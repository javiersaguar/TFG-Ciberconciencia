"""Validacion cruzada por informe para decidir si el modelo se combina con el diccionario (F4.3).

Motivo: elegida en desarrollo (16 informes), la union modelo + diccionario pierde; en prueba
ganaria. Desarrollo no representa bien al diccionario (pocas menciones explicitas), asi que la
decision se toma con los 86 informes de entrenamiento + desarrollo. La prueba no se toca.

Reglas, fijadas ANTES de ver ningun resultado (bitacora 2026-11-07):
  - 5 bloques por informe (barajado con semilla fija); en cada vuelta se entrena SecureBERT 2.0
    con 4 bloques y se predice el quinto. Al final cada informe tiene una prediccion.
  - Sin seleccion dentro de cada vuelta: epoca e umbral fijos, los medianos de los
    entrenamientos con la particion publicada (epocas [4, 7, 7] -> 7; umbrales
    [0.25, 0.15, 0.20] -> 0.20). Resto de hiperparametros, los de entrenar.py.
  - La poda del diccionario y la frecuencia que define una tecnica "rara" se calculan solo con
    los 4 bloques de entrenamiento de cada vuelta.
  - Variantes: modelo; union; union solo en tecnicas raras (< 10, < 20, < 50 frases).
  - Decision: se adopta la variante con diccionario de mejor F1 por frase sobre los 86 informes
    SOLO si supera al modelo y el remuestreo por informe (B = 10.000) da una fraccion de
    diferencias <= 0 menor que 0,05. Si no, el modelo solo.

Uso (desde la raiz del repo):
  .venv-ml/bin/python -m cti.extract.validacion_cruzada entrenar      # GPU, unos 25-30 min
  .venv/bin/python -m cti.extract.validacion_cruzada evaluar
"""
import argparse
import collections
import json
import math
import random
import statistics
import time
from pathlib import Path

from cti.extract import diccionario as dic
from cti.extract.analisis import bootstrap, cuentas_por_doc
from cti.extract.entrenar import REVISIONES, codificar
from cti.extract.metricas import evaluar

DATOS = Path("data/ml2/annoctr")
SALIDA = Path("data/ml2/cv")
MODELO = "cisco-ai/SecureBERT2.0-base"
BLOQUES, SEMILLA = 5, 2026
EPOCAS, UMBRAL = 7, 0.20
LOTE, LR, MAX_TOKENS = 32, 3e-5, 128
CORTES_RARAS = (10, 20, 50)
ALFA = 0.05


def leer(part):
    with (DATOS / f"{part}.jsonl").open(encoding="utf-8") as fh:
        return [json.loads(l) for l in fh]


def bloques(filas):
    docs = sorted({f["doc"] for f in filas})
    random.Random(SEMILLA).shuffle(docs)
    return {d: i % BLOQUES for i, d in enumerate(docs)}


