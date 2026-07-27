"""Entrenamiento y evaluacion del detector de anomalias por ventana.

Compara dos estrategias de entrenamiento:
  A) solo ventanas sin indicios de ataque (aprendizaje de lo normal puro)
  B) todas las ventanas asumiendo contaminacion baja

La evaluacion se hace sobre apt29 day1, unico conjunto con alertas Sigma
como referencia externa.
"""
import argparse
import json
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score, average_precision_score

from ml.anomaly.features import (
    get_client, load_window_features, add_alert_labels, feature_columns,
)

SEED = 42
EVAL_DATASET = "SDWIN-200501225525"   # apt29 day1

# Caracteristicas que participan en la definicion de "ventana limpia".
# Se excluyen en la ablacion para comprobar que el modelo no depende de ellas.
FEATURES_CIRCULARES = [
    "s_lsass", "s_lsass_sosp", "s_dump_mod", "s_dump_file",
    "s_log_borrado", "s_logon_remoto", "c_inyecciones", "c_severidad_alta",
]

def marcar_indicios(df):
    """Marca las ventanas con indicios objetivos de actividad maliciosa."""
    return (
        (df.get("s_lsass", 0) > 0) | (df.get("s_lsass_sosp", 0) > 0)
        | (df.get("s_dump_mod", 0) > 0) | (df.get("s_dump_file", 0) > 0)
        | (df.get("s_log_borrado", 0) > 0) | (df.get("c_inyecciones", 0) > 0)
        | (df.get("c_severidad_alta", 0) > 0)
    )


def entrenar(X_train, contamination, seed=SEED):
    scaler = StandardScaler().fit(X_train)
    model = IsolationForest(
        n_estimators=200,
        contamination=contamination,
        random_state=seed,
        n_jobs=-1,
    ).fit(scaler.transform(X_train))
    return scaler, model


def puntuar(scaler, model, X):
    """Puntuacion de anomalia normalizada: mayor = mas anomalo."""
    raw = -model.score_samples(scaler.transform(X))
    return raw


def evaluar(nombre, scores, y_true):
    """Calcula metricas frente a la referencia de alertas Sigma."""
    if y_true.sum() == 0 or y_true.sum() == len(y_true):
        return {"estrategia": nombre, "auc_roc": None, "auc_pr": None,
                "nota": "sin variedad en la referencia"}
    return {
        "estrategia": nombre,
        "auc_roc": round(float(roc_auc_score(y_true, scores)), 3),
        "auc_pr": round(float(average_precision_score(y_true, scores)), 3),
        "positivos": int(y_true.sum()),
        "muestras": int(len(y_true)),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=int, default=5)
    ap.add_argument("--contamination", type=float, default=0.3)
    ap.add_argument("--out", default="ml/anomaly/resultados.json")
    args = ap.parse_args()

    client = get_client()
    df = load_window_features(client, minutes=args.minutes)
    df = add_alert_labels(client, df, minutes=args.minutes)
    feats = feature_columns(df)
    df[feats] = df[feats].fillna(0)

    df["indicios"] = marcar_indicios(df)
    es_eval = df["dataset_id"] == EVAL_DATASET

    print(f"Ventanas totales     : {len(df)}")
    print(f"  sin indicios       : {(~df['indicios']).sum()}")
    print(f"  con indicios       : {df['indicios'].sum()}")
    print(f"  de evaluacion      : {es_eval.sum()}  (apt29 day1)")
    print(f"Caracteristicas      : {len(feats)}")
    print()

    # Conjunto de evaluacion: apt29 day1, con las alertas Sigma como referencia
    df_eval = df[es_eval].copy()
    y_eval = (df_eval["n_alertas"] > 0).astype(int).values
    X_eval = df_eval[feats].values

    resultados = []

    def ejecutar(nombre, feats_usar, df_train, contamination):
        """Entrena con un subconjunto de caracteristicas y evalua."""
        if len(df_train) < 30:
            return None
        scaler, model = entrenar(df_train[feats_usar].values, contamination)
        scores = puntuar(scaler, model, df_eval[feats_usar].values)
        r = evaluar(nombre, scores, y_eval)
        r["n_entrenamiento"] = len(df_train)
        r["n_features"] = len(feats_usar)
        resultados.append(r)
        return scores

    limpio = df[(~df["indicios"]) & (~es_eval)]
    todo = df[~es_eval]

    # Conjunto completo de caracteristicas
    df_eval["score_A"] = ejecutar("A: limpias, todas las feats", feats, limpio, 0.05)
    df_eval["score_B"] = ejecutar(f"B: todo (cont={args.contamination}), todas", feats,
                                  todo, args.contamination)

    # ABLACION: sin las caracteristicas que definen "ventana limpia"
    feats_ablacion = [f for f in feats if f not in FEATURES_CIRCULARES]
    print(f"Ablacion: {len(feats)} -> {len(feats_ablacion)} caracteristicas")
    print(f"  excluidas: {', '.join(FEATURES_CIRCULARES)}\n")

    ejecutar("C: limpias, SIN feats circulares", feats_ablacion, limpio, 0.05)
    ejecutar(f"D: todo (cont={args.contamination}), SIN circulares", feats_ablacion,
             todo, args.contamination)

    # Control: solo volumen (la caracteristica mas obvia)
    feats_volumen = ["n_eventos"]
    ejecutar("E: control, solo n_eventos", feats_volumen, limpio, 0.05)
    # --- Experimentos con caracteristicas RELATIVAS (sin volumen) ---
    from ml.anomaly.features import relative_features, absolute_features

    feats_rel = relative_features(df)
    feats_abs = absolute_features(df)
    print(f"\nCaracteristicas relativas: {len(feats_rel)}  |  absolutas: {len(feats_abs)}")
    print(f"  relativas: {', '.join(feats_rel[:8])}...\n")

    ejecutar("F: limpias, SOLO ratios (sin volumen)", feats_rel, limpio, 0.05)
    ejecutar(f"G: todo (cont={args.contamination}), SOLO ratios", feats_rel,
             todo, args.contamination)
    # --- Resultados ---
    print("Resultados sobre apt29 day1")
    print(f"  {'estrategia':44} {'feats':>6} {'entren.':>8} {'AUC-ROC':>9} {'AUC-PR':>8}")
    for r in resultados:
        print(f"  {r['estrategia']:44} {r.get('n_features',0):6d} "
              f"{r.get('n_entrenamiento',0):8d} "
              f"{str(r.get('auc_roc')):>9} {str(r.get('auc_pr')):>8}")

    # Importancia aproximada: caracteristicas mas extremas en las ventanas top
    print("\nVentanas mas anomalas segun la estrategia B:")
    top = df_eval.nlargest(5, "score_B")
    for _, row in top.iterrows():
        print(f"  {row['host'][:22]:24} {str(row['ventana'])[:19]}  "
              f"score={row['score_B']:.3f}  alertas={row['n_alertas']}  "
              f"eventos={int(row['n_eventos'])}")

    with open(args.out, "w") as fh:
        json.dump({"minutes": args.minutes, "resultados": resultados}, fh, indent=2)
    print(f"\nGuardado en {args.out}")


if __name__ == "__main__":
    main()