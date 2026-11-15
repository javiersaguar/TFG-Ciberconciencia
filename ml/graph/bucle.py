"""ML-3: el bucle neurosimbolico sobre los escenarios del corpus (F5.4, pasos 5 y 6).

    el modelo PROPONE tecnicas probables  -->  el razonador comprueba cuales son FACTIBLES aqui y ahora
              ^                                                |
              +------- solo se presenta lo que la logica deriva, con su justificacion

Se recorre cada escenario en el orden en que el Pilar A detecto sus campanas. Tras cada campana:

  consulta     las tecnicas padre observadas hasta ese momento;
  modelo       el sistema adoptado en ml.graph.evaluar, entrenado SIN la familia de APT29 (G0016 y sus
               campanas), ordena las tecnicas que aun no se han visto;
  razonador    con lo confirmado hasta ese momento, los estados que el adversario ya ha logrado y la
               FRONTERA: aplicaciones de regla aun no confirmadas cuyas precondiciones ya se cumplen;
  bucle        cada tecnica propuesta se cruza con la frontera (graph/datalog/tecnicas.json). Se
               presenta solo si alguna regla factible la realiza, y se dice donde. Lo demas se descarta,
               distinguiendo «no es factible ahora» de «no hay regla que la modele».

Dos medidas, ambas contra lo que paso de verdad:
  1. las propuestas del modelo frente a las tecnicas del plan de emulacion aun no observadas;
  2. el paso siguiente real (la campana que vino despues): ¿estaba en la frontera del razonador? y, si
     su tecnica era nueva, ¿en que puesto la tenia el modelo, antes y despues de verificar?

Son pocos pasos (dos escenarios): se informa como caso de estudio, no como estimacion.

Uso (desde la raiz del repo, despues de ml.graph.evaluar y de graph.pipeline):
  .venv/bin/python -m ml.graph.bucle
"""
import csv
import json
from pathlib import Path

from ml.graph import evaluar as ev

DATOS = Path("data/graph")
SALIDA = Path("data/ml3/bucle.json")
MAPA = Path("graph/datalog/tecnicas.json")
VERDAD = Path("detection/evaluation/verdad_datasets.csv")
ESCENARIOS = {"apt29-day1": "SDWIN-200501225525", "apt29-day2": "SDWIN-200502035409"}
EXCLUIR = "G0016"
REGLAS = "v2"
K = 10
INICIO = "adversario"


def padre(t):
    return t.split(".")[0]


def recomendador(doc, resultados):
    """El sistema adoptado, entrenado sin la familia del actor que se evalua. Tambien la popularidad, de contraste."""
    familia = next(e["familia"] for e in doc["entidades"] if e["ext"] == EXCLUIR)
    tren = [e for e in doc["entidades"] if e["familia"] != familia]
    ids = [t["ext"] for t in doc["tecnicas"]]
    clases = {"popularidad": ev.Popularidad, "knn_tecnicas": ev.KnnTecnicas, "knn_entidades": ev.KnnEntidades}
    adoptado = resultados["decision"]["adoptado"]
    if adoptado not in clases:
        raise SystemExit(f"El sistema adoptado ({adoptado}) necesita embeddings: este módulo solo monta las líneas base")
    return adoptado, clases[adoptado](tren, ids), ev.Popularidad(tren, ids), ids, len(tren)


