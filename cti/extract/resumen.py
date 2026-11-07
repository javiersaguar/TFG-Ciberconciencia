"""Tabla de ML-2: LB-a de diccionario frente a cada modelo afinado, con media y desviacion
entre semillas (F4.3). Solo lee resultados ya guardados; no entrena ni evalua nada.

Lee data/ml2/resultados/lb-a.json y data/ml2/modelos/*/resultados.json, imprime una tabla en
Markdown y la guarda, junto con los datos, en data/ml2/resultados/tabla-ml2.{md,json}.

Uso (desde la raiz del repo):
  .venv/bin/python -m cti.extract.resumen
"""
import collections
import json
import statistics
from pathlib import Path

RESULTADOS = Path("data/ml2/resultados")
MODELOS = Path("data/ml2/modelos")

METRICAS = [  # (columna, funcion que la saca de un bloque de metricas de evaluar())
    ("F1 frase", lambda m: m["frase_micro"]["f1"]),
    ("P frase", lambda m: m["frase_micro"]["precision"]),
    ("R frase", lambda m: m["frase_micro"]["exhaustividad"]),
    ("F1 macro", lambda m: m["frase_macro_f1"]),
    ("R explicitas", lambda m: m["mencion_exhaustividad"]["explicita"]),
    ("R implicitas", lambda m: m["mencion_exhaustividad"]["implicita"]),
    ("F1 informe", lambda m: m["informe_micro"]["f1"]),
]


def celda(valores):
    if len(valores) == 1:
        return f"{valores[0]:.3f}"
    return f"{statistics.mean(valores):.3f} ± {statistics.stdev(valores):.3f}"


def main():
    filas, datos = [], {}
    lb = json.loads((RESULTADOS / "lb-a.json").read_text(encoding="utf-8"))
    for variante in ("bruto", "podado"):
        m = lb[f"{variante}_test"]
        nombre = f"LB-a diccionario ({variante})"
        datos[nombre] = {c: [f(m)] for c, f in METRICAS}
        filas.append((nombre, 1, [celda([f(m)]) for _, f in METRICAS]))

    por_modelo = collections.defaultdict(list)
    for r in sorted(MODELOS.glob("*/resultados.json")):
        res = json.loads(r.read_text(encoding="utf-8"))
        por_modelo[res["modelo"]].append(res)
    for modelo, runs in sorted(por_modelo.items()):
        valores = {c: [f(r["test"]) for r in runs] for c, f in METRICAS}
        datos[modelo] = {**valores, "semillas": [r["semilla"] for r in runs],
                         "epocas": [r["seleccion"]["epoca"] for r in runs],
                         "umbrales": [r["seleccion"]["umbral"] for r in runs]}
        filas.append((modelo, len(runs), [celda(valores[c]) for c, _ in METRICAS]))

    cab = "| Modelo (prueba) | Semillas | " + " | ".join(c for c, _ in METRICAS) + " |"
    tabla = [cab, "|---|---:|" + "---:|" * len(METRICAS)]
    tabla += [f"| {n} | {k} | " + " | ".join(v) + " |" for n, k, v in filas]
    texto = "\n".join(tabla)
    print(texto)
    for modelo in por_modelo:
        d = datos[modelo]
        print(f"{modelo}: semillas {d['semillas']}, epocas elegidas {d['epocas']}, umbrales {d['umbrales']}")
    RESULTADOS.mkdir(parents=True, exist_ok=True)
    (RESULTADOS / "tabla-ml2.md").write_text(texto + "\n", encoding="utf-8")
    (RESULTADOS / "tabla-ml2.json").write_text(json.dumps(datos, indent=1, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
