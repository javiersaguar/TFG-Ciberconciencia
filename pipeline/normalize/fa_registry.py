"""Despachador FA separado: conserva intacto el registro Windows de F3."""
from pipeline.normalize.comiset import normalize_comiset
from pipeline.normalize.zeek import normalize_zeek
from pipeline.normalize.registry import normalize as normalize_windows


def normalize(event, dataset_id=None, ordinal=None):
    if not isinstance(event, dict):
        raise ValueError("El evento no es objeto JSON")
    kind = event.get("_tfg_input_format")
    if kind == "zeek":
        return normalize_zeek(event, dataset_id=dataset_id, ordinal=ordinal)
    if kind == "comiset":
        return normalize_comiset(event, dataset_id=dataset_id, ordinal=ordinal)
    if kind is not None:
        raise ValueError(f"Formato FA desconocido: {kind!r}")
    return normalize_windows(event, dataset_id=dataset_id, ordinal=ordinal)
