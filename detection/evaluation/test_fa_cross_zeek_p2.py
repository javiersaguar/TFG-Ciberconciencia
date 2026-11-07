"""Cruce offline: topología no equivale a soporte temporal ni duplica aristas."""
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from detection.evaluation import fa_cross_zeek_p2 as cross


class CrossTests(unittest.TestCase):
    def test_original_ctes_are_reused_as_readonly_with_final_scope(self):
        path = ROOT / "detection/patterns/p2_lateral_movement.sql"
        original = path.read_text()
        prefix = cross.prefix_from_oracle(original, ["SDWIN-200501225525"])
        self.assertTrue(prefix.lstrip().startswith("WITH"))
        self.assertNotIn("CREATE OR REPLACE VIEW", prefix)
        self.assertNotIn("aristas_marcadas AS", prefix)
        self.assertIn("aristas AS", prefix)
        self.assertIn("FROM (SELECT * FROM tfg.events FINAL WHERE dataset_id IN ('SDWIN-200501225525'))", prefix)
        self.assertEqual(path.read_text(), original)
        with self.assertRaises(ValueError):
            cross.prefix_from_oracle("SELECT * FROM unexpected", ["x"])

    def test_topology_four_tuple_time_and_campaign_windows_are_separate(self):
        dataset = "SDWIN-200501225525"
        edges = [{"dataset_id": dataset, "origen": "A", "destino": "B", "time_ms": stamp,
                  "dst_port": 5985, "src_port": port, "src_ip": "::ffff:10.0.1.4", "dst_ip": "10.0.1.6",
                  "arista_uid": str(index), "confirmada": index != 2}
                 for index, stamp, port in ((1, 10000, 111), (2, 11000, 222), (3, 12000, 333))]
        network = [{"dataset_id": "ZEEK-APT29-DAY1", "src_ip": "10.0.1.4", "dst_ip": "::ffff:10.0.1.6",
                    "dst_port": 5985, "src_port": port, "time_ms": stamp, "end_ms": stamp + 100,
                    "source_uid": str(port)} for port, stamp in ((111, 10000), (222, 100000), (999, 11000))]
        doc = json.dumps({"tfg": {"devices": [{"hostname": "A", "role": "origen"}, {"hostname": "B", "role": "destino"}]}})
        campaigns = [{"dataset_id": dataset, "campaign_id": "c1", "start_ms": 9000, "end_ms": 11500, "documento": doc},
                     {"dataset_id": dataset, "campaign_id": "c2", "start_ms": 9500, "end_ms": 10500, "documento": doc}]
        result = cross.classify(edges, network, campaigns, tolerance_ms=50)[dataset]
        self.assertEqual(result["p2_aristas_unique"], 3)
        self.assertEqual(result["aristas_in_p2_windows_unique"], 2)
        self.assertEqual(result["aristas_with_topology_matches"], 3)
        self.assertEqual(result["aristas_with_four_tuple_matches_no_time"], 2)
        self.assertEqual(result["aristas_temporally_supported"], 1)
        self.assertEqual(result["aristas_in_windows_temporally_supported"], 1)
        self.assertEqual(result["aristas_bilateral_sysmon"], 2)
        self.assertEqual(result["edges"][0]["campaign_windows"], ["c1", "c2"])

    def test_clock_gap_is_not_repaired_to_force_a_match(self):
        dataset = "SDWIN-200501225525"
        edge = {"dataset_id": dataset, "origen": "A", "destino": "B", "time_ms": 1000000,
                "dst_port": 445, "src_port": 10, "src_ip": "10.0.0.1", "dst_ip": "10.0.0.2",
                "arista_uid": "edge", "confirmada": 1}
        network = {"dataset_id": "ZEEK-APT29-DAY1", "time_ms": 1000, "end_ms": 2000,
                   "src_ip": "10.0.0.1", "dst_ip": "10.0.0.2", "src_port": 10,
                   "dst_port": 445, "source_uid": "uid"}
        result = cross.classify([edge], [network], [], 5000)[dataset]
        self.assertEqual(result["aristas_with_four_tuple_matches_no_time"], 1)
        self.assertEqual(result["aristas_temporally_supported"], 0)


if __name__ == "__main__":
    unittest.main()
