"""Prepara y mide day2 fuera de los servicios, sin alterar los mapeadores.

Ejecutar desde la raíz del worktree con ``python3 -I``. Solo se importa código
del worktree; el ZIP y el XLSX se leen como datos y nunca se ejecutan.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import shutil
import sys
import time
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from pipeline.normalize.registry import normalize, UnmappedEvent
from pipeline.normalize.ocsf_common import event_time, _desfase_colector_ms, parse_ts

DATASET_ID = "SDWIN-200502035409"
MEMBER = "apt29_evals_day2_manual_2020-05-02035409.json"
EXPECTED_BYTES = 1_714_987_031
EXPECTED_LINES = 587_286
ZIP_SHA256 = "377f8cba5db95a453a3ee8bd19f493efafc23724541482a4da99da28ee4665f9"
JSON_SHA256 = "fd4043c9ad2382f57da882476acb541332d2d19b60ad538572a8d4a070d59a89"


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def read_plan(path):
    """Lee únicamente textos descriptivos de day2, excluyendo comandos y claves."""
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relation = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        sheets = {s.attrib["name"]: s.attrib[relation]
                  for s in workbook.findall("m:sheets/m:sheet", ns)}
        links = {r.attrib["Id"]: r.attrib["Target"] for r in
                 ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))}
        target = links[sheets["day2"]]
        if target.startswith("/") or ".." in Path(target).parts:
            raise ValueError("Relación XLSX fuera del directorio xl")
        strings = ["".join(n.itertext()) for n in
                   ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        sheet = ET.fromstring(archive.read("xl/" + target))
    rows = []
    for row in sheet.findall("m:sheetData/m:row", ns):
        cells = {}
        for cell in row.findall("m:c", ns):
            column = cell.attrib["r"].rstrip("0123456789")
            if column not in ("A", "B", "C", "D", "F", "G", "H"):
                continue
            value = cell.find("m:v", ns)
            if value is not None:
                cells[column] = (strings[int(value.text)] if cell.attrib.get("t") == "s"
                                 else value.text)
        if cells.get("B") and cells.get("C") != "Step":
            rows.append(cells)
    return {"source": str(path.relative_to(ROOT)), "sha256": sha256(path),
            "sheet": "day2", "rows": rows,
            "note": "Plan de técnicas, sin horas ni etiquetas por evento; contiene IDs ATT&CK históricos."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--inspect-existing", action="store_true",
                        help="Repite la medida de una extracción cuyo SHA256 se comprueba")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    source = ROOT / "data/Security-Datasets/datasets/compound/apt29/day2/apt29_evals_day2_manual.zip"
    destination = ROOT / "data/samples/apt29/day2" / MEMBER
    plan = ROOT / "data/Security-Datasets/datasets/compound/apt29/emulationplans/apt29.xlsx"
    started = time.monotonic()
    if sha256(source) != ZIP_SHA256:
        raise SystemExit("El ZIP no coincide con el SHA256 del MANIFEST")
    if destination.exists() and not args.inspect_existing:
        raise SystemExit(f"No se sobrescribe una extracción previa: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists():
        with zipfile.ZipFile(source) as archive:
            info = archive.getinfo(MEMBER)
            if info.file_size != EXPECTED_BYTES:
                raise SystemExit(f"Tamaño inesperado: {info.file_size}")
            # Miembro explícito: no se permite que una ruta del ZIP elija el destino.
            with archive.open(info) as src, destination.open("xb") as dst:
                shutil.copyfileobj(src, dst, 1 << 20)
    if destination.stat().st_size != EXPECTED_BYTES:
        raise SystemExit("La extracción no tiene el tamaño esperado")
    if sha256(destination) != JSON_SHA256:
        raise SystemExit("La extracción no coincide con el SHA256 verificado")
    counts = collections.Counter()
    pairs = collections.defaultdict(collections.Counter)
    offsets, time_sources, hosts = (collections.Counter() for _ in range(3))
    ranges = {}
    previous = {}
    backwards = collections.Counter()
    utc_delta = collections.Counter()
    semantic = collections.Counter()
    identities = set()
    with destination.open(encoding="utf-8") as src, (output / "dlq.normalize.jsonl").open("x", encoding="utf-8") as dlq:
        for line_no, line in enumerate(src, 1):
            counts["physical_lines"] += 1
            pair = None
            try:
                event = json.loads(line)
                if not isinstance(event, dict):
                    raise ValueError("registro no es objeto JSON")
                host = str(event.get("Hostname") or event.get("Computer") or "unknown")
                pair = (str(event.get("Channel", "")).lower(), str(event.get("EventID", "")))
                pairs[pair]["input"] += 1
                hosts[host] += 1
                offset = _desfase_colector_ms(event)
                offsets[str(offset)] += 1
                stamp, origin = event_time(event)
                time_sources[origin] += 1
                if stamp is not None:
                    if host in previous and stamp < previous[host]:
                        backwards[host] += 1
                    previous[host] = stamp
                    low, high = ranges.get(host, (stamp, stamp))
                    ranges[host] = [min(low, stamp), max(high, stamp)]
                raw_utc, raw_local = parse_ts(event.get("UtcTime")), parse_ts(event.get("EventTime"))
                if raw_utc is not None and raw_local is not None and offset is not None:
                    delta = raw_utc - raw_local - offset
                    utc_delta["compared"] += 1
                    utc_delta["within_1s"] += abs(delta) <= 1000
                    utc_delta["within_5s"] += abs(delta) <= 5000
                    utc_delta["max_abs_ms"] = max(utc_delta["max_abs_ms"], abs(delta))
                ocsf = normalize(event, dataset_id=DATASET_ID, ordinal=line_no)
                if not isinstance(ocsf.get("time"), int):
                    raise ValueError("OCSF sin tiempo de evento válido")
                if not ocsf.get("device", {}).get("hostname"):
                    raise ValueError("OCSF sin host")
                if not ocsf.get("tfg", {}).get("record_number"):
                    raise ValueError("OCSF sin identidad de registro")
                identity = (host, pair[0], ocsf["tfg"]["record_number"])
                semantic["duplicate_identity"] += identity in identities
                identities.add(identity)
                if ocsf["tfg"]["source_event_id"] != event["EventID"]:
                    semantic["event_id_mismatch"] += 1
                if origin == "UtcTime" and ocsf["time"] != parse_ts(event["UtcTime"]):
                    semantic["sysmon_time_mismatch"] += 1
                fields = {
                    "1": [("Image", ("process", "file", "path"))],
                    "7": [("ImageLoaded", ("module", "file", "path"))],
                    "10": [("SourceImage", ("actor", "process", "file", "path")),
                           ("TargetImage", ("process", "file", "path"))],
                    "12": [("TargetObject", ("unmapped", "TargetObject"))],
                    "13": [("TargetObject", ("unmapped", "TargetObject"))],
                }.get(pair[1], []) if pair[0] == "microsoft-windows-sysmon/operational" else []
                for raw_field, path in fields:
                    value = ocsf
                    for component in path:
                        value = value.get(component) if isinstance(value, dict) else None
                    if not event.get(raw_field):
                        semantic[f"empty_source:{raw_field}"] += 1
                    elif value != event[raw_field]:
                        semantic[f"mismatch:{raw_field}"] += 1
                    else:
                        semantic[f"preserved:{raw_field}"] += 1
            except Exception as exc:
                reason = f"{type(exc).__name__}: {exc}"
                counts["dlq"] += 1
                counts[f"reason:{reason}"] += 1
                if pair is not None:
                    pairs[pair]["dlq"] += 1
                dlq.write(json.dumps({"dataset_id": DATASET_ID, "line_no": line_no,
                                      "stage": "normalize", "reason": reason,
                                      "original": line.rstrip("\n")}, ensure_ascii=False) + "\n")
            else:
                counts["normalized"] += 1
                pairs[pair]["normalized"] += 1
    if counts["physical_lines"] != EXPECTED_LINES:
        raise SystemExit(f"Recuento inesperado: {counts['physical_lines']}")
    report = {
        "dataset_id": DATASET_ID,
        "mode": "offline_no_services",
        "source_zip": str(source.relative_to(ROOT)), "source_sha256": sha256(source),
        "extracted_file": str(destination.relative_to(ROOT)),
        "bytes": destination.stat().st_size, "sha256": sha256(destination),
        "counts": dict(counts),
        "coverage": [{"channel": p[0], "event_id": p[1], **dict(c)} for p, c in sorted(pairs.items())],
        "host_records": dict(hosts), "collector_offsets_ms": dict(offsets),
        "time_sources": dict(time_sources), "event_ranges_epoch_ms": ranges,
        "backwards_in_source_order": dict(backwards),
        "utc_vs_eventtime_plus_offset": dict(utc_delta),
        "semantic_checks": dict(semantic),
        "duration_seconds": round(time.monotonic() - started, 3),
        "limitations": ["No hay carga, detección Sigma ni campañas ClickHouse/Flink.",
                         "La DLQ local conserva cada línea rechazada y su motivo.",
                         "Orden original no equivale a orden de tiempo de evento."]}
    (output / "coverage.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    (output / "emulation-plan-day2.json").write_text(json.dumps(read_plan(plan), indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({k: report[k] for k in ("dataset_id", "bytes", "sha256", "counts", "collector_offsets_ms", "time_sources", "duration_seconds")}, indent=2))


if __name__ == "__main__":
    main()
