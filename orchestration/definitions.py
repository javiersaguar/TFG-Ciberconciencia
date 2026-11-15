"""Orquestacion del ciclo del grafo razonado con Dagster (F5.5).

Dagster no anade logica: cada activo llama a una funcion de graph.pipeline o de cti.feeds, que tambien
se puede lanzar a mano. Lo que aporta es el orden, el registro de cada ejecucion con sus cifras y la
automatizacion:

  Activos del grupo `grafo`, uno por ESCENARIO (particion):
      inventario -> capa_sintetica -> hechos -> rutas -> analitica
  Activo del grupo `cti`:
      caducidad_indicadores

  ciclo_grafo        trabajo que reconstruye el grafo razonado de un escenario de extremo a extremo
  campanas_nuevas    sensor: cuando el Pilar A deja campanas nuevas de un escenario en ClickHouse,
                     lanza el ciclo de ese escenario
  caducidad_diaria   planificacion: cada dia marca los indicadores caducados

Uso: `./scripts/up.sh orchestration` y abrir http://localhost:3000.
"""
import json
from datetime import date

import dagster as dg

from cti.feeds import caducidad
from graph import pipeline
from graph.inventory import extraer

ESCENARIOS = dg.StaticPartitionsDefinition(pipeline.ESCENARIOS)


def _resultado(r, **destacados):
    """Las cifras del paso como metadatos de la materializacion."""
    return dg.MaterializeResult(metadata={**destacados, "resumen": dg.MetadataValue.json(json.loads(json.dumps(r, default=str)))})


def _sin_huerfanas(r):
    if r["sin_extremo"]:
        raise dg.Failure(f"Relaciones sin alguno de sus extremos: {r['sin_extremo'][:5]}")


@dg.asset(partitions_def=ESCENARIOS, group_name="grafo",
          description="Inventario observado (equipos, usuarios, sesiones, conexiones y campañas) de ClickHouse a Neo4j.")
def inventario(context: dg.AssetExecutionContext):
    r = pipeline.inventario(context.partition_key)
    _sin_huerfanas(r)
    return _resultado(r, nodos=r["nodos"], relaciones=r["relaciones"], obsoletos=r["obsoletos_nodos"] + r["obsoletos_relaciones"])


@dg.asset(partitions_def=ESCENARIOS, group_name="grafo", deps=[inventario],
          description="Capa sintética declarada: vulnerabilidades (cifras reales), activos y posición del adversario.")
def capa_sintetica(context: dg.AssetExecutionContext):
    r = pipeline.sintetica(context.partition_key)
    _sin_huerfanas(r)
    return _resultado(r, nodos=r["nodos"], relaciones=r["relaciones"], asignaciones_omitidas=len(r["omitidas"]))


@dg.asset(partitions_def=ESCENARIOS, group_name="grafo", deps=[capa_sintetica],
          description="Hechos Datalog exportados del grafo, con la capa de procedencia de cada relación.")
def hechos(context: dg.AssetExecutionContext):
    r = pipeline.hechos(context.partition_key)
    return _resultado(r, relaciones=len(r), hechos=sum(x["hechos"] for x in r.values()))


@dg.asset(partitions_def=ESCENARIOS, group_name="grafo", deps=[hechos],
          description="Razonamiento con Soufflé: rutas de ataque con su traza y grafo de derivación, cargados en Neo4j.")
def rutas(context: dg.AssetExecutionContext):
    r = pipeline.rutas(context.partition_key)
    _sin_huerfanas(r)
    context.log.info(f"Campañas explicadas: {r['campanas_explicadas']} de {r['campanas']}")
    return _resultado(r, reglas=r["reglas"], reglas_sha256=r["reglas_sha256"], rutas=len(r["rutas"]),
                      aplicaciones=r["aplicaciones"], confirmadas=r["confirmadas"],
                      campanas_explicadas=r["campanas_explicadas"], campanas=r["campanas"])


@dg.asset(partitions_def=ESCENARIOS, group_name="grafo", deps=[rutas],
          description="Analítica con GDS: centralidad de la red, cuellos de botella y caminos de menor coste.")
def analitica(context: dg.AssetExecutionContext):
    r = pipeline.analitica(context.partition_key)
    return _resultado(r, mas_central=r["mas_central"], cuellos_de_botella=", ".join(r["cuellos_de_botella"]) or "ninguno",
                      caminos_validos=r["caminos_validos"], caminos=r["caminos"])


@dg.asset(group_name="cti", description="Marca la caducidad de los indicadores por tipo (47, 300 o 460 días).")
def caducidad_indicadores():
    r = caducidad.ejecutar(date.today())
    return _resultado(r, total=r["total"], caducados=r["caducados"])


ciclo_grafo = dg.define_asset_job("ciclo_grafo", selection=dg.AssetSelection.groups("grafo"), partitions_def=ESCENARIOS,
                                  description="Reconstruye el grafo razonado de un escenario de extremo a extremo.")
caducidad_job = dg.define_asset_job("caducidad", selection=dg.AssetSelection.assets(caducidad_indicadores))

caducidad_diaria = dg.ScheduleDefinition(name="caducidad_diaria", job=caducidad_job, cron_schedule="0 6 * * *", execution_timezone="Europe/Madrid",
                                         default_status=dg.DefaultScheduleStatus.RUNNING)


def firmas_campanas():
    """Por escenario, una firma de sus campanas en ClickHouse: cuantas hay y cuando se ingirio la ultima."""
    import clickhouse_connect
    cx = pipeline.conexiones()["clickhouse"]
    cliente = clickhouse_connect.get_client(**cx, username="tfg", password="tfg", database="tfg")
    tabla = extraer.TABLAS_CAMPANAS[pipeline.CAMPANAS]
    por_dataset = {e: cfg["dataset_id"] for e, cfg in extraer.ESCENARIOS.items()}
    filas = cliente.query(f"SELECT dataset_id, count(), toString(max(ingested_at)) FROM tfg.{tabla} FINAL "
                          "WHERE dataset_id IN {ds:Array(String)} GROUP BY dataset_id",
                          parameters={"ds": sorted(por_dataset.values())}).result_rows
    vistas = {d: f"{n}@{t}" for d, n, t in filas}
    return {e: vistas.get(d, "0") for e, d in por_dataset.items()}


@dg.sensor(job=ciclo_grafo, minimum_interval_seconds=300, default_status=dg.DefaultSensorStatus.RUNNING,
           description="Lanza el ciclo de un escenario cuando cambian sus campañas del Pilar A.")
def campanas_nuevas(context: dg.SensorEvaluationContext):
    antes = json.loads(context.cursor) if context.cursor else {}
    ahora = firmas_campanas()
    cambios = [e for e, f in ahora.items() if antes.get(e) != f]
    context.update_cursor(json.dumps(ahora, sort_keys=True))
    if not cambios:
        return dg.SkipReason("Las campañas no han cambiado")
    return [dg.RunRequest(partition_key=e, run_key=f"{e}:{ahora[e]}") for e in sorted(cambios)]


defs = dg.Definitions(assets=[inventario, capa_sintetica, hechos, rutas, analitica, caducidad_indicadores],
                      jobs=[ciclo_grafo, caducidad_job], schedules=[caducidad_diaria], sensors=[campanas_nuevas])
