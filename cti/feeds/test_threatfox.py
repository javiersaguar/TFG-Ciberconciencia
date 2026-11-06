"""Tests del convertidor ThreatFox -> STIX (sin red ni clave).

    .venv/bin/python -m unittest cti.feeds.test_threatfox -v
"""
import unittest

from cti.feeds.threatfox import convertir, filas_csv, patron
from cti.stix_loader.transform import transformar

CSV = '''################################################################
# ThreatFox IOCs: full data dump (CSV)                         #
################################################################
#
# "first_seen_utc","ioc_id","ioc_value","ioc_type","threat_type","fk_malware","malware_alias","malware_printable","last_seen_utc","confidence_level","reference","tags","anonymous","reporter"
"2026-11-01 10:00:00", "1001", "203.0.113.5:443", "ip:port", "botnet_cc", "win.cobalt_strike", "Agentemis,BEACON", "Cobalt Strike", "", "100", "", "c2,CobaltStrike", "0", "alguien"
"2026-11-02 11:30:00", "1002", "malo.example", "domain", "botnet_cc", "win.cobalt_strike", "", "Cobalt Strike", "2026-11-03 09:00:00", "75", "", "None", "0", "alguien"
"2026-11-02 12:00:00", "1003", "http://x.example/a'b", "url", "payload_delivery", "", "", "", "", "50", "", "", "1", "anon"
"2026-11-02 12:00:00", "1004", "D41D8CD98F00B204E9800998ECF8427E", "md5_hash", "payload", "elf.mirai", "", "Mirai", "", "100", "", "", "0", "x"
"2026-11-02 12:00:00", "1005", "algo", "tipo_raro", "payload", "", "", "", "", "100", "", "", "0", "x"
'''


class TestThreatFox(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.filas = list(filas_csv(CSV))
        cls.bundle, cls.resumen = convertir(cls.filas)
        cls.por_tipo = {}
        for o in cls.bundle["objects"]:
            cls.por_tipo.setdefault(o["type"], []).append(o)

    def test_cabecera_comentada(self):
        self.assertEqual(len(self.filas), 5)
        self.assertEqual(self.filas[0]["ioc_value"], "203.0.113.5:443")
        self.assertEqual(self.filas[1]["tags"], "")  # "None" -> vacio

    def test_resumen(self):
        self.assertEqual(self.resumen["iocs"], 4)
        self.assertEqual(self.resumen["sin_patron"], 1)
        self.assertEqual(self.resumen["familias"], 2)
        self.assertEqual(len(self.por_tipo["relationship"]), 3)  # el IOC 1003 no tiene familia

    def test_patrones(self):
        self.assertIn("network-traffic:dst_port = 443", patron("ip:port", "203.0.113.5:443"))
        self.assertEqual(patron("url", "http://x/a'b"), "[url:value = 'http://x/a\\'b']")
        self.assertEqual(patron("md5_hash", "ABC"), "[file:hashes.'MD5' = 'abc']")
        self.assertIsNone(patron("tipo_raro", "x"))

    def test_ids_deterministas(self):
        otra, _ = convertir(list(filas_csv(CSV)))
        self.assertEqual({o["id"] for o in otra["objects"]}, {o["id"] for o in self.bundle["objects"]})

    def test_familia_con_alias(self):
        cs = [m for m in self.por_tipo["malware"] if m["x_malpedia_id"] == "win.cobalt_strike"][0]
        self.assertEqual(cs["name"], "Cobalt Strike")
        self.assertEqual(cs["aliases"], ["Agentemis", "BEACON"])

    def test_carga_con_el_cargador_comun(self):
        nodos, rels, _, descartes = transformar(self.bundle)
        self.assertEqual(len(nodos), 6)  # 4 indicadores + 2 familias
        self.assertEqual({r["tipo"] for r in rels}, {"INDICATES"})
        self.assertEqual(descartes["relacion_no_valida"], 0)


if __name__ == "__main__":
    unittest.main()
