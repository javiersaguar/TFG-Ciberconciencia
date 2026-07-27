"""Inspeccion de las caracteristicas por ventana antes de entrenar."""
import argparse

from ml.anomaly.features import (
    get_client, load_window_features, add_alert_labels, feature_columns,
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=int, default=5)
    args = ap.parse_args()

    client = get_client()
    df = load_window_features(client, minutes=args.minutes)
    df = add_alert_labels(client, df, minutes=args.minutes)

    feats = feature_columns(df)
    print(f"Ventanas de {args.minutes} min : {len(df)}")
    print(f"Caracteristicas          : {len(feats)}")
    print(f"Datasets                 : {df['dataset_id'].nunique()}")
    print(f"Hosts                    : {df['host'].nunique()}")
    print()
    print(f"Ventanas con alerta      : {(df['n_alertas'] > 0).sum()}")
    print(f"Ventanas sin alerta      : {(df['n_alertas'] == 0).sum()}")
    print()
    print("Comparacion de medias (con alerta vs sin alerta):")
    con = df[df["n_alertas"] > 0][feats].mean()
    sin = df[df["n_alertas"] == 0][feats].mean()
    comp = (con - sin).abs().sort_values(ascending=False).head(12)
    print(f"  {'caracteristica':24} {'con alerta':>12} {'sin alerta':>12}")
    for c in comp.index:
        print(f"  {c:24} {con[c]:12.2f} {sin[c]:12.2f}")


if __name__ == "__main__":
    main()