def escenario(esc):
    """Campanas en orden y grafo de derivacion, de los ficheros que deja graph.pipeline."""
    inv = json.loads((DATOS / f"inventario-{esc}.json").read_text(encoding="utf-8"))
    der = json.loads((DATOS / f"derivada-{esc}-{REGLAS}.json").read_text(encoding="utf-8"))
    campanas = sorted(({"id": n["id"], "patron": n["props"]["pattern_id"], "titulo": n["props"]["title"],
                        "inicio": n["props"]["first_seen"], "tecnicas": sorted({padre(t) for t in n["props"]["techniques"]})}
                       for n in inv["nodos"] if "Campaign" in n["labels"]), key=lambda c: (c["inicio"], c["id"]))
    estado = {n["id"]: n["props"]["state"] for n in der["nodos"] if "AttackState" in n["labels"]}
    apps = {n["id"]: {"id": n["props"]["app"], "rule": n["props"]["rule"], "basis": n["props"]["basis"],
                      "detail": n["props"]["detail"], "confirmed_by": n["props"]["confirmed_by"], "pre": [], "conclusion": None}
            for n in der["nodos"] if "RuleApp" in n["labels"]}
    for r in der["relaciones"]:
        if r["tipo"] == "ENABLES":
            apps[r["destino"]]["pre"].append(estado[r["origen"]])
        elif r["tipo"] == "CONCLUDES":
            apps[r["origen"]]["conclusion"] = estado[r["destino"]]
    return campanas, list(apps.values())


def situacion(apps, vistas):
    """Estados ya logrados y frontera, con las campanas vistas hasta ahora."""
    def confirmada(a):
        return any(c.startswith("primer_contacto:") or c.split(":", 1)[1] in vistas for c in a["confirmed_by"])

    hechas = [a for a in apps if confirmada(a)]
    logrados = {INICIO} | {a["conclusion"] for a in hechas}
    cambio = True
    while cambio:          # lo que se sigue sin que el adversario haga nada (R0)
        cambio = False
        for a in apps:
            if a["basis"] == "trivial" and a["conclusion"] not in logrados and all(p in logrados for p in a["pre"]):
                logrados.add(a["conclusion"])
                cambio = True
    hechas_ids = {a["id"] for a in hechas}
    frontera = [a for a in apps if a["basis"] != "trivial" and a["id"] not in hechas_ids
                and a["conclusion"] not in logrados and all(p in logrados for p in a["pre"])]
    return logrados, sorted(frontera, key=lambda a: a["id"])


def recorrer(esc, modelo, popularidad, ids, mapa, plan):
    campanas, apps = escenario(esc)
    tecnica_de = {r: set(ts) for r, ts in mapa.items()}
    modeladas = set().union(*tecnica_de.values())
    pasos = []
    for i in range(1, len(campanas) + 1):
        vistas = {c["id"] for c in campanas[:i]}
        consulta = sorted({t for c in campanas[:i] for t in c["tecnicas"] if t in set(ids)})
        orden = ev.ordenar(modelo.puntuar(consulta), consulta)
        orden_pop = ev.ordenar(popularidad.puntuar(consulta), consulta)
        logrados, frontera = situacion(apps, vistas)
        factibles = {}
        for a in frontera:
            for t in tecnica_de.get(a["rule"], ()):
                factibles.setdefault(t, []).append({"regla": a["rule"], "donde": a["conclusion"], "detalle": a["detail"], "base": a["basis"]})
        verificadas = [{"puesto_modelo": n, "tecnica": t, "pasos": factibles[t]} for n, t in enumerate(orden, 1) if t in factibles]
        top = orden[:K]
        pendientes = plan - set(consulta)
        paso = {"tras": [f"{c['patron']} {c['titulo']}" for c in campanas[:i]][-1], "campanas_vistas": i, "consulta": consulta,
                "propuestas": top, "frontera": [f"{a['rule']} → {a['conclusion']}" for a in frontera],
                "verificadas": verificadas,
                "top_presentadas": sum(t in factibles for t in top),
                "top_no_factibles_ahora": sum(t in modeladas and t not in factibles for t in top),
                "top_sin_regla": sum(t not in modeladas for t in top),
                "plan": {"pendientes": len(pendientes), "aciertos_modelo": len(set(top) & pendientes),
                         "aciertos_popularidad": len(set(orden_pop[:K]) & pendientes)}}
        if i < len(campanas):
            sig = campanas[i]
            sus_apps = [a for a in apps if f"campana:{sig['id']}" in a["confirmed_by"]]
            reales = sorted({t for a in sus_apps for t in tecnica_de.get(a["rule"], ())})
            nuevas = [t for t in reales if t not in consulta]
            paso["siguiente"] = {
                "campana": f"{sig['patron']} {sig['titulo']}", "tecnicas": reales,
                "en_frontera": any(a["id"] in {f["id"] for f in frontera} for a in sus_apps),
                "tecnica_nueva": bool(nuevas),
                "puesto_modelo": min((orden.index(t) + 1 for t in nuevas), default=None),
                "puesto_verificado": min((n for n, v in enumerate(verificadas, 1) if v["tecnica"] in nuevas), default=None)}
        pasos.append(paso)
    return {"escenario": esc, "campanas": len(campanas), "pasos": pasos}


