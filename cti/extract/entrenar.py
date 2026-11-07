"""Afinado de un modelo de lenguaje para ML-2: frase -> tecnicas padre de ATT&CK (F4.3).

Clasificacion multietiqueta sobre el espacio de etiquetas de cti.extract.annoctr (tecnicas
con >= 5 frases de entrenamiento). El mismo script sirve para el modelo del dominio y para
su modelo general de partida, con todo lo demas igual, para medir cuanto aporta el
preentrenamiento en ciberseguridad:

  - SecureBERT 2.0 (cisco-ai/SecureBERT2.0-base, Apache 2.0), preentrenado en textos de
    ciberseguridad a partir de ModernBERT-base;
  - ModernBERT-base (answerdotai/ModernBERT-base, Apache 2.0), la misma arquitectura sin
    ese preentrenamiento.

El SecureBERT original (ehsanaghaei/SecureBERT) solo publica pesos en pickle
(pytorch_model.bin), que pueden ejecutar codigo al cargarse: no se usa. Solo se cargan
pesos en safetensors y en una revision fijada.

Protocolo (fijado antes de entrenar):
  - entrenamiento con `train`; seleccion de epoca y de UMBRAL con `dev` (F1 micro por frase);
  - `test` se evalua UNA vez, al final, con la epoca y el umbral elegidos en `dev`;
  - las frases sin ninguna tecnica del espacio son ejemplos negativos;
  - se repite con varias semillas (--semilla) y se informa media y desviacion;
  - todo se registra en MLflow (parametros, curvas por epoca y metricas finales).

Salida en data/ml2/modelos/<nombre>/: mejor modelo, predicciones de test (para el analisis
de errores) y metricas. Necesita torch y transformers (entorno de ML, ver
ml/requirements-ml2.txt); la preparacion de datos y la evaluacion no dependen de ellos.

Uso (desde la raiz del repo):
  .venv-ml/bin/python -m cti.extract.entrenar --modelo cisco-ai/SecureBERT2.0-base --semilla 1
  .venv-ml/bin/python -m cti.extract.entrenar --modelo answerdotai/ModernBERT-base --semilla 1
"""
import argparse
import json
import math
import random
import time
from pathlib import Path

from cti.extract.metricas import evaluar, resumen_texto

DATOS = Path("data/ml2/annoctr")
MODELOS = Path("data/ml2/modelos")
UMBRALES = [round(0.05 * i, 2) for i in range(1, 19)]   # 0.05 .. 0.90

# Revisiones fijadas (commit del repositorio en Hugging Face), comprobadas el 07-11-2026
REVISIONES = {
    "cisco-ai/SecureBERT2.0-base": "7f7c16d1b2316c5046759667ed97f527aa1b7709",
    "answerdotai/ModernBERT-base": "8949b909ec900327062f0ebf497f51aef5e6f0c8",
}


def leer(part):
    with (DATOS / f"{part}.jsonl").open(encoding="utf-8") as fh:
        return [json.loads(l) for l in fh]


def codificar(filas, espacio):
    pos = {t: i for i, t in enumerate(espacio)}
    y = []
    for f in filas:
        v = [0.0] * len(espacio)
        for t in f["etiquetas"]:
            if t in pos:
                v[pos[t]] = 1.0
        y.append(v)
    return y


def decodificar(probs, espacio, umbral):
    return [{espacio[j] for j, p in enumerate(fila) if p >= umbral} for fila in probs]


def mejor_umbral(filas, probs, espacio):
    """Umbral global que maximiza el F1 micro por frase (solo se usa con dev)."""
    mejor = (-1.0, 0.5, None)
    for u in UMBRALES:
        m = evaluar(filas, decodificar(probs, espacio, u), espacio)
        if m["frase_micro"]["f1"] > mejor[0]:
            mejor = (m["frase_micro"]["f1"], u, m)
    return mejor


