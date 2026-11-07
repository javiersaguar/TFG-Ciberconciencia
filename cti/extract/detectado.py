"""Evaluacion extrinseca 6b y 6c de ML-2: perfil extraido frente a lo detectado (F4.3).

Entrada:
  - data/ml2/detecciones/apt29.jsonl, exportado de ClickHouse con cti/extract/export_detecciones.sql;
  - el perfil de APT29 de ML-2 (data/ml2/stix/apt29-perfil.json, de cti.extract.perfil_stix);
  - ATT&CK v19.2 (fichas de todos los grupos) y la verdad conocida de day1
    (detection/evaluation/verdad_datasets.csv).
Todo se compara a nivel de tecnica padre.

6b. Perfil frente a lo detectado. Para cada dataset de APT29: que tecnicas detectadas (en alertas y
    en campanas) aparecen en el perfil extraido de los informes, cuales no menciona ningun
    informe, y lo mismo frente a la verdad del plan de emulacion.
6c. Parecido entre campana y actor. Se ordenan TODOS los grupos de ATT&CK (no revocados ni
    obsoletos; tecnicas del grupo y de sus campanas atribuidas) por parecido con las tecnicas
    de las campanas detectadas. Dos medidas: Jaccard y coseno con pesos IDF (una tecnica que
    usan casi todos los grupos, como T1059, cuenta poco). Se informa la posicion de G0016 y,
    como candidato extra, la del perfil de ML-2. Se presenta como parecido a perfiles
    conocidos, NO como atribucion. Circularidad: el plan de emulacion de MITRE sale de la
    ficha de APT29, asi que un buen puesto de G0016 es esperable.

Uso (desde la raiz del repo):
  .venv/bin/python -m cti.extract.detectado
"""
import collections
import csv
import json
import math
from pathlib import Path

from cti.attack_ids import PAQUETE, por_defecto

DETECCIONES = Path("data/ml2/detecciones/apt29.jsonl")
PERFIL = Path("data/ml2/stix/apt29-perfil.json")
VERDAD = Path("detection/evaluation/verdad_datasets.csv")
SALIDA = Path("data/ml2/resultados/detectado.json")
DATASETS = {"SDWIN-200501225525": "day1", "SDWIN-200502035409": "day2"}


def padre(idx, t):
    t = (t or "").strip().upper().removeprefix("ATTACK.")
    return idx.padre(t) if t.startswith("T") else None


def grupos(idx):
    objs = json.loads(Path(PAQUETE).read_text(encoding="utf-8"))["objects"]
    ext = lambda o: next((r["external_id"] for r in o.get("external_references", [])
                          if r.get("source_name") == "mitre-attack"), None)
    vivos = lambda o: not o.get("revoked") and not o.get("x_mitre_deprecated")
    por_id = {o["id"]: o for o in objs}
    rels = [o for o in objs if o["type"] == "relationship" and vivos(o)]
    campanas = collections.defaultdict(set)
    for r in rels:
        if r["relationship_type"] == "attributed-to":
            campanas[r["target_ref"]].add(r["source_ref"])
    usa = collections.defaultdict(set)
    for r in rels:
        ap = por_id.get(r["target_ref"])
        if r["relationship_type"] == "uses" and ap and ap["type"] == "attack-pattern" and vivos(ap):
            p = idx.padre(ext(ap))
            if p:
                usa[r["source_ref"]].add(p)
    out = {}
    for g in objs:
        if g["type"] == "intrusion-set" and vivos(g):
            tec = set(usa[g["id"]])
            for c in campanas[g["id"]]:
                tec |= usa[c]
            if tec:
                out[ext(g)] = {"nombre": g["name"], "tecnicas": tec}
    return out


def jaccard(a, b):
    return len(a & b) / len(a | b) if a | b else 0.0


def coseno_idf(a, b, idf):
    num = sum(idf[t] ** 2 for t in a & b)
    na = math.sqrt(sum(idf[t] ** 2 for t in a))
    nb = math.sqrt(sum(idf[t] ** 2 for t in b))
    return num / (na * nb) if na and nb else 0.0


def ranking(consulta, candidatos, idf):
    out = {}
    # `cobertura` (parte de la consulta que contiene la ficha del grupo) es un DIAGNOSTICO anadido
    # despues de ver que Jaccard y coseno no ponen a G0016 arriba: no es una medida fijada antes.
    medidas = (("jaccard", jaccard), ("coseno_idf", lambda a, b: coseno_idf(a, b, idf)),
               ("cobertura_diagnostico", lambda a, b: len(a & b) / len(a) if a else 0.0))
    for medida, f in medidas:
        orden = sorted(candidatos, key=lambda g: -f(consulta, candidatos[g]["tecnicas"]))
        out[medida] = {
            "puesto_G0016": orden.index("G0016") + 1 if "G0016" in orden else None,
            "puesto_perfil_ml2": orden.index("ML2-APT29") + 1 if "ML2-APT29" in orden else None,
            "top5": [(g, candidatos[g]["nombre"], round(f(consulta, candidatos[g]["tecnicas"]), 3)) for g in orden[:5]],
        }
    return out


