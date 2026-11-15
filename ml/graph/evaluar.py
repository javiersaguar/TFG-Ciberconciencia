"""ML-3: prediccion de tecnicas sobre el grafo de ATT&CK, con ocultacion de aristas (F5.4).

TAREA. Dado un conjunto de tecnicas ya observadas de un actor (la consulta), ordenar las demas por lo
probable que es que tambien las use. Es lo que hara el sistema con una campana en curso: de lo detectado,
proponer que puede venir despues.

PROTOCOLO, fijado ANTES de ejecutar nada (15-11-2026):
  - Datos: ml.graph.datos (ATT&CK v19.2; grupos y campanas con sus tecnicas padre).
  - Se evalua con las entidades de 5 tecnicas o mas. Las demas solo sirven para entrenar.
  - 5 bloques por FAMILIA (un grupo y sus campanas atribuidas van juntos), barajados con semilla fija.
    En cada vuelta se entrena con 4 bloques y se evalua con el quinto: la entidad evaluada NUNCA esta
    en el entrenamiento (escenario real: una campana nueva no esta en ATT&CK).
  - Por entidad evaluada, 5 repeticiones: se oculta al azar el 30 % de sus tecnicas (redondeando hacia
    arriba) y el resto es la consulta. El sistema ordena todas las tecnicas que no estan en la consulta.
  - Metricas por caso, promediadas por entidad y luego entre entidades: exhaustividad a 5 y a 10, rango
    reciproco medio (MRR), precision media (MAP) y AUC.
  - Sin busqueda de hiperparametros: todos los valores estan en las constantes de este modulo.

SISTEMAS
  popularidad     cuantas entidades de entrenamiento usan la tecnica (no mira la consulta);
  knn_tecnicas    coocurrencia: suma de la similitud coseno entre cada tecnica de la consulta y la candidata;
  knn_entidades   voto de las 20 entidades de entrenamiento mas parecidas a la consulta (Jaccard);
  fastrp          embeddings estructurales FastRP de Neo4j GDS sobre el grafo de entrenamiento (entidades,
                  software, tecnicas y tacticas); coseno entre la candidata y el centroide de la consulta;
  combinado       regresion logistica sobre las cuatro puntuaciones anteriores y el solape de tacticas.
                  Se ajusta DENTRO de los bloques de entrenamiento: tres bloques dan las puntuaciones y
                  el cuarto, los ejemplos.

DECISION, fijada antes de ver resultados. El sistema que usara el bucle neurosimbolico es el de mejor MRR.
Un sistema aprendido (fastrp o combinado) solo se adopta si supera a la MEJOR linea base (popularidad o
los dos knn) en MRR, con una fraccion de diferencias <= 0 menor que 0,05 en un remuestreo emparejado por
entidad (10.000 muestras). Si no, el bucle usa la mejor linea base y se informa asi.

Uso (desde la raiz del repo, con Neo4j levantado para FastRP):
  .venv/bin/python -m ml.graph.datos
  .venv/bin/python -m ml.graph.evaluar
"""
import argparse
import collections
import json
import math
import os
import random
from pathlib import Path

import numpy as np

DATOS = Path("data/ml3/attack.json")
SALIDA = Path("data/ml3/resultados.json")
SEMILLA, BLOQUES = 2026, 5
MIN_TECNICAS, OCULTAR, REPETICIONES = 5, 0.30, 5
KS = (5, 10)
VECINOS = 20
FASTRP = {"embeddingDimension": 128, "iterationWeights": [0.0, 1.0, 1.0], "normalizationStrength": 0.0,
          "randomSeed": 42, "concurrency": 1}
B, ALFA = 10_000, 0.05
BASES = ("popularidad", "knn_tecnicas", "knn_entidades")
APRENDIDOS = ("fastrp", "combinado")


# ------------------------------------------------------------------ protocolo
def bloques(entidades):
    familias = sorted({e["familia"] for e in entidades})
    random.Random(SEMILLA).shuffle(familias)
    de = {f: i % BLOQUES for i, f in enumerate(familias)}
    return {e["ext"]: de[e["familia"]] for e in entidades}


def casos(entidad):
    """Las repeticiones de una entidad: (consulta, ocultas), con una semilla que depende solo de ella."""
    rng = random.Random(f"{SEMILLA}|{entidad['ext']}")
    tec = sorted(entidad["tecnicas"])
    n = math.ceil(OCULTAR * len(tec))
    out = []
    for _ in range(REPETICIONES):
        ocultas = set(rng.sample(tec, n))
        out.append((sorted(set(tec) - ocultas), sorted(ocultas)))
    return out


