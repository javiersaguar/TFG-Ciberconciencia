"""Probabilidades de los modelos ya afinados en desarrollo y prueba (F4.3).

entrenar.py solo guarda las predicciones de prueba, ya umbralizadas. Para elegir en
DESARROLLO cualquier cosa que venga despues (combinacion con el diccionario, umbrales) hacen
falta las probabilidades de las dos particiones. Este script no entrena: carga cada
data/ml2/modelos/<nombre>/mejor (safetensors) y escribe a su lado
probs_dev.jsonl y probs_test.jsonl ({"id", "probs": [una por etiqueta del espacio]}).

Uso (desde la raiz del repo, entorno de ML):
  .venv-ml/bin/python -m cti.extract.predecir
"""
import json
from pathlib import Path

DATOS = Path("data/ml2/annoctr")
MODELOS = Path("data/ml2/modelos")


def leer(part):
    with (DATOS / f"{part}.jsonl").open(encoding="utf-8") as fh:
        return [json.loads(l) for l in fh]


def main():
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    espacio = json.loads((DATOS / "etiquetas.json").read_text(encoding="utf-8"))["espacio"]
    datos = {p: leer(p) for p in ("dev", "test")}
    for carpeta in sorted(MODELOS.glob("*/mejor")):
        tok = AutoTokenizer.from_pretrained(carpeta)
        modelo = AutoModelForSequenceClassification.from_pretrained(
            carpeta, use_safetensors=True, trust_remote_code=False).to("cuda").eval()
        assert [modelo.config.id2label[i] for i in range(len(espacio))] == espacio, carpeta
        for part, filas in datos.items():
            salida = []
            with torch.no_grad():
                for i in range(0, len(filas), 128):
                    enc = tok([f["texto"] for f in filas[i:i + 128]], truncation=True, max_length=128,
                              padding=True, return_tensors="pt").to("cuda")
                    with torch.autocast("cuda", dtype=torch.bfloat16):
                        logits = modelo(**enc).logits
                    salida.extend(torch.sigmoid(logits.float()).cpu().tolist())
            with (carpeta.parent / f"probs_{part}.jsonl").open("w", encoding="utf-8") as fh:
                for f, p in zip(filas, salida):
                    fh.write(json.dumps({"id": f["id"], "probs": [round(x, 5) for x in p]}) + "\n")
        print(f"{carpeta.parent.name}: probabilidades de dev y test guardadas", flush=True)
        del modelo
        torch.cuda.empty_cache()


if __name__ == "__main__":
    main()