def main():
    idx = por_defecto()
    filas = [json.loads(l) for l in DETECCIONES.open(encoding="utf-8") if l.strip()]
    perfil = {o["x_tfg_tecnica"] for o in json.loads(PERFIL.read_text(encoding="utf-8"))["objects"]
              if o["type"] == "relationship" and o.get("x_tfg_fuente") == "ml2"}
    gs = grupos(idx)
    g0016 = gs["G0016"]["tecnicas"]
    verdad = {}
    with VERDAD.open(encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["dataset_id"] in DATASETS:
                verdad[r["dataset_id"]] = {p for t in r["tecnicas"].split("|") if (p := padre(idx, t))}

    candidatos = dict(gs)
    candidatos["ML2-APT29"] = {"nombre": "Perfil de APT29 extraído por ML-2", "tecnicas": perfil}
    df = collections.Counter(t for g in gs.values() for t in g["tecnicas"])
    idf = collections.defaultdict(lambda: math.log(len(gs)))
    idf.update({t: math.log(len(gs) / n) for t, n in df.items()})

    salida = {"grupos_candidatos": len(gs), "perfil_ml2": sorted(perfil), "datasets": {}}
    for ds, nombre in DATASETS.items():
        alertas = {p for f in filas if f["tipo"] == "alerta_tecnica" and f["dataset_id"] == ds
                   if (p := padre(idx, f["tecnica"]))}
        camps = [f for f in filas if f["tipo"] == "campana" and f["dataset_id"] == ds]
        if not alertas and not camps:
            continue
        en_camp = {p for c in camps for t in c["technique_ids"] if (p := padre(idx, t))}
        d = {"alertas_tecnicas": len(alertas), "campanas": len(camps)}
        # 6b
        for etiqueta, conj in (("alertas", alertas), ("campanas", en_camp), ("verdad", verdad.get(ds, set()))):
            if not conj:
                continue
            d[f"6b_{etiqueta}"] = {
                "tecnicas": len(conj),
                "en_perfil_ml2": sorted(conj & perfil), "fuera_perfil_ml2": sorted(conj - perfil),
                "cobertura_perfil_ml2": round(len(conj & perfil) / len(conj), 3),
                "cobertura_attack_G0016": round(len(conj & g0016) / len(conj), 3),
            }
        # 6c
        consultas = {"union de campanas": en_camp, "todas las alertas": alertas}
        if ds in verdad:
            consultas["verdad del plan (cota)"] = verdad[ds]
        for c in camps:
            consultas[f"campana {c['pattern_id']} {c['campaign_id'][:8]}"] = {
                p for t in c["technique_ids"] if (p := padre(idx, t))}
        d["6c"] = {k: {"tecnicas": len(v), **ranking(v, candidatos, idf)} for k, v in consultas.items() if v}
        salida["datasets"][nombre] = d

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(salida, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"Grupos candidatos: {len(gs)}; perfil ML-2: {len(perfil)} técnicas")
    for nombre, d in salida["datasets"].items():
        print(f"\n== {nombre}: {d['alertas_tecnicas']} técnicas en alertas, {d['campanas']} campañas")
        for k in ("6b_alertas", "6b_campanas", "6b_verdad"):
            if k in d:
                x = d[k]
                print(f"  {k}: {x['tecnicas']} técnicas; en perfil ML-2 {x['cobertura_perfil_ml2']:.2f}, "
                      f"en ficha G0016 {x['cobertura_attack_G0016']:.2f}; fuera del perfil: {x['fuera_perfil_ml2']}")
        print("  6c (puesto de G0016 / del perfil ML-2 entre", len(candidatos), "candidatos):")
        for k, v in d["6c"].items():
            print(f"    {k} ({v['tecnicas']} téc.): jaccard {v['jaccard']['puesto_G0016']}/{v['jaccard']['puesto_perfil_ml2']}, "
                  f"coseno_idf {v['coseno_idf']['puesto_G0016']}/{v['coseno_idf']['puesto_perfil_ml2']}, "
                  f"cobertura {v['cobertura_diagnostico']['puesto_G0016']}/{v['cobertura_diagnostico']['puesto_perfil_ml2']}; "
                  f"top3 idf {[(g, s) for g, _, s in v['coseno_idf']['top5'][:3]]}")


if __name__ == "__main__":
    main()
