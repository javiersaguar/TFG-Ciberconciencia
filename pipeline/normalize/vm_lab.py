"""Adaptador del laboratorio propio de F2.3 (VM Windows 11 con Sysmon y Atomic Red Team) a los
mapeadores Windows actuales. Origen fa_vm.

La telemetría (telemetry_clean_*.json, una línea JSON por evento) ya viene plana, con los mismos
nombres de campo que los datasets de OTRF, pero tiene dos diferencias:

  - `TimeCreated` está en HORA LOCAL de la VM (Europe/Madrid; +2 h en la captura del 30-07-2026), y
    el normalizador lo lee como UTC. Se convierte a UTC con la zona declarada y se comprueba contra
    el `UtcTime` de Sysmon cuando existe: los 11.959 eventos de Sysmon tienen un desfase de 120 min
    exactos. Security 4688 y PowerShell 4104 no traen UtcTime y dependen solo de la zona.
  - No hay número de registro. La identidad es la línea del fichero de origen, que es estable y
    única.
"""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from pipeline.normalize.registry import normalize as normalize_windows

ZONA = ZoneInfo("Europe/Madrid")
TOLERANCIA_UTC = timedelta(minutes=5)   # Sysmon 3 (red) se escribe segundos después del UtcTime
FORMATO = "%Y-%m-%d %H:%M:%S.%f"


def _local(valor, campo):
    if not isinstance(valor, str):
        raise ValueError(f"VM sin {campo}")
    try:
        return datetime.strptime(valor, FORMATO)
    except ValueError as exc:
        raise ValueError(f"VM {campo} inválido: {valor!r}") from exc


def adapt_vm_lab(event):
    ref = event.get("_tfg_source_ref")
    if not isinstance(ref, dict) or not isinstance(ref.get("line"), int):
        raise ValueError("VM sin referencia de línea de origen")
    if not isinstance(event.get("Hostname"), str) or not event["Hostname"]:
        raise ValueError("VM sin host")
    raw = {k: v for k, v in deepcopy(event).items() if not k.startswith("_tfg_")}
    try:
        raw["EventID"] = int(event["EventID"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("VM sin EventID numérico") from exc
    instante = _local(event.get("TimeCreated"), "TimeCreated").replace(tzinfo=ZONA).astimezone(timezone.utc)
    if event.get("UtcTime"):
        sysmon = _local(event["UtcTime"], "UtcTime").replace(tzinfo=timezone.utc)
        if abs(instante - sysmon) > TOLERANCIA_UTC:
            raise ValueError(f"VM TimeCreated (zona {ZONA}) no cuadra con UtcTime: {instante - sysmon}")
    raw["TimeCreated"] = instante.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    raw["TimeCreatedLocal"] = event["TimeCreated"]
    raw["RecordNumber"] = ref["line"]
    return raw


def normalize_vm_lab(event, dataset_id=None, ordinal=None):
    result = normalize_windows(adapt_vm_lab(event), dataset_id=dataset_id, ordinal=ordinal)
    result["tfg"]["time_source"] = "vm_lab.TimeCreated(Europe/Madrid)"
    result["unmapped"]["source_ref"] = deepcopy(event["_tfg_source_ref"])
    return result
