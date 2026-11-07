"""Cruce de solo lectura entre aristas P2 y conn Zeek, sin desplazar relojes.

Reutiliza los CTE de aristas del oráculo vigente, sin crear/modificar vistas.
Separa compatibilidad topológica y confirmación temporal por cuatro endpoints.
"""
import argparse
import hashlib
import ipaddress
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from detection.evaluation.fa_execute import sql, literal
from detection.evaluation.fa_transport import save

WINDOWS_DAYS = {"SDWIN-200501225525": "ZEEK-APT29-DAY1", "SDWIN-200502035409": "ZEEK-APT29-DAY2"}


def ip(value):
    parsed = ipaddress.ip_address(value)
    return str(parsed.ipv4_mapped) if isinstance(parsed, ipaddress.IPv6Address) and parsed.ipv4_mapped else str(parsed)


def prefix_from_oracle(source, datasets):
    cleaned = re.sub(r"--[^\n]*", "", source)
    marker = re.search(r"CREATE\s+OR\s+REPLACE\s+VIEW\s+tfg\.p2_campanas\s+AS\s+", cleaned, re.I)
    if marker is None:
        raise ValueError("No se encuentra el oráculo P2 esperado")
    body = cleaned[marker.end():]
    end = re.search(r"\baristas_marcadas\s+AS\s*\(", body, re.I)
    if end is None:
        raise ValueError("No se encuentra el límite del CTE de aristas")
    prefix = body[:end.start()].rstrip()
    if not prefix.endswith(","):
        raise ValueError("Estructura inesperada de los CTE P2")
    prefix = prefix[:-1]
    if prefix.count("FROM tfg.events") != 1:
        raise ValueError("Fuente del oráculo distinta de la revisada")
    ids = ",".join(literal(d) for d in datasets)
    prefix = prefix.replace("FROM tfg.events", f"FROM (SELECT * FROM tfg.events FINAL WHERE dataset_id IN ({ids}))")
    if not prefix.lstrip().upper().startswith("WITH") or re.search(r"\b(CREATE|INSERT|ALTER|DROP|DELETE|TRUNCATE)\b", prefix, re.I):
        raise ValueError("El prefijo generado debe ser solo lectura")
    return prefix


def campaign_roles(row):
    document = json.loads(row["documento"])
    roles = {d.get("role"): d.get("hostname") for d in (document.get("tfg") or {}).get("devices", [])}
    return roles.get("origen"), roles.get("destino")


def classify(edges, network, campaigns, tolerance_ms=5000):
    by_dataset = {}
    for dataset, zeek_dataset in WINDOWS_DAYS.items():
        selected_edges = [e for e in edges if e["dataset_id"] == dataset]
        selected_network = [n for n in network if n["dataset_id"] == zeek_dataset]
        selected_campaigns = [c for c in campaigns if c["dataset_id"] == dataset]
        results = []
        for edge in selected_edges:
            windows = [c["campaign_id"] for c in selected_campaigns
                       if campaign_roles(c) == (edge["origen"], edge["destino"])
                       and int(c["start_ms"]) <= int(edge["time_ms"]) <= int(c["end_ms"])]
            topology, four_tuple, simultaneous = [], [], []
            for record in selected_network:
                same_endpoints = (ip(record["src_ip"]) == ip(edge["src_ip"])
                                  and ip(record["dst_ip"]) == ip(edge["dst_ip"])
                                  and int(record["dst_port"]) == int(edge["dst_port"]))
                if not same_endpoints:
                    continue
                topology.append(record["source_uid"])
                if record["src_port"] is None or edge["src_port"] is None or int(record["src_port"]) != int(edge["src_port"]):
                    continue
                four_tuple.append(record["source_uid"])
                if (int(record["time_ms"]) - tolerance_ms <= int(edge["time_ms"])
                        <= int(record["end_ms"]) + tolerance_ms):
                    simultaneous.append(record["source_uid"])
            results.append({**edge, "campaign_windows": windows,
                            "topology_ip_dstport_matches": sorted(set(topology)),
                            "four_tuple_matches_without_time": sorted(set(four_tuple)),
                            "temporal_four_tuple_matches": sorted(set(simultaneous)),
                            "temporally_supported": bool(simultaneous),
                            "reason": "coincidencia temporal de endpoints" if simultaneous else
                                      ("endpoints compatibles pero sin coincidencia temporal" if topology else "sin conn Zeek compatible")})
        in_windows = [r for r in results if r["campaign_windows"]]
        by_dataset[dataset] = {
            "zeek_dataset_id": zeek_dataset, "p2_aristas_unique": len(results),
            "p2_windows": len(selected_campaigns), "aristas_in_p2_windows_unique": len(in_windows),
            "aristas_bilateral_sysmon": sum(bool(int(r["confirmada"])) for r in results),
            "aristas_with_topology_matches": sum(bool(r["topology_ip_dstport_matches"]) for r in results),
            "aristas_with_four_tuple_matches_no_time": sum(bool(r["four_tuple_matches_without_time"]) for r in results),
            "aristas_temporally_supported": sum(r["temporally_supported"] for r in results),
            "aristas_in_windows_temporally_supported": sum(r["temporally_supported"] for r in in_windows),
            "zeek_conn_records": len(selected_network), "edges": results,
            "windows_clock_range_ms": ([min(int(e["time_ms"]) for e in selected_edges), max(int(e["time_ms"]) for e in selected_edges)] if selected_edges else None),
            "zeek_clock_range_ms": ([min(int(n["time_ms"]) for n in selected_network), max(int(n["end_ms"]) for n in selected_network)] if selected_network else None),
        }
    return by_dataset


