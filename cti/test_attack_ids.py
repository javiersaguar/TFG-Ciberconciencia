"""Tests de la normalizacion de identificadores de ATT&CK (paquete en miniatura).

    .venv/bin/python -m unittest cti.test_attack_ids -v
"""
import unittest

from cti.attack_ids import AttackIds, desde_etiqueta_sigma, normalizar_texto


def tecnica(sid, tid, nombre, fase=None, **extra):
    o = {"type": "attack-pattern", "id": sid, "name": nombre,
         "external_references": [{"source_name": "mitre-attack", "external_id": tid}], **extra}
    if fase:
        o["kill_chain_phases"] = [{"kill_chain_name": "mitre-attack", "phase_name": fase}]
    return o


def rel(sid, tipo, a, b):
    return {"type": "relationship", "id": sid, "relationship_type": tipo, "source_ref": a, "target_ref": b}


PAQUETE = {"type": "bundle", "objects": [
    {"type": "x-mitre-tactic", "id": "x-mitre-tactic--ex", "x_mitre_shortname": "execution",
     "external_references": [{"source_name": "mitre-attack", "external_id": "TA0002"}]},
    tecnica("ap--t1059", "T1059", "Command and Scripting Interpreter", "execution"),
    tecnica("ap--t1059-001", "T1059.001", "PowerShell", "execution", x_mitre_is_subtechnique=True),
    tecnica("ap--t1086", "T1086", "PowerShell", revoked=True),
    tecnica("ap--viejo", "T1000", "Revocada en cadena", revoked=True),
    tecnica("ap--huerfana", "T1001", "Revocada sin sustituto", revoked=True),
    tecnica("ap--t1064", "T1064", "Scripting", x_mitre_deprecated=True),
    rel("r1", "subtechnique-of", "ap--t1059-001", "ap--t1059"),
    rel("r2", "revoked-by", "ap--t1086", "ap--t1059-001"),
    rel("r3", "revoked-by", "ap--viejo", "ap--t1086"),
]}


class TestResolver(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.idx = AttackIds(PAQUETE, version="mini")

    def test_vigente(self):
        r = self.idx.resolver("T1059.001")
        self.assertEqual((r.vigente, r.estado), ("T1059.001", "vigente"))

    def test_revocada(self):
        r = self.idx.resolver("T1086")
        self.assertEqual((r.vigente, r.estado), ("T1059.001", "revocada"))

    def test_revocada_en_cadena(self):
        self.assertEqual(self.idx.vigente("T1000"), "T1059.001")

    def test_revocada_sin_sustituto(self):
        r = self.idx.resolver("T1001")
        self.assertEqual((r.vigente, r.estado), (None, "revocada"))

    def test_obsoleta_se_conserva(self):
        r = self.idx.resolver("T1064")
        self.assertEqual((r.vigente, r.estado), ("T1064", "obsoleta"))

    def test_desconocida(self):
        self.assertEqual(self.idx.resolver("T9999").estado, "desconocida")
        self.assertEqual(self.idx.resolver("no-es-un-id").estado, "desconocida")

    def test_padre(self):
        self.assertEqual(self.idx.padre("T1059.001"), "T1059")
        self.assertEqual(self.idx.padre("T1059"), "T1059")
        self.assertEqual(self.idx.padre("T1086"), "T1059")

    def test_tacticas(self):
        self.assertEqual(self.idx.tacticas_de("T1086"), ["TA0002"])


class TestTexto(unittest.TestCase):
    def test_normalizar(self):
        self.assertEqual(normalizar_texto(" t1003/001 "), "T1003.001")
        self.assertEqual(normalizar_texto("attack.t1003.001"), "T1003.001")
        self.assertIsNone(normalizar_texto("attack.credential_access"))
        self.assertIsNone(normalizar_texto(""))

    def test_sigma(self):
        self.assertEqual(desde_etiqueta_sigma("attack.t1059.001"), "T1059.001")
        self.assertIsNone(desde_etiqueta_sigma("T1059.001"))


if __name__ == "__main__":
    unittest.main()
