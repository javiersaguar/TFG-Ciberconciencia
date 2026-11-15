"""Tests de la capa sintetica, sin bases de datos."""
import copy
import json
import unittest
from pathlib import Path

from graph.cargar import validar
from graph.seed.construir import construir

ESC = "prueba"
DECL = {
    "referencias": {"cvss": "NVD", "epss": "FIRST", "kev": "CISA"},
    "vulnerabilidades": [
        {"cve": "CVE-1", "alias": "Remota", "cvss": 10.0, "vector": "CVSS:3.1/AV:N", "acceso": "remoto", "epss": 0.9,
         "epss_percentil": 0.99, "kev": True, "kev_ransomware": False, "publicada": "2020-01-01", "efecto": "ejecucion_system"},
        {"cve": "CVE-2", "alias": "Local", "cvss": 7.8, "vector": "CVSS:3.1/AV:L", "acceso": "local", "epss": 0.4,
         "epss_percentil": 0.9, "kev": True, "kev_ransomware": False, "publicada": "2020-01-01", "efecto": "elevacion_system"}],
    "asignaciones": [{"cve": "CVE-1", "equipo": "WS1", "servicio": "tcp/445", "motivo": "m"},
                     {"cve": "CVE-1", "equipo": "WS2", "servicio": "tcp/445", "motivo": "m"},
                     {"cve": "CVE-2", "equipo": "WS2", "servicio": None, "motivo": "m"}],
    "activos": [{"clave": "dominio", "nombre": "Dominio", "criticidad": 10, "equipo": "DC", "motivo": "m"}],
    "adversario": {"nombre": "Atacante", "equipos": ["192.168.0.4", "192.168.0.5"], "motivo": "m"},
}


def inventario():
    host = lambda n: {"id": f"{ESC}/host/{n}", "labels": ["TfgObject", "Host"], "props": {"name": n}}
    return {"nodos": [host("WS1"), host("WS2"), host("DC"), host("192.168.0.4"),
                      {"id": f"{ESC}/svc/WS1/tcp/445", "labels": ["TfgObject", "Service"], "props": {}}]}


class Sintetica(unittest.TestCase):
    def setUp(self):
        self.nodos, self.rels, self.omitidas = construir(ESC, DECL, inventario())
        self.r = {x["id"]: x for x in self.rels}

    def test_la_remota_solo_donde_se_observo_el_servicio(self):
        self.assertIn(f"{ESC}/host/WS1|HAS_VULN|{ESC}/vuln/CVE-1", self.r)
        self.assertNotIn(f"{ESC}/host/WS2|HAS_VULN|{ESC}/vuln/CVE-1", self.r)
        self.assertEqual(self.omitidas, [{"cve": "CVE-1", "equipo": "WS2", "servicio": "tcp/445"}])
        self.assertEqual(self.r[f"{ESC}/host/WS1|HAS_VULN|{ESC}/vuln/CVE-1"]["props"]["port"], 445)

    def test_la_local_no_lleva_puerto(self):
        self.assertNotIn("port", self.r[f"{ESC}/host/WS2|HAS_VULN|{ESC}/vuln/CVE-2"]["props"])

    def test_activo_y_adversario(self):
        self.assertIn(f"{ESC}/host/DC|HOSTS|{ESC}/asset/dominio", self.r)
        donde = [x["destino"] for x in self.rels if x["tipo"] == "LOCATED_AT"]
        self.assertEqual(donde, [f"{ESC}/host/192.168.0.4"])   # el segundo servidor no esta en el inventario

    def test_todo_es_sintetico_y_lo_acepta_el_cargador(self):
        for x in self.nodos + self.rels:
            self.assertEqual((x["props"]["origen"], x["props"]["escenario"]), ("sintetico", ESC))
        validar({"escenario": ESC, "capa": "sintetica", "nodos": self.nodos, "relaciones": self.rels})
        with self.assertRaises(ValueError):
            validar({"escenario": ESC, "capa": "inventario", "nodos": self.nodos, "relaciones": self.rels})

    def test_errores_de_la_declaracion(self):
        mala = copy.deepcopy(DECL)
        mala["activos"][0]["equipo"] = "NOEXISTE"
        with self.assertRaises(ValueError):
            construir(ESC, mala, inventario())
        mala = copy.deepcopy(DECL)
        mala["asignaciones"][2]["servicio"] = "tcp/1"
        with self.assertRaises(ValueError):
            construir(ESC, mala, inventario())

    def test_la_declaracion_real_es_coherente(self):
        decl = json.loads((Path(__file__).parent / "apt29.json").read_text(encoding="utf-8"))
        cves = {v["cve"] for v in decl["vulnerabilidades"]}
        self.assertTrue(all(a["cve"] in cves for a in decl["asignaciones"]))
        for v in decl["vulnerabilidades"]:
            self.assertEqual(v["acceso"], "remoto" if "/AV:N/" in v["vector"] else "local")
            self.assertIn(v["efecto"], decl["efectos"])
            self.assertTrue(0 <= v["epss"] <= 1 and 0 < v["cvss"] <= 10)


if __name__ == "__main__":
    unittest.main()