def main():
    global DATOS
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--modelo", default="cisco-ai/SecureBERT2.0-base", choices=sorted(REVISIONES))
    ap.add_argument("--semilla", type=int, default=1)
    ap.add_argument("--epocas", type=int, default=8)
    ap.add_argument("--lote", type=int, default=32)
    ap.add_argument("--lr", type=float, default=3e-5)
    ap.add_argument("--max-tokens", type=int, default=128)
    ap.add_argument("--neg-fraccion", type=float, default=1.0,
                    help="Fraccion de frases negativas de entrenamiento que se usan en cada epoca")
    ap.add_argument("--pos-weight", action="store_true",
                    help="Ponderar los positivos de cada etiqueta (sqrt(neg/pos)) contra el desbalanceo")
    ap.add_argument("--mlflow", default="http://localhost:5000")
    ap.add_argument("--datos", default=str(DATOS),
                    help="Carpeta del conjunto (por defecto AnnoCTR; data/ml2/annoctr_aug para el aumentado)")
    args = ap.parse_args()
    DATOS = Path(args.datos)

    import numpy as np
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

    random.seed(args.semilla); np.random.seed(args.semilla); torch.manual_seed(args.semilla)
    dispositivo = "cuda" if torch.cuda.is_available() else "cpu"
    espacio = json.loads((DATOS / "etiquetas.json").read_text(encoding="utf-8"))["espacio"]
    datos = {p: leer(p) for p in ("train", "dev", "test")}
    y = {p: codificar(datos[p], espacio) for p in datos}

    revision = REVISIONES[args.modelo]
    tok = AutoTokenizer.from_pretrained(args.modelo, revision=revision)
    modelo = AutoModelForSequenceClassification.from_pretrained(
        args.modelo, revision=revision, num_labels=len(espacio), problem_type="multi_label_classification",
        id2label=dict(enumerate(espacio)), label2id={t: i for i, t in enumerate(espacio)},
        use_safetensors=True, trust_remote_code=False).to(dispositivo)

    def tensores(filas):
        return tok([f["texto"] for f in filas], truncation=True, max_length=args.max_tokens,
                   padding=True, return_tensors="pt")

    def probabilidades(part):
        modelo.eval()
        salida = []
        with torch.no_grad():
            for i in range(0, len(datos[part]), 128):
                enc = {k: v.to(dispositivo) for k, v in tensores(datos[part][i:i + 128]).items()}
                with torch.autocast(dispositivo, dtype=torch.bfloat16, enabled=dispositivo == "cuda"):
                    logits = modelo(**enc).logits
                salida.extend(torch.sigmoid(logits.float()).cpu().tolist())
        return salida

    Y = torch.tensor(y["train"])
    if args.pos_weight:
        pos = Y.sum(0).clamp(min=1)
        peso = torch.sqrt((len(Y) - pos) / pos).to(dispositivo)
    else:
        peso = None
    perdida = torch.nn.BCEWithLogitsLoss(pos_weight=peso)
    positivos = [i for i, v in enumerate(y["train"]) if any(v)]
    negativos = [i for i, v in enumerate(y["train"]) if not any(v)]
    por_epoca = len(positivos) + int(len(negativos) * args.neg_fraccion)
    pasos = args.epocas * math.ceil(por_epoca / args.lote)
    opt = torch.optim.AdamW(modelo.parameters(), lr=args.lr, weight_decay=0.01)
    sched = get_linear_schedule_with_warmup(opt, int(0.1 * pasos), pasos)

    sufijo = "" if DATOS == Path("data/ml2/annoctr") else "-" + DATOS.name.removeprefix("annoctr_")
    nombre = f"{args.modelo.split('/')[-1]}{sufijo}-s{args.semilla}"
    destino = MODELOS / nombre
    destino.mkdir(parents=True, exist_ok=True)

    mlf = None
    try:
        import mlflow
        mlflow.set_tracking_uri(args.mlflow)
        mlflow.set_experiment("ML-2 extraccion de TTPs (AnnoCTR)")
        mlflow.start_run(run_name=nombre)
        mlflow.log_params({**vars(args), "revision": revision, "etiquetas": len(espacio), "dispositivo": dispositivo,
                           "frases_train": len(datos["train"]), "positivas_train": len(positivos)})
        mlf = mlflow
    except Exception as e:  # MLflow es opcional: sin servidor se sigue y se guarda en disco
        print(f"MLflow no disponible ({e}); solo se guarda en {destino}")

    mejor = {"f1": -1.0}
    historia = []
    t0 = time.time()
    for epoca in range(1, args.epocas + 1):
        modelo.train()
        indices = positivos + random.sample(negativos, int(len(negativos) * args.neg_fraccion))
        random.shuffle(indices)
        total = 0.0
        for i in range(0, len(indices), args.lote):
            lote = [datos["train"][k] for k in indices[i:i + args.lote]]
            enc = {k: v.to(dispositivo) for k, v in tensores(lote).items()}
            objetivo = Y[indices[i:i + args.lote]].to(dispositivo)
            with torch.autocast(dispositivo, dtype=torch.bfloat16, enabled=dispositivo == "cuda"):
                logits = modelo(**enc).logits
            l = perdida(logits.float(), objetivo)
            l.backward()
            torch.nn.utils.clip_grad_norm_(modelo.parameters(), 1.0)
            opt.step(); sched.step(); opt.zero_grad()
            total += l.item() * len(lote)
        f1, umbral, m = mejor_umbral(datos["dev"], probabilidades("dev"), espacio)
        fila = {"epoca": epoca, "perdida": round(total / len(indices), 5), "dev_f1": f1, "umbral": umbral,
                "dev_macro_f1": m["frase_macro_f1"], "segundos": round(time.time() - t0)}
        historia.append(fila)
        print(fila, flush=True)
        if mlf:
            mlf.log_metrics({k: v for k, v in fila.items() if k != "epoca"}, step=epoca)
        if f1 > mejor["f1"]:
            mejor = {"f1": f1, "umbral": umbral, "epoca": epoca}
            modelo.save_pretrained(destino / "mejor", safe_serialization=True)
            tok.save_pretrained(destino / "mejor")

    # Evaluacion final, una sola vez, con la mejor epoca y su umbral de dev
    modelo = AutoModelForSequenceClassification.from_pretrained(destino / "mejor", use_safetensors=True).to(dispositivo)
    resultados = {"modelo": args.modelo, "semilla": args.semilla, "seleccion": mejor, "historia": historia}
    for part in ("dev", "test"):
        probs = probabilidades(part)
        preds = decodificar(probs, espacio, mejor["umbral"])
        resultados[part] = evaluar(datos[part], preds, espacio)
        print(resumen_texto(f"{nombre} {part}", resultados[part]))
        if part == "test":
            with (destino / "predicciones_test.jsonl").open("w", encoding="utf-8") as fh:
                for f, p, pr in zip(datos[part], preds, probs):
                    fh.write(json.dumps({"id": f["id"], "doc": f["doc"], "texto": f["texto"],
                                         "oro": f["etiquetas"], "pred": sorted(p),
                                         "top": sorted(zip(espacio, pr), key=lambda x: -x[1])[:3]},
                                        ensure_ascii=False) + "\n")
    (destino / "resultados.json").write_text(json.dumps(resultados, indent=1, ensure_ascii=False), encoding="utf-8")
    if mlf:
        for part in ("dev", "test"):
            r = resultados[part]
            mlf.log_metrics({f"{part}_frase_f1": r["frase_micro"]["f1"], f"{part}_frase_macro_f1": r["frase_macro_f1"],
                             f"{part}_informe_f1": r["informe_micro"]["f1"],
                             f"{part}_mencion_r_explicita": r["mencion_exhaustividad"]["explicita"] or 0,
                             f"{part}_mencion_r_implicita": r["mencion_exhaustividad"]["implicita"] or 0})
        try:
            mlf.log_artifact(str(destino / "resultados.json"))
        except Exception as e:  # el servidor del compose guarda artefactos en una ruta local suya
            print(f"Artefacto no subido a MLflow ({e}); queda en {destino}")
        mlf.end_run()
    print(f"Resultados en {destino}")


if __name__ == "__main__":
    main()
