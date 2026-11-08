"""Carga aislada y verificable de un lote FA, sin recrear los topics de F3.

La ejecución requiere autorización de Javier. Cada paso deja registro y no se
reintenta automáticamente una publicación o un INSERT. Usa los jobs vigentes.
"""
import argparse
import csv
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.request
import urllib.parse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from detection.evaluation.fa_transport import audit, save

PY = str(ROOT / ".venv/bin/python")
BOOT = "import pathlib,runpy,sys; sys.path.insert(0,str(pathlib.Path.cwd().resolve())); from pipeline.normalize.fa_consumer import install; install(); runpy.run_module(sys.argv.pop(1),run_name='__main__')"


def module(name, *args):
    return [PY, "-I", "-u", "-c", BOOT, name, *map(str, args)]


def group_lag(group, topic):
    from confluent_kafka import Consumer, TopicPartition
    consumer = Consumer({"bootstrap.servers": "localhost:9092", "group.id": group, "enable.auto.commit": False})
    try:
        metadata = consumer.list_topics(timeout=15).topics[topic]
        partitions = [TopicPartition(topic, p) for p in metadata.partitions]
        offsets = consumer.committed(partitions, timeout=15)
        return sum(consumer.get_watermark_offsets(p, timeout=15)[1] - max(p.offset, 0) for p in offsets)
    finally:
        consumer.close()


# Un solo equipo cae en una sola partición y lo detecta un único proceso (~250 ev/s en COMISET LAB):
# hacen falta más de tres tandas de 9 min. Cada tanda sigue desde los offsets confirmados.
TANDAS = 8


