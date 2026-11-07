"""Analisis de ML-2 sobre los modelos ya afinados (F4.3, pasos 4 y 7). No entrena nada.

Necesita las probabilidades de cti.extract.predecir y la LB-a de cti.extract.diccionario.

  1. Significacion. Remuestreo emparejado (bootstrap) por INFORME de prueba: en cada muestra
     se toman 34 informes con reemplazo y se recalculan el F1 micro por frase y por informe de
     cada sistema (media de sus 3 semillas). Se informa la diferencia observada, su intervalo
     del 95 % y la fraccion de muestras en que la diferencia es <= 0. Se remuestrea por informe
     porque las frases de un mismo informe no son independientes.
  2. Errores por tecnica. F1 por tecnica del mejor modelo (cuentas sumadas de sus 3 semillas)
     frente a la LB-a; relacion con la frecuencia en entrenamiento; tecnicas en las que gana el
     diccionario; confusiones mas frecuentes (tecnica predicha en una frase anotada con otra).
  3. Combinacion con el diccionario, ELEGIDA EN DESARROLLO:
       modelo         el modelo solo, con su umbral de desarrollo;
       union          modelo + todo lo que salte el diccionario podado;
       union-reumbral la union, volviendo a elegir el umbral del modelo en desarrollo.
     Se elige la variante con mejor F1 por frase en desarrollo; la prueba solo se informa.

Salida: data/ml2/resultados/analisis.json y analisis.md (con ejemplos de errores para leer).

Uso (desde la raiz del repo):
  .venv/bin/python -m cti.extract.analisis
"""
import collections
import json
import math
import random
import statistics
from pathlib import Path

from cti.extract import diccionario as dic
from cti.extract.metricas import evaluar

DATOS = Path("data/ml2/annoctr")
MODELOS = Path("data/ml2/modelos")
RESULTADOS = Path("data/ml2/resultados")
UMBRALES = [round(0.05 * i, 2) for i in range(1, 19)]
B = 10000
SEMILLA_BOOTSTRAP = 2026
CORTES_RARAS = (10, 20, 50)
TRAMOS_FRECUENCIA = [(5, 9), (10, 19), (20, 49), (50, 10 ** 9)]


def leer(path):
    with Path(path).open(encoding="utf-8") as fh:
        return [json.loads(l) for l in fh]


def umbralizar(probs, espacio, u):
    return [{espacio[j] for j, p in enumerate(fila) if p >= u} for fila in probs]


# ---------------------------------------------------------------- cuentas por informe
def cuentas_por_doc(filas, preds, espacio):
    """{doc: (vp, fp, fn) por frase, (vp, fp, fn) por informe}: base del remuestreo."""
    espacio = set(espacio)
    frase = collections.defaultdict(lambda: [0, 0, 0])
    oro_d, pred_d = collections.defaultdict(set), collections.defaultdict(set)
    for f, p in zip(filas, preds):
        oro, pr = set(f["etiquetas"]) & espacio, set(p) & espacio
        c = frase[f["doc"]]
        c[0] += len(oro & pr); c[1] += len(pr - oro); c[2] += len(oro - pr)
        oro_d[f["doc"]] |= oro; pred_d[f["doc"]] |= pr
    return {d: (tuple(frase[d]), (len(oro_d[d] & pred_d[d]), len(pred_d[d] - oro_d[d]),
                                  len(oro_d[d] - pred_d[d]))) for d in frase}


def f1(vp, fp, fn):
    return 2 * vp / (2 * vp + fp + fn) if vp else 0.0


def f1_muestra(cuentas_runs, docs, nivel):
    """F1 micro medio entre semillas de un sistema sobre una muestra de informes."""
    out = []
    for cuentas in cuentas_runs:
        vp = fp = fn = 0
        for d in docs:
            a, b, c = cuentas[d][nivel]
            vp += a; fp += b; fn += c
        out.append(f1(vp, fp, fn))
    return statistics.mean(out)


