"""Tests del razonador: la busqueda de pruebas (pura) y las reglas de attack.dl (con Soufflé en Docker).

Los tests de reglas escriben un conjunto MINIMO de hechos y comprueban que se deriva. Se saltan si no
esta la imagen tfg/souffle (`cd infra && docker compose --profile reason build souffle`).
"""
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from graph.datalog import razonar
from graph.datalog.exportar import CONSULTAS


def hay_souffle():
    if not shutil.which("docker"):
        return False
    r = subprocess.run(["docker", "image", "inspect", razonar.IMAGEN], capture_output=True)
    return r.returncode == 0


def app(id_, conclusion, pre, confirmado=False, base="observado"):
    return {"id": id_, "rule": id_.split("|")[0], "conclusion": conclusion, "detail": "", "basis": base,
            "pre": list(pre), "confirmed": [{"kind": "campana", "ref": "c"}] if confirmado else []}


class Pruebas(unittest.TestCase):
    """La eleccion de la mejor prueba en un grafo Y/O."""

    def setUp(self):
        # Dos formas de llegar a g: directa sin confirmar (1 paso) o por a y b, confirmadas (3 pasos).
        self.apps = {a["id"]: a for a in [
            app("directo", "g", ["adversario"]),
            app("p1", "a", ["adversario"], confirmado=True),
            app("p2", "b", ["a"], confirmado=True),
            app("p3", "g", ["a", "b"], confirmado=True),
            app("ciclo", "a", ["g"]),
            app("imposible", "z", ["no_demostrable"])]}

    def pasos(self, criterio, estado="g"):
        mejor = razonar.mejores(self.apps, criterio)
        return [p["id"] for p in razonar.prueba(estado, mejor, self.apps)]

    def test_evidencia_prefiere_lo_confirmado_aunque_sea_mas_largo(self):
        self.assertEqual(self.pasos("evidencia"), ["p1", "p2", "p3"])

    def test_corta_prefiere_menos_pasos(self):
        self.assertEqual(self.pasos("corta"), ["directo"])

    def test_las_precondiciones_van_antes_y_no_se_repiten(self):
        pasos = self.pasos("evidencia")
        self.assertEqual(len(pasos), len(set(pasos)))
        self.assertLess(pasos.index("p1"), pasos.index("p3"))

    def test_lo_no_demostrable_no_aparece_y_los_ciclos_no_cuelgan(self):
        mejor = razonar.mejores(self.apps, "evidencia")
        self.assertNotIn("z", mejor)
        self.assertEqual(mejor["a"][1], "p1")

    def test_el_paso_trivial_no_cuenta(self):
        self.assertEqual(razonar.coste(app("R0|x", "s", [], base="trivial"), "corta"), (0, 0))


BASE = {
    "host": [("WS1", "workstation", "interna", "10.0.1.0/24"), ("WS2", "workstation", "interna", "10.0.1.0/24"),
             ("DC", "domain_controller", "interna", "10.0.0.0/24"), ("C2", "external", "externa", "externa")],
    "conn": [("WS1", "C2", "tcp", 443)],
    "logon": [("alice", "WS1", 2)],
    "attacker_at": [("C2",)],
    "contact": [("WS1", "C2", 0)],
}


