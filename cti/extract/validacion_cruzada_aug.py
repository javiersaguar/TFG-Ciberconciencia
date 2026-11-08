"""Validacion cruzada del sistema ML-2 aumentado (paso 10a) frente al adoptado (F4.3).

Pregunta: ¿pasa a ser el sistema adoptado el SecureBERT 2.0 entrenado ademas con las 343 frases de
procedimiento de ATT&CK (T1003, T1548, T1569; data/ml2/annoctr_aug)? El aumento existe para cubrir tres
tecnicas que AnnoCTR casi no anota (en entrenamiento + desarrollo hay 2, 2 y 0 frases), asi que AnnoCTR
no puede medir lo que aporta. Lo que si puede medir es si estropea las 59 tecnicas de siempre.

Reglas, fijadas ANTES de ver ningun resultado (08-11-2026):
  - Mismos 5 bloques por informe que la validacion cruzada adoptada (data/ml2/cv/bloques.json), mismas
    semillas por vuelta, epoca 7 y umbral 0,20, resto de hiperparametros igual.
  - En cada vuelta, el modelo aumentado se entrena con las frases de AnnoCTR de los 4 bloques mas las
    343 frases de ATT&CK (espacio de 62 etiquetas). Las frases de ATT&CK nunca se predicen.
  - Brazo A: el sistema adoptado (modelo sin aumento ∪ diccionario podado), con las probabilidades ya
    calculadas en data/ml2/cv. Brazo B: modelo aumentado ∪ el MISMO diccionario podado (poda con los 4
    bloques de cada vuelta y las 59 etiquetas). Solo cambia el modelo.
  - Se mide sobre los 86 informes y SOLO en las 59 etiquetas del espacio original.
  - Decision (no inferioridad): se adopta el aumentado si el limite inferior del IC 95 % de la
    diferencia B - A en F1 por frase (remuestreo por informe, B = 10.000) es >= -0,02. El margen 0,02 es
    del orden de la variacion entre semillas observada en 10a. Si no, se queda el sistema actual.
  - Se informan tambien, sin efecto en la decision, el F1 por informe y la comparacion de los modelos
    solos.

Uso (desde la raiz del repo):
  .venv-ml/bin/python -m cti.extract.validacion_cruzada_aug entrenar     # GPU, unos 30 min
  .venv/bin/python -m cti.extract.validacion_cruzada_aug evaluar
"""
import argparse
import collections
import json
import math
import random
import time
from pathlib import Path

from cti.extract import diccionario as dic
from cti.extract import validacion_cruzada as cv
from cti.extract.analisis import bootstrap, cuentas_por_doc
from cti.extract.entrenar import REVISIONES, codificar
from cti.extract.metricas import evaluar

DATOS_AUG = Path("data/ml2/annoctr_aug")
CV_BASE = Path("data/ml2/cv")
SALIDA = Path("data/ml2/cv_aug")
MARGEN = 0.02


def leer(base, part):
    with (base / f"{part}.jsonl").open(encoding="utf-8") as fh:
        return [json.loads(l) for l in fh]


def es_aumento(f):
    return f["doc"].startswith("attack-procedimientos-")


def entrenar(_args):
    import numpy as np
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

    espacio = json.loads((DATOS_AUG / "etiquetas.json").read_text(encoding="utf-8"))["espacio"]
    todas = leer(DATOS_AUG, "train") + leer(DATOS_AUG, "dev")
    aumento = [f for f in todas if es_aumento(f)]
    filas = [f for f in todas if not es_aumento(f)]
    bloque = json.loads((CV_BASE / "bloques.json").read_text(encoding="utf-8"))
    assert set(bloque) == {f["doc"] for f in filas}, "los informes no coinciden con la validacion adoptada"
    SALIDA.mkdir(parents=True, exist_ok=True)
    tok = AutoTokenizer.from_pretrained(cv.MODELO, revision=REVISIONES[cv.MODELO])
    print(f"{len(filas)} frases de AnnoCTR, {len(aumento)} de aumento, espacio {len(espacio)}", flush=True)

    for k in range(cv.BLOQUES):
        destino = SALIDA / f"bloque{k}_probs.jsonl"
        if destino.exists():
            print(f"bloque {k}: ya hecho, se salta", flush=True)
            continue
        random.seed(cv.SEMILLA + k); np.random.seed(cv.SEMILLA + k); torch.manual_seed(cv.SEMILLA + k)
        tren = [f for f in filas if bloque[f["doc"]] != k] + aumento
        fuera = [f for f in filas if bloque[f["doc"]] == k]
        Y = torch.tensor(codificar(tren, espacio))
        modelo = AutoModelForSequenceClassification.from_pretrained(
            cv.MODELO, revision=REVISIONES[cv.MODELO], num_labels=len(espacio),
            problem_type="multi_label_classification", use_safetensors=True,
            trust_remote_code=False).to("cuda")
        perdida = torch.nn.BCEWithLogitsLoss()
        pasos = cv.EPOCAS * math.ceil(len(tren) / cv.LOTE)
        opt = torch.optim.AdamW(modelo.parameters(), lr=cv.LR, weight_decay=0.01)
        sched = get_linear_schedule_with_warmup(opt, int(0.1 * pasos), pasos)
        t0 = time.time()
        for epoca in range(1, cv.EPOCAS + 1):
            modelo.train()
            indices = list(range(len(tren)))
            random.shuffle(indices)
            for i in range(0, len(indices), cv.LOTE):
                lote = indices[i:i + cv.LOTE]
                enc = tok([tren[j]["texto"] for j in lote], truncation=True, max_length=cv.MAX_TOKENS,
                          padding=True, return_tensors="pt").to("cuda")
                with torch.autocast("cuda", dtype=torch.bfloat16):
                    logits = modelo(**enc).logits
                l = perdida(logits.float(), Y[lote].to("cuda"))
                l.backward()
                torch.nn.utils.clip_grad_norm_(modelo.parameters(), 1.0)
                opt.step(); sched.step(); opt.zero_grad()
            print(f"bloque {k} epoca {epoca} ({round(time.time() - t0)} s)", flush=True)
        modelo.eval()
        probs = []
        with torch.no_grad():
            for i in range(0, len(fuera), 128):
                enc = tok([f["texto"] for f in fuera[i:i + 128]], truncation=True, max_length=cv.MAX_TOKENS,
                          padding=True, return_tensors="pt").to("cuda")
                with torch.autocast("cuda", dtype=torch.bfloat16):
                    probs.extend(torch.sigmoid(modelo(**enc).logits.float()).cpu().tolist())
        with destino.open("w", encoding="utf-8") as fh:
            for f, p in zip(fuera, probs):
                fh.write(json.dumps({"id": f["id"], "probs": [round(x, 5) for x in p]}) + "\n")
        print(f"bloque {k}: {len(tren)} frases de entrenamiento, {len(fuera)} predichas", flush=True)
        del modelo, opt
        torch.cuda.empty_cache()
    (SALIDA / "espacio.json").write_text(json.dumps(espacio), encoding="utf-8")


