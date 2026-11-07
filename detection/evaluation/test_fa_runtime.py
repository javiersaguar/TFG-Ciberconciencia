"""Pruebas sin servicios: transporte parcial, namespaces y reconciliación FA."""
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from detection.evaluation import fa_transport as transport
from detection.evaluation import fa_reconcile as reconcile


class FakeProducer:
    instances = []
    fail_delivery = False
    remaining = 0

    def __init__(self, config):
        self.config, self.calls, self.callbacks, self.flushes = config, [], [], 0
        self.instances.append(self)

    def produce(self, topic, **kwargs):
        self.calls.append((topic, kwargs))
        self.callbacks.append(kwargs["on_delivery"])

    def poll(self, timeout):
        return 0

    def flush(self, timeout):
        self.flushes += 1
        for callback in self.callbacks:
            callback("delivery-failed" if self.fail_delivery else None, None)
        self.callbacks.clear()
        return self.remaining


class FakePartition:
    def __init__(self, topic, partition, offset=0):
        self.topic, self.partition, self.offset = topic, partition, offset


class TransportTests(unittest.TestCase):
    def setUp(self):
        FakeProducer.instances.clear()
        FakeProducer.fail_delivery = False
        FakeProducer.remaining = 0

    def replay(self, lines, after, expected=None):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        source, report = (Path(directory.name) / name for name in ("source.jsonl", "report.json"))
        source.write_text("\n".join(lines) + "\n")
        topic = "raw.fa.runtime-test"
        args = types.SimpleNamespace(file=source, report=report, topic=topic, append=False,
                                     dataset_id="FA-TEST", source="test", expected=expected or len(lines))
        kafka = types.ModuleType("confluent_kafka")
        kafka.Producer = FakeProducer
        result = None
        with patch.dict(sys.modules, {"confluent_kafka": kafka}), \
             patch.object(transport, "audit", side_effect=[{topic: {"records": 0}}, {topic: {"records": after}}]), \
             contextlib.redirect_stdout(io.StringIO()):
            try:
                transport.replay(args)
            except RuntimeError as exc:
                result = exc
        return result, json.loads(report.read_text()), args

    def test_callback_failures_are_reported_and_raise(self):
        FakeProducer.fail_delivery = True
        error, report, _ = self.replay(['{"Hostname":"host"}'], 0)
        self.assertIsNotNone(error)
        self.assertEqual(report["sent"], 1)
        self.assertEqual(report["delivered"], 0)
        self.assertTrue(report["delivery_failures"])

    def test_broker_cardinality_mismatch_is_not_success(self):
        error, report, _ = self.replay(['{"Hostname":"host"}', '{"Hostname":"other"}'], 1)
        self.assertIsNotNone(error)
        self.assertEqual(report["delivered"], 2)
        self.assertEqual(report["after"]["raw.fa.runtime-test"]["records"], 1)

    def test_invalid_second_line_flushes_and_reports_partial_then_refuses_retry(self):
        error, report, args = self.replay(['{"Hostname":"host"}', 'invalid-json'], 1)
        self.assertIsNotNone(error)
        self.assertEqual((report["sent"], report["delivered"], report["last_source_line"]), (1, 1, 2))
        self.assertIn("JSONDecodeError", report["exception"])
        self.assertEqual(FakeProducer.instances[0].flushes, 1)
        with self.assertRaises(ValueError):
            transport.replay(args)
        self.assertEqual(len(FakeProducer.instances), 1)

    def test_remaining_queue_or_expected_mismatch_is_rejected(self):
        FakeProducer.remaining = 1
        error, _, _ = self.replay(['{"Hostname":"host"}'], 1)
        self.assertIsNotNone(error)
        FakeProducer.remaining = 0
        error, _, _ = self.replay(['{"Hostname":"host"}'], 1, expected=2)
        self.assertIsNotNone(error)

    def test_f3_topics_and_groups_are_rejected(self):
        for topic in ("raw.host.windows", "norm.events", "det.alerts", "det.campaigns", "dlq.normalize"):
            with self.subTest(topic=topic), self.assertRaises(ValueError):
                transport.validate_topic(topic)
            with self.subTest(topic=topic), self.assertRaises(ValueError):
                list(reconcile.read_topic(topic))
        with self.assertRaises(ValueError):
            reconcile.offsets("normalizer-f3", "raw.fa.test")
        transport.validate_topic("raw.net.zeek")

    def test_retention_hole_fails_audit_without_commit(self):
        consumer = types.SimpleNamespace(
            list_topics=lambda **kwargs: types.SimpleNamespace(topics={"raw.fa.test": types.SimpleNamespace(error=None, partitions={0: None})}),
            get_watermark_offsets=lambda *args, **kwargs: (3, 10), close=lambda: None)
        kafka = types.ModuleType("confluent_kafka")
        kafka.Consumer = lambda config: consumer
        kafka.TopicPartition = FakePartition
        with patch.dict(sys.modules, {"confluent_kafka": kafka}), self.assertRaises(RuntimeError):
            transport.audit(["raw.fa.test"])

    def test_reconciliation_detects_lost_identity_and_handles_zero_supported_host(self):
        kafka = {"FA": {("FA", "host", "security", 1), ("FA", "host", "security", 2)}}
        stored = {"FA": {("FA", "host", "security", 1)}}
        report = reconcile.compare_sets(kafka, stored, {"FA", "unsupported-host"})
        self.assertFalse(report["FA"]["equal"])
        self.assertEqual(report["FA"]["missing_in_clickhouse"], 1)
        self.assertTrue(report["unsupported-host"]["equal"])
        self.assertEqual(report["unsupported-host"]["kafka_unique"], 0)

    def test_complete_reconciliation_resolves_dlq_and_duplicate_alerts(self):
        class Message:
            def __init__(self, topic, value, headers=None):
                self.data, self.topic_name, self.header_data = value, topic, headers
            def value(self): return self.data
            def headers(self): return self.header_data
            def topic(self): return self.topic_name
            def partition(self): return 0
            def offset(self): return 0

        topics = {k: f"{prefix}.fa.runtime-test.{k}" for k, prefix in
                  (("raw", "raw"), ("norm", "norm"), ("alerts", "det"),
                   ("normalize_dlq", "dlq"), ("detect_dlq", "dlq"))}
        raw = json.dumps({"Hostname": "host", "RecordNumber": 1}).encode()
        rejected = json.dumps({"Hostname": "unsupported", "RecordNumber": 2}).encode()
        normalized = {"device": {"hostname": "host"}, "tfg": {"dataset_id": "FA", "source_channel": "security", "record_number": 1}}
        alert = {"alert_id": "alert-1", "tfg": {"dataset_id": "FA"}}
        messages = {
            topics["raw"]: [Message(topics["raw"], raw, [("dataset_id", b"FA"), ("line_no", b"1")]),
                            Message(topics["raw"], rejected, [("dataset_id", b"BAD"), ("line_no", b"1")])],
            topics["norm"]: [Message(topics["norm"], json.dumps(normalized).encode())],
            topics["alerts"]: [Message(topics["alerts"], json.dumps(alert).encode())] * 2,
            topics["normalize_dlq"]: [Message(topics["normalize_dlq"], rejected, [("error", b"unsupported")])],
            topics["detect_dlq"]: [],
        }
        stored = [{"dataset_id": "FA", "device_hostname": "host", "source_channel": "security", "record_number": "1"}]
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "RUN.json").write_text(json.dumps({"run_id": "fa-runtime-test", "topics": topics,
                                                         "datasets": [{"dataset_id": "FA", "records": 1}, {"dataset_id": "BAD", "records": 1}]}))
            for missing in (False, True):
                output = folder / f"report-{missing}.json"
                def query(statement):
                    return ([] if missing else stored) if "tfg.events" in statement else [{"dataset_id": "FA", "alert_id": "alert-1"}]
                with patch.object(reconcile, "read_topic", side_effect=lambda topic: iter(messages[topic])), \
                     patch.object(reconcile, "sql", side_effect=query), \
                     patch.object(reconcile, "audit", return_value={}), \
                     patch.object(reconcile, "offsets", return_value={"at_end": True, "lag": 0}), \
                     contextlib.redirect_stdout(io.StringIO()):
                    args = types.SimpleNamespace(run_directory=folder, output=output)
                    if missing:
                        with self.assertRaises(SystemExit):
                            reconcile.run(args)
                    else:
                        reconcile.run(args)
                report = json.loads(output.read_text())
                self.assertEqual(report["fully_reconciled"], not missing)
                self.assertEqual(report["publication_counts"]["FA"]["alert_duplicate_publications"], 1)
                self.assertEqual(report["dlq"]["normalize"]["details"][0]["source_lines"], [["BAD", "1"]])