@unittest.skipUnless(hay_souffle(), "falta la imagen tfg/souffle")
class Reglas(unittest.TestCase):
    version = "v1"

    def razonar(self, **cambios):
        hechos = {r: list(BASE.get(r, [])) for r in CONSULTAS}
        for r, filas in cambios.items():
            hechos[r] = filas
        with tempfile.TemporaryDirectory(dir=razonar.RAIZ / "data") as tmp:
            d = Path(tmp)
            d.chmod(0o755)
            (d / "facts").mkdir()
            (d / "out").mkdir(mode=0o777)
            (d / "out").chmod(0o777)
            for r, filas in hechos.items():
                (d / "facts" / f"{r}.facts").write_text("".join("\t".join(map(str, f)) + "\n" for f in filas))
            razonar.ejecutar(d / "facts", d / "out", Path(razonar.__file__).parent / razonar.VERSIONES[self.version][0])
            rel = razonar.leer(d / "out")
        self.rel = rel
        self.exec = set(rel["exec"])
        self.creds = {c for (c,) in rel["creds"]}
        self.apps = razonar.aplicaciones(rel)
        return rel

    def reglas(self):
        return {a["rule"] for a in self.apps.values()}

    def test_acceso_inicial_necesita_sesion_interactiva_y_salida(self):
        self.razonar()
        self.assertEqual(self.exec, {("WS1", "user")})
        self.razonar(logon=[("alice", "WS1", 3)])            # sesion de red: no
        self.assertEqual(self.exec, set())
        self.razonar(conn=[("WS1", "DC", "tcp", 88)])          # sin salida al exterior: no
        self.assertEqual(self.exec, set())

    def test_escalada_por_sesion_de_administrador_y_robo_de_credenciales(self):
        self.razonar(admin_of=[("alice", "WS1")])
        self.assertIn(("WS1", "admin"), self.exec)
        self.assertEqual(self.creds, {"alice"})

    def test_sin_administrador_no_hay_credenciales(self):
        self.razonar()
        self.assertEqual(self.creds, set())

    def test_escalada_por_vulnerabilidad_local(self):
        self.razonar(vuln_local=[("WS1", "CVE-L", "elevacion_system")])
        self.assertIn(("WS1", "admin"), self.exec)
        self.assertIn("escalada_vulnerabilidad", self.reglas())

    def test_movimiento_lateral_exige_ser_administrador_en_el_destino(self):
        lateral = dict(admin_of=[("alice", "WS1")], conn=BASE["conn"] + [("WS1", "WS2", "tcp", 5985)])
        self.razonar(**lateral)
        self.assertNotIn(("WS2", "admin"), self.exec)
        self.razonar(**lateral | {"admin_of": [("alice", "WS1"), ("alice", "WS2")]})
        self.assertIn(("WS2", "admin"), self.exec)

    def test_la_misma_subred_basta_si_el_destino_atiende_el_puerto_y_queda_marcada(self):
        self.razonar(admin_of=[("alice", "WS1"), ("alice", "WS2")], service=[("WS2", "tcp", 445)])
        self.assertIn(("WS2", "admin"), self.exec)
        paso = next(a for a in self.apps.values() if a["rule"] == "movimiento_lateral_credenciales")
        self.assertEqual(paso["basis"], "inferido")
        # en otra subred y sin conexion observada no hay camino
        self.razonar(admin_of=[("alice", "WS1"), ("alice", "DC")], service=[("DC", "tcp", 445)])
        self.assertNotIn(("DC", "admin"), self.exec)

    def test_explotacion_remota_solo_por_un_camino_de_red(self):
        vuln = [("WS2", "CVE-R", "tcp", 445, "ejecucion_system")]
        self.razonar(vuln_remote=vuln)
        self.assertNotIn(("WS2", "admin"), self.exec)
        self.razonar(vuln_remote=vuln, service=[("WS2", "tcp", 445)])
        self.assertIn(("WS2", "admin"), self.exec)
        self.assertEqual(next(a for a in self.apps.values() if a["rule"] == "explotacion_remota")["basis"], "sintetico")

    def test_dominio_por_la_cuenta_integrada_y_propagacion(self):
        self.razonar(admin_of=[("alice", "WS1")], builtin_admin=[("alice",)])
        self.assertEqual(self.rel["domain_admin"], [("()",)])
        self.assertIn(("DC", "admin"), self.exec)
        self.assertNotIn(("C2", "admin"), self.exec)      # el dominio no administra equipos externos

    def test_dominio_por_vulnerabilidad_del_controlador(self):
        self.razonar(conn=BASE["conn"] + [("WS1", "DC", "tcp", 135)],
                     vuln_remote=[("DC", "CVE-Z", "tcp", 135, "admin_dominio")])
        self.assertIn("dominio_por_vulnerabilidad", self.reglas())
        self.assertIn(("WS2", "admin"), self.exec)

    def test_activo_alcanzado_segun_el_privilegio_que_pide(self):
        activos = [("docs", "WS1", 5, "user"), ("dominio", "WS1", 10, "admin")]
        self.razonar(asset=activos)
        self.assertEqual({a for a, _, _ in self.rel["asset_reached"]}, {"docs"})

    def test_confirmacion_del_acceso_inicial_solo_en_el_primer_contacto(self):
        self.razonar(logon=[("alice", "WS1", 2), ("bob", "WS2", 2)],
                     conn=[("WS1", "C2", "tcp", 443), ("WS2", "C2", "tcp", 443)],
                     contact=[("WS1", "C2", 500), ("WS2", "C2", 20)])
        self.assertEqual(self.exec, {("WS1", "user"), ("WS2", "user")})     # los dos son posibles
        confirmados = {id_ for id_, a in self.apps.items() if a["confirmed"]}
        self.assertEqual(confirmados, {"R1|WS2|bob"})                       # solo uno ocurrio primero

    def test_confirmacion_por_campana(self):
        hechos = dict(admin_of=[("alice", "WS1"), ("alice", "WS2")],
                      conn=BASE["conn"] + [("WS1", "WS2", "tcp", 5985)], service=[("WS2", "tcp", 445)],
                      campaign=[("c3", "P3", "WS1", "host"), ("c1", "P1", "WS1", "host"),
                                ("c2", "P2", "WS1", "origen"), ("c2", "P2", "WS2", "destino")],
                      campaign_tech=[("c3", "T1548.002")])
        self.razonar(**hechos)
        conf = {id_: [c["ref"] for c in a["confirmed"]] for id_, a in self.apps.items() if a["confirmed"]}
        self.assertEqual(conf["R3|WS1|alice"], ["c3"])
        self.assertEqual(conf["R4|WS1|alice"], ["c1"])
        self.assertEqual(conf["R5|WS1|alice|WS2|5985"], ["c2"])
        self.assertNotIn("R5|WS1|alice|WS2|445", conf)      # ese puerto no se observo: no lo confirma la campana
        # una escalada sin la tecnica de elusion de UAC no confirma R3
        self.razonar(**hechos | {"campaign_tech": [("c3", "T1055")]})
        self.assertFalse(self.apps["R3|WS1|alice"]["confirmed"])


