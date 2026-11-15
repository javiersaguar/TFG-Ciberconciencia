"""Tests del bucle neurosimbolico: estados logrados y frontera, sin modelo ni bases de datos."""
import unittest

from ml.graph.bucle import padre, situacion


def app(id_, rule, pre, conclusion, confirmada_por=(), base="observado"):
    return {"id": id_, "rule": rule, "basis": base, "detail": "", "pre": list(pre), "conclusion": conclusion,
            "confirmed_by": list(confirmada_por)}


APPS = [
    app("R1", "acceso_inicial_usuario", ["adversario"], "exec:A:user", ["primer_contacto:C2"]),
    app("R3", "escalada_sesion_admin", ["exec:A:user"], "exec:A:admin", ["campana:c1"]),
    app("R4", "robo_credenciales", ["exec:A:admin"], "creds:u", ["campana:c2"]),
    app("R5", "movimiento_lateral_credenciales", ["exec:A:user", "creds:u"], "exec:B:admin", ["campana:c3"]),
    app("R0", "admin_implica_usuario", ["exec:B:admin"], "exec:B:user", base="trivial"),
    app("R4b", "robo_credenciales", ["exec:B:admin"], "creds:u"),
    app("R7", "explotacion_remota", ["exec:A:user"], "exec:C:admin", base="sintetico"),
]


class Situacion(unittest.TestCase):
    def test_al_principio_solo_el_acceso_inicial_esta_logrado(self):
        logrados, frontera = situacion(APPS, set())
        self.assertEqual(logrados, {"adversario", "exec:A:user"})
        self.assertEqual([a["id"] for a in frontera], ["R3", "R7"])       # R5 no: le faltan las credenciales

    def test_una_regla_entra_en_la_frontera_cuando_se_cumplen_todas_sus_precondiciones(self):
        _, frontera = situacion(APPS, {"c1"})
        self.assertIn("R4", [a["id"] for a in frontera])
        self.assertNotIn("R5", [a["id"] for a in frontera])
        _, frontera = situacion(APPS, {"c1", "c2"})
        self.assertIn("R5", [a["id"] for a in frontera])

    def test_lo_confirmado_y_lo_que_no_aporta_estado_nuevo_salen_de_la_frontera(self):
        logrados, frontera = situacion(APPS, {"c1", "c2", "c3"})
        self.assertIn("exec:B:user", logrados)                 # por R0, sin que el adversario haga nada
        ids = [a["id"] for a in frontera]
        self.assertEqual(ids, ["R7"])                          # R4b concluye credenciales que ya tiene
        self.assertNotIn("R0", ids)

    def test_padre(self):
        self.assertEqual((padre("T1003.001"), padre("T1548")), ("T1003", "T1548"))


if __name__ == "__main__":
    unittest.main()
