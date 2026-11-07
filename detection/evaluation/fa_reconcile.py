"""Reconciliación FA de solo lectura: offsets, identidades Kafka/ClickHouse y DLQ.

Consume por asignación directa hasta un corte fijo, sin subscribe ni commits.
No inserta, borra, recrea ni modifica topics, tablas o grupos de F3.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from detection.evaluation.fa_transport import validate_topic, save, audit
from detection.evaluation.fa_execute import sql, literal


def header(headers, name):
    for key, value in headers or []:
        if key == name:
            return value.decode() if isinstance(value, bytes) else value
    return None


def identity(event):
    tfg = event.get("tfg") or {}
    host = (event.get("device") or {}).get("hostname")
    values = (tfg.get("dataset_id"), host, tfg.get("source_channel"), tfg.get("record_number"))
    if not all(v is not None for v in values) or not values[0] or not host:
        raise ValueError("Evento normalizado sin identidad completa")
    return (str(values[0]), str(host), str(values[2]), int(values[3]))


def fingerprint(values):
    digest = hashlib.sha256()
    for value in sorted(values):
        digest.update(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode() + b"\n")
    return digest.hexdigest()


def compare_sets(published, stored, datasets):
    result = {}
    for dataset in sorted(datasets):
        kafka = published.get(dataset, set())
        clickhouse = stored.get(dataset, set())
        result[dataset] = {"kafka_unique": len(kafka), "clickhouse_final_unique": len(clickhouse),
                           "kafka_sha256": fingerprint(kafka), "clickhouse_sha256": fingerprint(clickhouse),
                           "missing_in_clickhouse": len(kafka - clickhouse),
                           "extra_in_clickhouse": len(clickhouse - kafka), "equal": kafka == clickhouse}
    return result


def read_topic(topic):
    validate_topic(topic)
    from confluent_kafka import Consumer, TopicPartition, KafkaError
    consumer = Consumer({"bootstrap.servers": "localhost:9092", "group.id": "fa-readonly-reconciliation",
                         "enable.auto.commit": False, "enable.auto.offset.store": False,
                         "allow.auto.create.topics": False, "enable.partition.eof": True})
    try:
        info = consumer.list_topics(topic=topic, timeout=15).topics.get(topic)
        if info is None or info.error:
            raise ValueError(f"Topic ausente: {topic}")
        cutoffs = {}
        partitions = []
        for partition in sorted(info.partitions):
            low, high = consumer.get_watermark_offsets(TopicPartition(topic, partition), timeout=15, cached=False)
            if low != 0:
                raise ValueError(f"Retención/recorte en {topic}[{partition}]")
            cutoffs[partition] = high
            if high > low:
                partitions.append(TopicPartition(topic, partition, low))
        consumer.assign(partitions)
        pending = {p.partition for p in partitions}
        last_progress = time.monotonic()
        while pending:
            message = consumer.poll(1)
            if message is None:
                if time.monotonic() - last_progress > 90:
                    raise TimeoutError(f"Lectura sin progreso: {topic}")
                continue
            if message.error():
                if message.error().code() == KafkaError._PARTITION_EOF:
                    if message.offset() >= cutoffs[message.partition()]:
                        pending.discard(message.partition())
                    continue
                raise RuntimeError(str(message.error()))
            partition = message.partition()
            if message.offset() >= cutoffs[partition]:
                pending.discard(partition)
                continue
            last_progress = time.monotonic()
            yield message
            if message.offset() + 1 >= cutoffs[partition]:
                pending.discard(partition)
    finally:
        consumer.close()


def offsets(group, topic):
    validate_topic(topic)
    if not re.fullmatch(r"fa-[a-z0-9-]+-(normalizer|detector)", group):
        raise ValueError("Grupo fuera de FA: no se consulta un grupo F3")
    from confluent_kafka import Consumer, TopicPartition
    consumer = Consumer({"bootstrap.servers": "localhost:9092", "group.id": group,
                         "enable.auto.commit": False, "enable.auto.offset.store": False,
                         "allow.auto.create.topics": False})
    try:
        info = consumer.list_topics(topic=topic, timeout=15).topics.get(topic)
        if info is None or info.error:
            raise ValueError(f"Topic ausente: {topic}")
        partitions = [TopicPartition(topic, p) for p in sorted(info.partitions)]
        committed = consumer.committed(partitions, timeout=15)
        result = []
        for part in committed:
            low, high = consumer.get_watermark_offsets(part, timeout=15, cached=False)
            cursor = max(part.offset, 0)
            result.append({"partition": part.partition, "low": low, "high": high,
                           "committed": part.offset, "lag": max(high - cursor, 0),
                           "at_end": cursor == high, "invalid_ahead": cursor > high})
        return {"group": group, "topic": topic, "partitions": result,
                "at_end": all(p["at_end"] for p in result), "lag": sum(p["lag"] for p in result)}
    finally:
        consumer.close()


def run(args):
    meta = json.loads((args.run_directory / "RUN.json").read_text())
    topics, run_id = meta["topics"], meta["run_id"]
    if not re.fullmatch(r"fa-[a-z0-9-]+", run_id):
        raise ValueError("Run ID ajeno a FA")
    for topic in topics.values():
        validate_topic(topic)
    datasets = {d["dataset_id"] for d in meta["datasets"]}
    checked_topics = [topics[k] for k in ("raw", "norm", "alerts", "normalize_dlq", "detect_dlq")]
    watermarks_before = audit(checked_topics)
    raw_refs = collections.defaultdict(set)
    raw_count = collections.Counter()
    for message in read_topic(topics["raw"]):
        dataset = header(message.headers(), "dataset_id")
        if dataset not in datasets:
            raise ValueError("Dataset de raw fuera del lote")
        raw_count[dataset] += 1
        raw_refs[hashlib.sha256(message.value()).digest()].add((dataset, header(message.headers(), "line_no")))
    norm_values = collections.defaultdict(set)
    norm_count = collections.Counter()
    for message in read_topic(topics["norm"]):
        item = identity(json.loads(message.value()))
        if item[0] not in datasets:
            raise ValueError("Dataset normalizado fuera del lote")
        norm_values[item[0]].add(item)
        norm_count[item[0]] += 1
    alert_values = collections.defaultdict(set)
    alert_count = collections.Counter()
    for message in read_topic(topics["alerts"]):
        event = json.loads(message.value())
        dataset = (event.get("tfg") or {}).get("dataset_id")
        alert_id = event.get("alert_id")
        if dataset not in datasets or not isinstance(alert_id, str) or not alert_id:
            raise ValueError("Alerta sin identidad o ajena al lote")
        alert_values[dataset].add(alert_id)
        alert_count[dataset] += 1
    dlq = {}
    for stage, key in (("normalize", "normalize_dlq"), ("detect", "detect_dlq")):
        groups, details = collections.Counter(), []
        for message in read_topic(topics[key]):
            raw = json.loads(message.value())
            refs = raw_refs.get(hashlib.sha256(message.value()).digest(), set()) if stage == "normalize" else set()
            candidate_ids = {r[0] for r in refs}
            dataset = (raw.get("tfg") or {}).get("dataset_id") or header(message.headers(), "dataset_id")
            if dataset is None and len(candidate_ids) == 1:
                dataset = next(iter(candidate_ids))
            reason = header(message.headers(), "error") or "MOTIVO_AUSENTE"
            if dataset not in datasets:
                dataset = "UNRESOLVED"
            groups[(dataset, reason)] += 1
            details.append({"dataset_id": dataset, "error": reason,
                            "topic_partition_offset": [message.topic(), message.partition(), message.offset()],
                            "source_lines": sorted([list(r) for r in refs]),
                            "source_ref": raw.get("_tfg_source_ref"),
                            "record_number": raw.get("RecordNumber") or (raw.get("tfg") or {}).get("record_number")})
        dlq[stage] = {"records": len(details), "by_dataset_error": [
            {"dataset_id": d, "error": e, "records": n} for (d, e), n in sorted(groups.items())], "details": details}
    ids = ",".join(literal(d) for d in sorted(datasets))
    event_rows = sql(f"SELECT dataset_id,device_hostname,source_channel,record_number FROM tfg.events FINAL WHERE dataset_id IN ({ids})")
    stored_events = collections.defaultdict(set)
    for row in event_rows:
        item = (str(row["dataset_id"]), str(row["device_hostname"]), str(row["source_channel"]), int(row["record_number"]))
        stored_events[item[0]].add(item)
    stored_alerts = collections.defaultdict(set)
    for row in sql(f"SELECT dataset_id,alert_id FROM tfg.alerts FINAL WHERE dataset_id IN ({ids})"):
        stored_alerts[row["dataset_id"]].add(row["alert_id"])
    normalizer = offsets(run_id + "-normalizer", topics["raw"])
    detector = offsets(run_id + "-detector", topics["norm"])
    watermarks_after = audit(checked_topics)
    balance = {}
    for definition in meta["datasets"]:
        dataset = definition["dataset_id"]
        rejected = sum(r["records"] for r in dlq["normalize"]["by_dataset_error"] if r["dataset_id"] == dataset)
        balance[dataset] = {"expected_raw": int(definition["records"]), "raw": raw_count[dataset],
                            "normalized_publications": norm_count[dataset], "normalize_dlq_publications": rejected,
                            "input_matches_manifest": raw_count[dataset] == int(definition["records"]),
                            "publication_balance": raw_count[dataset] == norm_count[dataset] + rejected}
    report = {"run_id": run_id, "mode": "readonly_no_commits", "offsets": {"normalizer": normalizer, "detector": detector},
              "watermarks_before": watermarks_before, "watermarks_after": watermarks_after,
              "topics_stable_during_audit": watermarks_before == watermarks_after,
              "normalization_balance": balance,
              "events": compare_sets(norm_values, stored_events, datasets),
              "alerts": compare_sets(alert_values, stored_alerts, datasets), "dlq": dlq,
              "publication_counts": {d: {"raw": raw_count[d], "norm": norm_count[d], "alerts": alert_count[d],
                                         "norm_duplicate_publications": norm_count[d] - len(norm_values[d]),
                                         "alert_duplicate_publications": alert_count[d] - len(alert_values[d])} for d in sorted(datasets)}}
    report["fully_reconciled"] = (normalizer["at_end"] and detector["at_end"]
                                   and report["topics_stable_during_audit"]
                                   and all(b["input_matches_manifest"] and b["publication_balance"] for b in balance.values())
                                   and all(r["equal"] for r in report["events"].values())
                                   and all(r["equal"] for r in report["alerts"].values())
                                   and not any(r["dataset_id"] == "UNRESOLVED" or r["error"] == "MOTIVO_AUSENTE"
                                               for group in dlq.values() for r in group["by_dataset_error"]))
    save(args.output, report)
    print(json.dumps({"fully_reconciled": report["fully_reconciled"], "offsets": report["offsets"],
                      "events": report["events"], "alerts": report["alerts"],
                      "publication_counts": report["publication_counts"],
                      "dlq_counts": {k: v["records"] for k, v in dlq.items()}}, indent=2))
    if not report["fully_reconciled"]:
        raise SystemExit("Reconciliación incompleta; revisar el informe sin repetir cargas")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-directory", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit("No se sobrescribe una reconciliación existente")
    run(args)


if __name__ == "__main__":
    main()
