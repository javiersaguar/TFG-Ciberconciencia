"""Tests de las reglas de inferencia del inventario (graph/model.md), sin bases de datos."""
import unittest

from graph.inventory.construir import construir, ip_valida

ESC = "prueba"
SID = "S-1-5-21-1-2-3-"


def filas():
    con = lambda rec, src, dst, port, n=1, proto="tcp", procs=("x.exe",): {
        "recorder": rec, "src": src, "dst": dst, "port": port, "proto": proto, "n": n, "first": 100, "last": 200,
        "procs": list(procs)}
    ses = lambda host, user, rid, tipo, src="-", n=1: {
        "host": host, "user": user, "domain": "LAB.LOCAL", "sid": f"{SID}{rid}", "logon_type": tipo, "src": src,
        "n": n, "first": 10, "last": 20}
    return {
        "ips": [{"host": "WS1.lab.local", "ip": "10.0.1.4", "n": 50}, {"host": "WS1.lab.local", "ip": "127.0.0.1", "n": 99},
                {"host": "WS1.lab.local", "ip": "10.0.1.99", "n": 2}, {"host": "DC.lab.local", "ip": "10.0.0.4", "n": 30}],
        "conexiones": [
            con("WS1.lab.local", "10.0.1.4", "10.0.0.4", 88, 5), con("DC.lab.local", "10.0.1.4", "10.0.0.4", 88, 5),
            con("WS1.lab.local", "10.0.1.4", "10.0.0.4", 389), con("WS1.lab.local", "10.0.1.4", "10.0.1.6", 5985),
            con("WS1.lab.local", "10.0.1.4", "192.168.0.4", 443), con("WS1.lab.local", "10.0.1.4", "8.8.8.8", 53, proto="udp"),
            con("WS1.lab.local", "10.0.1.4", "1.1.1.1", 53, proto="udp"),
            con("WS1.lab.local", "10.0.1.4", "10.0.1.255", 138), con("DC.lab.local", "10.0.0.4", "10.0.1.4", 55000),
            con("WS1.lab.local", "10.0.1.4", "10.0.1.4", 445)],
        "sesiones": [ses("WS1.lab.local", "alice", 1107, 10, "172.18.0.2"), ses("WS1.lab.local", "alice", 1107, 3),
                     ses("WS1.lab.local", "WS1$", 1001, 3), ses("WS1.lab.local", "SYSTEM", 0, 5) | {"sid": "S-1-5-18"},
                     ses("DC.lab.local", "admin", 500, 3, "10.0.1.4")],
        "privilegios": [
            {"host": "WS1.lab.local", "user": "alice", "domain": "LAB", "sid": f"{SID}1107",
             "privileges": ["SeDebugPrivilege", "SeBackupPrivilege"], "n": 2, "first": 10, "last": 20},
            {"host": "DC.lab.local", "user": "alice", "domain": "LAB", "sid": f"{SID}1107",
             "privileges": ["SeChangeNotifyPrivilege"], "n": 1, "first": 10, "last": 20}],
        "actividad": [
            {"host": "DC.lab.local", "user": "alice", "n": 9, "first": 5, "last": 50},        # sin 4624 de alice en DC
            {"host": "WS1.lab.local", "user": "alice", "n": 9, "first": 9, "last": 50},       # a la vez que su 4624
            {"host": "DC.lab.local", "user": "admin", "n": 3, "first": 10 - 120_001, "last": 50},  # mucho antes
            {"host": "WS1.lab.local", "user": "desconocido", "n": 9, "first": 1, "last": 50}],
        "campanas": [{
            "campaign_id": "c1", "pattern_id": "P2", "dataset_id": "ds", "title": "Movimiento lateral", "first_seen": 1,
            "last_seen": 2, "severity_id": 4, "confidence_score": 90, "technique_ids": ["T1021.006", "T1003.001"],
            "related_events_count": 3, "version": "v2",
            "documento": {"tfg": {"devices": [{"hostname": "WS1.lab.local", "role": "origen"},
                                              {"hostname": "WS2.lab.local", "role": "destino"}],
                                  "stages": [{"order": 2, "name": "servicio"}, {"order": 1, "name": "ejecucion_remota"}]}}}],
    }


