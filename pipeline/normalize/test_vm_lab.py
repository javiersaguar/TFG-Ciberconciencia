"""Regresiones del adaptador del laboratorio propio (origen fa_vm)."""
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from pipeline.normalize.fa_registry import normalize
from pipeline.normalize.vm_lab import adapt_vm_lab


def vm(**cambios):
    evento = {"_tfg_input_format": "vm_lab", "_tfg_source_ref": {"path": "telemetria.json", "line": 7},
              "EventID": 1, "Channel": "Microsoft-Windows-Sysmon/Operational", "Hostname": "TFGCIBER",
              "TimeCreated": "2026-07-30 10:21:00.500", "UtcTime": "2026-07-30 08:21:00.498",
              "ProcessId": "4948", "Image": r"C:\Windows\System32\rundll32.exe",
              "CommandLine": r"rundll32.exe C:\Windows\System32\comsvcs.dll, MiniDump 640 C:\lsass.dmp full",
              "ParentImage": r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe", "User": r"TFGCIBER\TFG"}
    evento.update(cambios)
    return evento


class VmLabTests(unittest.TestCase):
    def test_hora_local_a_utc_e_identidad_por_linea(self):
        r = normalize(vm(), dataset_id="VM-TFGCIBER-20260730-ataque", ordinal=99)
        self.assertEqual(r["time"], 1785399660500)          # 2026-07-30T08:21:00.500Z
        self.assertEqual(r["tfg"]["record_number"], 7)
        self.assertEqual(r["tfg"]["time_source"], "vm_lab.TimeCreated(Europe/Madrid)")
        self.assertEqual(r["device"]["hostname"], "TFGCIBER")
        self.assertEqual(r["unmapped"]["source_ref"]["line"], 7)

    def test_sin_utctime_depende_solo_de_la_zona(self):
        r = normalize(vm(EventID=4104, Channel="Microsoft-Windows-PowerShell/Operational", UtcTime=None,
                         ScriptBlockText="Get-Process"), dataset_id="VM", ordinal=1)
        self.assertEqual(r["time"], 1785399660500)

    def test_zona_que_no_cuadra_con_sysmon_se_rechaza(self):
        with self.assertRaisesRegex(ValueError, "no cuadra"):
            adapt_vm_lab(vm(UtcTime="2026-07-30 10:21:00.498"))

    def test_sin_referencia_o_sin_host_se_rechaza(self):
        with self.assertRaisesRegex(ValueError, "referencia"):
            adapt_vm_lab(vm(_tfg_source_ref={}))
        with self.assertRaisesRegex(ValueError, "host"):
            adapt_vm_lab(vm(Hostname=""))

    def test_no_muta_el_original(self):
        e = vm()
        adapt_vm_lab(e)
        self.assertEqual(e["TimeCreated"], "2026-07-30 10:21:00.500")
        self.assertIn("_tfg_source_ref", e)


if __name__ == "__main__":
    unittest.main()
