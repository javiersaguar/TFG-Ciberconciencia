"""Prepara Zeek o el piloto COMISET para replay FA; sin tocar servicios.

Se ordena en SQLite con caché acotada. Se conservan los originales y las
referencias, y todo rechazo de preparación/normalización queda en una DLQ local.
"""
import argparse
import collections
import gzip
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from pipeline.normalize.fa_registry import normalize
from pipeline.normalize.zeek import epoch_ms
from pipeline.normalize.comiset import adapt_comiset
from pipeline.normalize.ocsf_common import parse_ts
from pipeline.normalize.registry import MAPPERS


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def file_hash(path):
    h = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def zeek_inputs(day):
    folder = ROOT / f"data/Security-Datasets/datasets/compound/apt29/day{day}/zeek/individual_zeek_logs"
    entries = {}
    files = []
    input_count = 0
    for path in sorted(folder.glob("*.log")):
        if not path.stem.endswith(("_conn", "_dns")):
            continue
        files.append({"path": str(path.relative_to(ROOT)), "sha256": file_hash(path)})
        host = path.stem.rsplit("_", 1)[0]
        with path.open(encoding="utf-8") as source:
            for line_no, line in enumerate(source, 1):
                raw = json.loads(line)
                digest = hashlib.sha256(encoded(raw).encode()).hexdigest()
                ref = {"path": str(path.relative_to(ROOT)), "line": line_no, "capture_label": host}
                input_count += 1
                if digest in entries:
                    entries[digest]["_tfg_source_ref"]["references"].append(ref)
                else:
                    entries[digest] = {**raw, "Hostname": host, "_tfg_input_format": "zeek",
                                       "_tfg_source_ref": {"references": [ref], "content_sha256": digest}}
    return list(entries.values()), files, input_count


