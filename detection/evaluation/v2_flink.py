"""Ajuste v2 en Flink: detección con la semántica corregida y patrones v2, sobre topics aislados.

Las cifras oficiales (v1) no se tocan: tfg.alerts y tfg.campaigns no cambian. Para cada grupo de
datos (un topic normalizado ya existente) se hace:

  1. detección Sigma con la semántica de palabras clave corregida (detection/evaluator.py), del
     topic normalizado a det.v2.<grupo>.alerts;
  2. los patrones v2 de Flink (infra/flink/jobs/v2/) con los topics sustituidos: leen esas alertas y
     el topic normalizado, y escriben en det.v2.<grupo>.p{1,2,3}_flujo y det.v2.<grupo>.campaigns;
  3. sink de las campañas a tfg.campaigns_v2 (tabla aparte).

Se apoya en las funciones de fa_execute (procesos con tope de tiempo, detección por tandas,
auditoría de topics). Si algún topic del grupo ya existe, se detiene para no duplicar.

Uso (desde la raíz del repo, con Redpanda, Flink y ClickHouse levantados):
  .venv/bin/python -I detection/evaluation/v2_flink.py --grupos f3 day2 comiset1 comiset2b1 ...
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from detection.evaluation.fa_execute import execute, group_lag, module, save  # noqa: E402


TANDAS = 30


def detectar(d, topics, run, prefix="02-detect"):
    """Detección por tandas, como fa_execute.detect_stage, pero sin su auditoría del espacio FA: aquí
    también se LEE norm.events (corpus de F3), con un grupo nuevo y sin escribir en ningún topic de F3."""
    from confluent_kafka import Consumer, TopicPartition
    c = Consumer({"bootstrap.servers": "localhost:9092", "group.id": run + "-sondeo", "enable.auto.commit": False})
    try:
        meta = c.list_topics(timeout=15).topics[topics["norm"]]
        con_datos = sum(1 for p in meta.partitions
                        if (lambda lo_hi: lo_hi[1] > lo_hi[0])(c.get_watermark_offsets(TopicPartition(topics["norm"], p), timeout=15)))
    finally:
        c.close()
    instancias = max(1, con_datos)
    grupo = run + "-detector"
    # un solo equipo (LAB) cae en una partición: ~235 ev/s con la semántica v2 (la mitad en LAB), hasta 30 tandas de 9 min (margen para CPU en modo eco)
    for tanda in range(TANDAS):
        procesos = []
        for i in range(instancias):
            log = (d / f"{prefix}-tanda{tanda}-{i}.log").open("x")
            cmd = module("pipeline.jobs.detect_job", "--source-topic", topics["norm"], "--sink-topic", topics["alerts"],
                         "--dlq-topic", topics["detect_dlq"], "--group-id", grupo, "--from-beginning", "--idle-exit", "20")
            procesos.append((subprocess.Popen(["timeout", "540s", *cmd], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT), log))
        print(f"INICIO detección tanda {tanda}, {instancias} instancias", flush=True)
        codigos = []
        for proc, log in procesos:
            codigos.append(proc.wait())
            log.close()
        if any(x not in (0, 124) for x in codigos):
            raise RuntimeError(f"Fallo de detectores: {codigos}")
        pendiente = group_lag(grupo, topics["norm"])
        print(f"FIN tanda {tanda}; pendiente={pendiente}", flush=True)
        if pendiente == 0:
            return
    raise RuntimeError(f"Detección incompleta tras {TANDAS} tandas")

GRUPOS = {
    "f3": "norm.events",
    "day2": "norm.fa.fa-day2-20261107.events",
    "comiset1": "norm.fa.fa-comiset-20261107.events",
    **{f"comiset2b{k}": f"norm.fa.fa-comiset-v2-b{k}.events" for k in (1, 2, 3, 4)},
    "lab": "norm.fa.fa-comiset-lab.events",
    "vm": "norm.fa.fa-vm-lab.events",
}
SQL_V2 = ROOT / "infra/flink/jobs/v2"
PASOS = [("p1_comun.sql", "p1_06_flujo.sql"), ("p1_comun.sql", "p1_08_emision.sql"),
         ("p2_comun.sql", "p2_02_flujo.sql"), ("p2_comun.sql", "p2_04_emision.sql"),
         ("p3_comun.sql", "p3_01_flujo.sql"), ("p3_comun.sql", "p3_03_emision.sql")]
PROPIEDAD = re.compile(r"('(topic|properties\.group\.id)'\s*=\s*)'([^']+)'", re.I)


def topics_de(grupo, norm):
    return {"norm": norm, "alerts": f"det.v2.{grupo}.alerts", "detect_dlq": f"dlq.v2.{grupo}.detect",
            "campaigns": f"det.v2.{grupo}.campaigns",
            **{f"p{i}": f"det.v2.{grupo}.p{i}_flujo" for i in (1, 2, 3)}}


def aislar(sql, grupo, topics):
    mapa = {"norm.events": topics["norm"], "det.alerts": topics["alerts"], "det.campaigns": topics["campaigns"],
            **{f"det.p{i}_flujo": topics[f"p{i}"] for i in (1, 2, 3)}}

    def sustituir(m):
        prop, original = m.group(2).lower(), m.group(3)
        if prop == "topic":
            if original not in mapa:
                raise ValueError(f"topic no previsto en el SQL: {original}")
            return f"{m.group(1)}'{mapa[original]}'"
        return f"{m.group(1)}'v2-{grupo}-{original}'"
    return PROPIEDAD.sub(sustituir, sql)


def flink_activos():
    import urllib.request
    with urllib.request.urlopen("http://127.0.0.1:8081/jobs/overview", timeout=15) as r:
        return [j for j in json.load(r)["jobs"] if j["state"] not in ("FINISHED", "CANCELED", "FAILED")]


def ejecutar_grupo(grupo, norm, base):
    d = base / grupo
    d.mkdir(parents=True, exist_ok=False)
    topics = topics_de(grupo, norm)
    from confluent_kafka.admin import AdminClient
    existentes = AdminClient({"bootstrap.servers": "localhost:9092"}).list_topics(timeout=15).topics
    if norm not in existentes:
        raise ValueError(f"No existe el topic normalizado {norm}")
    if any(t in existentes for k, t in topics.items() if k != "norm"):
        raise ValueError(f"Ya existe algún topic v2 de {grupo}: se detiene para no duplicar")
    for i, (k, t) in enumerate((k, t) for k, t in topics.items() if k != "norm"):
        particiones = 1 if "dlq" in k else 3
        execute(["docker", "exec", "redpanda", "rpk", "topic", "create", t, "-p", str(particiones),
                 "-c", "retention.ms=-1"], d, f"01-topic-{i}-{k}")
    # 1) detección v2 (semántica corregida: nunca con TFG_SIGMA_PALABRAS_CLAVE=v1)
    os.environ.pop("TFG_SIGMA_PALABRAS_CLAVE", None)
    # el consumidor de FA exige grupos fa-*: el prefijo de estos grupos es fa-v2-
    detectar(d, topics, f"fa-v2-{grupo}")
    # 2) patrones v2 en Flink
    sql_dir = d / "sql"
    sql_dir.mkdir()
    manifiesto = {"grupo": grupo, "topics": topics, "sql": []}
    for f in sorted({x for paso in PASOS for x in paso}):
        origen = (SQL_V2 / f).read_text(encoding="utf-8")
        salida = aislar(origen, grupo, topics)
        (sql_dir / f).write_text(salida, encoding="utf-8")
        manifiesto["sql"].append({"fuente": str((SQL_V2 / f).relative_to(ROOT)),
                                  "sha256_fuente": hashlib.sha256(origen.encode()).hexdigest(),
                                  "sha256": hashlib.sha256(salida.encode()).hexdigest()})
    save(d / "MANIFEST.json", manifiesto)
    if flink_activos():
        raise ValueError("Hay jobs de Flink activos: revisar antes de ejecutar")
    destino = f"/tmp/v2-{grupo}"
    execute(["docker", "cp", str(sql_dir), f"flink-jobmanager:{destino}"], d, "03-copia")
    for i, (comun, paso) in enumerate(PASOS):
        execute(["timeout", "540s", "docker", "exec", "-i", "flink-jobmanager", "./bin/sql-client.sh",
                 "-i", f"{destino}/{comun}", "-f", f"{destino}/{paso}"], d, f"04-sql-{i}", timeout=550)
        log = (d / f"04-sql-{i}.log").read_text(errors="replace")
        if "[ERROR]" in log or "Could not execute SQL" in log:
            raise RuntimeError(f"Error SQL en {paso} ({grupo})")
        if flink_activos():
            raise RuntimeError("Quedan jobs de Flink activos tras un paso síncrono")
    # 3) campañas a la tabla v2
    execute(module("pipeline.jobs.sink_campaigns", "--topic", topics["campaigns"], "--group-id", f"fa-v2-{grupo}-campaigns",
                   "--from-beginning", "--idle-exit", "15", "--tabla", "campaigns_v2"), d, "05-sink-campaigns")
    save(d / "COMPLETO.json", {"grupo": grupo, "fin": time.time()})
    print(f"Grupo {grupo}: completo", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--grupos", nargs="+", required=True, choices=sorted(GRUPOS))
    ap.add_argument("--salida", type=Path, default=Path("data/fa/v2-flink"))
    args = ap.parse_args()
    base = ROOT / args.salida
    base.mkdir(parents=True, exist_ok=True)
    for g in args.grupos:
        print(f"== {g} ({GRUPOS[g]}) {time.strftime('%H:%M')}", flush=True)
        ejecutar_grupo(g, GRUPOS[g], base)


if __name__ == "__main__":
    main()
