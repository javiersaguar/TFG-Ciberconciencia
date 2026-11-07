"""Foto reproducible de F3; capture requiere aprobación de uso de ClickHouse.

No ejecuta DDL/DML ni lanza contenedores. ``compare`` solo lee dos ficheros.
El SQL original se conserva; la comparación de F3 usa su universo congelado.
"""
import argparse
import collections
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
TABLES = {
    "events": "dataset_id, device_hostname, source_channel, record_number",
    "alerts": "dataset_id, alert_id",
    "campaigns": "dataset_id, campaign_id",
    "verdad_datasets": "dataset_id",
}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def quoted(value):
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def statements(sql):
    # El fichero revisado no contiene cadenas con ';' ni comentarios de bloque.
    cleaned = re.sub(r"--[^\n]*", "", sql)
    return [s.strip() for s in cleaned.split(";") if s.strip()]


def scoped_statement(statement, dataset_ids):
    """Restringe las tablas con CTE; no modifica el fichero SQL de cierre."""
    ids = ",".join(map(quoted, dataset_ids))
    ctes = []
    result = statement
    for table in ("alerts", "campaigns", "verdad_datasets"):
        ctes.append(f"f3_{table} AS (SELECT * FROM tfg.{table} FINAL WHERE dataset_id IN ({ids}))")
        pattern = rf"\btfg\.{table}\b(?:\s+(AS\s+\w+)\s+FINAL|\s+FINAL)?"
        result = re.sub(pattern, lambda m: f"f3_{table}" + (f" {m[1]}" if m[1] else ""), result, flags=re.I)
    prefix = "WITH " + ",\n".join(ctes)
    if re.match(r"^WITH\b", result, re.I):
        return prefix + ",\n" + result[4:].lstrip()
    return prefix + "\n" + result


def rows(query, host):
    params = urllib.parse.urlencode({"database": "tfg", "default_format": "JSONEachRow",
                                     "readonly": "1", "max_execution_time": "90"})
    request = urllib.request.Request(host.rstrip("/") + "/?" + params,
                                     data=query.encode(), method="POST")
    # Credenciales de desarrollo iguales a los sinks existentes. No se imprimen.
    request.add_header("X-ClickHouse-User", "tfg")
    request.add_header("X-ClickHouse-Key", "tfg")
    with urllib.request.urlopen(request, timeout=120) as response:
        for line in response:
            if line.strip():
                yield json.loads(line)


def capture(output, host):
    if output.exists():
        raise SystemExit(f"No se sobrescribe la foto existente: {output}")
    truth = ROOT / "detection/evaluation/verdad_datasets.csv"
    with truth.open(newline="", encoding="utf-8") as source:
        # El CSV incorpora FA sin redefinir el corpus congelado del cierre F3.
        dataset_ids = sorted({r["dataset_id"] for r in csv.DictReader(source)
                              if r.get("origen") in ("corpus", "atomico")})
    return capture_with_ids(output, host, dataset_ids)


def capture_with_ids(output, host, dataset_ids):
    if output.exists():
        raise SystemExit(f"No se sobrescribe la foto existente: {output}")
    if not dataset_ids or len(dataset_ids) != len(set(dataset_ids)):
        raise ValueError("El universo congelado debe contener IDs únicos y no estar vacío")
    close_sql = (ROOT / "detection/evaluation/f3_cierre.sql").read_text()
    report = {"schema_version": 1, "dataset_ids": dataset_ids,
              "captured_at_utc": datetime.now(timezone.utc).isoformat(),
              "f3_sql_sha256": hashlib.sha256(close_sql.encode()).hexdigest(),
              "f3_sql_original": close_sql, "tables": {}}
    ids = ",".join(map(quoted, dataset_ids))
    for table, ordering in TABLES.items():
        digest = hashlib.sha256()
        per_dataset = collections.defaultdict(lambda: {"rows": 0, "sha256": hashlib.sha256()})
        query = f"SELECT * FROM tfg.{table} FINAL WHERE dataset_id IN ({ids}) ORDER BY {ordering}"
        for row in rows(query, host):
            if row.get("dataset_id") not in dataset_ids:
                raise ValueError(f"Fila de {table} sin dataset_id del universo F3")
            raw = canonical(row) + b"\n"
            digest.update(raw)
            entry = per_dataset[row["dataset_id"]]
            entry["rows"] += 1
            entry["sha256"].update(raw)
        report["tables"][table] = {
            "sha256": digest.hexdigest(),
            "datasets": {d: {"rows": e["rows"], "sha256": e["sha256"].hexdigest()}
                         for d, e in sorted(per_dataset.items())}}
    truth = report["tables"]["verdad_datasets"]["datasets"]
    if set(truth) != set(dataset_ids) or any(v["rows"] != 1 for v in truth.values()):
        raise ValueError("La verdad en ClickHouse no coincide con los IDs F3 congelados")
    report["f3_cierre_global"] = []
    report["f3_cierre_frozen"] = []
    for statement in statements(close_sql):
        report["f3_cierre_global"].append(sorted(list(rows(statement, host)), key=canonical))
        report["f3_cierre_frozen"].append(sorted(list(rows(scoped_statement(statement, dataset_ids), host)), key=canonical))
    output.parent.mkdir(parents=True, exist_ok=True)
    validate_snapshot(report)
    with output.open("x", encoding="utf-8") as target:
        json.dump(report, target, indent=2, ensure_ascii=False)
        target.write("\n")
    print(json.dumps({"snapshot": str(output), "datasets": len(dataset_ids),
                      "counts": {t: sum(d["rows"] for d in v["datasets"].values())
                                 for t, v in report["tables"].items()}}, indent=2))


