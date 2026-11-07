"""Ejecuta copias aisladas del CEP vigente y verifica F3 después del sink.

No modifica patrones. Ante fallo del cliente comprueba los jobs remotos y se
detiene; nunca repite un INSERT automáticamente.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from detection.evaluation.fa_execute import execute, module, sql, literal
from detection.evaluation.fa_transport import audit, save


def jobs():
    with urllib.request.urlopen("http://127.0.0.1:8081/jobs/overview", timeout=15) as response:
        return json.load(response)["jobs"]


def run(args):
    plan = json.loads((args.plan / "MANIFEST.json").read_text())
    run_id = plan["run_id"]
    directory = args.run_directory / "cep"
    directory.mkdir(parents=True, exist_ok=False)
    for entry in plan["sql"]:
        for path, expected in ((ROOT / entry["source"], entry["source_sha256"]),
                               (args.plan / entry["output"], entry["sha256"])):
            if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                raise ValueError(f"SQL distinto al revisado: {path}")
    active = [j for j in jobs() if j["state"] not in ("FINISHED", "CANCELED", "FAILED")]
    save(directory / "jobs-before.json", active)
    if active:
        raise ValueError("Hay jobs activos: revisar antes de ejecutar CEP")
    execute(plan["copy_command"], directory, "00-copy")
    for index, command in enumerate(plan["flink_commands"]):
        try:
            execute(command, directory, f"01-sql-{index}", timeout=550)
        except Exception:
            save(directory / f"jobs-at-failure-{index}.json", jobs())
            raise
        log = (directory / f"01-sql-{index}.log").read_text(errors="replace")
        if "[ERROR]" in log or "Could not execute SQL" in log:
            save(directory / f"jobs-at-failure-{index}.json", jobs())
            raise RuntimeError(f"Error SQL aunque el cliente devolvió cero: paso {index}")
        active = [j for j in jobs() if j["state"] not in ("FINISHED", "CANCELED", "FAILED")]
        if active:
            save(directory / f"jobs-at-failure-{index}.json", active)
            raise RuntimeError("Quedan jobs activos después de un paso supuestamente síncrono")
    campaigns = plan["topics"]["det.campaigns"]
    save(directory / "kafka-after-cep.json", audit([campaigns, *[plan["topics"][f"det.p{i}_flujo"] for i in (1, 2, 3)]]))
    execute(module("pipeline.jobs.sink_campaigns", "--topic", campaigns, "--group-id", run_id + "-campaigns",
                   "--from-beginning", "--idle-exit", "15"), directory, "02-sink-campaigns")
    before = ROOT / "data/fa/foto-f3-antes.json"
    execute(module("detection.evaluation.fa_snapshot", "capture-after", "--before", before,
                   "--output", directory / "after.json"), directory, "03-snapshot")
    execute(module("detection.evaluation.fa_snapshot", "compare", "--before", before,
                   "--after", directory / "after.json"), directory, "04-invariance")
    execute(module("detection.evaluation.fa_reconcile", "--run-directory", args.run_directory,
                   "--output", directory / "RECONCILIATION.json"), directory, "05-reconciliation")
    inputs = json.loads(args.inputs.read_text())
    ids = ",".join(literal(d["dataset_id"]) for d in inputs)
    report = {"run_id": run_id, "status": "ingested_detected_cep_evaluated",
              "datasets": [d["dataset_id"] for d in inputs], "events": [], "alerts": [], "campaigns": []}
    report["events"] = sql(f"SELECT dataset_id, device_hostname AS host, source_channel, count() AS n, min(time) AS first, max(time) AS last FROM tfg.events FINAL WHERE dataset_id IN ({ids}) GROUP BY dataset_id, host, source_channel ORDER BY dataset_id, host, source_channel")
    report["alerts"] = sql(f"SELECT dataset_id, device_hostname AS host, rule_id, rule_title, technique_ids, count() AS n FROM tfg.alerts FINAL WHERE dataset_id IN ({ids}) GROUP BY dataset_id, host, rule_id, rule_title, technique_ids ORDER BY dataset_id, n DESC")
    report["campaigns"] = sql(f"SELECT dataset_id, pattern_id, count() AS n, groupArray(campaign_id) AS campaign_ids FROM tfg.campaigns FINAL WHERE dataset_id IN ({ids}) GROUP BY dataset_id, pattern_id ORDER BY dataset_id, pattern_id")
    for dataset in inputs:
        observed = sum(int(e["n"]) for e in report["events"] if e["dataset_id"] == dataset["dataset_id"])
        dataset["stored_events_final"] = observed
    truth = sql(f"SELECT * FROM tfg.verdad_datasets FINAL WHERE dataset_id IN ({ids}) ORDER BY dataset_id")
    report["evaluation"] = []
    for row in truth:
        for pattern in ("P1", "P2", "P3"):
            count = sum(int(c["n"]) for c in report["campaigns"] if c["dataset_id"] == row["dataset_id"] and c["pattern_id"] == pattern)
            expected = int(row[pattern.lower() + "_esperado"])
            stored = sum(int(e["n"]) for e in report["events"] if e["dataset_id"] == row["dataset_id"])
            classification = ("VP" if count else "FN") if expected else ("FP_candidate" if count else "VN")
            if row["verdad"] == "red_sin_etiqueta":
                classification = "no_evaluable_patrones_host"
            elif not stored:
                classification = "no_evaluable_sin_eventos_soportados"
            report["evaluation"].append({"dataset_id": row["dataset_id"], "pattern": pattern,
                                         "expected_scenario": bool(expected), "campaigns": count,
                                         "classification": classification,
                                         "truth_scope": row["verdad"]})
    save(directory / "RESULTS.json", report)
    print(json.dumps({"events": sum(int(e["n"]) for e in report["events"]),
                      "alerts": sum(int(e["n"]) for e in report["alerts"]),
                      "campaigns": report["campaigns"], "evaluation": report["evaluation"]}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--run-directory", type=Path, required=True)
    parser.add_argument("--inputs", type=Path, required=True)
    run(parser.parse_args())


if __name__ == "__main__":
    main()
