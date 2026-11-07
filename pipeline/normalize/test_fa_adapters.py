"""Regresiones offline de las nuevas fuentes sin modificar el registro F3."""
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from pipeline.normalize.fa_registry import normalize
from pipeline.normalize.comiset import adapt_comiset
from pipeline.normalize.registry import normalize as windows, UnmappedEvent


def zeek(stream="conn"):
    return {"_tfg_input_format": "zeek", "Hostname": "capture-label", "@stream": stream,
            "ts": 1588205198.89971, "uid": "uid-1", "id_orig_h": "10.0.1.4", "id_orig_p": 1234,
            "id_resp_h": "10.0.0.4", "id_resp_p": 53, "proto": "udp", "duration": 1.25,
            "orig_bytes": 39, "resp_bytes": 55, "new_field": "preserve-me"}


def comiset():
    return {"_tfg_input_format": "comiset", "Hostname": "host-hash", "_id": "elastic-1",
            "_index": "test", "_source": {"host_name": "original.host", "record_number": 42,
                "event_id": "10", "log_name": "Microsoft-Windows-Sysmon/Operational",
                "event_original_time": "2022-06-27T08:54:19.297+02:00", "@timestamp": "2030-01-01T00:00:00Z",
                "process_path": r"C:\Windows\source.exe", "target_process_path": r"C:\Windows\lsass.exe",
                "process_id": "7600", "target_process_id": "4532", "GrantedAccess": "0x1010"}}


class ZeekTests(unittest.TestCase):
    def test_conn_report_preserves_endpoints_counts_and_source(self):
        raw = zeek()
        result = normalize(raw, dataset_id="ZEEK-APT29-DAY1", ordinal=1)
        self.assertEqual((result["class_uid"], result["activity_id"]), (4001, 6))
        self.assertEqual(result["time"], 1588205198899)
        self.assertEqual(result["end_time"], result["time"] + 1250)
        self.assertEqual(result["src_endpoint"]["ip"], "10.0.1.4")
        self.assertEqual(result["traffic"]["bytes_in"], 55)
        self.assertEqual(result["connection_info"]["direction_id"], 0)
        self.assertEqual(result["unmapped"]["zeek"]["new_field"], "preserve-me")
        self.assertEqual(result["tfg"]["source_event_id"], 0)
        # Identidad independiente del ordinal de replay y del orden de claves JSON.
        reordered = dict(reversed(list(raw.items())))
        self.assertEqual(result["tfg"]["record_number"], normalize(reordered, ordinal=99)["tfg"]["record_number"])

    def test_dns_mixed_answers_do_not_invent_record_types(self):
        raw = {**zeek("dns"), "query": "example.org", "qtype_name": "A", "rcode": 0,
               "answers": ["alias.example.org", "10.0.0.4"], "TTLs": [300, 60]}
        result = normalize(raw)
        self.assertEqual((result["class_uid"], result["activity_id"]), (4003, 6))
        self.assertEqual(result["query"]["hostname"], "example.org")
        self.assertEqual(result["answers"][0], {"rdata": "alias.example.org", "ttl": 300})
        self.assertNotIn("type", result["answers"][0])

    def test_bad_time_ip_port_and_stream_are_rejected(self):
        for patch in ({"ts": "nan"}, {"id_orig_h": "invalid"}, {"id_orig_p": 90000},
                      {"@stream": "http"}, {"Hostname": ""}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                normalize({**zeek(), **patch})


class ComisetTests(unittest.TestCase):
    def test_aliases_time_identity_and_provenance_without_source_mutation(self):
        raw = comiset()
        before = deepcopy(raw)
        result = normalize(raw, dataset_id="COMISET-REAL-v1-host-hash", ordinal=99)
        expected_time = int(datetime(2022, 6, 27, 6, 54, 19, 297000, tzinfo=timezone.utc).timestamp() * 1000)
        self.assertEqual(result["time"], expected_time)
        self.assertEqual(result["actor"]["process"]["pid"], 7600)
        self.assertEqual(result["process"]["pid"], 4532)
        self.assertTrue(result["tfg"]["signal_lsass_access"])
        self.assertTrue(result["tfg"]["signal_suspicious_access"])
        self.assertEqual(result["tfg"]["record_number"], 42)
        self.assertEqual(result["device"]["hostname"], "host-hash")
        self.assertEqual(result["unmapped"]["source_ref"]["_id"], "elastic-1")
        self.assertEqual(result["unmapped"]["comiset_source"], raw["_source"])
        self.assertEqual(raw, before)

    def test_native_fields_take_precedence_and_hashes_are_rebuilt(self):
        raw = comiset()
        raw["_source"].update({"SourceImage": r"C:\native.exe", "hash_sha256": "ABC"})
        adapted = adapt_comiset(raw)
        self.assertEqual(adapted["SourceImage"], r"C:\native.exe")
        self.assertEqual(adapted["Hashes"], "SHA256=ABC")

    def test_image_load_hashes_signature_and_actor_are_available(self):
        raw = comiset()
        raw["_source"].update({"event_id": "7", "ImageLoaded": r"C:\module.dll", "Signed": "true",
                               "Signature": "Publisher", "hash_sha256": "ABC"})
        result = normalize(raw)
        self.assertEqual(result["module"]["file"]["path"], r"C:\module.dll")
        self.assertEqual(result["module"]["file"]["hashes"], [{"algorithm_id": 3, "value": "ABC"}])
        self.assertEqual(result["module"]["file"]["signature"]["state_id"], 1)
        self.assertEqual(result["actor"]["process"]["file"]["path"], raw["_source"]["process_path"])

    def test_unknown_channel_and_invalid_source_are_rejected_with_reason(self):
        raw = comiset()
        raw["_source"]["log_name"] = "Microsoft-Windows-TaskScheduler/Operational"
        with self.assertRaises(UnmappedEvent):
            normalize(raw)
        for patch in ({"_id": ""}, {"_source": None}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                normalize({**comiset(), **patch})
        raw = comiset()
        raw["_source"]["event_original_time"] = "2022-06-27T06:54:19"
        with self.assertRaises(ValueError):
            normalize(raw)

    def test_windows_route_is_unchanged(self):
        raw = {"Channel": "Microsoft-Windows-Sysmon/Operational", "EventID": 1,
               "Hostname": "WIN", "RecordNumber": 3, "TimeCreated": "2022-01-01T00:00:00.000Z",
               "Image": r"C:\Windows\process.exe"}
        self.assertEqual(normalize(deepcopy(raw), dataset_id="original", ordinal=1),
                         windows(deepcopy(raw), dataset_id="original", ordinal=1))


if __name__ == "__main__":
    unittest.main()
