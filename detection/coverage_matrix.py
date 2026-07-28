"""Genera capas de ATT&CK Navigator con la cobertura de deteccion del sistema.

Produce dos capas:
  - potencial : tecnicas cubiertas por las reglas cargadas
  - observada : tecnicas efectivamente detectadas en los datasets procesados
"""
import argparse
import collections
import json

from detection.loader import load_rules, rule_summary

DEFAULT_RULE_DIRS = [
    "process_creation", "process_access", "image_load", "file/file_event",
    "network_connection", "registry", "builtin", "powershell",
]

# Escala de color: de menos a mas reglas/detecciones
GRADIENT = {
    "colors": ["#ffe8e8", "#e60d0d"],
    "minValue": 0,
    "maxValue": 10,
}


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--rules-base", default="data/sigma/rules/windows")
    p.add_argument("--rule-dirs", nargs="*", default=None)
    p.add_argument("--ch-host", default="127.0.0.1")
    p.add_argument("--out-dir", default="eval/attack-coverage")
    p.add_argument("--no-clickhouse", action="store_true",
                   help="Genera solo la capa potencial")
    return p.parse_args()


def build_layer(name, description, technique_counts, max_value):
    """Construye una capa en formato ATT&CK Navigator v4."""
    techniques = []
    for tid, count in sorted(technique_counts.items()):
        # Navigator espera el formato TXXXX o TXXXX.NNN
        techniques.append({
            "techniqueID": tid,
            "score": count,
            "comment": f"{count} regla(s)" if "potencial" in name else f"{count} alerta(s)",
            "enabled": True,
        })

    return {
        "name": name,
        "versions": {"attack": "19", "navigator": "5.1.0", "layer": "4.5"},        "domain": "enterprise-attack",
        "description": description,
        "techniques": techniques,
        "gradient": {**GRADIENT, "maxValue": max(max_value, 1)},
        "legendItems": [],
        "showTacticRowBackground": True,
        "tacticRowBackground": "#dddddd",
        "sorting": 3,
        "layout": {"layout": "side", "showID": True, "showName": True},
        "hideDisabled": True,
    }


def coverage_from_rules(args):
    """Tecnicas cubiertas por las reglas cargadas."""
    dirs = args.rule_dirs or DEFAULT_RULE_DIRS
    paths = [f"{args.rules_base}/{d}" for d in dirs]
    rules, errors = load_rules(paths)

    counts = collections.Counter()
    por_tactica = collections.Counter()
    sin_tecnica = 0

    for r in rules:
        s = rule_summary(r)
        if not s["techniques"]:
            sin_tecnica += 1
        for t in s["techniques"]:
            counts[t] += 1
        for t in s["tactics"]:
            por_tactica[t] += 1

    print(f"Reglas cargadas        : {len(rules)}  (errores: {len(errors)})")
    print(f"  sin tecnica asignada : {sin_tecnica}")
    print(f"Tecnicas cubiertas     : {len(counts)}")
    print(f"  subtecnicas          : {sum(1 for t in counts if '.' in t)}")
    print()
    print("Top tacticas por numero de reglas:")
    for t, n in por_tactica.most_common(10):
        print(f"  {n:5d}  {t}")
    return counts


def coverage_from_alerts(args):
    """Tecnicas efectivamente detectadas en los datasets procesados."""
    import clickhouse_connect
    client = clickhouse_connect.get_client(
        host=args.ch_host, port=8123, username="tfg", password="tfg", database="tfg"
    )
    rows = client.query(
        "SELECT arrayJoin(technique_ids) AS t, count() AS n "
        "FROM tfg.alerts GROUP BY t ORDER BY n DESC"
    ).result_rows
    counts = collections.Counter({t: n for t, n in rows})

    print()
    print(f"Tecnicas detectadas    : {len(counts)}")
    print("Top tecnicas observadas:")
    for t, n in counts.most_common(10):
        print(f"  {n:5d}  {t}")
    return counts


def main():
    args = parse_args()
    import os
    os.makedirs(args.out_dir, exist_ok=True)

    potencial = coverage_from_rules(args)
    layer = build_layer(
        "TFG - Cobertura potencial",
        "Tecnicas ATT&CK cubiertas por el conjunto de reglas cargadas en la plataforma. "
        "La puntuacion indica el numero de reglas que detectan cada tecnica.",
        potencial,
        max_value=max(potencial.values()) if potencial else 1,
    )
    path = f"{args.out_dir}/cobertura-potencial.json"
    with open(path, "w") as fh:
        json.dump(layer, fh, indent=2)
    print(f"\nGuardado: {path}")

    if args.no_clickhouse:
        return

    try:
        observada = coverage_from_alerts(args)
    except Exception as exc:
        print(f"\n[WARN] No se pudo consultar ClickHouse: {exc}")
        return

    layer2 = build_layer(
        "TFG - Cobertura observada",
        "Tecnicas ATT&CK efectivamente detectadas sobre los conjuntos de datos procesados. "
        "La puntuacion indica el numero de alertas generadas por cada tecnica.",
        observada,
        max_value=max(observada.values()) if observada else 1,
    )
    path2 = f"{args.out_dir}/cobertura-observada.json"
    with open(path2, "w") as fh:
        json.dump(layer2, fh, indent=2)
    print(f"Guardado: {path2}")

    # Resumen comparativo
    solo_potencial = set(potencial) - set(observada)
    print()
    print("Resumen")
    print(f"  Tecnicas con regla disponible : {len(potencial)}")
    print(f"  Tecnicas observadas en datos  : {len(observada)}")
    print(f"  Con regla pero no observadas  : {len(solo_potencial)}")
    print(f"  Tasa de activacion            : {len(observada)/len(potencial)*100:.1f} %")


if __name__ == "__main__":
    main()