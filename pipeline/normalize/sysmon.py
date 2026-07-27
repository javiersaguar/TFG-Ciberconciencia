"""Mapeadores de eventos Sysmon a OCSF."""
from pipeline.normalize.ocsf_common import (
    base_event, CAT_SYSTEM, CAT_NETWORK,
    CLASS_PROCESS, CLASS_FILE_SYSTEM, CLASS_NETWORK, CLASS_MODULE,
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

def map_sysmon_1(event):
    """Sysmon 1 - Process Create -> Process Activity (1007), activity 1 = Launch."""
    ocsf = base_event(event, CLASS_PROCESS, CAT_SYSTEM, activity_id=1)
    ocsf["type_name"] = "Process Activity: Launch"

    image = event.get("Image", "")
    parent = event.get("ParentImage", "")

    ocsf["process"] = {
        "name": image.split("\\")[-1] if image else None,
        "pid": _to_int(event.get("ProcessId")),
        "cmd_line": event.get("CommandLine"),
        "file": {
            "path": image or None,
            "hashes": _parse_hashes(event.get("Hashes")),
        },
        "user": {"name": event.get("User")},
        "parent_process": {
            "name": parent.split("\\")[-1] if parent else None,
            "pid": _to_int(event.get("ParentProcessId")),
            "cmd_line": event.get("ParentCommandLine"),
            "file": {"path": parent or None},
        },
    }
    ocsf["actor"] = {"user": {"name": event.get("User")}}
    ocsf["unmapped"] = {
        "IntegrityLevel": event.get("IntegrityLevel"),
        "CurrentDirectory": event.get("CurrentDirectory"),
        "LogonId": event.get("LogonId"),
        "OriginalFileName": event.get("OriginalFileName"),
    }
    return ocsf


def map_sysmon_5(event):
    """Sysmon 5 - Process Terminated -> Process Activity (1007), activity 2 = Terminate."""
    ocsf = base_event(event, CLASS_PROCESS, CAT_SYSTEM, activity_id=2)
    ocsf["type_name"] = "Process Activity: Terminate"
    image = event.get("Image", "")
    ocsf["process"] = {
        "name": image.split("\\")[-1] if image else None,
        "pid": _to_int(event.get("ProcessId")),
        "file": {"path": image or None},
        "user": {"name": event.get("User")},
    }
    return ocsf


def map_sysmon_11(event):
    """Sysmon 11 - File Create -> File System Activity (1001), activity 1 = Create."""
    ocsf = base_event(event, CLASS_FILE_SYSTEM, CAT_SYSTEM, activity_id=1)
    ocsf["type_name"] = "File System Activity: Create"

    target = event.get("TargetFilename", "")
    image = event.get("Image", "")

    ocsf["file"] = {
        "name": target.split("\\")[-1] if target else None,
        "path": target or None,
        "type_id": 1,  # Regular File
    }
    ocsf["actor"] = {
        "process": {
            "name": image.split("\\")[-1] if image else None,
            "pid": _to_int(event.get("ProcessId")),
            "file": {"path": image or None},
        }
    }
    # Senal: volcado de memoria escrito a disco
    low = target.lower()
    ocsf["tfg"]["signal_dump_file"] = low.endswith(".dmp") or "dump" in low
    return ocsf


def map_sysmon_3(event):
    """Sysmon 3 - Network Connection -> Network Activity (4001), activity 1 = Open."""
    ocsf = base_event(event, CLASS_NETWORK, CAT_NETWORK, activity_id=1)
    ocsf["type_name"] = "Network Activity: Open"
    ocsf["metadata"]["profiles"] = ["host", "network"]

    image = event.get("Image", "")
    ocsf["src_endpoint"] = {
        "ip": event.get("SourceIp"),
        "port": _to_int(event.get("SourcePort")),
        "hostname": event.get("SourceHostname"),
    }
    ocsf["dst_endpoint"] = {
        "ip": event.get("DestinationIp"),
        "port": _to_int(event.get("DestinationPort")),
        "hostname": event.get("DestinationHostname"),
    }
    ocsf["connection_info"] = {
        "protocol_name": event.get("Protocol"),
        "direction_id": 2 if str(event.get("Initiated")).lower() == "true" else 1,
    }
    ocsf["actor"] = {
        "process": {
            "name": image.split("\\")[-1] if image else None,
            "pid": _to_int(event.get("ProcessId")),
            "file": {"path": image or None},
        }
    }
    return ocsf

def map_sysmon_7(event):
    """Sysmon 7 - Image Loaded -> Module Activity (1005), activity 1 = Load."""
    ocsf = base_event(event, CLASS_MODULE, CAT_SYSTEM, activity_id=1)
    ocsf["type_name"] = "Module Activity: Load"

    image = event.get("Image", "")
    loaded = event.get("ImageLoaded", "")

    ocsf["module"] = {
        "base_address": None,
        "file": {
            "name": loaded.split("\\")[-1] if loaded else None,
            "path": loaded or None,
            "hashes": _parse_hashes(event.get("Hashes")),
            "signature": {
                "certificate": {"subject": event.get("Signature")},
                "state_id": 1 if str(event.get("Signed")).lower() == "true" else 2,
            },
        },
        "type": "Shared Library",
    }
    ocsf["actor"] = {
        "process": {
            "name": image.split("\\")[-1] if image else None,
            "pid": _to_int(event.get("ProcessId")),
            "file": {"path": image or None},
        }
    }
    ocsf["unmapped"] = {
        "SignatureStatus": event.get("SignatureStatus"),
        "OriginalFileName": event.get("OriginalFileName"),
        "Company": event.get("Company"),
    }
    # Senal: DLL de volcado/depuracion cargada por un proceso inusual
    low = loaded.lower()
    ocsf["tfg"]["signal_dump_module"] = any(
        d in low for d in ("comsvcs.dll", "dbgcore.dll", "dbghelp.dll")
    )
    return ocsf


def map_sysmon_registry(event):
    """Sysmon 12/13/14 - Registry events.

    OCSF (esquema base) no define una clase de registro de Windows, asi que
    se mapean a Process Activity conservando TODO el detalle en 'unmapped'.
    Decision documentada: revisar si una extension Windows de OCSF la anade.
    """
    ocsf = base_event(event, CLASS_PROCESS, CAT_SYSTEM, activity_id=0)
    ocsf["type_name"] = "Registry Activity (unmapped in OCSF core)"

    image = event.get("Image", "")
    ocsf["actor"] = {
        "process": {
            "name": image.split("\\")[-1] if image else None,
            "pid": _to_int(event.get("ProcessId")),
            "file": {"path": image or None},
        }
    }
    ocsf["unmapped"] = {
        "EventType": event.get("EventType"),
        "TargetObject": event.get("TargetObject"),
        "Details": event.get("Details"),
        "NewName": event.get("NewName"),
    }
    ocsf["tfg"]["registry_key"] = event.get("TargetObject")
    return ocsf


def _parse_hashes(raw):
    """Convierte 'SHA1=ABC,MD5=DEF' al formato de hashes de OCSF."""
    if not raw:
        return []
    algos = {"md5": 1, "sha1": 2, "sha256": 3}
    out = []
    for part in str(raw).split(","):
        if "=" not in part:
            continue
        name, _, value = part.partition("=")
        key = name.strip().lower()
        if key in algos:
            out.append({"algorithm_id": algos[key], "value": value.strip()})
    return out

def _to_int(value):
    """Convierte PIDs que pueden venir en decimal o hex ('0x12d8')."""
    if value is None:
        return None
    try:
        return int(str(value), 0)
    except (ValueError, TypeError):
        return None

def map_sysmon_2(event):
    """Sysmon 2 - File creation time changed -> File System Activity.

    El cambio de marca temporal de un fichero es una tecnica de anti-forense
    (timestomping, T1070.006).
    """
    ocsf = base_event(event, CLASS_FILE_SYSTEM, CAT_SYSTEM, activity_id=0)
    ocsf["type_name"] = "File System Activity: Timestamp Change"
    ocsf["severity_id"] = 3
    image = event.get("Image", "")
    target = event.get("TargetFilename", "")
    ocsf["file"] = {"name": target.split("\\")[-1] if target else None, "path": target or None}
    ocsf["actor"] = {"process": {
        "name": image.split("\\")[-1] if image else None,
        "pid": _to_int(event.get("ProcessId")),
        "file": {"path": image or None},
    }}
    ocsf["unmapped"] = {
        "CreationUtcTime": event.get("CreationUtcTime"),
        "PreviousCreationUtcTime": event.get("PreviousCreationUtcTime"),
    }
    ocsf["tfg"]["signal_timestomp"] = True
    return ocsf


def map_sysmon_8(event):
    """Sysmon 8 - CreateRemoteThread -> Process Activity (inyeccion, T1055)."""
    ocsf = base_event(event, CLASS_PROCESS, CAT_SYSTEM, activity_id=4)  # 4 = Inject
    ocsf["type_name"] = "Process Activity: Inject"
    ocsf["severity_id"] = 3
    source = event.get("SourceImage", "")
    target = event.get("TargetImage", "")
    ocsf["actor"] = {"process": {
        "name": source.split("\\")[-1] if source else None,
        "pid": _to_int(event.get("SourceProcessId")),
        "file": {"path": source or None},
    }}
    ocsf["process"] = {
        "name": target.split("\\")[-1] if target else None,
        "pid": _to_int(event.get("TargetProcessId")),
        "file": {"path": target or None},
    }
    ocsf["unmapped"] = {
        "StartAddress": event.get("StartAddress"),
        "StartModule": event.get("StartModule"),
        "StartFunction": event.get("StartFunction"),
        "NewThreadId": event.get("NewThreadId"),
    }
    ocsf["tfg"]["signal_remote_thread"] = True
    return ocsf


def map_sysmon_9(event):
    """Sysmon 9 - RawAccessRead -> File System Activity (acceso crudo a disco)."""
    ocsf = base_event(event, CLASS_FILE_SYSTEM, CAT_SYSTEM, activity_id=2)  # 2 = Read
    ocsf["type_name"] = "File System Activity: Raw Access Read"
    image = event.get("Image", "")
    ocsf["file"] = {"path": event.get("Device")}
    ocsf["actor"] = {"process": {
        "name": image.split("\\")[-1] if image else None,
        "pid": _to_int(event.get("ProcessId")),
        "file": {"path": image or None},
    }}
    ocsf["unmapped"] = {"Device": event.get("Device")}
    ocsf["tfg"]["signal_raw_disk_access"] = True
    return ocsf


def map_sysmon_18(event):
    """Sysmon 18 - Pipe connected -> Process Activity.

    Las tuberias con nombre son un canal habitual de comunicacion entre
    implantes y de movimiento lateral.
    """
    ocsf = base_event(event, CLASS_PROCESS, CAT_SYSTEM, activity_id=0)
    ocsf["type_name"] = "Named Pipe Activity"
    image = event.get("Image", "")
    ocsf["actor"] = {"process": {
        "name": image.split("\\")[-1] if image else None,
        "pid": _to_int(event.get("ProcessId")),
        "file": {"path": image or None},
    }}
    ocsf["unmapped"] = {
        "PipeName": event.get("PipeName"),
        "EventType": event.get("EventType"),
    }
    ocsf["tfg"]["pipe_name"] = event.get("PipeName")
    return ocsf


def map_sysmon_23(event):
    """Sysmon 23 - File Delete (archivado) -> File System Activity, Delete."""
    ocsf = base_event(event, CLASS_FILE_SYSTEM, CAT_SYSTEM, activity_id=4)  # 4 = Delete
    ocsf["type_name"] = "File System Activity: Delete"
    image = event.get("Image", "")
    target = event.get("TargetFilename", "")
    ocsf["file"] = {
        "name": target.split("\\")[-1] if target else None,
        "path": target or None,
        "hashes": _parse_hashes(event.get("Hashes")),
    }
    ocsf["actor"] = {"process": {
        "name": image.split("\\")[-1] if image else None,
        "pid": _to_int(event.get("ProcessId")),
        "file": {"path": image or None},
    }}
    ocsf["unmapped"] = {
        "IsExecutable": event.get("IsExecutable"),
        "Archived": event.get("Archived"),
        "User": event.get("User"),
    }
    ocsf["tfg"]["signal_file_deleted"] = True
    return ocsf