def bootstrap(sistemas, pares, docs):
    rng = random.Random(SEMILLA_BOOTSTRAP)
    muestras = [[rng.choice(docs) for _ in docs] for _ in range(B)]
    out = {}
    for a, b in pares:
        for nivel, nombre in ((0, "frase"), (1, "informe")):
            obs = f1_muestra(sistemas[a], docs, nivel) - f1_muestra(sistemas[b], docs, nivel)
            difs = sorted(f1_muestra(sistemas[a], m, nivel) - f1_muestra(sistemas[b], m, nivel) for m in muestras)
            out[f"{a} - {b} | {nombre}"] = {
                "diferencia": round(obs, 4),
                "ic95": [round(difs[int(0.025 * B)], 4), round(difs[int(0.975 * B) - 1], 4)],
                "fraccion_dif_menor_o_igual_0": round(sum(d <= 0 for d in difs) / B, 4)}
    return out


# ---------------------------------------------------------------- errores por tecnica
def rangos(xs):
    orden = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(orden):
        j = i
        while j + 1 < len(orden) and xs[orden[j + 1]] == xs[orden[i]]:
            j += 1
        for k in range(i, j + 1):
            r[orden[k]] = (i + j) / 2
        i = j + 1
    return r


def spearman(xs, ys):
    rx, ry = rangos(xs), rangos(ys)
    mx, my = statistics.mean(rx), statistics.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))
    return num / den if den else 0.0


def por_tecnica(filas, preds_runs, espacio):
    """Cuentas vp/fp/fn por tecnica sumadas sobre las semillas."""
    c = collections.defaultdict(lambda: [0, 0, 0])
    esp = set(espacio)
    for preds in preds_runs:
        for f, p in zip(filas, preds):
            oro, pr = set(f["etiquetas"]) & esp, set(p) & esp
            for t in oro & pr: c[t][0] += 1
            for t in pr - oro: c[t][1] += 1
            for t in oro - pr: c[t][2] += 1
    return c


def confusiones(filas, preds_runs, espacio, n=12):
    esp = set(espacio)
    cont = collections.Counter()
    for preds in preds_runs:
        for f, p in zip(filas, preds):
            oro, pr = set(f["etiquetas"]) & esp, set(p) & esp
            for fp in pr - oro:
                for fn in oro - pr:
                    cont[(fn, fp)] += 1
    return [{"oro": a, "predicha": b, "veces": k} for (a, b), k in cont.most_common(n)]