def metricas(orden, ocultas):
    """`orden`: candidatas de mejor a peor. Devuelve las metricas de un caso."""
    oc = set(ocultas)
    aciertos = [t in oc for t in orden]
    pos = [i for i, a in enumerate(aciertos, 1) if a]
    m = {f"r@{k}": sum(aciertos[:k]) / len(oc) for k in KS}
    m["mrr"] = 1 / pos[0]
    m["map"] = sum((j + 1) / p for j, p in enumerate(pos)) / len(oc)
    negativos = len(orden) - len(pos)
    # AUC: probabilidad de que una oculta quede por delante de una no usada
    m["auc"] = sum(negativos - (p - j - 1) for j, p in enumerate(pos)) / (len(pos) * negativos)
    return m


# ------------------------------------------------------------------ sistemas
class Popularidad:
    def __init__(self, entidades, tecnicas):
        c = collections.Counter(t for e in entidades for t in e["tecnicas"])
        self.p = {t: float(c[t]) for t in tecnicas}

    def puntuar(self, consulta):
        return self.p


class KnnTecnicas:
    def __init__(self, entidades, tecnicas):
        self.idx = {t: i for i, t in enumerate(tecnicas)}
        m = np.zeros((len(entidades), len(tecnicas)))
        for i, e in enumerate(entidades):
            m[i, [self.idx[t] for t in e["tecnicas"]]] = 1
        norma = np.linalg.norm(m, axis=0)
        norma[norma == 0] = 1
        self.sim = (m.T @ m) / np.outer(norma, norma)
        self.tecnicas = tecnicas

    def puntuar(self, consulta):
        s = self.sim[[self.idx[q] for q in consulta]].sum(axis=0)
        return dict(zip(self.tecnicas, s.tolist()))


class KnnEntidades:
    def __init__(self, entidades, tecnicas):
        self.conjuntos = [set(e["tecnicas"]) for e in entidades]
        self.tecnicas = tecnicas

    def puntuar(self, consulta):
        q = set(consulta)
        sims = sorted(((len(q & c) / len(q | c), i) for i, c in enumerate(self.conjuntos) if q & c), reverse=True)[:VECINOS]
        s = collections.Counter()
        for sim, i in sims:
            for t in self.conjuntos[i]:
                s[t] += sim
        return {t: float(s[t]) for t in self.tecnicas}


class FastRP:
    def __init__(self, vectores, tecnicas):
        self.v = {t: np.asarray(vectores[t]) for t in tecnicas if t in vectores}
        self.tecnicas = tecnicas

    def puntuar(self, consulta):
        qs = [self.v[q] for q in consulta if q in self.v]
        if not qs:
            return {t: 0.0 for t in self.tecnicas}
        c = np.mean(qs, axis=0)
        nc = np.linalg.norm(c) or 1.0
        return {t: float(self.v[t] @ c / ((np.linalg.norm(self.v[t]) or 1.0) * nc)) if t in self.v else 0.0
                for t in self.tecnicas}


def embeddings(session, entidades, software, tecnicas):
    """FastRP de GDS sobre el grafo de entrenamiento. Las aristas salen de los datos, no del grafo vivo."""
    nombre = "tfg-ml3"
    session.run("CALL gds.graph.drop($n, false)", n=nombre).consume()
    usos = [[e["ext"], t] for e in entidades for t in e["tecnicas"]] + [[s["ext"], t] for s in software for t in s["tecnicas"]]
    tacticas = [[t["ext"], ta] for t in tecnicas for ta in t["tacticas"]]
    session.run("""
        CALL () {
            UNWIND $usos AS par
            MATCH (a:StixObject {external_id: par[0]}) WHERE (a:IntrusionSet OR a:CtiCampaign OR a:Software)
              AND NOT coalesce(a.revoked, false)
            MATCH (b:Technique {external_id: par[1]}) WHERE NOT coalesce(b.revoked, false) AND NOT coalesce(b.deprecated, false)
            RETURN a, b
            UNION
            UNWIND $tacticas AS par
            MATCH (a:Technique {external_id: par[0]}) WHERE NOT coalesce(a.revoked, false) AND NOT coalesce(a.deprecated, false)
            MATCH (b:Tactic {shortname: par[1]})
            RETURN a, b
        }
        WITH gds.graph.project($n, a, b, {}, {undirectedRelationshipTypes: ['*']}) AS g
        RETURN g.nodeCount AS nodos""", n=nombre, usos=usos, tacticas=tacticas).consume()
    filas = session.run("""
        CALL gds.fastRP.stream($n, $cfg) YIELD nodeId, embedding
        WITH gds.util.asNode(nodeId) AS x, embedding WHERE x:Technique
        RETURN x.external_id AS t, embedding""", n=nombre, cfg=FASTRP).data()
    session.run("CALL gds.graph.drop($n)", n=nombre).consume()
    return {f["t"]: f["embedding"] for f in filas}


