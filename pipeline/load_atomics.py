"""Carga masiva de los datasets atomicos de OTRF hacia el bus de eventos.

Extrae cada zip, localiza su metadato (que aporta la verdad conocida: tecnica
ATT&CK, tactica y descripcion) y reproduce sus eventos con el identificador de
dataset correspondiente.
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

import yaml
from confluent_kafka import Producer

ATOMIC_BASE = Path("data/Security-Datasets/datasets/atomic/windows")
METADATA_DIR = Path("data/Security-Datasets/datasets/atomic/_metadata")

TIMESTAMP_FIELDS = ("TimeCreated", "@timestamp", "UtcTime")


def parse_args():
    p = argparse.ArgumentParser(description="Carga los datasets atomicos de OTRF")
    p.add_argument("--brokers", default="localhost:9092")
    p.add_argument("--topic", default="raw.host.windows")
    p.add_argument("--tactics", nargs="*", default=None,
                   help="Tacticas a cargar (por defecto, todas)")
    p.add_argument("--limit", type=int, default=0, help="Maximo de datasets (0 = todos)")
    p.add_argument("--dry-run", action="store_true", help="Solo listar, no publicar")
    return p.parse_args()


def load_metadata_index():
    """Indexa los metadatos por nombre de fichero de datos referenciado."""
    index = {}
    if not METADATA_DIR.exists():
        return index
    for yml in METADATA_DIR.glob("*.yaml"):
        try:
            meta = yaml.safe_load(yml.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(meta, dict):
            continue
        for f in (meta.get("files") or []):
            link = str(f.get("link", ""))
            if link:
                index[Path(link).name] = meta
    return index


def summarize(meta):
    """Extrae tecnica, tactica y titulo de los metadatos."""
    if not meta:
        return {"id": None, "title": None, "techniques": [], "tactics": []}
    techs, tactics = [], []
    for m in (meta.get("attack_mappings") or []):
        t = str(m.get("technique", "")).upper()
        sub = m.get("sub-technique")
        if t:
            techs.append(f"{t}.{sub}" if sub else t)
        tactics.extend(str(x).upper() for x in (m.get("tactics") or []))
    return {
        "id": meta.get("id"),
        "title": meta.get("title"),
        "techniques": techs,
        "tactics": tactics,
    }


def extract_ts(event):
    from datetime import datetime, timezone
    for field in TIMESTAMP_FIELDS:
        raw = event.get(field)
        if not raw:
            continue
        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%d %H:%M:%S"):
            try:
                dt = datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
                return int(dt.timestamp() * 1000)
            except (ValueError, TypeError):
                continue
    return None


def main():
    args = parse_args()
    meta_index = load_metadata_index()
    print(f"Metadatos indexados: {len(meta_index)}")

    zips = sorted(ATOMIC_BASE.rglob("*.zip"))
    if args.tactics:
        zips = [z for z in zips if any(t in str(z) for t in args.tactics)]
    if args.limit:
        zips = zips[:args.limit]
    print(f"Datasets a procesar: {len(zips)}\n")

    if args.dry_run:
        for z in zips:
            meta = summarize(meta_index.get(z.name))
            print(f"  {z.relative_to(ATOMIC_BASE)}  ->  {meta['techniques']}  {meta['title']}")
        return

    producer = Producer({
        "bootstrap.servers": args.brokers,
        "linger.ms": 50,
        "compression.type": "snappy",
        "enable.idempotence": True,
    })

    total_ev = 0
    ok = 0
    fallos = []
    resumen = []

    for i, zpath in enumerate(zips, 1):
        meta = summarize(meta_index.get(zpath.name))
        ds_id = meta["id"] or f"ATOMIC-{zpath.stem[:40]}"

        try:
            with zipfile.ZipFile(zpath) as zf:
                names = [n for n in zf.namelist() if n.endswith(".json")]
                if not names:
                    fallos.append((zpath.name, "sin json"))
                    continue
                enviados = 0
                for name in names:
                    with zf.open(name) as fh:
                        for line in fh:
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                event = json.loads(line)
                            except json.JSONDecodeError:
                                continue
                            host = (event.get("Hostname") or event.get("Computer") or "unknown")
                            producer.produce(
                                topic=args.topic,
                                key=str(host).encode("utf-8"),
                                value=json.dumps(event, ensure_ascii=False).encode("utf-8"),
                                timestamp=extract_ts(event) or 0,
                                headers={
                                    "dataset_id": ds_id,
                                    "source": "otrf-atomic",
                                    "techniques": ",".join(meta["techniques"]),
                                },
                            )
                            enviados += 1
                producer.poll(0)
                total_ev += enviados
                ok += 1
                resumen.append((ds_id, enviados, meta["techniques"], meta["title"]))
                print(f"[{i:3d}/{len(zips)}] {enviados:6d} ev  {str(meta['techniques']):24} "
                      f"{(meta['title'] or zpath.stem)[:46]}")
        except Exception as exc:
            fallos.append((zpath.name, f"{type(exc).__name__}: {exc}"))

    producer.flush()

    tecnicas = {t for _, _, techs, _ in resumen for t in techs}
    print(f"\nResumen")
    print(f"  Datasets cargados : {ok}/{len(zips)}")
    print(f"  Eventos totales   : {total_ev:,}")
    print(f"  Tecnicas distintas: {len(tecnicas)}")
    if fallos:
        print(f"  Fallos            : {len(fallos)}")
        for n, e in fallos[:5]:
            print(f"     {n}: {e}")


if __name__ == "__main__":
    main()