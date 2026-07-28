"""Entrenamiento del detector de anomalias con registro de experimentos.

Compara tres enfoques sobre el mismo problema:
  1. No supervisado (Isolation Forest) con datos limpios
  2. No supervisado con datos contaminados
  3. Supervisado (Random Forest) con SMOTE para el desbalanceo

Todos los experimentos se registran en MLflow para su reproducibilidad.
"""
import argparse
import warnings

import mlflow
import numpy as np
from imblearn.over_sampling import SMOTE
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import (
    roc_auc_score, average_precision_score, precision_score,
    recall_score, f1_score,
)
from sklearn.preprocessing import StandardScaler

from ml.anomaly.features import (
    get_client, load_window_features, add_alert_labels,
    feature_columns, relative_features,
)

warnings.filterwarnings("ignore")

SEED = 42
EVAL_DATASET = "SDWIN-200501225525"   # apt29 day1
EXPERIMENT = "ML-1 deteccion de anomalias"

FEATURES_CIRCULARES = [
    "s_lsass", "s_lsass_sosp", "s_dump_mod", "s_dump_file",
    "s_log_borrado", "s_logon_remoto", "c_inyecciones", "c_severidad_alta",
]


def marcar_indicios(df):
    cols = ["s_lsass", "s_lsass_sosp", "s_dump_mod", "s_dump_file",
            "s_log_borrado", "c_inyecciones", "c_severidad_alta"]
    mask = np.zeros(len(df), dtype=bool)
    for c in cols:
        if c in df.columns:
            mask |= (df[c] > 0).values
    return mask


