"""Capa sintetica de un escenario: declaracion + inventario -> nodos y relaciones (F5.1).

La declaracion (graph/seed/<semilla>.json) dice lo que los eventos no traen: vulnerabilidades, activos
criticos y donde esta el adversario. Aqui se cruza con el inventario observado del escenario, y TODO lo
que sale lleva `origen: sintetico`.

Reglas:
  - Un activo o un adversario solo se asigna a un equipo que este en el inventario; si no, es un error
    de la declaracion.
  - Una vulnerabilidad de acceso remoto solo se asigna si su servicio se OBSERVO en ese escenario
    (el equipo tiene ese :Service). Si no se observo, la asignacion se omite y se informa: no se
    inventa un servicio para poder colgarle una vulnerabilidad.
  - Las cifras de cada vulnerabilidad (CVSS, EPSS, catalogo de explotadas) son reales y llevan su fuente.

Uso (desde la raiz del repo, despues de graph.inventory.extraer):
  .venv/bin/python -m graph.seed.construir apt29-day1
  .venv/bin/python -m graph.cargar data/graph/sintetica-apt29-day1.json
"""
import argparse
import collections
import json
from pathlib import Path

SEMILLAS = {"apt29-day1": "apt29", "apt29-day2": "apt29"}
DIR = Path(__file__).parent
DATOS = Path("data/graph")


def construir(escenario, decl, inventario):
    """Devuelve (nodos, relaciones, omitidas). `omitidas` son asignaciones sin servicio observado."""
    equipos = {n["props"]["name"]: n["id"] for n in inventario["nodos"] if "Host" in n["labels"]}
    servicios = {n["id"] for n in inventario["nodos"] if "Service" in n["labels"]}
    base = {"escenario": escenario, "origen": "sintetico"}
    nodos, rels, omitidas = {}, {}, []

    def equipo(nombre, para):
        if nombre not in equipos:
            raise ValueError(f"{para}: el equipo {nombre} no está en el inventario de {escenario}")
        return equipos[nombre]

    def rel(tipo, a, b, **props):
        id_ = f"{a}|{tipo}|{b}"
        rels[id_] = {"id": id_, "tipo": tipo, "origen": a, "destino": b, "props": {"id": id_, **base, **props}}

    vulns = {v["cve"]: v for v in decl["vulnerabilidades"]}
    for a in decl["asignaciones"]:
        v = vulns[a["cve"]]
        h = equipo(a["equipo"], a["cve"])
        if (v["acceso"] == "remoto") != bool(a["servicio"]):
            raise ValueError(f"{a['cve']}: una vulnerabilidad remota necesita servicio y una local no lo lleva")
        if a["servicio"]:
            proto, puerto = a["servicio"].split("/")
            if f"{escenario}/svc/{a['equipo']}/{proto}/{puerto}" not in servicios:
                omitidas.append({"cve": a["cve"], "equipo": a["equipo"], "servicio": a["servicio"]})
                continue
        vid = f"{escenario}/vuln/{v['cve']}"
        nodos[vid] = {"id": vid, "labels": ["TfgObject", "Vulnerability"], "props": {
            "id": vid, **base, "cve": v["cve"], "name": v["alias"], "cvss": v["cvss"], "vector": v["vector"],
            "access": v["acceso"], "effect": v["efecto"], "epss": v["epss"], "epss_percentile": v["epss_percentil"],
            "kev": v["kev"], "kev_ransomware": v["kev_ransomware"], "published": v["publicada"],
            "sources": [decl["referencias"][k] for k in ("cvss", "epss", "kev")]}}
        extra = {"proto": proto, "port": int(puerto)} if a["servicio"] else {}
        rel("HAS_VULN", h, vid, reason=a["motivo"], **extra)

    for a in decl["activos"]:
        aid = f"{escenario}/asset/{a['clave']}"
        nodos[aid] = {"id": aid, "labels": ["TfgObject", "Asset"], "props": {
            "id": aid, **base, "name": a["nombre"], "criticality": a["criticidad"], "required_privilege": a["privilegio"],
            "reason": a["motivo"]}}
        rel("HOSTS", equipo(a["equipo"], a["clave"]), aid)

    adv = decl["adversario"]
    presentes = [e for e in adv["equipos"] if e in equipos]   # el dia 2 no aparece el segundo servidor
    if not presentes:
        raise ValueError(f"Ningún equipo del adversario está en el inventario de {escenario}")
    did = f"{escenario}/adversary/externo"
    nodos[did] = {"id": did, "labels": ["TfgObject", "Adversary"], "props": {
        "id": did, **base, "name": adv["nombre"], "reason": adv["motivo"]}}
    for e in presentes:
        rel("LOCATED_AT", did, equipos[e])

    return (sorted(nodos.values(), key=lambda n: n["id"]), sorted(rels.values(), key=lambda r: r["id"]), omitidas)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("escenario", choices=sorted(SEMILLAS))
    args = ap.parse_args()
    decl = json.loads((DIR / f"{SEMILLAS[args.escenario]}.json").read_text(encoding="utf-8"))
    inventario = json.loads((DATOS / f"inventario-{args.escenario}.json").read_text(encoding="utf-8"))
    nodos, relaciones, omitidas = construir(args.escenario, decl, inventario)
    destino = DATOS / f"sintetica-{args.escenario}.json"
    destino.write_text(json.dumps({"escenario": args.escenario, "capa": "sintetica", "semilla": SEMILLAS[args.escenario],
                                   "nodos": nodos, "relaciones": relaciones, "omitidas": omitidas},
                                  indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{destino}: {len(nodos)} nodos y {len(relaciones)} relaciones")
    print("  nodos:", dict(collections.Counter(n["labels"][1] for n in nodos).most_common()))
    for o in omitidas:
        print(f"  omitida: {o['cve']} en {o['equipo']} ({o['servicio']} no se observó en este escenario)")


if __name__ == "__main__":
    main()
