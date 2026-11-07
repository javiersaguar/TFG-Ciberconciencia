"""Evaluacion extrinseca 6a de ML-2: perfil de APT29 extraido de informes frente a ATT&CK (F4.3).

Entrada: las frases de ANALISIS de los 6 informes de Microsoft sobre APT29/NOBELIUM/Midnight
Blizzard (cti.extract.informes). El perfil de un sistema es el conjunto de tecnicas padre que
predice en al menos una frase (y, como variante, en al menos 2).

Referencia: ATT&CK v19.2.
  - G0016: relaciones `uses` del grupo a tecnicas (no revocadas ni obsoletas), subidas a padre;
  - G0016+campanas: lo anterior mas las de sus campanas atribuidas (C0023 Operation Ghost,
    C0024 SolarWinds Compromise).
Solo se puntua dentro del espacio de etiquetas de ML-2 (59 tecnicas): lo que queda fuera no
lo puede predecir ningun modelo y se informa aparte.

Sistemas: diccionario (LB-a podado), SecureBERT 2.0 (3 semillas de la particion publicada,
media y desviacion) y sus combinaciones con el diccionario. Control: las tablas "MITRE ATT&CK
techniques observed" del propio editor se excluyen del perfil principal y se informa aparte
con ellas.

Circularidad (a declarar): la ficha de G0016 se construye en parte con estos mismos informes.
Coincidir con ella es esperable y no prueba que el modelo generalice. Ademas, AnnoCTR trae
informes de APT29 en entrenamiento (no de Microsoft).

Uso (desde la raiz del repo, entorno de ML):
  .venv-ml/bin/python -m cti.extract.perfil_apt29
"""
import collections
import json
import statistics
from pathlib import Path

from cti.attack_ids import PAQUETE, por_defecto
from cti.extract import diccionario as dic
from cti.extract.informes import APT29, frases

DATOS = Path("data/ml2/annoctr")
MODELOS = Path("data/ml2/modelos")
RESULTADOS = Path("data/ml2/resultados")
MODELO = "SecureBERT2.0-base"
CORTES_RARAS = (10, 20, 50)


def referencia(grupo="G0016"):
    idx = por_defecto()
    objs = json.loads(Path(PAQUETE).read_text(encoding="utf-8"))["objects"]
    ext = lambda o: next((r["external_id"] for r in o.get("external_references", [])
                          if r.get("source_name") == "mitre-attack"), None)
    por_id = {o["id"]: o for o in objs}
    g = next(o for o in objs if o["type"] == "intrusion-set" and ext(o) == grupo)
    rels = [o for o in objs if o["type"] == "relationship" and not o.get("revoked")
            and not o.get("x_mitre_deprecated")]
    campanas = {r["source_ref"] for r in rels if r["relationship_type"] == "attributed-to"
                and r["target_ref"] == g["id"]}

    def tecnicas(fuentes):
        out = set()
        for r in rels:
            if r["relationship_type"] == "uses" and r["source_ref"] in fuentes \
                    and r["target_ref"].startswith("attack-pattern--"):
                ap = por_id.get(r["target_ref"])
                if ap and not ap.get("revoked") and not ap.get("x_mitre_deprecated"):
                    p = idx.padre(ext(ap))
                    if p:
                        out.add(p)
        return out

    return {"G0016": tecnicas({g["id"]}), "G0016+campanas": tecnicas({g["id"]} | campanas),
            "campanas": sorted(ext(por_id[c]) for c in campanas)}


def probabilidades(textos):
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
    out = {}
    for carpeta in sorted(MODELOS.glob(f"{MODELO}-s*/mejor")):
        tok = AutoTokenizer.from_pretrained(carpeta)
        m = AutoModelForSequenceClassification.from_pretrained(carpeta, use_safetensors=True,
                                                               trust_remote_code=False).to("cuda").eval()
        probs = []
        with torch.no_grad():
            for i in range(0, len(textos), 64):
                enc = tok(textos[i:i + 64], truncation=True, max_length=128, padding=True,
                          return_tensors="pt").to("cuda")
                with torch.autocast("cuda", dtype=torch.bfloat16):
                    probs.extend(torch.sigmoid(m(**enc).logits.float()).cpu().tolist())
        res = json.loads((carpeta.parent / "resultados.json").read_text(encoding="utf-8"))
        out[res["semilla"]] = {"probs": probs, "umbral": res["seleccion"]["umbral"]}
        del m
        torch.cuda.empty_cache()
    return out


def puntuar(perfil, ref):
    vp = perfil & ref
    p = len(vp) / len(perfil) if perfil else 0.0
    r = len(vp) / len(ref) if ref else 0.0
    return {"tecnicas": len(perfil), "aciertos": len(vp), "precision": round(p, 3), "exhaustividad": round(r, 3),
            "f1": round(2 * p * r / (p + r), 3) if p + r else 0.0}