def validate_snapshot(snapshot):
    """Rechaza fotos incompletas: dos ficheros vacíos no prueban invariancia."""
    if snapshot.get("schema_version") != 1:
        raise ValueError("Falta schema_version=1")
    ids = snapshot.get("dataset_ids")
    if not isinstance(ids, list) or not ids or len(set(ids)) != len(ids):
        raise ValueError("dataset_ids ausente, vacío o duplicado")
    if not all(isinstance(d, str) and d for d in ids):
        raise ValueError("dataset_id inválido")
    if set(snapshot.get("tables", {})) != set(TABLES):
        raise ValueError("Falta alguna tabla protegida")
    for table in snapshot["tables"].values():
        if not re.fullmatch(r"[0-9a-f]{64}", table.get("sha256", "")):
            raise ValueError("SHA256 de tabla ausente o inválido")
        if not isinstance(table.get("datasets"), dict) or not set(table["datasets"]) <= set(ids):
            raise ValueError("Desglose de datasets ausente o ajeno a F3")
        for dataset in table["datasets"].values():
            if not isinstance(dataset.get("rows"), int) or dataset["rows"] < 0:
                raise ValueError("Recuento ausente o inválido")
            if not re.fullmatch(r"[0-9a-f]{64}", dataset.get("sha256", "")):
                raise ValueError("SHA256 por dataset ausente o inválido")
    truth = snapshot["tables"]["verdad_datasets"]["datasets"]
    if set(truth) != set(ids) or any(v["rows"] != 1 for v in truth.values()):
        raise ValueError("La verdad no cubre exactamente los IDs F3 congelados")
    for field in ("f3_cierre_global", "f3_cierre_frozen"):
        if not isinstance(snapshot.get(field), list) or len(snapshot[field]) != 6:
            raise ValueError(f"{field} no contiene las seis consultas")
    if not re.fullmatch(r"[0-9a-f]{64}", snapshot.get("f3_sql_sha256", "")):
        raise ValueError("Falta SHA256 del SQL de cierre")


def compare(before_path, after_path):
    before, after = (json.loads(p.read_text()) for p in (before_path, after_path))
    validate_snapshot(before)
    validate_snapshot(after)
    keys = ("schema_version", "dataset_ids", "f3_sql_sha256", "tables", "f3_cierre_frozen")
    differences = [k for k in keys if before.get(k) != after.get(k)]
    result = {"f3_unchanged": not differences, "differences": differences,
              "global_result_changed": before.get("f3_cierre_global") != after.get("f3_cierre_global")}
    print(json.dumps(result, indent=2))
    if differences:
        raise SystemExit("La foto de F3 cambió: detener las cargas y avisar a Javier")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("capture", "capture-after"):
        command = sub.add_parser(name)
        command.add_argument("--output", type=Path, required=True)
        command.add_argument("--host", default="http://127.0.0.1:8123")
        if name == "capture-after":
            command.add_argument("--before", type=Path, required=True)
    command = sub.add_parser("compare")
    command.add_argument("--before", type=Path, required=True)
    command.add_argument("--after", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "capture":
        capture(args.output, args.host)
    elif args.command == "capture-after":
        before = json.loads(args.before.read_text())
        validate_snapshot(before)
        capture_with_ids(args.output, args.host, before["dataset_ids"])
    else:
        compare(args.before, args.after)


if __name__ == "__main__":
    main()
