"""Pruebas offline de aislamiento del CEP y procedencia de la verdad propuesta."""
import importlib.util
import json
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location("fa_plan_day2", Path(__file__).with_name("fa_plan_day2.py"))
plan = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(plan)


def without_full_comments(sql):
    return "\n".join(line for line in sql.splitlines() if not line.lstrip().startswith("--"))


class PlanTests(unittest.TestCase):
    def test_nine_sql_files_preserve_body_and_isolate_all_connectors(self):
        observed_topics = set()
        for name in plan.SOURCE_FILES:
            path = plan.ROOT / "infra/flink/jobs" / name
            original = path.read_text()
            output, changes = plan.isolate_sql(original, "fa-day2-test")
            reverse = {(c["property"], c["isolated"]): c["source"] for c in changes}
            restored = plan.PROPERTY.sub(lambda m: f"{m[1]}'{reverse[(m[2].lower(), m[3])]}'", output)
            self.assertEqual(without_full_comments(restored), without_full_comments(original), name)
            self.assertEqual(path.read_text(), original, name)
            for match in plan.PROPERTY.finditer(output):
                if match[2].lower() == "topic":
                    observed_topics.add(match[3])
                    self.assertIn(match[3], plan.topic_map("fa-day2-test").values())
                else:
                    self.assertTrue(match[3].startswith("fa-day2-test-"))
        self.assertEqual(observed_topics, set(plan.topic_map("fa-day2-test").values()))

    def test_unexpected_topic_is_rejected(self):
        with self.assertRaises(ValueError):
            plan.isolate_sql("'topic' = 'unreviewed.topic'", "fa-day2-test")

    def test_truth_matches_xlsx_steps_and_active_local_stix(self):
        report, row = plan.truth_proposal(Path("data/fa/20261107-day2-verified"))
        self.assertEqual(len(report["steps"]), 24)
        self.assertEqual(row["dataset_id"], "SDWIN-200502035409")
        self.assertEqual(row["verdad"], "parcial")
        self.assertEqual([row[f"p{i}_esperado"] for i in (1, 2, 3)], [1, 1, 1])
        self.assertNotIn("T1103", row["tecnicas"].split("|"))
        self.assertNotIn("T1571", row["tecnicas"].split("|"))
        self.assertIn("T1003.001", report["steps"]["16.D"])
        self.assertIn("T1558.001", report["steps"]["20.B"])
        self.assertNotIn("T1558.003", report["steps"]["20.B"])

    def test_prepared_six_cep_commands_are_time_bounded(self):
        path = plan.ROOT / "data/fa/20261107-day2-plan/MANIFEST.json"
        manifest = json.loads(path.read_text())
        self.assertEqual(len(manifest["flink_commands"]), 6)
        for command in manifest["flink_commands"]:
            self.assertEqual(command[:2], ["timeout", "540s"])
            self.assertIn("/tmp/fa-day2-20261107/", " ".join(command))


if __name__ == "__main__":
    unittest.main()
