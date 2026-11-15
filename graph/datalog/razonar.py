"""Ejecuta el razonador sobre los hechos de un escenario y extrae las rutas de ataque (F5.3).

  1. Lanza Soufflé (imagen tfg/souffle, sin red) con graph/datalog/attack.dl.
  2. Lee el grafo de derivacion: `app` (aplicaciones de regla), `pre` (sus precondiciones) y
     `confirmed` (la evidencia observada que confirma cada una).
  3. Para cada activo alcanzable busca la mejor PRUEBA: el conjunto de aplicaciones de regla que lleva
     del estado `adversario` al estado objetivo, con todas las precondiciones demostradas. Dos criterios:
       evidencia  menos pasos sin confirmar; a igualdad, menos pasos;
       corta      menos pasos; a igualdad, menos sin confirmar.
     Si los dos dan la misma prueba, se guarda una sola ruta con los dos criterios.
  4. Escribe la capa `derivada` (nodos :AttackPath) para graph.cargar.

Cada ruta conserva la traza completa: por paso, la regla, el detalle, las precondiciones, en que se
apoya (observado, inferido o sintetico) y que evidencia lo confirma.

Uso (desde la raiz del repo, con Neo4j levantado y despues de graph.datalog.exportar):
  .venv/bin/python -m graph.datalog.razonar apt29-day1 --reglas v2
  .venv/bin/python -m graph.cargar data/graph/derivada-apt29-day1-v2.json
"""
import argparse
import collections
import csv
import hashlib
import json
import math
import shutil
import subprocess
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
REGLAS = Path(__file__).parent / "attack.dl"
# Version de las reglas -> fichero principal y todos los que la componen (para su huella).
VERSIONES = {"v1": ("attack.dl", ["attack.dl"]), "v2": ("attack_v2.dl", ["attack.dl", "attack_v2.dl"])}
TRABAJO = Path("data/graph/datalog")
DATOS = Path("data/graph")
IMAGEN = "tfg/souffle:2.5"
INICIO = "adversario"
CRITERIOS = ("evidencia", "corta")


# ------------------------------------------------------------------ Soufflé
def ejecutar(hechos, salida, reglas=REGLAS, tope_s=300):
    """Lanza Soufflé: el binario local si existe (contenedor de orquestacion) o, si no, su contenedor."""
    hechos, salida, reglas = Path(hechos).resolve(), Path(salida).resolve(), Path(reglas).resolve()
    salida.mkdir(parents=True, exist_ok=True)
    if shutil.which("souffle"):
        r = subprocess.run(["souffle", "-F", str(hechos), "-D", str(salida), str(reglas)],
                           capture_output=True, text=True, timeout=tope_s)
        if r.returncode != 0 or "Error" in r.stderr:
            raise RuntimeError(f"Soufflé falló ({r.returncode}): {r.stderr.strip()[:2000]}")
        return r.stderr.strip()
    cmd = ["docker", "run", "--rm", "--network", "none", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
           "-v", f"{reglas.parent}:/rules:ro", "-v", f"{hechos}:/facts:ro", "-v", f"{salida}:/out",
           IMAGEN, "-F", "/facts", "-D", "/out", f"/rules/{reglas.name}"]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=tope_s)
    if r.returncode != 0 or "Error" in r.stderr:
        raise RuntimeError(f"Soufflé falló ({r.returncode}): {r.stderr.strip()[:2000]}")
    return r.stderr.strip()


def leer(salida):
    """{relacion: [tuplas]} con todo lo que ha escrito Soufflé."""
    out = {}
    for f in sorted(Path(salida).glob("*.csv")):
        with f.open(encoding="utf-8", newline="") as fh:
            out[f.stem] = [tuple(fila) for fila in csv.reader(fh, delimiter="\t", quoting=csv.QUOTE_NONE)]
    return out


# ------------------------------------------------------------------ grafo de derivacion y pruebas
def aplicaciones(rel):
    """{id: {rule, conclusion, detail, basis, pre[], confirmed[]}} a partir de app, pre y confirmed."""
    apps = {}
    for id_, regla, conclusion, detalle, base in rel.get("app", []):
        apps[id_] = {"id": id_, "rule": regla, "conclusion": conclusion, "detail": detalle, "basis": base,
                     "pre": [], "confirmed": []}
    for id_, estado in rel.get("pre", []):
        apps[id_]["pre"].append(estado)
    for id_, tipo, ref in rel.get("confirmed", []):
        apps[id_]["confirmed"].append({"kind": tipo, "ref": ref})
    for a in apps.values():
        a["pre"].sort()
        a["confirmed"].sort(key=lambda c: (c["kind"], c["ref"]))
    return apps


