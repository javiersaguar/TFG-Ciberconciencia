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

    # --- Estrategia A: entrenar solo con ventanas limpias (excluyendo eval) ---
    limpio = df[(~df["indicios"]) & (~es_eval)]
    if len(limpio) >= 30:
        scaler_a, model_a = entrenar(limpio[feats].values, contamination=0.05)
        scores_a = puntuar(scaler_a, model_a, X_eval)
        r = evaluar("A: solo ventanas limpias", scores_a, y_eval)
        r["n_entrenamiento"] = len(limpio)
        resultados.append(r)
        df_eval["score_A"] = scores_a

    # --- Estrategia B: entrenar con todo asumiendo contaminacion ---
    todo = df[~es_eval]
    scaler_b, model_b = entrenar(todo[feats].values, contamination=args.contamination)
    scores_b = puntuar(scaler_b, model_b, X_eval)
    r = evaluar(f"B: todo, contaminacion={args.contamination}", scores_b, y_eval)
    r["n_entrenamiento"] = len(todo)
    resultados.append(r)
    df_eval["score_B"] = scores_b

    # --- Resultados ---
    print("Resultados sobre apt29 day1")
    print(f"  {'estrategia':34} {'entren.':>8} {'AUC-ROC':>9} {'AUC-PR':>8}")
    for r in resultados:
        print(f"  {r['estrategia']:34} {r.get('n_entrenamiento',0):8d} "
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