def entrenar(_args):
    import numpy as np
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

    espacio = json.loads((DATOS / "etiquetas.json").read_text(encoding="utf-8"))["espacio"]
    filas = leer("train") + leer("dev")
    bloque = bloques(filas)
    SALIDA.mkdir(parents=True, exist_ok=True)
    (SALIDA / "bloques.json").write_text(json.dumps(bloque, indent=1), encoding="utf-8")
    tok = AutoTokenizer.from_pretrained(MODELO, revision=REVISIONES[MODELO])

    for k in range(BLOQUES):
        destino = SALIDA / f"bloque{k}_probs.jsonl"
        if destino.exists():
            print(f"bloque {k}: ya hecho, se salta", flush=True)
            continue
        random.seed(SEMILLA + k); np.random.seed(SEMILLA + k); torch.manual_seed(SEMILLA + k)
        tren = [f for f in filas if bloque[f["doc"]] != k]
        fuera = [f for f in filas if bloque[f["doc"]] == k]
        Y = torch.tensor(codificar(tren, espacio))
        modelo = AutoModelForSequenceClassification.from_pretrained(
            MODELO, revision=REVISIONES[MODELO], num_labels=len(espacio),
            problem_type="multi_label_classification", use_safetensors=True,
            trust_remote_code=False).to("cuda")
        perdida = torch.nn.BCEWithLogitsLoss()
        pasos = EPOCAS * math.ceil(len(tren) / LOTE)
        opt = torch.optim.AdamW(modelo.parameters(), lr=LR, weight_decay=0.01)
        sched = get_linear_schedule_with_warmup(opt, int(0.1 * pasos), pasos)
        t0 = time.time()
        for epoca in range(1, EPOCAS + 1):
            modelo.train()
            indices = list(range(len(tren)))
            random.shuffle(indices)
            for i in range(0, len(indices), LOTE):
                lote = indices[i:i + LOTE]
                enc = tok([tren[j]["texto"] for j in lote], truncation=True, max_length=MAX_TOKENS,
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
                enc = tok([f["texto"] for f in fuera[i:i + 128]], truncation=True, max_length=MAX_TOKENS,
                          padding=True, return_tensors="pt").to("cuda")
                with torch.autocast("cuda", dtype=torch.bfloat16):
                    probs.extend(torch.sigmoid(modelo(**enc).logits.float()).cpu().tolist())
        with destino.open("w", encoding="utf-8") as fh:
            for f, p in zip(fuera, probs):
                fh.write(json.dumps({"id": f["id"], "probs": [round(x, 5) for x in p]}) + "\n")
        print(f"bloque {k}: {len(tren)} frases de entrenamiento, {len(fuera)} predichas", flush=True)
        del modelo, opt
        torch.cuda.empty_cache()


def evaluar_cv(_args):
    espacio = json.loads((DATOS / "etiquetas.json").read_text(encoding="utf-8"))["espacio"]
    filas = leer("train") + leer("dev")
    bloque = json.loads((SALIDA / "bloques.json").read_text(encoding="utf-8"))
    terminos = dic.diccionario()
    por_id = {f["id"]: f for f in filas}
    preds = collections.defaultdict(dict)   # variante -> id -> conjunto
    detalle = []
    for k in range(BLOQUES):
        tren = [f for f in filas if bloque[f["doc"]] != k]
        probs = {}
        with (SALIDA / f"bloque{k}_probs.jsonl").open(encoding="utf-8") as fh:
            for l in fh:
                x = json.loads(l)
                probs[x["id"]] = x["probs"]
        quitados = dic.podar(terminos, dic.compilar(terminos), tren, set(espacio))
        podado = {t: v for t, v in terminos.items() if t not in quitados}
        patron = dic.compilar(podado)
        frec = collections.Counter(t for f in tren for t in f["etiquetas"])
        for i, p in probs.items():
            m = {espacio[j] for j, v in enumerate(p) if v >= UMBRAL}
            d = dic.predecir(por_id[i]["texto"], patron, podado)
            preds["modelo"][i] = m
            preds["union"][i] = m | d
            for c in CORTES_RARAS:
                preds[f"union-raras<{c}"][i] = m | {t for t in d if frec[t] < c}
            preds["diccionario"][i] = d
        detalle.append({"bloque": k, "informes": len({por_id[i]["doc"] for i in probs}),
                        "frases": len(probs), "poda_quitados": quitados})

    orden = [f for f in filas if f["id"] in preds["modelo"]]
    assert len(orden) == len(filas)
    tabla, por_bloque = {}, collections.defaultdict(list)
    for v, pv in preds.items():
        m = evaluar(orden, [pv[f["id"]] for f in orden], espacio)
        tabla[v] = {"f1_frase": m["frase_micro"]["f1"], "p_frase": m["frase_micro"]["precision"],
                    "r_frase": m["frase_micro"]["exhaustividad"], "f1_macro": m["frase_macro_f1"],
                    "r_explicitas": m["mencion_exhaustividad"]["explicita"],
                    "r_implicitas": m["mencion_exhaustividad"]["implicita"], "f1_informe": m["informe_micro"]["f1"]}
        for k in range(BLOQUES):
            fb = [f for f in orden if bloque[f["doc"]] == k]
            por_bloque[v].append(evaluar(fb, [pv[f["id"]] for f in fb], espacio)["frase_micro"]["f1"])

    docs = sorted({f["doc"] for f in orden})
    sistemas = {v: [cuentas_por_doc(orden, [pv[f["id"]] for f in orden], espacio)] for v, pv in preds.items()}
    con_dic = [v for v in preds if v.startswith("union")]
    signif = bootstrap(sistemas, [(v, "modelo") for v in con_dic], docs)
    mejor = max(con_dic, key=lambda v: tabla[v]["f1_frase"])
    s = signif[f"{mejor} - modelo | frase"]
    adoptada = mejor if s["diferencia"] > 0 and s["fraccion_dif_menor_o_igual_0"] < ALFA else "modelo"

    salida = {"reglas": {"bloques": BLOQUES, "epocas": EPOCAS, "umbral": UMBRAL, "alfa": ALFA},
              "tabla": tabla, "f1_frase_por_bloque": por_bloque, "significacion": signif,
              "mejor_con_diccionario": mejor, "decision": adoptada, "bloques": detalle}
    (SALIDA / "resultado.json").write_text(json.dumps(salida, indent=1, ensure_ascii=False), encoding="utf-8")
    print("| Variante (86 informes, fuera de bloque) | F1 frase | P | R | F1 macro | R explícitas | R implícitas | F1 informe | F1 frase por bloque |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|---|")
    for v, t in tabla.items():
        print(f"| {v} | {t['f1_frase']:.3f} | {t['p_frase']:.3f} | {t['r_frase']:.3f} | {t['f1_macro']:.3f} | "
              f"{t['r_explicitas']:.3f} | {t['r_implicitas']:.3f} | {t['f1_informe']:.3f} | "
              + " ".join(f"{x:.2f}" for x in por_bloque[v]) + " |")
    print()
    for k, v in signif.items():
        print(f"{k}: {v['diferencia']:+.3f} IC95 [{v['ic95'][0]:+.3f}, {v['ic95'][1]:+.3f}] fraccion<=0 {v['fraccion_dif_menor_o_igual_0']}")
    print(f"\nMejor con diccionario: {mejor}. DECISION (regla fijada antes): {adoptada}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="orden", required=True)
    sub.add_parser("entrenar")
    sub.add_parser("evaluar")
    args = ap.parse_args()
    {"entrenar": entrenar, "evaluar": evaluar_cv}[args.orden](args)


if __name__ == "__main__":
    main()