def detect_stage(directory, topics, run, prefix="05-detect", first_wave=0):
    group = run + "-detector"
    partitions = audit([topics["norm"]])[topics["norm"]]["partitions"]
    instances = max(1, sum(p["records"] > 0 for p in partitions))
    for wave in range(first_wave, TANDAS):
        workers = []
        for index in range(instances):
            path = directory / f"{prefix}-wave{wave}-{index}.log"
            log = path.open("x")
            command = module("pipeline.jobs.detect_job", "--source-topic", topics["norm"], "--sink-topic", topics["alerts"],
                             "--dlq-topic", topics["detect_dlq"], "--group-id", group, "--from-beginning", "--idle-exit", "20")
            process = subprocess.Popen(["timeout", "540s", *command], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
            workers.append((process, log))
        print(f"INICIO detección tanda {wave}, {instances} instancias", flush=True)
        codes = []
        for process, log in workers:
            codes.append(process.wait())
            log.close()
        if any(code not in (0, 124) for code in codes):
            raise RuntimeError(f"Fallo de detectores: {codes}")
        lag = group_lag(group, topics["norm"])
        print(f"FIN tanda {wave}; lag pendiente={lag}", flush=True)
        if lag == 0:
            return
        # Solo se continúa el MISMO grupo desde offsets confirmados. No replay.
    raise RuntimeError(f"Detección incompleta tras {TANDAS} tandas; revisar antes de continuar")


def sql(query, write=False):
    params = urllib.parse.urlencode({"database": "tfg", "default_format": "JSONEachRow",
                                     "readonly": "0" if write else "1", "max_execution_time": "90"})
    request = urllib.request.Request("http://127.0.0.1:8123/?" + params, data=query.encode(), method="POST")
    request.add_header("X-ClickHouse-User", "tfg")
    request.add_header("X-ClickHouse-Key", "tfg")
    with urllib.request.urlopen(request, timeout=120) as response:
        return [json.loads(line) for line in response if line.strip()]


def literal(value):
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def execute(command, directory, name, timeout=540):
    log = directory / f"{name}.log"
    if log.exists():
        raise ValueError(f"Paso ya registrado: {log}; revisar antes de repetir")
    print(f"INICIO {name}", flush=True)
    with log.open("x") as target:
        result = subprocess.run(command, cwd=ROOT, stdout=target, stderr=subprocess.STDOUT,
                                timeout=timeout, env={**os.environ, "PYTHONUNBUFFERED": "1"})
    if result.returncode:
        raise RuntimeError(f"Falló {name}: exit={result.returncode}; consultar {log}")
    print(f"OK {name}", flush=True)


def add_truth(paths):
    rows = []
    for path in paths:
        with path.open(newline="", encoding="utf-8") as source:
            rows.extend(csv.DictReader(source))
    for row in rows:
        if row["dataset_id"] in ("SDWIN-200501225525", "SDWIN-201018195009") or row["dataset_id"].startswith("LSASS_"):
            raise ValueError("No se modifica la verdad F3")
        if sql(f"SELECT dataset_id FROM tfg.verdad_datasets FINAL WHERE dataset_id={literal(row['dataset_id'])}"):
            raise ValueError(f"Ya existe verdad para {row['dataset_id']}; revisar antes de repetir")
        record = dict(row)
        for key in ("p1_esperado", "p2_esperado", "p3_esperado"):
            record[key] = int(record[key])
        sql("INSERT INTO tfg.verdad_datasets FORMAT JSONEachRow\n" + json.dumps(record, ensure_ascii=False), write=True)
    return rows


def finish_ingest(directory, topics, run):
    for job, source in (("sink_clickhouse", "norm"), ("sink_alerts", "alerts")):
        execute(module("pipeline.jobs." + job, "--topic", topics[source], "--group-id", run + "-" + source,
                       "--from-beginning", "--idle-exit", "15", "--ch-host", "127.0.0.1"), directory, "06-" + job)
    before = ROOT / "data/fa/foto-f3-antes.json"
    execute(module("detection.evaluation.fa_snapshot", "capture-after", "--before", before,
                   "--output", directory / "after-ingest.json"), directory, "07-snapshot")
    execute(module("detection.evaluation.fa_snapshot", "compare", "--before", before,
                   "--after", directory / "after-ingest.json"), directory, "08-invariance")
    save(directory / "INGEST_COMPLETE.json", {"run_id": run, "f3_unchanged": True})


def run(args):
    if not re.fullmatch(r"fa-[a-z0-9-]+", args.run_id):
        raise ValueError("run-id inválido")
    if args.zeek and not args.fa:
        raise ValueError("Zeek requiere el despachador --fa")
    directory = ROOT / args.output
    directory.mkdir(parents=True, exist_ok=False)
    datasets = json.loads(args.inputs.read_text())
    if not datasets:
        raise ValueError("Lote sin datasets")
    run = args.run_id
    topics = {"raw": "raw.net.zeek" if args.zeek else f"raw.fa.{run}.host.windows",
              "norm": f"norm.fa.{run}.events", "alerts": f"det.fa.{run}.alerts",
              "normalize_dlq": f"dlq.fa.{run}.normalize", "detect_dlq": f"dlq.fa.{run}.detect",
              "campaigns": f"det.fa.{run}.campaigns",
              **{f"p{i}": f"det.fa.{run}.p{i}_flujo" for i in (1, 2, 3)}}
    from confluent_kafka.admin import AdminClient
    existing = AdminClient({"bootstrap.servers": "localhost:9092"}).list_topics(timeout=15).topics
    if any(t in existing for t in topics.values()):
        raise ValueError("Ya existe algún topic de este lote: se detiene para evitar duplicaciones")
    for table in ("events", "alerts", "campaigns"):
        ids = ",".join(literal(d["dataset_id"]) for d in datasets)
        if int(sql(f"SELECT count() AS n FROM tfg.{table} FINAL WHERE dataset_id IN ({ids})")[0]["n"]):
            raise ValueError(f"El corpus ya contiene filas en {table}; revisar antes de repetir")
    before = ROOT / "data/fa/foto-f3-antes.json"
    execute(module("detection.evaluation.fa_snapshot", "capture-after", "--before", before,
                   "--output", directory / "before.json"), directory, "00-before")
    execute(module("detection.evaluation.fa_snapshot", "compare", "--before", before,
                   "--after", directory / "before.json"), directory, "01-compare-before")
    for index, (name, topic) in enumerate(topics.items()):
        partitions = 1 if "dlq" in name else (6 if name == "norm" else 3)
        execute(["docker", "exec", "redpanda", "rpk", "topic", "create", topic, "-p", str(partitions),
                 "-c", "retention.ms=-1"], directory, f"02-topic-{index}-{name}")
    save(directory / "RUN.json", {"run_id": run, "datasets": datasets, "topics": topics,
                                   "status": "started", "started_epoch": time.time()})
    truth_rows = add_truth(args.truth_csv)
    save(directory / "truth-loaded.json", truth_rows)
    for index, dataset in enumerate(datasets):
        command = module("detection.evaluation.fa_transport", "replay", "--file", dataset["file"],
                         "--dataset-id", dataset["dataset_id"], "--source", dataset["source"],
                         "--topic", topics["raw"], "--expected", dataset["records"],
                         "--report", directory / f"replay-{index}.json")
        if index:
            command.append("--append")
        execute(command, directory, f"03-replay-{index}")
    normalize_module = "pipeline.normalize.fa_job" if args.fa else "pipeline.jobs.normalize_job"
    execute(module(normalize_module, "--source-topic", topics["raw"], "--sink-topic", topics["norm"],
                   "--dlq-topic", topics["normalize_dlq"], "--group-id", run + "-normalizer",
                   "--from-beginning", "--idle-exit", "15"), directory, "04-normalize")
    counts = audit(list(topics.values()))
    save(directory / "after-normalize.json", counts)
    if counts[topics["raw"]]["records"] != counts[topics["norm"]]["records"] + counts[topics["normalize_dlq"]]["records"]:
        raise RuntimeError("Pérdida o duplicación en normalización")
    detect_stage(directory, topics, run)
    after_detect(directory, topics, run, args)


def after_detect(directory, topics, run, args):
    counts = audit(list(topics.values()))
    save(directory / "after-detect.json", counts)
    consumed = alerts = dlq = 0
    for path in directory.glob("05-detect-wave*.log"):
        text = path.read_text()
        consumed += int(re.search(r"  Eventos\s+: (\d+)", text)[1])
        alerts += int(re.search(r"  Alertas\s+: (\d+)", text)[1])
        dlq += int(re.search(r"  A DLQ\s+: (\d+)", text)[1])
    if consumed < counts[topics["norm"]]["records"] or alerts != counts[topics["alerts"]]["records"] or dlq != counts[topics["detect_dlq"]]["records"]:
        raise RuntimeError("Cardinalidad incorrecta entre detección y Kafka")
    finish_ingest(directory, topics, run)
    print("Lote normalizado/detectado y almacenado; invariancia F3 comprobada. CEP pendiente.", flush=True)
    if args.cep_plan:
        from detection.evaluation.fa_cep import run as run_cep
        run_cep(argparse.Namespace(plan=args.cep_plan, run_directory=directory, inputs=args.inputs))


def resume(args):
    """Reanuda un lote cuya detección se quedó a medias (pasó el tope de tandas).

    Solo continúa el MISMO grupo del detector desde sus offsets confirmados, numerando las tandas
    a partir de las ya hechas; después aplica los mismos controles que run(). No vuelve a crear
    topics, ni a cargar verdad, ni a hacer replay."""
    directory = ROOT / args.output
    state = json.loads((directory / "RUN.json").read_text())
    if state["run_id"] != args.run_id:
        raise ValueError("El directorio es de otro run-id")
    if (directory / "INGEST_COMPLETE.json").exists() or (directory / "after-detect.json").exists():
        raise ValueError("Este lote ya pasó la detección: no se reanuda")
    topics = state["topics"]
    counts = audit([topics["norm"], topics["raw"], topics["normalize_dlq"]])
    if counts[topics["raw"]]["records"] != counts[topics["norm"]]["records"] + counts[topics["normalize_dlq"]]["records"]:
        raise RuntimeError("Pérdida o duplicación en normalización")
    hechas = len(list(directory.glob("05-detect-wave*-0.log")))
    print(f"Reanudación de {args.run_id}: {hechas} tandas hechas, lag={group_lag(args.run_id + '-detector', topics['norm'])}", flush=True)
    detect_stage(directory, topics, args.run_id, first_wave=hechas)
    after_detect(directory, topics, args.run_id, args)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resume", action="store_true", help="Reanudar la detección de un lote a medias")
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--inputs", type=Path, required=True)
    parser.add_argument("--truth-csv", type=Path, action="append", default=[])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--fa", action="store_true")
    parser.add_argument("--zeek", action="store_true")
    parser.add_argument("--cep-plan", type=Path)
    args = parser.parse_args()
    resume(args) if args.resume else run(args)


if __name__ == "__main__":
    main()
