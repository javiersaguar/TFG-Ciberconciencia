"""Ajuste v2, parte 3: efecto de corregir la semántica de las palabras clave de Sigma.

El evaluador anclaba cada palabra clave sin campo al evento aplanado entero (`^valor$`), así que
las reglas con palabras clave casi nunca disparaban. Corregido el 07-11-2026: ahora es búsqueda de
subcadena, como define Sigma (detection/evaluator.py, match_keyword).

Este script MIDE el efecto sin tocar las alertas oficiales:
  - carga las mismas reglas que detect_job y se queda con las que tienen alguna palabra clave;
  - relee los topics normalizados de F3 y de FA (norm.events y norm.fa.*.events) desde el
    principio, sin confirmar offsets;
  - evalúa cada evento con la semántica antigua y con la nueva;
  - las alertas que SOLO aparecen con la nueva se construyen exactamente como las construiría
    detect_job (mismo event_hash y alert_id) y se guardan en tfg.alerts_kw, una tabla aparte.

Las vistas v2 de los patrones leen tfg.alerts ∪ tfg.alerts_kw; las oficiales, solo tfg.alerts.

Uso (desde la raíz del repo, con Redpanda y ClickHouse levantados):
  .venv/bin/python -m detection.evaluation.v2_palabras_clave
"""
import collections
import hashlib
import json
import re
import time
import uuid

import clickhouse_connect
from confluent_kafka import Consumer, TopicPartition
from sigma.conditions import ConditionAND, ConditionNOT, ConditionOR, ConditionValueExpression

import detection.evaluator as ev
from detection.loader import load_rules
from pipeline.jobs.detect_job import DEFAULT_RULE_DIRS, build_alert, header_value
from pipeline.jobs.sink_alerts import COLUMNS, to_row

TOPICS = re.compile(r"^norm\.(events|fa\..*\.events)$")
DDL = "CREATE TABLE IF NOT EXISTS tfg.alerts_kw AS tfg.alerts"


def tiene_palabra_clave(cond):
    if isinstance(cond, ConditionValueExpression):
        return True
    if isinstance(cond, (ConditionAND, ConditionOR, ConditionNOT)):
        return any(tiene_palabra_clave(a) for a in cond.args)
    return False


def main():
    rules, errors = load_rules([f"data/sigma/rules/windows/{d}" for d in DEFAULT_RULE_DIRS])
    compiladas = ev.compile_rules(rules)
    con_pc = [c for c in compiladas if any(tiene_palabra_clave(x) for x in c.conditions)]
    print(f"Reglas: {len(compiladas)}; con palabras clave: {len(con_pc)}", flush=True)

    ch = clickhouse_connect.get_client(host="127.0.0.1", port=8123, username="tfg", password="tfg", database="tfg")
    ch.command(DDL)
    ch.command("TRUNCATE TABLE tfg.alerts_kw")      # tabla propia de esta medida: se rehace entera

    consumer = Consumer({"bootstrap.servers": "localhost:9092", "group.id": f"v2-palabras-clave-{uuid.uuid4().hex[:8]}",
                         "enable.auto.commit": False, "auto.offset.reset": "earliest"})
    meta = consumer.list_topics(timeout=10)
    topics = sorted(t for t in meta.topics if TOPICS.match(t))
    asignadas, fin = [], {}
    for t in topics:
        for p in meta.topics[t].partitions:
            lo, hi = consumer.get_watermark_offsets(TopicPartition(t, p), timeout=10)
            if hi > lo:
                asignadas.append(TopicPartition(t, p, lo))
                fin[(t, p)] = hi
    consumer.assign(asignadas)
    print(f"Topics: {topics}; mensajes: {sum(fin.values()):,}", flush=True)

    pendientes = set(fin)
    leidos, nuevas, lote = 0, collections.Counter(), []
    por_regla, por_dataset = collections.Counter(), collections.Counter()
    t0 = time.time()
    while pendientes:
        msg = consumer.poll(1.0)
        if msg is None:
            continue
        if msg.error():
            raise RuntimeError(msg.error())
        clave = (msg.topic(), msg.partition())
        if msg.offset() >= fin[clave] - 1:
            pendientes.discard(clave)
        if clave not in fin or msg.offset() >= fin[clave]:
            continue
        leidos += 1
        payload = msg.value()
        evento = json.loads(payload)
        dataset = header_value(msg.headers(), "dataset_id")
        for c in con_pc:
            if not c.applies_to(evento):
                continue
            try:
                # Primero la semántica corregida: si no dispara, la antigua tampoco (una palabra que
                # es el evento entero también es una subcadena suya). Solo entonces se mira la antigua.
                ev.PALABRAS_CLAVE_V1 = False
                despues, matched = c.evaluate(evento)
                if not despues:
                    continue
                ev.PALABRAS_CLAVE_V1 = True
                antes, _ = c.evaluate(evento)
                ev.PALABRAS_CLAVE_V1 = False
            except ev.UnsupportedFeature:
                continue
            if despues and not antes:
                alerta = build_alert(c, matched, evento, dataset, hashlib.sha1(payload).hexdigest())
                alerta.setdefault("tfg", {})["detector"] = "v2-palabras-clave"
                lote.append(to_row(alerta))
                por_regla[(c.summary or {}).get("rule_title")] += 1
                por_dataset[dataset] += 1
        if len(lote) >= 500:
            ch.insert("alerts_kw", lote, column_names=COLUMNS)
            lote = []
        if leidos % 50_000 == 0:
            print(f"  {leidos:,} eventos, {sum(por_regla.values()):,} alertas nuevas, {leidos / (time.time() - t0):.0f} ev/s", flush=True)
    if lote:
        ch.insert("alerts_kw", lote, column_names=COLUMNS)
    consumer.close()
    ev.PALABRAS_CLAVE_V1 = False
    distintas = ch.query("SELECT count() FROM tfg.alerts_kw FINAL").result_rows[0][0]
    print(f"\nEventos releídos: {leidos:,}; alertas nuevas (solo con la semántica corregida): {distintas:,}")
    print("Por regla:", json.dumps(por_regla.most_common(20), ensure_ascii=False))
    print("Por dataset (top 15):", json.dumps(por_dataset.most_common(15), ensure_ascii=False))


if __name__ == "__main__":
    main()