def run(args):
    source = ROOT / "detection/patterns/p2_lateral_movement.sql"
    raw = source.read_text()
    prefix = prefix_from_oracle(raw, list(WINDOWS_DAYS))
    edges_query = prefix + """
SELECT a.dataset_id AS dataset_id, a.origen AS origen, a.destino AS destino,
       toUnixTimestamp64Milli(a.t) AS time_ms,
       a.puerto AS dst_port, a.arista_uid AS arista_uid, a.confirmada AS confirmada,
       toString(s.ip_origen) AS src_ip, toString(s.ip_destino) AS dst_ip, r.src_port AS src_port
FROM aristas AS a
INNER JOIN salientes AS s ON s.dataset_id=a.dataset_id AND s.arista_uid=a.arista_uid
INNER JOIN red AS r ON r.dataset_id=a.dataset_id AND r.event_uid=a.arista_uid
ORDER BY a.dataset_id, time_ms, a.arista_uid
"""
    maps_query = prefix + "\nSELECT dataset_id AS dataset_id,toString(ip) AS ip,host AS host,votos AS votos FROM mapa_ip_host ORDER BY dataset_id,ip"
    ids = ",".join(literal(d) for d in WINDOWS_DAYS)
    campaigns_query = f"SELECT campaign_id AS campaign_id,dataset_id AS dataset_id,toUnixTimestamp64Milli(first_seen) AS start_ms,toUnixTimestamp64Milli(last_seen) AS end_ms,documento AS documento FROM tfg.campaigns FINAL WHERE pattern_id='P2' AND dataset_id IN ({ids}) ORDER BY dataset_id,campaign_id"
    zeek_ids = ",".join(literal(d) for d in WINDOWS_DAYS.values())
    zeek_query = f"""SELECT dataset_id AS dataset_id,toUnixTimestamp64Milli(time) AS time_ms,
        toUnixTimestamp64Milli(time)+JSONExtractInt(raw,'duration') AS end_ms,
        toString(src_ip) AS src_ip,toString(dst_ip) AS dst_ip,src_port AS src_port,dst_port AS dst_port,
        JSONExtractString(raw,'tfg','source_uid') AS source_uid
        FROM tfg.events FINAL WHERE dataset_id IN ({zeek_ids}) AND source_channel='zeek.conn'
        ORDER BY dataset_id,time_ms,source_uid"""
    edges, network, campaigns = sql(edges_query), sql(zeek_query), sql(campaigns_query)
    prepared = json.loads((ROOT / "data/fa/20261107-zeek-ready/MANIFEST.json").read_text())
    expected = {r["dataset_id"]: r["input"] for r in prepared["coverage"] if r["channel_or_stream"] == "conn"}
    observed = {d: sum(n["dataset_id"] == d for n in network) for d in WINDOWS_DAYS.values()}
    if observed != expected:
        raise ValueError(f"Zeek no está completamente cargado: observado={observed}, esperado={expected}")
    # No multiplicar la arista por ventanas o por filas de otras capturas.
    unique = {(e["dataset_id"], str(e["arista_uid"])): e for e in edges}
    if len(unique) != len(edges):
        raise ValueError("El JOIN multiplicó aristas; revisar antes de informar cifras")
    report = {"mode": "readonly_no_clock_shift", "clock_offset_ms": 0,
              "temporal_tolerance_ms": args.tolerance_ms,
              "oracle_path": str(source.relative_to(ROOT)), "oracle_sha256": hashlib.sha256(raw.encode()).hexdigest(),
              "host_ip_maps": sql(maps_query),
              "expected_zeek_conn": expected, "observed_zeek_conn": observed,
              "queries": {"edges": edges_query, "zeek": zeek_query, "campaigns": campaigns_query, "ip_maps": maps_query},
              "datasets": classify(edges, network, campaigns, args.tolerance_ms),
              "limits": ["Compatibilidad de IP/puerto no confirma una misma ejecución ni simultaneidad.",
                         "No se ajustan relojes ni se buscan desplazamientos para forzar coincidencias.",
                         "El criterio temporal comprueba IP/puerto de ambos extremos y ventana de conexión ±tolerancia; no incluye protocolo.",
                         "No mide latencia: conn.log puede emitirse al cerrar la conexión o expirar un timeout."]}
    save(args.output, report)
    print(json.dumps({d: {k: v for k, v in result.items() if k != "edges"} for d, result in report["datasets"].items()}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--tolerance-ms", type=int, default=5000)
    args = parser.parse_args()
    if args.output.exists() or not 0 <= args.tolerance_ms <= 60000:
        raise SystemExit("Salida existente o tolerancia fuera de [0,60000] ms")
    run(args)


if __name__ == "__main__":
    main()
