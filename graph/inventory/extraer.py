"""Extrae de ClickHouse el inventario observado de un escenario y lo deja en un JSON (F5.1).

Las consultas solo leen `tfg.events` y la tabla de campanas. Las reglas que convierten esas filas en
nodos y relaciones estan en graph.inventory.construir y en graph/model.md.

Cada escenario es un conjunto de datos: los dos dias de APT29 son dos montajes distintos del mismo
laboratorio (cambia el SID del dominio), asi que no se mezclan.

Uso (desde la raiz del repo, con ClickHouse levantado):
  .venv/bin/python -m graph.inventory.extraer apt29-day1
  .venv/bin/python -m graph.inventory.extraer apt29-day2
"""
import argparse
import collections
import json
from pathlib import Path

from graph.inventory.construir import construir

ESCENARIOS = {
    "apt29-day1": {"dataset_id": "SDWIN-200501225525", "red_interna": "10.0.0.0/8"},
    "apt29-day2": {"dataset_id": "SDWIN-200502035409", "red_interna": "10.0.0.0/8"},
}
SALIDA = Path("data/graph")
TABLAS_CAMPANAS = {"v2": "campaigns_v2", "v1": "campaigns"}

_IP = "replaceOne(IPv6NumToString({c}), '::ffff:', '')"
_USUARIO = "JSONExtractString(raw, 'user', 'name')"
CONSULTAS = {
    # IP que cada equipo usa como origen en las conexiones que inicia
    "ips": f"""SELECT device_hostname AS host, {_IP.format(c='src_ip')} AS ip, count() AS n
               FROM tfg.events WHERE dataset_id = {{ds:String}} AND source_event_id = 3
                 AND source_channel = 'microsoft-windows-sysmon/operational' AND direction_id = 2
               GROUP BY host, ip""",
    "conexiones": f"""SELECT device_hostname AS recorder, {_IP.format(c='src_ip')} AS src,
                        {_IP.format(c='dst_ip')} AS dst, toInt32(dst_port) AS port,
                        JSONExtractString(raw, 'connection_info', 'protocol_name') AS proto, count() AS n,
                        toUnixTimestamp64Milli(min(time)) AS first, toUnixTimestamp64Milli(max(time)) AS last,
                        groupUniqArray(8)(actor_process_name) AS procs
                      FROM tfg.events WHERE dataset_id = {{ds:String}} AND source_event_id = 3
                        AND source_channel = 'microsoft-windows-sysmon/operational' AND dst_port IS NOT NULL
                      GROUP BY recorder, src, dst, port, proto""",
    "sesiones": f"""SELECT device_hostname AS host, {_USUARIO} AS user,
                      JSONExtractString(raw, 'user', 'domain') AS domain, JSONExtractString(raw, 'user', 'uid') AS sid,
                      toInt32(JSONExtractInt(raw, 'logon_type_id')) AS logon_type,
                      JSONExtractString(raw, 'src_endpoint', 'ip') AS src, count() AS n,
                      toUnixTimestamp64Milli(min(time)) AS first, toUnixTimestamp64Milli(max(time)) AS last
                    FROM tfg.events WHERE dataset_id = {{ds:String}} AND source_event_id = 4624
                      AND source_channel = 'security'
                    GROUP BY host, user, domain, sid, logon_type, src""",
    "privilegios": f"""SELECT device_hostname AS host, {_USUARIO} AS user,
                         JSONExtractString(raw, 'user', 'domain') AS domain, JSONExtractString(raw, 'user', 'uid') AS sid,
                         arraySort(groupUniqArrayArray(JSONExtract(raw, 'privileges', 'Array(String)'))) AS privileges,
                         count() AS n, toUnixTimestamp64Milli(min(time)) AS first, toUnixTimestamp64Milli(max(time)) AS last
                       FROM tfg.events WHERE dataset_id = {{ds:String}} AND source_event_id = 4672
                         AND source_channel = 'security'
                       GROUP BY host, user, domain, sid""",
}
CAMPANAS = """SELECT campaign_id, pattern_id, dataset_id, title, toUnixTimestamp64Milli(first_seen) AS first_seen,
                toUnixTimestamp64Milli(last_seen) AS last_seen, toInt32(severity_id) AS severity_id,
                toInt32(confidence_score) AS confidence_score, technique_ids,
                toInt32(related_events_count) AS related_events_count, documento
              FROM tfg.{tabla} FINAL WHERE dataset_id = {{ds:String}} ORDER BY first_seen, campaign_id"""


def leer(cliente, dataset_id, version):
    filas = {}
    for nombre, sql in CONSULTAS.items():
        r = cliente.query(sql, parameters={"ds": dataset_id})
        filas[nombre] = [dict(zip(r.column_names, f)) for f in r.result_rows]
    r = cliente.query(CAMPANAS.format(tabla=TABLAS_CAMPANAS[version]), parameters={"ds": dataset_id})
    filas["campanas"] = []
    for f in r.result_rows:
        c = dict(zip(r.column_names, f))
        c["documento"] = json.loads(c["documento"])
        c["technique_ids"] = list(c["technique_ids"])
        c["version"] = version
        filas["campanas"].append(c)
    return filas


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("escenario", choices=sorted(ESCENARIOS))
    ap.add_argument("--campanas", choices=sorted(TABLAS_CAMPANAS), default="v2",
                    help="Version de los patrones del Pilar A (v2 es la actual)")
    ap.add_argument("--ch-host", default="localhost")
    ap.add_argument("--ch-port", type=int, default=8123)
    args = ap.parse_args()

    import clickhouse_connect  # solo hace falta para leer de verdad
    cfg = ESCENARIOS[args.escenario]
    cliente = clickhouse_connect.get_client(host=args.ch_host, port=args.ch_port, username="tfg",
                                            password="tfg", database="tfg")
    filas = leer(cliente, cfg["dataset_id"], args.campanas)
    nodos, relaciones = construir(args.escenario, cfg["red_interna"], filas)
    SALIDA.mkdir(parents=True, exist_ok=True)
    destino = SALIDA / f"inventario-{args.escenario}.json"
    destino.write_text(json.dumps({"escenario": args.escenario, "dataset_id": cfg["dataset_id"],
                                   "campanas": args.campanas, "nodos": nodos, "relaciones": relaciones},
                                  indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{destino}: {len(nodos)} nodos y {len(relaciones)} relaciones "
          f"(filas leídas: {{{', '.join(f'{k}: {len(v)}' for k, v in filas.items())}}})")
    print("  nodos:", dict(collections.Counter(n["labels"][1] for n in nodos).most_common()))
    print("  relaciones:", dict(collections.Counter(r["tipo"] for r in relaciones).most_common()))


if __name__ == "__main__":
    main()
