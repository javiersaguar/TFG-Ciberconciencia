"""Regresión del cierre FA con particiones vacías, sin conectar con Kafka."""
import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("fa_consumer", Path(__file__).with_name("fa_consumer.py"))
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class Native:
    def __init__(self, config):
        self.positions = [SimpleNamespace(offset=-1001), SimpleNamespace(offset=100000)]
        self.calls = []

    def assignment(self):
        return [0, 1]

    def position(self, assigned):
        return self.positions

    def commit(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return kwargs


class ConsumerTests(unittest.TestCase):
    def setUp(self):
        self.module = SimpleNamespace(Consumer=Native)
        self.context = patch.dict(sys.modules, {"confluent_kafka": self.module})
        self.context.start()
        adapter.install()

    def tearDown(self):
        self.context.stop()

    def test_empty_partition_is_excluded_but_processed_offset_is_committed(self):
        consumer = self.module.Consumer({"group.id": "fa-test-normalizer"})
        result = consumer.commit(asynchronous=False)
        self.assertEqual([p.offset for p in result["offsets"]], [100000])
        self.assertFalse(result["asynchronous"])

    def test_no_positions_does_not_attempt_implicit_commit(self):
        consumer = self.module.Consumer({"group.id": "fa-test-normalizer"})
        consumer._consumer.positions = []
        self.assertIsNone(consumer.commit(asynchronous=False))
        self.assertEqual(consumer._consumer.calls, [])

    def test_original_f3_group_is_rejected(self):
        with self.assertRaises(ValueError):
            self.module.Consumer({"group.id": "normalizer-f3f"})


if __name__ == "__main__":
    unittest.main()
