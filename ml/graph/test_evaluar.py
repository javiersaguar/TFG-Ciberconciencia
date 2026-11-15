"""Tests del protocolo y de los sistemas de ML-3, sin Neo4j."""
import unittest

from ml.graph import evaluar as ev
from ml.graph.datos import familias


def entidad(ext, tecnicas, familia=None):
    return {"ext": ext, "tecnicas": list(tecnicas), "familia": familia or ext, "tipo": "grupo"}


class Protocolo(unittest.TestCase):
    def test_familias_une_el_grupo_con_sus_campanas(self):
        ent = [{"ext": x} for x in ("G1", "C1", "C2", "G2")]
        fam = familias(ent, [{"campana": "C1", "grupo": "G1"}, {"campana": "C2", "grupo": "G1"}, {"campana": "C9", "grupo": "G2"}])
        self.assertEqual(len({fam["G1"], fam["C1"], fam["C2"]}), 1)
        self.assertNotEqual(fam["G1"], fam["G2"])

    def test_una_familia_no_se_reparte_entre_bloques(self):
        ent = [entidad(f"G{i}", "abcde", familia=f"F{i % 7}") for i in range(40)]
        b = ev.bloques(ent)
        for f in {e["familia"] for e in ent}:
            self.assertEqual(len({b[e["ext"]] for e in ent if e["familia"] == f}), 1)
        self.assertEqual(set(b.values()), set(range(ev.BLOQUES)))

    def test_casos_ocultan_el_30_por_ciento_y_son_reproducibles(self):
        e = entidad("G1", [f"T{i}" for i in range(10)])
        cs = ev.casos(e)
        self.assertEqual(len(cs), ev.REPETICIONES)
        for consulta, ocultas in cs:
            self.assertEqual((len(ocultas), len(consulta)), (3, 7))
            self.assertFalse(set(consulta) & set(ocultas))
        self.assertEqual(cs, ev.casos(e))
        self.assertEqual(len(ev.casos(entidad("G2", "abcde"))[0][1]), 2)     # ceil(1,5)

    def test_metricas(self):
        m = ev.metricas(["a", "x", "b", "y", "z", "w"], ["a", "b"])
        self.assertEqual((m["r@5"], m["mrr"]), (1.0, 1.0))
        self.assertAlmostEqual(m["map"], (1 / 1 + 2 / 3) / 2)
        self.assertAlmostEqual(m["auc"], (4 + 3) / 8)       # a gana a 4 negativas; b, a 3
        peor = ev.metricas(["x", "y", "z", "w", "v", "a"], ["a"])
        self.assertEqual((peor["r@5"], peor["mrr"], peor["auc"]), (0.0, 1 / 6, 0.0))


class Sistemas(unittest.TestCase):
    def setUp(self):
        self.tec = ["T1", "T2", "T3", "T4", "T5"]
        # T1 y T2 van siempre juntas; T5 es la mas popular; T4 no la usa nadie
        self.ent = [entidad("A", ["T1", "T2", "T5"]), entidad("B", ["T1", "T2", "T5"]), entidad("C", ["T3", "T5"]),
                    entidad("D", ["T3", "T5"]), entidad("E", ["T5"])]

    def test_popularidad_no_mira_la_consulta(self):
        o = ev.ordenar(ev.Popularidad(self.ent, self.tec).puntuar(["T1"]), ["T1"])
        self.assertEqual(o[0], "T5")
        self.assertEqual(o[-1], "T4")
        self.assertNotIn("T1", o)

    def test_knn_tecnicas_propone_la_que_coocurre(self):
        s = ev.KnnTecnicas(self.ent, self.tec).puntuar(["T1"])
        self.assertGreater(s["T2"], s["T3"])
        self.assertEqual(s["T4"], 0.0)

    def test_knn_entidades_vota_con_las_parecidas(self):
        s = ev.KnnEntidades(self.ent, self.tec).puntuar(["T1"])
        self.assertGreater(s["T2"], s["T3"])
        self.assertEqual(s["T3"], 0.0)       # C y D no comparten nada con la consulta

    def test_fastrp_usa_el_centroide_y_tolera_tecnicas_sin_vector(self):
        f = ev.FastRP({"T1": [1, 0], "T2": [0.9, 0.1], "T3": [0, 1]}, self.tec)
        s = f.puntuar(["T1"])
        self.assertGreater(s["T2"], s["T3"])
        self.assertEqual(s["T4"], 0.0)
        self.assertEqual(set(ev.FastRP({}, self.tec).puntuar(["T1"]).values()), {0.0})

    def test_remuestreo_y_decision(self):
        por = {"popularidad": {i: {"mrr": 0.2} for i in range(50)}, "knn_tecnicas": {i: {"mrr": 0.3} for i in range(50)},
               "knn_entidades": {i: {"mrr": 0.25} for i in range(50)}, "fastrp": {i: {"mrr": 0.28} for i in range(50)},
               "combinado": {i: {"mrr": 0.4} for i in range(50)}}
        tabla = {n: {"mrr": next(iter(d.values()))["mrr"]} for n, d in por.items()}
        d = ev.decidir(tabla, por)
        self.assertEqual((d["mejor_linea_base"], d["adoptado"]), ("knn_tecnicas", "combinado"))
        por["combinado"] = {i: {"mrr": 0.3 + (0.01 if i % 2 else -0.01)} for i in range(50)}   # sin ventaja real
        tabla["combinado"] = {"mrr": 0.3}
        self.assertEqual(ev.decidir(tabla, por)["adoptado"], "knn_tecnicas")


if __name__ == "__main__":
    unittest.main()
