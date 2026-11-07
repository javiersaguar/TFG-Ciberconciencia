"""Adaptador de entrada COMISET Elasticsearch a los mapeadores Windows actuales."""
from copy import deepcopy
from datetime import datetime, timezone

from pipeline.normalize.registry import normalize as normalize_windows

ALIASES = {
    "Image": "process_path", "ProcessId": "process_id", "ProcessGuid": "process_guid",
    "ParentImage": "process_parent_path", "ParentProcessId": "process_parent_id",
    "ParentProcessGuid": "process_parent_guid", "User": "user_account",
    "TargetProcessId": "target_process_id", "TargetProcessGUID": "target_process_guid",
    "SourceProcessGUID": "process_guid", "CreationUtcTime": "file_creation_time",
}


def adapt_comiset(event):
    source = event.get("_source")
    if not isinstance(source, dict):
        raise ValueError("COMISET sin objeto _source")
    if not event.get("_id"):
        raise ValueError("COMISET sin identidad _id")
    raw = deepcopy(source)
    host = event.get("Hostname") or source.get("host_name")
    if not isinstance(host, str) or not host:
        raise ValueError("COMISET sin host")
    raw["Hostname"] = host
    raw["Channel"] = source.get("log_name")
    try:
        raw["EventID"] = int(source["event_id"])
        raw["RecordNumber"] = int(source["record_number"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("COMISET sin event_id/record_number numéricos") from exc
    stamp = source.get("event_original_time")
    if not isinstance(stamp, str):
        raise ValueError("COMISET sin event_original_time")
    try:
        instant = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("COMISET event_original_time inválido") from exc
    if instant.tzinfo is None:
        raise ValueError("COMISET event_original_time sin zona explícita")
    raw["TimeCreated"] = instant.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    for canonical, alias in ALIASES.items():
        if canonical not in raw and alias in source:
            raw[canonical] = source[alias]
    if raw["EventID"] in (8, 10):
        # Estos eventos usan SourceImage/SourceProcessId y no Image/ProcessId.
        for canonical, alias in (("SourceImage", "process_path"), ("SourceProcessId", "process_id"),
                                 ("TargetImage", "target_process_path")):
            if canonical not in raw and alias in source:
                raw[canonical] = source[alias]
    if "Hashes" not in raw:
        hashes = [f"{algorithm.upper()}={source[field]}" for algorithm, field in
                  (("md5", "hash_md5"), ("sha1", "hash_sha1"), ("sha256", "hash_sha256"))
                  if source.get(field)]
        if hashes:
            raw["Hashes"] = ",".join(hashes)
    return raw


def normalize_comiset(event, dataset_id=None, ordinal=None):
    adapted = adapt_comiset(event)
    result = normalize_windows(adapted, dataset_id=dataset_id, ordinal=ordinal)
    result["tfg"]["time_source"] = "comiset.event_original_time"
    result["tfg"]["source_uid"] = event["_id"]
    result["unmapped"]["comiset_source"] = deepcopy(event["_source"])
    result["unmapped"]["source_ref"] = {
        "_index": event.get("_index"), "_id": event["_id"],
        **event.get("_tfg_source_ref", {}),
    }
    return result