def metricas(y_true, scores, y_pred=None):
    out = {
        "auc_roc": float(roc_auc_score(y_true, scores)),
        "auc_pr": float(average_precision_score(y_true, scores)),
    }
    if y_pred is not None:
        out.update({
            "precision": float(precision_score(y_true, y_pred, zero_division=0)),
            "recall": float(recall_score(y_true, y_pred, zero_division=0)),
            "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        })
    return out


def registrar(nombre, params, mets, tags=None):
    with mlflow.start_run(run_name=nombre):
        mlflow.log_params(params)
        mlflow.log_metrics(mets)
        if tags:
            mlflow.set_tags(tags)
    linea = f"  {nombre:42}"
    for k in ("auc_roc", "auc_pr", "f1"):
        if k in mets:
            linea += f" {k}={mets[k]:.3f}"
    print(linea)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=int, default=5)
    ap.add_argument("--contamination", type=float, default=0.3)
    ap.add_argument("--tracking-uri", default="http://127.0.0.1:5000")
    args = ap.parse_args()

    mlflow.set_tracking_uri(args.tracking_uri)
    mlflow.set_experiment(EXPERIMENT)

    client = get_client()
    df = load_window_features(client, minutes=args.minutes)
    df = add_alert_labels(client, df, minutes=args.minutes)
    feats_all = feature_columns(df)
    df[feats_all] = df[feats_all].fillna(0)

    indicios = marcar_indicios(df)
    es_eval = (df["dataset_id"] == EVAL_DATASET).values

    df_eval = df[es_eval]
    y_eval = (df_eval["n_alertas"] > 0).astype(int).values

    feats_rel = relative_features(df)
    feats_sin_circ = [f for f in feats_all if f not in FEATURES_CIRCULARES]

    print(f"Ventanas: {len(df)}  |  evaluacion: {es_eval.sum()}  "
          f"(positivos: {y_eval.sum()})")
    print(f"Caracteristicas: {len(feats_all)} totales, {len(feats_rel)} relativas\n")

    base_params = {
        "ventana_min": args.minutes,
        "seed": SEED,
        "n_ventanas_total": len(df),
        "n_eval": int(es_eval.sum()),
        "dataset_eval": EVAL_DATASET,
    }

    # =====================================================================
    # ENFOQUE 1 y 2: no supervisado
    # =====================================================================
    print("No supervisado (Isolation Forest):")

    configs = [
        ("IF limpias - todas", feats_all, ~indicios & ~es_eval, 0.05),
        ("IF limpias - sin circulares", feats_sin_circ, ~indicios & ~es_eval, 0.05),
        ("IF limpias - solo ratios", feats_rel, ~indicios & ~es_eval, 0.05),
        ("IF contaminado - todas", feats_all, ~es_eval, args.contamination),
        ("IF contaminado - solo ratios", feats_rel, ~es_eval, args.contamination),
        ("Control - solo volumen", ["n_eventos"], ~indicios & ~es_eval, 0.05),
    ]

    for nombre, feats, mask_train, cont in configs:
        X_tr = df.loc[mask_train, feats].values
        if len(X_tr) < 30:
            continue
        scaler = StandardScaler().fit(X_tr)
        model = IsolationForest(n_estimators=200, contamination=cont,
                                random_state=SEED, n_jobs=-1).fit(scaler.transform(X_tr))
        scores = -model.score_samples(scaler.transform(df_eval[feats].values))
        mets = metricas(y_eval, scores)
        registrar(nombre, {**base_params, "enfoque": "no_supervisado",
                           "n_features": len(feats), "n_train": len(X_tr),
                           "contamination": cont, "modelo": "IsolationForest"},
                  mets, {"tipo": "no_supervisado"})

    # =====================================================================
    # ENFOQUE 3: supervisado con SMOTE
    # =====================================================================
    print("\nSupervisado (Random Forest):")

    # Etiqueta: ventana con actividad maliciosa segun indicios objetivos
    y_all = indicios.astype(int)
    mask_train = ~es_eval
    X_train_df = df.loc[mask_train]
    y_train = y_all[mask_train]

    print(f"  entrenamiento: {len(y_train)} ventanas "
          f"({y_train.sum()} positivas, {len(y_train)-y_train.sum()} negativas)")

    for nombre, feats in [("RF sin SMOTE - sin circulares", feats_sin_circ),
                          ("RF sin SMOTE - solo ratios", feats_rel)]:
        X_tr = X_train_df[feats].values
        model = RandomForestClassifier(n_estimators=200, random_state=SEED,
                                       n_jobs=-1, class_weight="balanced").fit(X_tr, y_train)
        proba = model.predict_proba(df_eval[feats].values)[:, 1]
        pred = (proba >= 0.5).astype(int)
        mets = metricas(y_eval, proba, pred)
        registrar(nombre, {**base_params, "enfoque": "supervisado",
                           "n_features": len(feats), "n_train": len(X_tr),
                           "smote": False, "modelo": "RandomForest"},
                  mets, {"tipo": "supervisado"})

    # Con SMOTE
    for nombre, feats in [("RF + SMOTE - sin circulares", feats_sin_circ),
                          ("RF + SMOTE - solo ratios", feats_rel)]:
        X_tr = X_train_df[feats].values
        n_min = int(min(y_train.sum(), len(y_train) - y_train.sum()))
        if n_min < 6:
            print(f"  [SKIP] {nombre}: clase minoritaria demasiado pequena ({n_min})")
            continue
        k = min(5, n_min - 1)
        X_res, y_res = SMOTE(random_state=SEED, k_neighbors=k).fit_resample(X_tr, y_train)
        model = RandomForestClassifier(n_estimators=200, random_state=SEED,
                                       n_jobs=-1).fit(X_res, y_res)
        proba = model.predict_proba(df_eval[feats].values)[:, 1]
        pred = (proba >= 0.5).astype(int)
        mets = metricas(y_eval, proba, pred)
        registrar(nombre, {**base_params, "enfoque": "supervisado",
                           "n_features": len(feats), "n_train_original": len(X_tr),
                           "n_train_smote": len(X_res), "smote": True,
                           "k_neighbors": k, "modelo": "RandomForest"},
                  mets, {"tipo": "supervisado_smote"})

    print(f"\nExperimentos registrados en {args.tracking_uri}")
    print(f"Experimento: '{EXPERIMENT}'")


if __name__ == "__main__":
    main()