"""Carga de reglas Sigma y transformacion al esquema OCSF del proyecto."""
from pathlib import Path

from sigma.collection import SigmaCollection
from sigma.processing.pipeline import ProcessingPipeline

PIPELINE_PATH = Path(__file__).parent / "pipelines" / "ocsf-tfg.yml"


def load_pipeline(path=None):
    """Carga la pipeline de traduccion Sigma -> OCSF del proyecto."""
    path = Path(path) if path else PIPELINE_PATH
    return ProcessingPipeline.from_yaml(path.read_text(encoding="utf-8"))


def load_rules(paths, pipeline=None, verbose=False):
    """Carga reglas Sigma desde ficheros o directorios y les aplica la pipeline.

    Devuelve (reglas_ok, errores) donde errores es una lista de (ruta, motivo).
    """
    pipeline = pipeline or load_pipeline()

    files = []
    for p in paths:
        p = Path(p)
        if p.is_dir():
            files.extend(sorted(p.rglob("*.yml")))
        elif p.is_file():
            files.append(p)

    rules, errors = [], []
    for f in files:
        try:
            collection = SigmaCollection.from_yaml(f.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append((str(f), f"parseo: {type(exc).__name__}: {exc}"))
            continue

        for rule in collection.rules:
            try:
                pipeline.apply(rule)
                rules.append(rule)
            except Exception as exc:
                errors.append((str(f), f"pipeline: {type(exc).__name__}: {exc}"))

    if verbose:
        print(f"Reglas cargadas : {len(rules)}")
        print(f"Errores         : {len(errors)}")

    return rules, errors


def rule_summary(rule):
    """Extrae los metadatos relevantes de una regla para la alerta."""
    techniques, tactics = [], []
    for tag in rule.tags:
        t = str(tag).lower()
        if t.startswith("attack.t"):
            techniques.append(t.replace("attack.", "").upper())
        elif t.startswith("attack."):
            tactics.append(t.replace("attack.", ""))

    return {
        "rule_id": str(rule.id) if rule.id else None,
        "rule_title": rule.title,
        "rule_level": str(rule.level).lower() if rule.level else "medium",
        "rule_status": str(rule.status).lower() if rule.status else None,
        "techniques": techniques,
        "tactics": tactics,
        "logsource_category": rule.logsource.category,
        "logsource_product": rule.logsource.product,
        "logsource_service": rule.logsource.service,
    }