def coste(app, criterio):
    """Coste de un paso: (sin confirmar, pasos) o (pasos, sin confirmar). R0 no es un paso del adversario."""
    if app["basis"] == "trivial":
        return (0, 0)
    sin_confirmar = 0 if app["confirmed"] else 1
    return (sin_confirmar, 1) if criterio == "evidencia" else (1, sin_confirmar)


def mejores(apps, criterio):
    """Para cada estado demostrable, la aplicacion elegida y su coste (suma de costes del arbol de prueba).

    Es la generalizacion de Dijkstra a grafos Y/O (Knuth): se relaja hasta el punto fijo. Los costes no
    son negativos, asi que un ciclo nunca mejora una prueba y el resultado no depende del orden.
    """
    mejor = {INICIO: ((0, 0), None)}
    cambio = True
    while cambio:
        cambio = False
        for id_ in sorted(apps):
            a = apps[id_]
            if any(p not in mejor for p in a["pre"]):
                continue
            c = coste(a, criterio)
            for p in a["pre"]:
                c = (c[0] + mejor[p][0][0], c[1] + mejor[p][0][1])
            actual = mejor.get(a["conclusion"])
            if actual is None or (c, id_) < (actual[0], actual[1]):
                mejor[a["conclusion"]] = (c, id_)
                cambio = True
    return mejor


def prueba(estado, mejor, apps):
    """Pasos de la prueba elegida para `estado`, sin repetir y con las precondiciones antes que su conclusion."""
    orden, vistos = [], set()

    def visitar(e):
        id_ = mejor[e][1]
        if id_ is None or id_ in vistos:
            return
        vistos.add(id_)
        for p in apps[id_]["pre"]:
            visitar(p)
        orden.append(apps[id_])

    visitar(estado)
    return orden


def coste_gds(app, epss):
    """Peso de un paso para los caminos ponderados de GDS (F5.2). Es una heuristica declarada:
    0 si esta confirmado o es trivial (ya ocurrio o no es un paso); -ln(EPSS) si explota una vulnerabilidad
    (EPSS es la probabilidad publicada de explotacion); 1 para el resto de pasos posibles."""
    if app["basis"] == "trivial" or app["confirmed"]:
        return 0.0
    if app["basis"] == "sintetico":
        p = epss.get(app["id"].rsplit("|", 1)[1])
        if p:
            return round(-math.log(p), 4)
    return 1.0


def cortes(apps, objetivos):
    """Para cada estado, los activos que dejan de ser alcanzables si el adversario no puede lograrlo.

    Es el analisis exacto de cuellos de botella en un grafo Y/O: se quitan las reglas que concluyen el
    estado y se vuelve a comprobar que objetivos siguen teniendo prueba.
    """
    demostrables = set(mejores(apps, "corta"))
    vivos = {a: e for a, e in objetivos.items() if e in demostrables}
    out = {}
    for estado in sorted(demostrables - {INICIO}):
        resto = set(mejores({i: a for i, a in apps.items() if a["conclusion"] != estado}, "corta"))
        out[estado] = sorted(a for a, e in vivos.items() if e not in resto)
    return out


# ------------------------------------------------------------------ capa derivada
def _equipo(estado):
    return estado.split(":")[1] if estado.startswith("exec:") else None


def texto(n, paso, campanas):
    marcas = []
    for c in paso["confirmed"]:
        marcas.append(f"campaña {campanas.get(c['ref'], c['ref'])}" if c["kind"] == "campana"
                      else f"primer contacto con {c['ref']}")
    estado = f"confirmado por {', '.join(marcas)}" if marcas else f"posible ({paso['basis']})"
    detalle = f": {paso['detail']}" if paso["detail"] else ""
    return f"{n}. {paso['rule']} → {paso['conclusion']}{detalle} [{estado}]"


def huella(version):
    h = hashlib.sha256()
    for f in VERSIONES[version][1]:
        h.update((Path(__file__).parent / f).read_bytes())
    return h.hexdigest()