def evaluar_cv(_args):
    espacio = json.loads((cv.DATOS / "etiquetas.json").read_text(encoding="utf-8"))["espacio"]
    espacio_aug = json.loads((SALIDA / "espacio.json").read_text(encoding="utf-8"))
    filas = cv.leer("train") + cv.leer("dev")
    bloque = json.loads((CV_BASE / "bloques.json").read_text(encoding="utf-8"))
    terminos = dic.diccionario()
    por_id = {f["id"]: f for f in filas}
    preds = collections.defaultdict(dict)
    for k in range(cv.BLOQUES):
        tren = [f for f in filas if bloque[f["doc"]] != k]
        quitados = dic.podar(terminos, dic.compilar(terminos), tren, set(espacio))
        podado = {t: v for t, v in terminos.items() if t not in quitados}
        patron = dic.compilar(podado)
        for brazo, base, esp in (("A", CV_BASE, espacio), ("B", SALIDA, espacio_aug)):
            with (base / f"bloque{k}_probs.jsonl").open(encoding="utf-8") as fh:
                for l in fh:
                    x = json.loads(l)
                    # solo las 59 etiquetas originales cuentan
                    m = {esp[j] for j, v in enumerate(x["probs"]) if v >= cv.UMBRAL} & set(espacio)
                    d = dic.predecir(por_id[x["id"]]["texto"], patron, podado)
                    preds[f"modelo {brazo}"][x["id"]] = m
                    preds[f"union {brazo}"][x["id"]] = m | d
    orden = [f for f in filas if f["id"] in preds["union A"]]
    assert len(orden) == len(filas) and all(len(p) == len(filas) for p in preds.values())
    tabla = {}
    for v, pv in preds.items():
        m = evaluar(orden, [pv[f["id"]] for f in orden], espacio)
        tabla[v] = {"f1_frase": m["frase_micro"]["f1"], "p_frase": m["frase_micro"]["precision"],
                    "r_frase": m["frase_micro"]["exhaustividad"], "f1_macro": m["frase_macro_f1"],
                    "f1_informe": m["informe_micro"]["f1"]}
    docs = sorted({f["doc"] for f in orden})
    sistemas = {v: [cuentas_por_doc(orden, [pv[f["id"]] for f in orden], espacio)] for v, pv in preds.items()}
    signif = bootstrap(sistemas, [("union B", "union A"), ("modelo B", "modelo A")], docs)
    s = signif["union B - union A | frase"]
    decision = "aumentado" if s["ic95"][0] >= -MARGEN else "actual"
    salida = {"reglas": {"margen": MARGEN, "epocas": cv.EPOCAS, "umbral": cv.UMBRAL, "etiquetas_medidas": len(espacio)},
              "tabla": tabla, "significacion": signif, "decision": decision}
    (SALIDA / "resultado.json").write_text(json.dumps(salida, indent=1, ensure_ascii=False), encoding="utf-8")
    print("| Sistema (86 informes, 59 etiquetas) | F1 frase | P | R | F1 macro | F1 informe |")
    print("|---|---:|---:|---:|---:|---:|")
    for v, t in tabla.items():
        print(f"| {v} | {t['f1_frase']:.3f} | {t['p_frase']:.3f} | {t['r_frase']:.3f} | {t['f1_macro']:.3f} | {t['f1_informe']:.3f} |")
    print()
    for k, v in signif.items():
        print(f"{k}: {v['diferencia']:+.3f} IC95 [{v['ic95'][0]:+.3f}, {v['ic95'][1]:+.3f}]")
    print(f"\nDECISION (no inferioridad, margen {MARGEN}): {decision}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="orden", required=True)
    sub.add_parser("entrenar")
    sub.add_parser("evaluar")
    args = ap.parse_args()
    {"entrenar": entrenar, "evaluar": evaluar_cv}[args.orden](args)


if __name__ == "__main__":
    main()
