"""Mide la cobertura de normalizacion sobre un dataset JSON Lines."""
import argparse
import collections
import json

from pipeline.normalize.registry import normalize, UnmappedEvent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--show-samples", action="store_true",
                    help="Muestra un evento OCSF de ejemplo por cada clase")
    args = ap.parse_args()

    total = ok = 0
    fallos = collections.Counter()
    por_clase = collections.Counter()
    muestras = {}

    with open(args.file, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            total += 1
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                fallos["json_invalido"] += 1
                continue

            try:
                ocsf = normalize(event, dataset_id="SDWIN-201018195009")
            except UnmappedEvent as exc:
                fallos[str(exc)] += 1
                continue

            ok += 1
            clase = f'{ocsf["class_uid"]} {ocsf.get("type_name", "")}'
            por_clase[clase] += 1
            muestras.setdefault(clase, ocsf)

    print(f"Eventos totales      : {total}")
    print(f"Normalizados         : {ok}")
    print(f"Sin mapeador (DLQ)   : {total - ok}")
    print(f"COBERTURA            : {ok / total * 100:.1f} %" if total else "sin datos")

    print("\nPor clase OCSF:")
    for clase, n in por_clase.most_common():
        print(f"  {n:5d}  {clase}")

    print("\nMotivos de no mapeo (top 15):")
    for motivo, n in fallos.most_common(15):
        print(f"  {n:5d}  {motivo}")

    if args.show_samples:
        for clase, ocsf in muestras.items():
            print(f"\n--- Ejemplo {clase} ---")
            print(json.dumps(ocsf, indent=2, ensure_ascii=False)[:800])


if __name__ == "__main__":
    main()