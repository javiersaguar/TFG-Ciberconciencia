"""Controles offline del aislamiento de las consultas y de la comparación."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("fa_snapshot", Path(__file__).with_name("fa_snapshot.py"))
snapshot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(snapshot)


class SnapshotTests(unittest.TestCase):
    def test_original_six_queries_are_scoped_without_mutation(self):
        path = snapshot.ROOT / "detection/evaluation/f3_cierre.sql"
        original = path.read_bytes()
        queries = snapshot.statements(original.decode())
        self.assertEqual(len(queries), 6)
        for query in queries:
            scoped = snapshot.scoped_statement(query, ["F3-dataset"])
            self.assertIn("dataset_id IN ('F3-dataset')", scoped)
            # Las tablas físicas solo aparecen en los tres CTE restringidos.
            self.assertEqual(scoped.count("tfg.alerts"), 1)
            self.assertEqual(scoped.count("tfg.campaigns"), 1)
            self.assertEqual(scoped.count("tfg.verdad_datasets"), 1)
            self.assertNotIn("f3_campaigns AS c FINAL", scoped)
            self.assertNotIn("f3_alerts FINAL", scoped)
            self.assertTrue(scoped.startswith("WITH f3_alerts"))
            self.assertEqual(scoped.count("WITH TOTALS"), query.count("WITH TOTALS"))
        self.assertEqual(path.read_bytes(), original)

    def test_quote_prevents_literal_escape(self):
        self.assertEqual(snapshot.quoted("a'b\\c"), "'a\\'b\\\\c'")

    def test_f3_change_fails_but_global_change_is_reported(self):
        before = self.valid_snapshot()
        after = copy.deepcopy(before)
        after["f3_cierre_global"][0] = [{"n": 7}]
        with tempfile.TemporaryDirectory() as directory:
            first, second = (Path(directory) / name for name in ("before.json", "after.json"))
            first.write_text(json.dumps(before))
            second.write_text(json.dumps(after))
            with contextlib.redirect_stdout(io.StringIO()):
                result = snapshot.compare(first, second)
            self.assertTrue(result["f3_unchanged"])
            self.assertTrue(result["global_result_changed"])
            after["tables"]["alerts"]["sha256"] = "b" * 64
            second.write_text(json.dumps(after))
            with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
                snapshot.compare(first, second)

    @staticmethod
    def valid_snapshot():
        return {"schema_version": 1, "dataset_ids": ["F3"], "f3_sql_sha256": "a" * 64,
                "tables": {t: {"sha256": "a" * 64,
                               "datasets": {"F3": {"rows": 1, "sha256": "a" * 64}}}
                           for t in snapshot.TABLES},
                "f3_cierre_frozen": [[{"n": 2}] for _ in range(6)],
                "f3_cierre_global": [[{"n": 2}] for _ in range(6)]}

    def test_incomplete_snapshots_are_rejected(self):
        invalid = [{}, {"schema_version": 1}]
        for field in ("schema_version", "dataset_ids", "tables", "f3_cierre_frozen", "f3_sql_sha256"):
            value = self.valid_snapshot()
            value.pop(field)
            invalid.append(value)
        value = self.valid_snapshot()
        value["tables"]["verdad_datasets"]["datasets"] = {}
        invalid.append(value)
        value = self.valid_snapshot()
        value["dataset_ids"] = []
        invalid.append(value)
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValueError):
                snapshot.validate_snapshot(value)


if __name__ == "__main__":
    unittest.main()