@unittest.skipUnless(hay_souffle(), "falta la imagen tfg/souffle")
class ReglasV2(Reglas):
    """La v2 incluye la v1 (hereda todos sus tests) y anade las sesiones previas y el volcado del directorio."""
    version = "v2"

    def test_v1_no_usa_las_sesiones_previas(self):
        hechos = dict(logon=[], session_prior=[("alice", "WS1")])
        self.razonar(**hechos)
        self.assertEqual(self.exec, {("WS1", "user")})
        self.version = "v1"
        self.razonar(**hechos)
        self.assertEqual(self.exec, set())

    def test_una_sesion_previa_deja_credenciales(self):
        # bob no inicia sesion en la captura, pero ya estaba trabajando en WS1
        self.razonar(admin_of=[("alice", "WS1")], session_prior=[("bob", "WS1")])
        self.assertEqual(self.creds, {"alice", "bob"})

    def test_volcado_del_directorio_desde_el_controlador(self):
        hechos = dict(admin_of=[("alice", "WS1"), ("alice", "DC")], conn=BASE["conn"] + [("WS1", "DC", "tcp", 5985)],
                      user=[("alice",), ("carol",)], campaign=[("c1", "P1", "DC", "host")])
        self.razonar(**hechos, campaign_tech=[("c1", "T1003.006")])
        self.assertIn("carol", self.creds)
        self.assertEqual([c["ref"] for c in self.apps["R12|DC|carol"]["confirmed"]], ["c1"])
        self.razonar(**hechos, campaign_tech=[("c1", "T1003.001")])     # otra tecnica no lo confirma
        self.assertFalse(self.apps["R12|DC|carol"]["confirmed"])
        self.razonar(admin_of=[("alice", "WS1")], user=[("alice",), ("carol",)])   # sin el controlador, no
        self.assertNotIn("carol", self.creds)


if __name__ == "__main__":
    unittest.main()