def main():
    doc = json.loads(ev.DATOS.read_text(encoding="utf-8"))
    resultados = json.loads(ev.SALIDA.read_text(encoding="utf-8"))
    adoptado, modelo, popularidad, ids, n_tren = recomendador(doc, resultados)
    mapa = json.loads(MAPA.read_text(encoding="utf-8"))["reglas"]
    with VERDAD.open(encoding="utf-8", newline="") as fh:
        verdad = {f["dataset_id"]: {padre(t) for t in f["tecnicas"].split("|") if t} & set(ids) for f in csv.DictReader(fh)}
    salida = {"sistema": adoptado, "entidades_entrenamiento": n_tren, "excluida_familia_de": EXCLUIR, "k": K, "reglas": REGLAS,
              "escenarios": [recorrer(e, modelo, popularidad, ids, mapa, verdad[d]) for e, d in ESCENARIOS.items()]}
    SALIDA.write_text(json.dumps(salida, indent=1, ensure_ascii=False), encoding="utf-8")

    print(f"Sistema: {adoptado}, entrenado con {n_tren} entidades (sin la familia de {EXCLUIR}); reglas {REGLAS}; K = {K}")
    tot = {"pasos": 0, "frontera": 0, "nuevas": 0}
    for e in salida["escenarios"]:
        print(f"\n■ {e['escenario']} ({e['campanas']} campañas)")
        for p in e["pasos"]:
            pl = p["plan"]
            print(f"  tras {p['campanas_vistas']} campaña(s) [{p['tras'][:46]}]: consulta {p['consulta']}")
            print(f"     top {K} del modelo: {pl['aciertos_modelo']} están en el plan (popularidad: {pl['aciertos_popularidad']}; quedaban {pl['pendientes']})")
            print(f"     razonador: {len(p['frontera'])} pasos factibles; del top {K}, se presentan {p['top_presentadas']}, "
                  f"{p['top_no_factibles_ahora']} no son factibles ahora y {p['top_sin_regla']} no tienen regla")
            for v in p["verificadas"][:3]:
                donde = sorted({x["donde"] for x in v["pasos"]})
                print(f"       ✔ {v['tecnica']} (puesto {v['puesto_modelo']} del modelo) → {', '.join(donde[:4])}")
            if "siguiente" in p:
                s = p["siguiente"]
                tot["pasos"] += 1
                tot["frontera"] += s["en_frontera"]
                tot["nuevas"] += s["tecnica_nueva"]
                extra = (f"técnica nueva: puesto {s['puesto_modelo']} del modelo y {s['puesto_verificado']} tras verificar"
                         if s["tecnica_nueva"] else "técnica ya observada: la decide el razonador")
                print(f"     ► vino después: {s['campana'][:60]} {s['tecnicas']} — en la frontera: {'sí' if s['en_frontera'] else 'NO'}; {extra}")
    print(f"\nPaso siguiente real dentro de la frontera del razonador: {tot['frontera']} de {tot['pasos']} "
          f"({tot['nuevas']} con técnica nueva)")


if __name__ == "__main__":
    main()