class SigmaNestedTests(unittest.TestCase):
    def test_real_wmi_rule_nested_or_and_negation(self):
        # Una sola regla local; no se cargan 2.093 reglas ni se abren servicios.
        from detection.loader import load_rules
        from detection.evaluator import CompiledRule
        path = ROOT / "data/sigma/rules/windows/builtin/wmi/win_wmi_persistence.yml"
        rules, errors = load_rules([path])
        self.assertFalse(errors)
        self.assertEqual(len(rules), 1)
        compiled = CompiledRule(rules[0])
        filter_fields = {"Provider": "SCM Event Provider", "Query": "select * from MSFT_SCMEventLogEvent",
                         "User": "S-1-5-32-544", "PossibleCause": "Permanent"}
        fixtures = [({"EventID": 5859}, True),
                    ({"EventID": 5861, "body": "ordinary text"}, False),
                    ({"EventID": 1, "body": "CommandLineEventConsumer"}, False),
                    ({"EventID": 5859, **filter_fields}, False),
                    ({"EventID": 5859, **filter_fields, "Query": "different query"}, True)]
        for event, expected in fixtures:
            with self.subTest(event=event):
                self.assertEqual(compiled.evaluate(event)[0], expected)

    @unittest.expectedFailure
    def test_known_existing_keyword_limitation_in_real_wmi_rule(self):
        # La búsqueda keyword se ancla al evento aplanado completo en el
        # evaluador vigente: combinación campo + keyword no tiene semántica
        # substring. Se registra expresamente, sin cambiar ni excluir la regla.
        from detection.loader import load_rules
        from detection.evaluator import CompiledRule
        path = ROOT / "data/sigma/rules/windows/builtin/wmi/win_wmi_persistence.yml"
        rules, errors = load_rules([path])
        self.assertFalse(errors)
        self.assertTrue(CompiledRule(rules[0]).evaluate({"EventID": 5861, "body": "ActiveScriptEventConsumer"})[0])


if __name__ == "__main__":
    unittest.main()