def main():
    etiquetas = json.loads((DATOS / "etiquetas.json").read_text(encoding="utf-8"))
    espacio, frec, nombres = etiquetas["espacio"], etiquetas["frecuencia_train"], etiquetas["nombres"]
    E = set(espacio)
    todas = [f for d in APT29 for f in frases(d)]
    usadas = [f for f in todas if f["tipo"] in ("analisis", "attack")]
    ref_total = referencia()
    refs = {k: v & E for k, v in ref_total.items() if k != "campanas"}

    # diccionario podado (poda de desarrollo, como en la LB-a)
    terminos = dic.diccionario()
    dev = [json.loads(l) for l in (DATOS / "dev.jsonl").open(encoding="utf-8")]
    quitados = dic.podar(terminos, dic.compilar(terminos), dev, E)
    podado = {t: v for t, v in terminos.items() if t not in quitados}
    patron = dic.compilar(podado)
    pred_dic = [dic.predecir(f["texto"], patron, podado) & E for f in usadas]

    semillas = probabilidades([f["texto"] for f in usadas])
    sistemas = {"diccionario": {0: pred_dic}}
    for s, d in semillas.items():
        m = [{espacio[j] for j, p in enumerate(fila) if p >= d["umbral"]} for fila in d["probs"]]
        sistemas.setdefault("modelo", {})[s] = m
        sistemas.setdefault("union", {})[s] = [a | b for a, b in zip(m, pred_dic)]
        for c in CORTES_RARAS:
            raras = {t for t in espacio if frec.get(t, 0) < c}
            sistemas.setdefault(f"union-raras<{c}", {})[s] = [a | (b & raras) for a, b in zip(m, pred_dic)]

    def perfil(preds, tipos, minimo):
        cuenta = collections.Counter(t for f, p in zip(usadas, preds) if f["tipo"] in tipos for t in p)
        return {t for t, n in cuenta.items() if n >= minimo}

    tabla = {}
    for nombre, por_semilla in sistemas.items():
        for etiqueta, tipos in (("sin tablas ATT&CK", {"analisis"}), ("con tablas ATT&CK", {"analisis", "attack"})):
            for minimo in (1, 2):
                for ref_n, ref in refs.items():
                    ps = [puntuar(perfil(p, tipos, minimo), ref) for p in por_semilla.values()]
                    tabla[f"{nombre} | {etiqueta} | >={minimo} frases | {ref_n}"] = {
                        k: (round(statistics.mean(x[k] for x in ps), 3) if len(ps) > 1 else ps[0][k])
                        for k in ps[0]} | ({"desv_f1": round(statistics.stdev(x["f1"] for x in ps), 3)} if len(ps) > 1 else {})

    # detalle del perfil principal del modelo (semilla 1): aciertos, extras y ausencias con un ejemplo
    s1 = sistemas["modelo"][min(sistemas["modelo"])]
    ejemplo = {}
    for f, p in zip(usadas, s1):
        if f["tipo"] == "analisis":
            for t in p:
                ejemplo.setdefault(t, f"[{f['doc']}] {f['texto'][:200]}")
    perfil_m = perfil(s1, {"analisis"}, 1)
    ref = refs["G0016+campanas"]
    detalle = {
        "aciertos": sorted(perfil_m & ref),
        "extra_no_en_attack": [{"tecnica": t, "nombre": nombres.get(t), "ejemplo": ejemplo.get(t)} for t in sorted(perfil_m - ref)],
        "ausentes_en_espacio": [{"tecnica": t, "nombre": nombres.get(t), "frases_train": frec.get(t, 0)} for t in sorted(ref - perfil_m)],
        "referencia_fuera_del_espacio": sorted(ref_total["G0016+campanas"] - E),
    }
    resumen = {"frases": {t: sum(f["tipo"] == t for f in todas) for t in ("analisis", "attack", "descartada")},
               "referencia": {k: len(v) for k, v in ref_total.items() if k != "campanas"} | {
                   f"{k} en espacio": len(v) for k, v in refs.items()} | {"campanas": ref_total["campanas"]},
               "tabla": tabla, "detalle_modelo_s1": detalle}
    RESULTADOS.mkdir(parents=True, exist_ok=True)
    (RESULTADOS / "perfil-apt29.json").write_text(json.dumps(resumen, indent=1, ensure_ascii=False), encoding="utf-8")

    print(f"Frases: {resumen['frases']}; referencia: {resumen['referencia']}")
    print("| Sistema | Tablas ATT&CK | Mínimo | Referencia | Técnicas | Aciertos | P | R | F1 |")
    print("|---|---|---|---|---:|---:|---:|---:|---:|")
    for k, v in tabla.items():
        n, et, mi, rf = k.split(" | ")
        print(f"| {n} | {et} | {mi} | {rf} | {v['tecnicas']} | {v['aciertos']} | {v['precision']:.3f} | "
              f"{v['exhaustividad']:.3f} | {v['f1']:.3f}{' ± ' + format(v['desv_f1'], '.3f') if 'desv_f1' in v else ''} |")
    print("\nModelo s1, perfil principal frente a G0016+campañas:")
    print("  aciertos:", detalle["aciertos"])
    print("  ausentes (en espacio):", [(x["tecnica"], x["nombre"], x["frases_train"]) for x in detalle["ausentes_en_espacio"]])
    print("  extra (no en ATT&CK):")
    for x in detalle["extra_no_en_attack"]:
        print(f"    {x['tecnica']} {x['nombre']}: {x['ejemplo']}")
    print("  referencia fuera del espacio:", len(detalle["referencia_fuera_del_espacio"]))


if __name__ == "__main__":
    main()
