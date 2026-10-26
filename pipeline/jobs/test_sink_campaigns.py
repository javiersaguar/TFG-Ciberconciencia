"""Tests del esquema común de campaña (validar y a_fila de sink_campaigns).

    .venv/bin/python -m unittest pipeline.jobs.test_sink_campaigns -v
"""
import copy
import json
import unittest
from datetime import datetime, timezone

from pipeline.jobs.sink_campaigns import COLUMNS, CampanaInvalida, a_fila, validar


def campana_p2():
    """La campaña P2 de apt29 day1, reducida a lo que el esquema exige."""
    return {
        "class_uid": 2004, "category_uid": 2, "activity_id": 1, "type_uid": 200401,
        "time": 1588389479493, "start_time": 1588388963801, "end_time": 1588389479493, "duration": 515692,
        "severity_id": 4, "confidence_score": 100, "confidence_id": 3, "is_alert": True,
        "finding_info": {
            "uid": "07c1426c17179d180b24073e097edfdc",
            "title": "Movimiento lateral SCRANTON.dmevals.local -> NASHUA.dmevals.local",
            "attacks": [
                {"technique": {"uid": "T1021"}, "sub_technique": {"uid": "T1021.006"}},
                {"technique": {"uid": "T1569"}, "sub_technique": {"uid": "T1569.002"}},
            ],
            "related_events": [{"uid": "a1", "type": "alert"}, {"uid": "a2", "type": "alert"}],
            "related_events_count": 2,
        },
        "tfg": {
            "pattern_id": "P2", "dataset_id": "SDWIN-200501225525",
            "devices": [{"hostname": "SCRANTON.dmevals.local", "role": "origen"},
                        {"hostname": "NASHUA.dmevals.local", "role": "destino"}],
            "tactic_names": ["lateral-movement", "execution"],
            "stages": [
                {"order": 2, "name": "ejecucion_remota", "count": 1, "evidence_uids": ["a1"]},
                {"order": 1, "name": "conexion_lateral", "count": 2, "evidence_uids": ["e1", "e2"]},
                {"order": 3, "name": "servicio", "count": 1, "evidence_uids": ["a2"]},
            ],
            "confidence_factors": {"arista": 0.30, "bilateral": 0.15, "proceso_interactivo": 0.10,
                                   "ejecucion_remota": 0.20, "servicio": 0.15, "credenciales": 0.10},
            "metrics": {"aristas": 17},
        },
    }


class TestValidar(unittest.TestCase):
    def test_una_campana_correcta_pasa(self):
        self.assertEqual(validar(campana_p2())["tfg"]["pattern_id"], "P2")

    def test_rechaza_lo_que_no_es_un_hallazgo_ocsf(self):
        for campo, valor in (("class_uid", 2001), ("type_uid", 200402)):
            doc = campana_p2()
            doc[campo] = valor
            with self.assertRaises(CampanaInvalida, msg=campo):
                validar(doc)

    def test_la_confianza_tiene_que_ser_la_suma_de_sus_factores(self):
        doc = campana_p2()
        doc["confidence_score"] = 80
        with self.assertRaisesRegex(CampanaInvalida, "suma de los factores"):
            validar(doc)
        # acotada a 1: 1,0 de factores > 1 sigue siendo 100
        doc = campana_p2()
        doc["tfg"]["confidence_factors"]["extra"] = 0.5
        validar(doc)

    def test_las_etapas_van_numeradas_de_1_a_n_y_cada_una_con_su_evidencia(self):
        doc = campana_p2()
        doc["tfg"]["stages"][0]["order"] = 5
        with self.assertRaisesRegex(CampanaInvalida, "órdenes"):
            validar(doc)
        doc = campana_p2()
        doc["tfg"]["stages"][1]["evidence_uids"] = []
        with self.assertRaisesRegex(CampanaInvalida, "evidencia"):
            validar(doc)
        doc = campana_p2()
        doc["tfg"]["stages"][1]["count"] = 17
        with self.assertRaisesRegex(CampanaInvalida, "count"):
            validar(doc)

    def test_tiempos_coherentes(self):
        doc = campana_p2()
        doc["duration"] = 1
        with self.assertRaisesRegex(CampanaInvalida, "duration"):
            validar(doc)
        doc = campana_p2()
        doc["start_time"] = doc["end_time"] + 1
        with self.assertRaisesRegex(CampanaInvalida, "posterior"):
            validar(doc)

    def test_related_events_sin_repetidos_y_con_su_recuento(self):
        doc = campana_p2()
        doc["finding_info"]["related_events_count"] = 3
        with self.assertRaisesRegex(CampanaInvalida, "related_events_count"):
            validar(doc)
        doc = campana_p2()
        doc["finding_info"]["related_events"][1]["uid"] = "a1"
        with self.assertRaisesRegex(CampanaInvalida, "repite"):
            validar(doc)

    def test_no_se_toca_el_documento(self):
        doc = campana_p2()
        antes = copy.deepcopy(doc)
        validar(doc)
        self.assertEqual(doc, antes)


class TestAFila(unittest.TestCase):
    def test_extrae_las_columnas_de_tfg_campaigns(self):
        ahora = datetime(2026, 10, 26, tzinfo=timezone.utc)
        fila = dict(zip(COLUMNS, a_fila(campana_p2(), ahora=ahora)))
        self.assertEqual(fila["campaign_id"], "07c1426c17179d180b24073e097edfdc")
        self.assertEqual(fila["pattern_id"], "P2")
        self.assertEqual(fila["duration_ms"], 515692)
        self.assertEqual(fila["first_seen"], datetime(2020, 5, 2, 3, 9, 23, 801000, tzinfo=timezone.utc))
        self.assertEqual(fila["devices"], ["SCRANTON.dmevals.local", "NASHUA.dmevals.local"])
        # sub-técnica cuando la hay; ordenadas y sin repetir
        self.assertEqual(fila["technique_ids"], ["T1021.006", "T1569.002"])
        # etapas por su orden, no por cómo vengan en el documento
        self.assertEqual(fila["stages"], ["conexion_lateral", "ejecucion_remota", "servicio"])
        self.assertEqual(fila["related_event_uids"], ["a1", "a2"])
        self.assertEqual(fila["ingested_at"], ahora)
        self.assertEqual(json.loads(fila["documento"])["finding_info"]["uid"], fila["campaign_id"])

    def test_un_documento_invalido_no_llega_a_la_tabla(self):
        doc = campana_p2()
        del doc["tfg"]
        with self.assertRaises(CampanaInvalida):
            a_fila(doc)


if __name__ == "__main__":
    unittest.main()