class Construir(unittest.TestCase):
    def setUp(self):
        nodos, rels = construir(ESC, "10.0.0.0/8", filas())
        self.n = {x["id"]: x for x in nodos}
        self.r = {x["id"]: x for x in rels}
        self.tipos = lambda t: [x for x in rels if x["tipo"] == t]

    def test_ip_valida(self):
        for mala in ("127.0.0.1", "10.0.1.255", "224.0.0.252", "169.254.1.1", "::1", "-", "fe80::1"):
            self.assertIsNone(ip_valida(mala), mala)
        self.assertIsNotNone(ip_valida("10.0.1.4"))

    def test_ip_del_equipo_es_la_mas_usada_y_no_el_bucle_local(self):
        self.assertEqual(self.n[f"{ESC}/host/WS1"]["props"]["ips"], ["10.0.1.4"])

    def test_papeles_y_zonas(self):
        self.assertEqual(self.n[f"{ESC}/host/DC"]["props"]["role"], "domain_controller")
        self.assertEqual(self.n[f"{ESC}/host/WS1"]["props"]["role"], "workstation")
        self.assertEqual(self.n[f"{ESC}/host/192.168.0.4"]["props"]["role"], "external")
        self.assertFalse(self.n[f"{ESC}/host/10.0.1.6"]["props"]["monitored"])
        self.assertIn(f"{ESC}/host/WS1|IN_ZONE|{ESC}/zone/10.0.1.0/24", self.r)
        self.assertIn(f"{ESC}/host/192.168.0.4|IN_ZONE|{ESC}/zone/externa", self.r)

    def test_las_publicas_se_agrupan_en_internet(self):
        self.assertNotIn(f"{ESC}/host/8.8.8.8", self.n)
        c = self.r[f"{ESC}/host/WS1|CONNECTS_TO|{ESC}/host/internet|udp/53"]["props"]
        self.assertEqual((c["events"], c["peers"], c["service"]), (2, 2, "dns"))

    def test_conexiones_sin_efimeros_ni_difusion_ni_propias(self):
        destinos = {(x["destino"], x["props"]["port"]) for x in self.tipos("CONNECTS_TO")}
        self.assertNotIn((f"{ESC}/host/WS1", 55000), destinos)
        self.assertFalse(any("255" in d for d, _ in destinos))
        self.assertFalse(any(x["origen"] == x["destino"] for x in self.tipos("CONNECTS_TO")))

    def test_la_misma_conexion_vista_por_dos_equipos_es_una_arista(self):
        c = self.r[f"{ESC}/host/WS1|CONNECTS_TO|{ESC}/host/DC|tcp/88"]["props"]
        self.assertEqual((c["events"], c["recorders"]), (10, ["DC", "WS1"]))
        self.assertIn(f"{ESC}/host/DC|RUNS|{ESC}/svc/DC/tcp/88", self.r)

    def test_usuarios_sin_cuentas_de_equipo_ni_de_sistema(self):
        nombres = sorted(x["props"]["name"] for x in self.n.values() if "User" in x["labels"])
        self.assertEqual(nombres, ["admin", "alice"])
        self.assertTrue(self.n[f"{ESC}/user/{SID}500"]["props"]["builtin_admin"])

    def test_sesiones_agregadas(self):
        s = self.r[f"{ESC}/user/{SID}1107|LOGGED_ON|{ESC}/host/WS1"]["props"]
        self.assertEqual((s["logon_types"], s["events"], s["from_ips"]), ([3, 10], 2, ["172.18.0.2"]))

    def test_admin_solo_con_sedebug(self):
        admins = [(x["origen"], x["destino"]) for x in self.tipos("ADMIN_OF")]
        self.assertEqual(admins, [(f"{ESC}/user/{SID}1107", f"{ESC}/host/WS1")])

    def test_sesion_previa_a_la_captura(self):
        previas = sorted((x["origen"].rsplit("-", 1)[1], x["destino"].rsplit("/", 1)[1]) for x in self.tipos("HAS_SESSION"))
        self.assertEqual(previas, [("1107", "DC"), ("500", "DC")])
        self.assertTrue(all(x["props"]["origen"] == "inferido" for x in self.tipos("HAS_SESSION")))

    def test_campana(self):
        c = self.n["c1"]["props"]
        self.assertEqual((c["stages"], c["techniques"]), (["ejecucion_remota", "servicio"], ["T1003.001", "T1021.006"]))
        self.assertEqual(self.r[f"c1|OBSERVED_ON|{ESC}/host/WS2|destino"]["props"]["role"], "destino")
        self.assertIn(f"{ESC}/host/WS2", self.n)   # equipo de la campana sin eventos propios
        ev = self.tipos("EVIDENCES")
        self.assertEqual(sorted(x["destino_externo"] for x in ev), ["T1003.001", "T1021.006"])
        self.assertTrue(all("destino" not in x for x in ev))

    def test_todo_lleva_escenario_y_origen(self):
        for x in list(self.n.values()) + list(self.r.values()):
            self.assertEqual(x["props"]["escenario"], ESC)
            self.assertIn(x["props"]["origen"], ("observado", "inferido"))

    def test_es_determinista(self):
        self.assertEqual(construir(ESC, "10.0.0.0/8", filas()), construir(ESC, "10.0.0.0/8", filas()))


if __name__ == "__main__":
    unittest.main()