class Componentes:
    """Los cuatro sistemas simples ajustados con un conjunto de entidades."""

    def __init__(self, entidades, software, tecnicas, session):
        ids = [t["ext"] for t in tecnicas]
        self.tacticas = {t["ext"]: set(t["tacticas"]) for t in tecnicas}
        self.ids = ids
        self.s = {"popularidad": Popularidad(entidades, ids), "knn_tecnicas": KnnTecnicas(entidades, ids),
                  "knn_entidades": KnnEntidades(entidades, ids),
                  "fastrp": FastRP(embeddings(session, entidades, software, tecnicas), ids)}

    def puntuaciones(self, consulta):
        return {n: s.puntuar(consulta) for n, s in self.s.items()}

    def rasgos(self, consulta, punt):
        """Matriz candidatas x rasgos para el sistema combinado; cada puntuacion se escala a [0, 1] dentro del caso."""
        cand = [t for t in self.ids if t not in set(consulta)]
        tq = set().union(*(self.tacticas[q] for q in consulta))
        cols = []
        for n in ("popularidad", "knn_tecnicas", "knn_entidades", "fastrp"):
            v = np.array([punt[n][t] for t in cand])
            rango = v.max() - v.min()
            cols.append((v - v.min()) / rango if rango else np.zeros_like(v))
        cols.append(np.array([len(self.tacticas[t] & tq) / len(self.tacticas[t]) if self.tacticas[t] else 0.0 for t in cand]))
        return cand, np.column_stack(cols)


def ordenar(puntuacion, consulta):
    q = set(consulta)
    return [t for t, _ in sorted(((t, s) for t, s in puntuacion.items() if t not in q), key=lambda x: (-x[1], x[0]))]


def ajustar_combinado(comp, entidades_ajuste):
    from sklearn.linear_model import LogisticRegression
    X, y = [], []
    for e in entidades_ajuste:
        for consulta, ocultas in casos(e):
            cand, m = comp.rasgos(consulta, comp.puntuaciones(consulta))
            X.append(m)
            y.extend(t in set(ocultas) for t in cand)
    return LogisticRegression(class_weight="balanced", max_iter=1000, random_state=SEMILLA).fit(np.vstack(X), np.array(y))


# ------------------------------------------------------------------ evaluacion
def evaluar(doc, session, registro=print):
    ent, tec, soft = doc["entidades"], doc["tecnicas"], doc["software"]
    bloque = bloques(ent)
    por_entidad = collections.defaultdict(dict)      # sistema -> entidad -> metricas medias
    coefs = []
    for k in range(BLOQUES):
        tren = [e for e in ent if bloque[e["ext"]] != k]
        prueba = [e for e in ent if bloque[e["ext"]] == k and len(e["tecnicas"]) >= MIN_TECNICAS]
        # combinado: tres bloques dan las puntuaciones y el cuarto, los ejemplos
        j = (k + 1) % BLOQUES
        base = Componentes([e for e in tren if bloque[e["ext"]] != j], soft, tec, session)
        modelo = ajustar_combinado(base, [e for e in tren if bloque[e["ext"]] == j and len(e["tecnicas"]) >= MIN_TECNICAS])
        coefs.append(modelo.coef_[0].tolist())
        comp = Componentes(tren, soft, tec, session)
        for e in prueba:
            acum = collections.defaultdict(lambda: collections.defaultdict(float))
            for consulta, ocultas in casos(e):
                punt = comp.puntuaciones(consulta)
                ordenes = {n: ordenar(p, consulta) for n, p in punt.items()}
                cand, m = comp.rasgos(consulta, punt)
                prob = modelo.predict_proba(m)[:, 1]
                ordenes["combinado"] = [t for t, _ in sorted(zip(cand, prob), key=lambda x: (-x[1], x[0]))]
                for n, o in ordenes.items():
                    for met, v in metricas(o, ocultas).items():
                        acum[n][met] += v / REPETICIONES
            for n, m_ in acum.items():
                por_entidad[n][e["ext"]] = dict(m_)
        registro(f"bloque {k}: {len(tren)} entidades de entrenamiento, {len(prueba)} evaluadas")
    return por_entidad, coefs, bloque


