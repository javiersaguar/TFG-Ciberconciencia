"""Mapeadores de eventos Sysmon a OCSF."""
from pipeline.normalize.ocsf_common import (
    base_event, CAT_SYSTEM, CLASS_PROCESS,
)

# GrantedAccess sospechosos sobre LSASS (lectura de memoria / acceso total)
# 0x1010=VM_READ, 0x1410, 0x1438, 0x143a, 0x1fffff=ALL_ACCESS
LSASS_SUSPICIOUS_ACCESS = {"0x1010", "0x1410", "0x1438", "0x143a", "0x1fffff"}


def map_sysmon_10(event):
    """Sysmon EventID 10 - ProcessAccess -> OCSF Process Activity (1007).

    Un proceso abre un handle contra otro. Es la senal canonica del volcado
    de LSASS (T1003.001) cuando el objetivo es lsass.exe.
    """
    ocsf = base_event(event, CLASS_PROCESS, CAT_SYSTEM, activity_id=3)  # 3 = Open
    ocsf["type_name"] = "Process Activity: Open"

    source_image = event.get("SourceImage", "")
    target_image = event.get("TargetImage", "")
    granted = str(event.get("GrantedAccess", ""))

    # actor = quien accede ; process = a quien se accede
    ocsf["actor"] = {
        "process": {
            "name": source_image.split("\\")[-1] if source_image else None,
            "pid": _to_int(event.get("SourceProcessId")),
            "file": {"path": source_image or None},
        }
    }
    ocsf["process"] = {
        "name": target_image.split("\\")[-1] if target_image else None,
        "pid": _to_int(event.get("TargetProcessId")),
        "file": {"path": target_image or None},
    }

    # Senales para la deteccion posterior (Sigma / CEP)
    is_lsass = "lsass.exe" in target_image.lower()
    ocsf["unmapped"] = {
        "GrantedAccess": granted,
        "CallTrace": event.get("CallTrace"),
        "SourceUser": event.get("SourceUser"),
        "TargetUser": event.get("TargetUser"),
    }
    ocsf["tfg"]["signal_lsass_access"] = is_lsass
    ocsf["tfg"]["signal_suspicious_access"] = is_lsass and granted in LSASS_SUSPICIOUS_ACCESS

    return ocsf


def _to_int(value):
    """Convierte PIDs que pueden venir en decimal o hex ('0x12d8')."""
    if value is None:
        return None
    try:
        return int(str(value), 0)
    except (ValueError, TypeError):
        return None