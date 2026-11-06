"""Metricas comunes de ML-2: las usan la linea base de diccionario y los modelos.

Tres niveles, todos sobre el espacio de etiquetas (tecnicas padre con ejemplos suficientes):

  frase    multietiqueta: precision, exhaustividad y F1 micro y macro;
  mencion  exhaustividad por mencion, separando explicitas (la tecnica se nombra) e
           implicitas (se describe sin nombrarla), que es donde un diccionario no llega;
  informe  conjunto de tecnicas del informe (union de sus frases) frente al anotado; es
           el nivel del perfil que se carga en el grafo.
"""
import collections


def _prf(vp, fp, fn):
    p = vp / (vp + fp) if vp + fp else 0.0
    r = vp / (vp + fn) if vp + fn else 0.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return {"precision": round(p, 4), "exhaustividad": round(r, 4), "f1": round(f, 4), "vp": vp, "fp": fp, "fn": fn}


def evaluar(filas, predicciones, espacio):
    """filas: frases del conjunto (con 'etiquetas', 'menciones', 'doc');
    predicciones: lista paralela de conjuntos de tecnicas predichas."""
    espacio = set(espacio)
    por_etiqueta = collections.defaultdict(lambda: [0, 0, 0])
    vp = fp = fn = 0
    for f, pred in zip(filas, predicciones):
        oro = set(f["etiquetas"]) & espacio
        pred = set(pred) & espacio
        for t in pred & oro:
            por_etiqueta[t][0] += 1
        for t in pred - oro:
            por_etiqueta[t][1] += 1
        for t in oro - pred:
            por_etiqueta[t][2] += 1
        vp += len(pred & oro); fp += len(pred - oro); fn += len(oro - pred)
    con_soporte = {t: v for t, v in por_etiqueta.items() if v[0] + v[2] > 0}
    macro = [_prf(*v)["f1"] for v in con_soporte.values()]

    menc = collections.Counter()
    for f, pred in zip(filas, predicciones):
        for m in f["menciones"]:
            if m["tecnica"] in espacio:
                menc[(m["clase"], "total")] += 1
                menc[(m["clase"], "acierto")] += m["tecnica"] in set(pred)

    oro_doc, pred_doc = collections.defaultdict(set), collections.defaultdict(set)
    for f, pred in zip(filas, predicciones):
        oro_doc[f["doc"]] |= set(f["etiquetas"]) & espacio
        pred_doc[f["doc"]] |= set(pred) & espacio
    dvp = sum(len(oro_doc[d] & pred_doc[d]) for d in oro_doc)
    dfp = sum(len(pred_doc[d] - oro_doc[d]) for d in oro_doc)
    dfn = sum(len(oro_doc[d] - pred_doc[d]) for d in oro_doc)

    return {
        "frase_micro": _prf(vp, fp, fn),
        "frase_macro_f1": round(sum(macro) / len(macro), 4) if macro else 0.0,
        "etiquetas_con_soporte": len(con_soporte),
        "mencion_exhaustividad": {
            c: round(menc[(c, "acierto")] / menc[(c, "total")], 4) if menc[(c, "total")] else None
            for c in ("explicita", "implicita")},
        "menciones": {c: menc[(c, "total")] for c in ("explicita", "implicita")},
        "informe_micro": _prf(dvp, dfp, dfn),
        "por_etiqueta": {t: _prf(*v) for t, v in sorted(con_soporte.items())},
    }


def resumen_texto(nombre, m):
    fm, im = m["frase_micro"], m["informe_micro"]
    me = m["mencion_exhaustividad"]
    return (f"{nombre:<22} frase P={fm['precision']:.3f} R={fm['exhaustividad']:.3f} F1={fm['f1']:.3f} "
            f"macroF1={m['frase_macro_f1']:.3f} | mencion R explicita={me['explicita']} implicita={me['implicita']} "
            f"| informe P={im['precision']:.3f} R={im['exhaustividad']:.3f} F1={im['f1']:.3f}")
