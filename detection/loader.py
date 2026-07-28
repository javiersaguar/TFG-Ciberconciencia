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

# Tacticas de MITRE ATT&CK Enterprise (v19)
ATTACK_TACTICS = {
    "reconnaissance", "resource-development", "initial-access", "execution",
    "persistence", "privilege-escalation", "stealth", "defense-evasion",
    "defense-impairment", "credential-access", "discovery", "lateral-movement",
    "collection", "command-and-control", "exfiltration", "impact",
}


def rule_summary(rule):
    """Extrae los metadatos relevantes de una regla para la alerta.

    Las etiquetas de Sigma mezclan tres cosas bajo el prefijo 'attack.':
    tecnicas (tNNNN), software (sNNNN) y tacticas (nombre). Ademas, algunas
    reglas de la comunidad usan nombres de tactica no estandar. Se clasifican
    por separado para no contaminar el mapeo ATT&CK.
    """
    techniques, tactics, software, otros = [], [], [], []

    for tag in rule.tags:
        t = str(tag).lower()
        if not t.startswith("attack."):
            continue
        valor = t.replace("attack.", "", 1)

        if valor.startswith("t") and valor[1:2].isdigit():
            techniques.append(valor.upper())
        elif valor.startswith("s") and valor[1:2].isdigit():
            software.append(valor.upper())
        elif valor.startswith("g") and valor[1:2].isdigit():
            otros.append(valor.upper())          # grupos de actores
        elif valor in ATTACK_TACTICS:
            tactics.append(valor)
        else:
            otros.append(valor)                  # etiquetas no estandar

    return {
        "rule_id": str(rule.id) if rule.id else None,
        "rule_title": rule.title,
        "rule_level": str(rule.level).lower() if rule.level else "medium",
        "rule_status": str(rule.status).lower() if rule.status else None,
        "techniques": techniques,
        "tactics": tactics,
        "software": software,
        "other_tags": otros,
        "logsource_category": rule.logsource.category,
        "logsource_product": rule.logsource.product,
        "logsource_service": rule.logsource.service,
    }