def construir(escenario, rel, mapa, hash_reglas, version="v1"):
    """Nodos :AttackPath y sus relaciones a partir de la salida del razonador."""
    apps = aplicaciones(rel)
    mejor = {c: mejores(apps, c) for c in CRITERIOS}
    campanas = {c: p for c, p, _, _ in rel.get("campaign_patron", [])}
    activos = {a: (h, int(cr), p) for a, h, cr, p in rel["asset_objetivo"]}
    base = {"escenario": escenario, "origen": "derivado"}
    nodos, rels, resumen = {}, {}, []

    def rel_(tipo, a, b, clave="", **props):
        id_ = f"{a}|{tipo}|{b}" + (f"|{clave}" if clave else "")
        rels[id_] = {"id": id_, "tipo": tipo, "origen": a, "destino": b, "props": {"id": id_, **base, **props}}

    # --- el grafo de derivacion: estados y aplicaciones de regla (lo analiza GDS en F5.2)
    objetivos = {a: f"exec:{h}:{p}" for a, (h, _, p) in activos.items()}
    corte = cortes(apps, objetivos)
    epss = mapa.get("vulnerabilidades", {})
    eid = lambda e: f"{escenario}/state/{e}"
    for e in sorted({INICIO} | set(corte)):
        partes = e.split(":")
        nodos[eid(e)] = {"id": eid(e), "labels": ["TfgObject", "AttackState"], "props": {
            "id": eid(e), **base, "state": e, "kind": partes[0],
            "host": partes[1] if partes[0] == "exec" else "", "privilege": partes[2] if partes[0] == "exec" else "",
            "user": partes[1] if partes[0] == "creds" else "",
            "goal_of": sorted(a for a, o in objetivos.items() if o == e),
            "cuts": corte.get(e, []), "cuts_assets": len(corte.get(e, [])), "rules_version": version}}
        if partes[0] == "exec" and partes[1] in mapa["equipos"]:
            rel_("ON_HOST", eid(e), mapa["equipos"][partes[1]])
    for a in apps.values():
        aid = f"{escenario}/app/{a['id']}"
        c = coste_gds(a, epss)
        nodos[aid] = {"id": aid, "labels": ["TfgObject", "RuleApp"], "props": {
            "id": aid, **base, "app": a["id"], "rule": a["rule"], "detail": a["detail"], "basis": a["basis"],
            "confirmed": bool(a["confirmed"]), "confirmed_by": [f"{x['kind']}:{x['ref']}" for x in a["confirmed"]],
            "cost": c, "rules_version": version}}
        for p in a["pre"]:
            rel_("ENABLES", eid(p), aid, cost=0.0)
        rel_("CONCLUDES", aid, eid(a["conclusion"]), cost=c)

    for activo in sorted(activos):
        equipo, criticidad, priv = activos[activo]
        objetivo = f"exec:{equipo}:{priv}"
        if objetivo not in mejor["evidencia"]:
            resumen.append({"activo": activo, "alcanzable": False})
            continue
        pruebas = {}
        for c in CRITERIOS:
            pasos = prueba(objetivo, mejor[c], apps)
            pruebas.setdefault(tuple(p["id"] for p in pasos), {"pasos": pasos, "criterios": []})["criterios"].append(c)
        for firma, pr in pruebas.items():
            reales = [p for p in pr["pasos"] if p["basis"] != "trivial"]
            equipos = []
            for p in reales:
                e = _equipo(p["conclusion"])
                if e and e not in equipos:
                    equipos.append(e)
            confirmados = [p for p in reales if p["confirmed"]]
            pid = f"{escenario}/path/{mapa['activos'][activo].rsplit('/', 1)[1]}/{pr['criterios'][0]}"
            nodos[pid] = {"id": pid, "labels": ["TfgObject", "AttackPath"], "props": {
                "id": pid, **base, "asset": activo, "goal": objetivo, "criticality": criticidad,
                "criteria": pr["criterios"], "steps": len(reales), "confirmed_steps": len(confirmados),
                "hypothetical_steps": len(reales) - len(confirmados),
                "uses_synthetic": any(p["basis"] == "sintetico" for p in reales),
                "uses_inferred": any(p["basis"] == "inferido" for p in reales),
                "rules": [p["rule"] for p in reales], "hosts": equipos,
                "narrative": "\n".join(texto(i, p, campanas) for i, p in enumerate(reales, 1)),
                "steps_json": json.dumps(pr["pasos"], ensure_ascii=False, sort_keys=True),
                "rules_sha256": hash_reglas, "rules_version": version}}
            rel_("REACHES", pid, mapa["activos"][activo])
            for i, e in enumerate(equipos, 1):
                rel_("TRAVERSES", pid, mapa["equipos"][e], clave=str(i), order=i)
            for c in sorted({c["ref"] for p in reales for c in p["confirmed"] if c["kind"] == "campana"}):
                rel_("CONFIRMED_BY", pid, c)
            resumen.append({"activo": activo, "alcanzable": True, "id": pid, "criterios": pr["criterios"],
                            "pasos": len(reales), "confirmados": len(confirmados),
                            "narrativa": nodos[pid]["props"]["narrative"]})
    return sorted(nodos.values(), key=lambda n: n["id"]), sorted(rels.values(), key=lambda r: r["id"]), resumen