# ---------------------------------------------------------------- principal
def main():
    etiquetas = json.loads((DATOS / "etiquetas.json").read_text(encoding="utf-8"))
    espacio, frec, nombres = etiquetas["espacio"], etiquetas["frecuencia_train"], etiquetas["nombres"]
    filas = {p: leer(DATOS / f"{p}.jsonl") for p in ("dev", "test")}

    # LB-a podada (la poda se recalcula igual que en diccionario.py: solo con desarrollo)
    terminos = dic.diccionario()
    quitados = dic.podar(terminos, dic.compilar(terminos), filas["dev"], set(espacio))
    podado = {t: v for t, v in terminos.items() if t not in quitados}
    patron = dic.compilar(podado)
    lba = {p: [dic.predecir(f["texto"], patron, podado) for f in filas[p]] for p in filas}

    # Modelos: probabilidades y umbral elegido en desarrollo al entrenar
    runs = collections.defaultdict(list)
    for r in sorted(MODELOS.glob("*/resultados.json")):
        res = json.loads(r.read_text(encoding="utf-8"))
        probs = {p: [x["probs"] for x in leer(r.parent / f"probs_{p}.jsonl")] for p in filas}
        for p in filas:
            assert [x["id"] for x in leer(r.parent / f"probs_{p}.jsonl")] == [f["id"] for f in filas[p]]
        u = res["seleccion"]["umbral"]
        preds = {p: umbralizar(probs[p], espacio, u) for p in filas}
        # comprobacion: las probabilidades recalculadas reproducen el resultado del entrenamiento
        f1_rep = evaluar(filas["test"], preds["test"], espacio)["frase_micro"]["f1"]
        assert abs(f1_rep - res["test"]["frase_micro"]["f1"]) < 0.01, (r, f1_rep, res["test"]["frase_micro"]["f1"])
        runs[res["modelo"].split("/")[-1]].append({"semilla": res["semilla"], "umbral": u, "probs": probs, "preds": preds})
    secure, modern = "SecureBERT2.0-base", "ModernBERT-base"

    # 3. combinacion, elegida en desarrollo
    combinaciones, todas_variantes = {}, {}
    for nombre_m, rs in list(runs.items()):
        variantes = collections.defaultdict(lambda: {"dev": [], "test": [], "umbrales": []})
        for r in rs:
            for p in filas:
                variantes["modelo"][p].append(r["preds"][p])
                variantes["union"][p].append([a | b for a, b in zip(r["preds"][p], lba[p])])
            mejor_u = max(UMBRALES, key=lambda u: evaluar(
                filas["dev"], [a | b for a, b in zip(umbralizar(r["probs"]["dev"], espacio, u), lba["dev"])],
                espacio)["frase_micro"]["f1"])
            variantes["union-reumbral"]["umbrales"].append(mejor_u)
            for p in filas:
                variantes["union-reumbral"][p].append(
                    [a | b for a, b in zip(umbralizar(r["probs"][p], espacio, mejor_u), lba[p])])
            # diccionario solo para las tecnicas raras (menos de k frases de entrenamiento)
            for k in CORTES_RARAS:
                raras = {e for e in espacio if frec.get(e, 0) < k}
                for p in filas:
                    variantes[f"union-raras<{k}"][p].append(
                        [a | (b & raras) for a, b in zip(r["preds"][p], lba[p])])
        tabla = {}
        for v, d in variantes.items():
            tabla[v] = {}
            for p in filas:
                ms = [evaluar(filas[p], preds, espacio) for preds in d[p]]
                tabla[v][p] = {k: round(statistics.mean(f(m) for m in ms), 4) for k, f in (
                    ("f1_frase", lambda m: m["frase_micro"]["f1"]),
                    ("f1_macro", lambda m: m["frase_macro_f1"]),
                    ("r_explicitas", lambda m: m["mencion_exhaustividad"]["explicita"]),
                    ("r_implicitas", lambda m: m["mencion_exhaustividad"]["implicita"]),
                    ("f1_informe", lambda m: m["informe_micro"]["f1"]))}
            if d["umbrales"]:
                tabla[v]["umbrales"] = d["umbrales"]
        elegida = max(tabla, key=lambda v: tabla[v]["dev"]["f1_frase"])
        combinaciones[nombre_m] = {"variantes": tabla, "elegida_en_dev": elegida}
        todas_variantes[nombre_m] = variantes
        runs[nombre_m + "+dicc"] = [{"preds": {p: variantes[elegida][p][i] for p in filas}} for i in range(len(rs))]

    # 1. significacion por remuestreo de informes
    docs = sorted({f["doc"] for f in filas["test"]})
    sistemas = {n: [cuentas_por_doc(filas["test"], r["preds"]["test"], espacio) for r in rs] for n, rs in runs.items()}
    sistemas["LB-a"] = [cuentas_por_doc(filas["test"], lba["test"], espacio)]
    pares = [(secure, modern), (secure, "LB-a"), (modern, "LB-a"), (secure + "+dicc", secure)]
    signif = bootstrap(sistemas, pares, docs)

    # Exploratorio (no decide nada): ¿la union es mejor que el modelo en prueba y en desarrollo?
    # Sirve para ver si el desacuerdo entre las dos particiones es ruido de muestras pequeñas.
    exploratorio = {}
    for part in ("dev", "test"):
        docs_p = sorted({f["doc"] for f in filas[part]})
        sis = {v: [cuentas_por_doc(filas[part], preds, espacio) for preds in todas_variantes[secure][v][part]]
               for v in ("modelo", "union", f"union-raras<{CORTES_RARAS[1]}")}
        exploratorio[part] = bootstrap(sis, [("union", "modelo"), (f"union-raras<{CORTES_RARAS[1]}", "modelo")], docs_p)

    # 2. errores por tecnica (mejor modelo frente a LB-a)
    cm = por_tecnica(filas["test"], [r["preds"]["test"] for r in runs[secure]], espacio)
    cd = por_tecnica(filas["test"], [lba["test"]], espacio)
    tecnicas = []
    for t in espacio:
        vp, fp, fn = cm[t]
        soporte = (vp + fn) // len(runs[secure])
        if not soporte:
            continue
        tecnicas.append({"tecnica": t, "nombre": nombres.get(t), "frec_train": frec.get(t, 0),
                         "soporte_test": soporte, "f1_modelo": round(f1(*cm[t]), 3),
                         "f1_diccionario": round(f1(*cd[t]), 3),
                         "fp_modelo_por_semilla": round(fp / len(runs[secure]), 1)})
    rho = spearman([math.log(x["frec_train"]) for x in tecnicas], [x["f1_modelo"] for x in tecnicas])
    por_tramo = []
    for lo, hi in TRAMOS_FRECUENCIA:
        grupo = [x for x in tecnicas if lo <= x["frec_train"] <= hi]
        if grupo:
            por_tramo.append({"frases_train": f"{lo}-{hi if hi < 10 ** 9 else '…'}", "tecnicas": len(grupo),
                              "f1_modelo_medio": round(statistics.mean(x["f1_modelo"] for x in grupo), 3),
                              "f1_diccionario_medio": round(statistics.mean(x["f1_diccionario"] for x in grupo), 3)})
    gana_dic = sorted([x for x in tecnicas if x["f1_diccionario"] > x["f1_modelo"]],
                      key=lambda x: x["f1_modelo"] - x["f1_diccionario"])
    conf = confusiones(filas["test"], [r["preds"]["test"] for r in runs[secure]], espacio)

    # ejemplos de errores (semilla 1 del mejor modelo) para lectura manual
    r1 = next(r for r in runs[secure] if r["semilla"] == 1)
    esp = set(espacio)
    ejemplos = {"falsos_negativos_implicitos": [], "falsos_positivos": []}
    for f, p in zip(filas["test"], r1["preds"]["test"]):
        oro = set(f["etiquetas"]) & esp
        for m in f["menciones"]:
            if m["clase"] == "implicita" and m["tecnica"] in esp - set(p):
                ejemplos["falsos_negativos_implicitos"].append({"texto": f["texto"], "mencion": m["texto"],
                                                                 "oro": m["tecnica"], "pred": sorted(p)})
        if set(p) - oro:
            ejemplos["falsos_positivos"].append({"texto": f["texto"], "oro": sorted(oro), "pred": sorted(p)})
    rng = random.Random(SEMILLA_BOOTSTRAP)
    for k in ejemplos:
        ejemplos[k] = rng.sample(ejemplos[k], min(15, len(ejemplos[k])))

    salida = {"significacion": signif, "exploratorio_union": exploratorio, "combinacion": combinaciones,
              "errores": {"spearman_logfrec_f1": round(rho, 3), "por_tramo": por_tramo,
                          "gana_diccionario": gana_dic, "confusiones": conf, "tecnicas": tecnicas},
              "ejemplos": ejemplos, "poda_quitados": quitados, "bootstrap": {"B": B, "semilla": SEMILLA_BOOTSTRAP}}
    RESULTADOS.mkdir(parents=True, exist_ok=True)
    (RESULTADOS / "analisis.json").write_text(json.dumps(salida, indent=1, ensure_ascii=False), encoding="utf-8")

    md = ["# Análisis de ML-2 (prueba de AnnoCTR)", "", "## 1. Significación (remuestreo por informe, B=10.000)", "",
          "| Comparación | Nivel | Diferencia F1 | IC 95 % | Fracción ≤ 0 |", "|---|---|---:|---|---:|"]
    for k, v in signif.items():
        par, nivel = k.split(" | ")
        md.append(f"| {par} | {nivel} | {v['diferencia']:+.3f} | [{v['ic95'][0]:+.3f}, {v['ic95'][1]:+.3f}] | {v['fraccion_dif_menor_o_igual_0']} |")
    md += ["", f"**Exploratorio, SecureBERT 2.0 (no decide nada):** unión y unión solo en técnicas con <{CORTES_RARAS[1]} frases, frente al modelo solo.", "",
           "| Partición | Comparación | Nivel | Diferencia F1 | IC 95 % | Fracción ≤ 0 |", "|---|---|---|---:|---|---:|"]
    for part, res in exploratorio.items():
        for k, v in res.items():
            par, nivel = k.split(" | ")
            md.append(f"| {part} | {par} | {nivel} | {v['diferencia']:+.3f} | [{v['ic95'][0]:+.3f}, {v['ic95'][1]:+.3f}] | {v['fraccion_dif_menor_o_igual_0']} |")
    md += ["", "## 2. Combinación con el diccionario (elegida en desarrollo)", ""]
    for m, c in combinaciones.items():
        md += [f"**{m}** — elegida en desarrollo: `{c['elegida_en_dev']}`", "",
               "| Variante | F1 frase dev | F1 frase prueba | F1 macro prueba | R implícitas prueba | F1 informe prueba |",
               "|---|---:|---:|---:|---:|---:|"]
        for v, t in c["variantes"].items():
            md.append(f"| {v} | {t['dev']['f1_frase']:.3f} | {t['test']['f1_frase']:.3f} | {t['test']['f1_macro']:.3f} | "
                      f"{t['test']['r_implicitas']:.3f} | {t['test']['f1_informe']:.3f} |")
        md.append("")
    md += ["## 3. Errores por técnica (SecureBERT 2.0, 3 semillas)", "",
           f"Correlación de Spearman entre log(frases de entrenamiento) y F1 por técnica: **{rho:.2f}**.", "",
           "| Frases de entrenamiento | Técnicas | F1 medio modelo | F1 medio diccionario |", "|---|---:|---:|---:|"]
    md += [f"| {x['frases_train']} | {x['tecnicas']} | {x['f1_modelo_medio']:.3f} | {x['f1_diccionario_medio']:.3f} |" for x in por_tramo]
    md += ["", "**Técnicas en las que gana el diccionario:**", "",
           "| Técnica | Nombre | Frases train | Soporte prueba | F1 modelo | F1 diccionario |", "|---|---|---:|---:|---:|---:|"]
    md += [f"| {x['tecnica']} | {x['nombre']} | {x['frec_train']} | {x['soporte_test']} | {x['f1_modelo']:.3f} | {x['f1_diccionario']:.3f} |" for x in gana_dic]
    md += ["", "**Confusiones más frecuentes** (frase anotada con *oro*, el modelo predice *predicha* y no *oro*; suma de 3 semillas):", "",
           "| Oro | Predicha | Veces |", "|---|---|---:|"]
    md += [f"| {c['oro']} {nombres.get(c['oro'], '')} | {c['predicha']} {nombres.get(c['predicha'], '')} | {c['veces']} |" for c in conf]
    md += ["", "## 4. Ejemplos (semilla 1, muestra aleatoria fija)", "", "### Menciones implícitas no encontradas", ""]
    md += [f"- **{e['oro']}** «{e['mencion']}» — predice {e['pred'] or '∅'}\n  > {e['texto']}" for e in ejemplos["falsos_negativos_implicitos"]]
    md += ["", "### Falsos positivos", ""]
    md += [f"- oro {e['oro'] or '∅'} — predice {e['pred']}\n  > {e['texto']}" for e in ejemplos["falsos_positivos"]]
    (RESULTADOS / "analisis.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md[:md.index("## 4. Ejemplos (semilla 1, muestra aleatoria fija)")]))


if __name__ == "__main__":
    main()