def resumen(por_entidad):
    return {n: {m: round(float(np.mean([v[m] for v in d.values()])), 4) for m in next(iter(d.values()))}
            for n, d in por_entidad.items()}


def remuestreo(por_entidad, a, b, metrica="mrr"):
    ids = sorted(por_entidad[a])
    d = np.array([por_entidad[a][i][metrica] - por_entidad[b][i][metrica] for i in ids])
    rng = np.random.default_rng(SEMILLA)
    medias = d[rng.integers(0, len(d), size=(B, len(d)))].mean(axis=1)
    return {"diferencia": round(float(d.mean()), 4), "ic95": [round(float(np.quantile(medias, 0.025)), 4),
                                                              round(float(np.quantile(medias, 0.975)), 4)],
            "fraccion_dif_menor_o_igual_0": round(float((medias <= 0).mean()), 4)}


def decidir(tabla, por_entidad):
    mejor_base = max(BASES, key=lambda n: tabla[n]["mrr"])
    contrastes = {f"{n} - {mejor_base}": remuestreo(por_entidad, n, mejor_base) for n in APRENDIDOS}
    validos = [n for n in APRENDIDOS if contrastes[f"{n} - {mejor_base}"]["diferencia"] > 0
               and contrastes[f"{n} - {mejor_base}"]["fraccion_dif_menor_o_igual_0"] < ALFA]
    adoptado = max(validos, key=lambda n: tabla[n]["mrr"]) if validos else mejor_base
    return {"mejor_linea_base": mejor_base, "contrastes": contrastes, "adoptado": adoptado}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.parse_args()
    from neo4j import GraphDatabase
    doc = json.loads(DATOS.read_text(encoding="utf-8"))
    uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    with GraphDatabase.driver(uri, auth=("neo4j", "tfg-neo4j")) as driver, driver.session() as s:
        por_entidad, coefs, bloque = evaluar(doc, s)
    tabla = resumen(por_entidad)
    decision = decidir(tabla, por_entidad)
    tipos = {e["ext"]: e["tipo"] for e in doc["entidades"]}
    por_tipo = {t: resumen({n: {i: v for i, v in d.items() if tipos[i] == t} for n, d in por_entidad.items()})
                for t in ("grupo", "campana")}
    evaluadas = len(next(iter(por_entidad.values())))
    SALIDA.write_text(json.dumps({
        "datos_sha256": doc["sha256"], "protocolo": {"bloques": BLOQUES, "semilla": SEMILLA, "min_tecnicas": MIN_TECNICAS,
                                                     "ocultar": OCULTAR, "repeticiones": REPETICIONES, "vecinos": VECINOS,
                                                     "fastrp": FASTRP, "remuestreo": B, "alfa": ALFA},
        "entidades_evaluadas": evaluadas, "tabla": tabla, "por_tipo": por_tipo, "decision": decision,
        "coeficientes_combinado": {"rasgos": ["popularidad", "knn_tecnicas", "knn_entidades", "fastrp", "solape_tacticas"],
                                   "por_bloque": coefs},
        "por_entidad": por_entidad}, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"\n{evaluadas} entidades evaluadas, {len(doc['tecnicas'])} técnicas candidatas")
    print("| Sistema | R@5 | R@10 | MRR | MAP | AUC |\n|---|---:|---:|---:|---:|---:|")
    for n in (*BASES, *APRENDIDOS):
        t = tabla[n]
        print(f"| {n} | {t['r@5']:.3f} | {t['r@10']:.3f} | {t['mrr']:.3f} | {t['map']:.3f} | {t['auc']:.3f} |")
    print(f"\nMejor línea base: {decision['mejor_linea_base']}")
    for c, v in decision["contrastes"].items():
        print(f"  {c} (MRR): {v['diferencia']:+.4f}  IC95 [{v['ic95'][0]:+.4f}, {v['ic95'][1]:+.4f}]  fracción<=0 {v['fraccion_dif_menor_o_igual_0']}")
    print(f"ADOPTADO para el bucle (regla fijada antes): {decision['adoptado']}")


if __name__ == "__main__":
    main()
