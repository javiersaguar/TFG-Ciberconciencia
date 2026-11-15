"""El ciclo completo del grafo razonado de un escenario, paso a paso y sin orquestador (F5).

  inventario  ClickHouse -> inventario observado -> Neo4j
  sintetica   declaracion + inventario -> capa sintetica -> Neo4j
  hechos      Neo4j -> hechos Datalog
  rutas       Soufflé -> rutas de ataque y grafo de derivacion -> Neo4j
  analitica   GDS: centralidad, cuellos de botella y caminos de menor coste

Cada paso es idempotente y devuelve un resumen. Dagster (orchestration/definitions.py) envuelve estas
mismas funciones: lo que se lanza a mano y lo que se orquesta es el mismo codigo.

Las conexiones salen del entorno (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, CH_HOST, CH_PORT), con los
valores locales por defecto.

Uso (desde la raiz del repo, con ClickHouse y Neo4j levantados):
  .venv/bin/python -m graph.pipeline apt29-day1
  .venv/bin/python -m graph.pipeline apt29-day2 --desde hechos
"""
import argparse
import json
import os
from pathlib import Path

from graph import cargar
from graph.analytics import gds
from graph.datalog import exportar, razonar
from graph.inventory import extraer
from graph.inventory.construir import construir as construir_inventario
from graph.seed import construir as seed

DATOS = Path("data/graph")
REGLAS = "v2"        # version de las reglas del razonador
CAMPANAS = "v2"      # version de los patrones del Pilar A
ESCENARIOS = sorted(extraer.ESCENARIOS)


def conexiones():
    return {"neo4j": {"uri": os.environ.get("NEO4J_URI", "bolt://localhost:7687"),
                      "user": os.environ.get("NEO4J_USER", "neo4j"),
                      "password": os.environ.get("NEO4J_PASSWORD", "tfg-neo4j")},
            "clickhouse": {"host": os.environ.get("CH_HOST", "localhost"), "port": int(os.environ.get("CH_PORT", "8123"))}}


def _guardar(nombre, doc):
    DATOS.mkdir(parents=True, exist_ok=True)
    (DATOS / nombre).write_text(json.dumps(doc, indent=1, ensure_ascii=False), encoding="utf-8")
    return doc


def inventario(escenario):
    import clickhouse_connect
    cx, cfg = conexiones(), extraer.ESCENARIOS[escenario]
    cliente = clickhouse_connect.get_client(**cx["clickhouse"], username="tfg", password="tfg", database="tfg")
    filas = extraer.leer(cliente, cfg["dataset_id"], CAMPANAS)
    nodos, relaciones = construir_inventario(escenario, cfg["red_interna"], filas)
    doc = _guardar(f"inventario-{escenario}.json", {"escenario": escenario, "capa": "inventario",
                                                     "dataset_id": cfg["dataset_id"], "campanas": CAMPANAS,
                                                     "nodos": nodos, "relaciones": relaciones})
    return cargar.cargar_documento(doc, **cx["neo4j"]) | {"filas": {k: len(v) for k, v in filas.items()}}


def sintetica(escenario):
    decl = json.loads((seed.DIR / f"{seed.SEMILLAS[escenario]}.json").read_text(encoding="utf-8"))
    inv = json.loads((DATOS / f"inventario-{escenario}.json").read_text(encoding="utf-8"))
    nodos, relaciones, omitidas = seed.construir(escenario, decl, inv)
    doc = _guardar(f"sintetica-{escenario}.json", {"escenario": escenario, "capa": "sintetica",
                                                    "semilla": seed.SEMILLAS[escenario], "nodos": nodos,
                                                    "relaciones": relaciones, "omitidas": omitidas})
    return cargar.cargar_documento(doc, **conexiones()["neo4j"]) | {"omitidas": omitidas}


def hechos(escenario):
    from neo4j import GraphDatabase
    n = conexiones()["neo4j"]
    with GraphDatabase.driver(n["uri"], auth=(n["user"], n["password"])) as driver, driver.session() as s:
        return exportar.exportar(s, escenario, exportar.SALIDA / escenario / "facts")


def rutas(escenario, reglas=REGLAS):
    dir_hechos = razonar.TRABAJO / escenario / "facts"
    salida = razonar.TRABAJO / escenario / f"out-{reglas}"
    razonar.ejecutar(dir_hechos, salida, Path(razonar.__file__).parent / razonar.VERSIONES[reglas][0])
    rel = razonar.leer(salida) | razonar.entrada(dir_hechos)
    mapa = json.loads((dir_hechos / "PROCEDENCIA.json").read_text(encoding="utf-8"))
    huella = razonar.huella(reglas)
    nodos, relaciones, resumen = razonar.construir(escenario, rel, mapa, huella, reglas)
    campanas = razonar.explicadas(rel)
    doc = _guardar(f"derivada-{escenario}-{reglas}.json", {"escenario": escenario, "capa": "derivada", "reglas": reglas,
                                                           "reglas_sha256": huella, "campanas": campanas,
                                                           "nodos": nodos, "relaciones": relaciones})
    apps = [a for a in razonar.aplicaciones(rel).values() if a["basis"] != "trivial"]
    return cargar.cargar_documento(doc, **conexiones()["neo4j"]) | {
        "reglas": reglas, "reglas_sha256": huella, "aplicaciones": len(apps),
        "confirmadas": sum(bool(a["confirmed"]) for a in apps),
        "campanas_explicadas": sum(c["explicada"] for c in campanas), "campanas": len(campanas),
        "rutas": [{k: r[k] for k in ("activo", "criterios", "pasos", "confirmados")} for r in resumen if r["alcanzable"]]}


def analitica(escenario):
    r = gds.analizar(escenario, **conexiones()["neo4j"])
    _guardar(f"analitica-{escenario}.json", r)
    d = r["derivacion"]
    return {"gds": r["gds"], "equipos": len(r["red"]["equipos"]),
            "mas_central": r["red"]["equipos"][0]["equipo"] if r["red"]["equipos"] else None,
            "estados": len(d["estados"]),
            "cuellos_de_botella": [e["estado"] for e in d["estados"] if e["activos_que_corta"] >= 2],
            "caminos": len(d["caminos"]), "caminos_validos": sum(bool(c.get("prueba_valida")) for c in d["caminos"])}


PASOS = {"inventario": inventario, "sintetica": sintetica, "hechos": hechos, "rutas": rutas, "analitica": analitica}


def ciclo(escenario, desde="inventario"):
    nombres = list(PASOS)
    return {p: PASOS[p](escenario) for p in nombres[nombres.index(desde):]}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("escenario", choices=ESCENARIOS)
    ap.add_argument("--desde", choices=list(PASOS), default="inventario")
    args = ap.parse_args()
    for paso, r in ciclo(args.escenario, args.desde).items():
        breve = {k: v for k, v in r.items() if k not in ("grafo_nodos", "grafo_relaciones", "sin_extremo")}
        print(f"■ {paso}: {json.dumps(breve, ensure_ascii=False)[:600]}")


if __name__ == "__main__":
    main()