def explicadas(rel):
    """Campanas del Pilar A que confirman alguna aplicacion de regla, y las que el razonador no explica."""
    todas = {c: p for c, p, _, _ in rel.get("campaign_patron", [])}
    equipos = collections.defaultdict(list)
    for c, _, h, rol in rel.get("campaign_patron", []):
        equipos[c].append(h if rol == "host" else f"{h} ({rol})")
    con = {ref for _, tipo, ref in rel.get("confirmed", []) if tipo == "campana"}
    return [{"campana": c, "patron": todas[c], "equipos": sorted(equipos[c]), "explicada": c in con} for c in sorted(todas)]


def entrada(hechos):
    """Hechos de entrada que hacen falta para construir las rutas (los activos y el patron de cada campana)."""
    def filas(nombre):
        with (hechos / f"{nombre}.facts").open(encoding="utf-8", newline="") as fh:
            return [tuple(f) for f in csv.reader(fh, delimiter="\t", quoting=csv.QUOTE_NONE)]
    return {"asset_objetivo": filas("asset"), "campaign_patron": filas("campaign")}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("escenario")
    ap.add_argument("--reglas", choices=sorted(VERSIONES), default="v1")
    args = ap.parse_args()
    hechos, salida = TRABAJO / args.escenario / "facts", TRABAJO / args.escenario / f"out-{args.reglas}"
    ejecutar(hechos, salida, Path(__file__).parent / VERSIONES[args.reglas][0])
    rel = leer(salida) | entrada(hechos)
    mapa = json.loads((hechos / "PROCEDENCIA.json").read_text(encoding="utf-8"))
    hash_reglas = huella(args.reglas)
    nodos, relaciones, resumen = construir(args.escenario, rel, mapa, hash_reglas, args.reglas)
    destino = DATOS / f"derivada-{args.escenario}-{args.reglas}.json"
    camp = explicadas(rel)
    destino.write_text(json.dumps({"escenario": args.escenario, "capa": "derivada", "reglas": args.reglas, "reglas_sha256": hash_reglas,
                                   "campanas": camp, "nodos": nodos, "relaciones": relaciones}, indent=1, ensure_ascii=False),
                       encoding="utf-8")
    apps = aplicaciones(rel)
    reales = [a for a in apps.values() if a["basis"] != "trivial"]
    print(f"{args.escenario}: {len(reales)} aplicaciones de regla, {sum(bool(a['confirmed']) for a in reales)} confirmadas; "
          f"estados: {dict(collections.Counter(a['conclusion'].split(':')[0] for a in reales))}")
    print(f"reglas {args.reglas} ({hash_reglas[:12]}) · {destino}: {sum('AttackPath' in n['labels'] for n in nodos)} rutas")
    print(f"campañas del Pilar A explicadas por alguna regla: {sum(c['explicada'] for c in camp)} de {len(camp)}")
    for c in camp:
        if not c["explicada"]:
            print(f"  sin explicar: {c['patron']} en {', '.join(c['equipos'])}")
    for r in resumen:
        if not r["alcanzable"]:
            print(f"\n■ {r['activo']}: NO alcanzable")
            continue
        print(f"\n■ {r['activo']} — criterio {' y '.join(r['criterios'])}: {r['pasos']} pasos, {r['confirmados']} confirmados")
        print("  " + r["narrativa"].replace("\n", "\n  "))


if __name__ == "__main__":
    main()