def prepare(kind, output):
    started = time.monotonic()
    output.mkdir(parents=True, exist_ok=False)
    db = sqlite3.connect(output / "sort.sqlite")
    db.execute("PRAGMA cache_size=-16384")
    db.execute("PRAGMA temp_store=FILE")
    db.execute("CREATE TABLE records (dataset TEXT, ts INTEGER, ordinal INTEGER, raw TEXT)")
    stats = collections.defaultdict(collections.Counter)
    coverage = collections.defaultdict(collections.Counter)
    ranges = {}
    input_files = []
    source_counts = {}
    identity_set = set()
    refs = {}
    if kind == "comiset":
        source_folder = ROOT / "data/external/comiset/real-sample-v1"
        with gzip.open(source_folder / "line-references.jsonl.gz", "rt") as source:
            for line in source:
                ref = json.loads(line)
                refs[(ref["partition"], ref["partition_line"])] = ref
        paths = sorted(source_folder.glob("host-*/*/*/*.jsonl.gz"))
        input_files = [{"path": str(p.relative_to(ROOT)), "sha256": file_hash(p)} for p in paths]
    elif kind == "comiset-v2":
        # v2 (07-11-2026): una partición por host, día y hora UTC (fa_comiset_v2_extract.py --seleccion).
        # Cada hora es su propio dataset, para que las tasas usen el tiempo realmente observado.
        source_folder = ROOT / "data/external/comiset/real-sample-v2"
        paths = sorted(source_folder.glob("host-*/*/h*.jsonl.gz"))
        input_files = [{"path": str(p.relative_to(ROOT)), "sha256": file_hash(p)} for p in paths]

    def records():
        if kind == "zeek":
            for day in (1, 2):
                items, files, total = zeek_inputs(day)
                input_files.extend(files)
                dataset = f"ZEEK-APT29-DAY{day}"
                source_counts[dataset] = {"source_records": total, "exact_duplicates": total - len(items)}
                for item in items:
                    yield dataset, item
        elif kind == "comiset-v2":
            for path in paths:
                host, dia, hora = path.relative_to(source_folder).parts
                dataset = f"COMISET-REAL-v2-{host}-{dia.replace('-', '')}-{hora.split('.')[0]}"
                with gzip.open(path, "rt", encoding="utf-8") as source:
                    for line_no, line in enumerate(source, 1):
                        item = json.loads(line)
                        item["Hostname"] = host
                        item["_tfg_input_format"] = "comiset"
                        item["_tfg_source_ref"] = {"path": str(path.relative_to(ROOT)), "line": line_no,
                                                    "original_host": item["_source"].get("host_name")}
                        yield dataset, item
        else:
            for path in paths:
                host = path.relative_to(source_folder).parts[0]
                dataset = f"COMISET-REAL-v1-{host}"
                partition = str(path.relative_to(source_folder))
                with gzip.open(path, "rt", encoding="utf-8") as source:
                    for line_no, line in enumerate(source, 1):
                        item = json.loads(line)
                        ref = refs[(partition, line_no)]
                        if ref["source_id"] != item["_id"]:
                            raise ValueError("Referencia COMISET no coincide con _id")
                        item["Hostname"] = host
                        item["_tfg_input_format"] = "comiset"
                        item["_tfg_source_ref"] = {"path": str(path.relative_to(ROOT)), "line": line_no,
                                                    "original_line": ref["source_line"],
                                                    "original_host": item["_source"].get("host_name")}
                        yield dataset, item

    with (output / "dlq.normalize.jsonl").open("x", encoding="utf-8") as dlq:
        for ordinal, (dataset, raw) in enumerate(records(), 1):
            stats[dataset]["input"] += 1
            timestamp = None
            try:
                if kind == "zeek":
                    timestamp = epoch_ms(raw.get("ts"))
                    key = raw.get("@stream")
                    supported = True
                else:  # comiset y comiset-v2
                    adapted = adapt_comiset(raw)
                    timestamp = parse_ts(adapted["TimeCreated"])
                    key = f'{adapted["Channel"].lower()}|{adapted["EventID"]}'
                    supported = (adapted["Channel"].lower(), adapted["EventID"]) in MAPPERS
                coverage[(dataset, key)]["input"] += 1
                if supported:
                    stats[dataset]["supported_input"] += 1
                db.execute("INSERT INTO records VALUES (?,?,?,?)", (dataset, timestamp, ordinal, encoded(raw)))
                result = normalize(raw, dataset_id=dataset, ordinal=ordinal)
                if result["time"] != timestamp:
                    raise ValueError("Tiempo normalizado no coincide con fuente elegida")
                identity = (dataset, result["device"]["hostname"], result["tfg"]["source_channel"],
                            result["tfg"]["record_number"])
                if identity in identity_set:
                    raise ValueError("Identidad normalizada repetida")
                identity_set.add(identity)
                stats[dataset]["normalized"] += 1
                if supported:
                    stats[dataset]["supported_normalized"] += 1
                coverage[(dataset, key)]["normalized"] += 1
            except Exception as exc:
                reason = f"{type(exc).__name__}: {exc}"
                stats[dataset]["dlq"] += 1
                stats[dataset][f"reason:{reason}"] += 1
                dlq.write(encoded({"dataset_id": dataset, "reason": reason, "original": raw}) + "\n")
            if timestamp is not None:
                low, high = ranges.get(dataset, (timestamp, timestamp))
                ranges[dataset] = [min(low, timestamp), max(high, timestamp)]
    db.commit()
    manifest = {"kind": kind, "mode": "offline_no_services", "files": [],
                "input_files": input_files, "source_counts": source_counts,
                "counts": {d: dict(v) for d, v in stats.items()},
                "ranges_epoch_ms": ranges,
                "coverage": [{"dataset_id": d, "channel_or_stream": k, **dict(v)}
                             for (d, k), v in sorted(coverage.items())],
                "notes": ["Unmapped conserva registro original y referencias; originales intactos.",
                          "Replay incluye eventos sin mapeador, para que la DLQ viva contabilice el mismo universo.",
                          "Zeek usa solo individuales; se deduplica contenido JSON idéntico conservando referencias.",
                          "Etiqueta de captura Zeek no acredita hostname del endpoint ni ubicación geográfica.",
                          "COMISET es actividad considerada normal, no etiqueta independiente; tasas usan tiempo observado."]}
    for dataset in sorted(stats):
        path = output / f"{dataset}.jsonl"
        previous = None
        count = 0
        with path.open("x", encoding="utf-8") as target:
            for timestamp, raw in db.execute("SELECT ts,raw FROM records WHERE dataset=? ORDER BY ts,ordinal", (dataset,)):
                if previous is not None and timestamp < previous:
                    raise ValueError("Orden temporal inválido")
                previous = timestamp
                target.write(raw + "\n")
                count += 1
        manifest["files"].append({"dataset_id": dataset, "path": str(path.relative_to(ROOT)),
                                  "bytes": path.stat().st_size, "sha256": file_hash(path), "records": count})
    db.close()
    (output / "sort.sqlite").unlink()
    manifest["duration_seconds"] = round(time.monotonic() - started, 3)
    (output / "MANIFEST.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"files": manifest["files"], "counts": manifest["counts"],
                      "source_counts": source_counts, "duration_seconds": manifest["duration_seconds"]}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=("zeek", "comiset", "comiset-v2"))
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    # absolute conserva la ruta del worktree; resolve seguiría el enlace data
    # al repo principal y rompería las referencias relativas de procedencia.
    prepare(args.kind, args.output.absolute())


if __name__ == "__main__":
    main()
