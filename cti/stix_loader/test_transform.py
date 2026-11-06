"""Tests de la transformacion STIX -> filas de Neo4j (no necesitan base de datos).

    .venv/bin/python -m unittest cti.stix_loader.test_transform -v
"""
import unittest

from cti.stix_loader.transform import etiquetas, propiedades, tipo_relacion, transformar


def paquete():
    """Un ATT&CK en miniatura: tactica, tecnica, subtecnica, tecnica revocada y grupo."""
    ref = lambda tid: [{"source_name": "mitre-attack", "external_id": tid,
                        "url": f"https://attack.mitre.org/techniques/{tid}"}]
    fase = [{"kill_chain_name": "mitre-attack", "phase_name": "credential-access"}]
    return {"type": "bundle", "id": "bundle--1", "objects": [
        {"type": "marking-definition", "id": "marking-definition--1"},
        {"type": "x-mitre-tactic", "id": "x-mitre-tactic--ca", "name": "Credential Access",
         "x_mitre_shortname": "credential-access", "external_references": ref("TA0006")},
        {"type": "attack-pattern", "id": "attack-pattern--t1003", "name": "OS Credential Dumping",
         "kill_chain_phases": fase, "x_mitre_is_subtechnique": False,
         "x_mitre_platforms": ["Windows", "Linux"], "external_references": ref("T1003"),
         "object_marking_refs": ["marking-definition--1"]},
        {"type": "attack-pattern", "id": "attack-pattern--t1003-001", "name": "LSASS Memory",
         "kill_chain_phases": fase, "x_mitre_is_subtechnique": True,
         "external_references": ref("T1003.001")},
        {"type": "attack-pattern", "id": "attack-pattern--viejo", "name": "Credential Dumping",
         "revoked": True, "external_references": ref("T9999")},
        {"type": "intrusion-set", "id": "intrusion-set--apt29", "name": "APT29",
         "aliases": ["APT29", "Cozy Bear"], "external_references": ref("G0016")},
        {"type": "relationship", "id": "relationship--1", "relationship_type": "subtechnique-of",
         "source_ref": "attack-pattern--t1003-001", "target_ref": "attack-pattern--t1003"},
        {"type": "relationship", "id": "relationship--2", "relationship_type": "uses",
         "source_ref": "intrusion-set--apt29", "target_ref": "attack-pattern--t1003-001",
         "description": "APT29 volcó LSASS."},
        {"type": "relationship", "id": "relationship--3", "relationship_type": "revoked-by",
         "source_ref": "attack-pattern--viejo", "target_ref": "attack-pattern--t1003"},
        {"type": "relationship", "id": "relationship--4", "relationship_type": "uses",
         "source_ref": "intrusion-set--apt29"},  # sin destino: no valida
    ]}


class TestTransformar(unittest.TestCase):
    def setUp(self):
        self.nodos, self.rels, self.tacticas, self.descartes = transformar(paquete())
        self.por_id = {n["id"]: n for n in self.nodos}

    def test_cuenta(self):
        self.assertEqual(len(self.nodos), 5)
        self.assertEqual(len(self.rels), 3)
        self.assertEqual(self.descartes["tipo_ignorado"], 1)
        self.assertEqual(self.descartes["relacion_no_valida"], 1)

    def test_identificador_attack_y_url(self):
        p = self.por_id["attack-pattern--t1003-001"]["props"]
        self.assertEqual(p["external_id"], "T1003.001")
        self.assertTrue(p["url"].endswith("T1003.001"))
        self.assertTrue(p["is_subtechnique"])

    def test_solo_propiedades_guardables(self):
        p = self.por_id["attack-pattern--t1003"]["props"]
        self.assertNotIn("external_references", p)
        self.assertNotIn("object_marking_refs", p)
        self.assertNotIn("kill_chain_phases", p)
        self.assertEqual(p["platforms"], ["Windows", "Linux"])

    def test_revocada_se_conserva_marcada(self):
        self.assertTrue(self.por_id["attack-pattern--viejo"]["props"]["revoked"])
        rev = [r for r in self.rels if r["tipo"] == "REVOKED_BY"]
        self.assertEqual(rev[0]["destino"], "attack-pattern--t1003")

    def test_etiquetas(self):
        self.assertEqual(self.por_id["intrusion-set--apt29"]["labels"], ["IntrusionSet", "Actor"])
        self.assertEqual(self.por_id["x-mitre-tactic--ca"]["labels"], ["Tactic"])
        self.assertEqual(self.por_id["x-mitre-tactic--ca"]["props"]["shortname"], "credential-access")
        self.assertEqual(etiquetas("x-mitre-algo-nuevo"), ["XMitreAlgoNuevo"])
        self.assertEqual(etiquetas("campaign"), ["CtiCampaign"])

    def test_tacticas_desde_kill_chain(self):
        self.assertIn({"tecnica": "attack-pattern--t1003", "tactica": "credential-access"}, self.tacticas)
        self.assertEqual(len(self.tacticas), 2)

    def test_relacion_sin_referencias_en_props(self):
        uses = [r for r in self.rels if r["tipo"] == "USES"][0]
        self.assertEqual(uses["props"]["description"], "APT29 volcó LSASS.")
        self.assertNotIn("source_ref", uses["props"])


class TestNombres(unittest.TestCase):
    def test_tipo_relacion(self):
        self.assertEqual(tipo_relacion("subtechnique-of"), "SUBTECHNIQUE_OF")
        self.assertEqual(tipo_relacion("uses"), "USES")
        self.assertIsNone(tipo_relacion("1) MATCH (n) DETACH DELETE n //"))
        self.assertIsNone(tipo_relacion(""))

    def test_propiedades_descarta_mapas(self):
        p = propiedades({"id": "x--1", "name": "n", "raro": {"a": 1}, "mezcla": [1, {"b": 2}]})
        self.assertEqual(set(p), {"id", "name"})


if __name__ == "__main__":
    unittest.main()
