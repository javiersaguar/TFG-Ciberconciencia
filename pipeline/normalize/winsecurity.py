"""Mapeadores del canal Security de Windows a OCSF."""
from pipeline.normalize.ocsf_common import (
    base_event, CAT_SYSTEM, CAT_NETWORK, CAT_IAM,
    CLASS_PROCESS, CLASS_NETWORK, CLASS_EVENT_LOG, CLASS_AUTHENTICATION,
)


def map_sec_4688(event):
    """4688 - A new process has been created -> Process Activity, Launch."""
    ocsf = base_event(event, CLASS_PROCESS, CAT_SYSTEM, activity_id=1)
    ocsf["type_name"] = "Process Activity: Launch"

    new_image = event.get("NewProcessName", "")
    parent = event.get("ParentProcessName", "")

    ocsf["process"] = {
        "name": new_image.split("\\")[-1] if new_image else None,
        "pid": _to_int(event.get("NewProcessId")),
        "cmd_line": event.get("CommandLine"),
        "file": {"path": new_image or None},
        "parent_process": {
            "name": parent.split("\\")[-1] if parent else None,
            "pid": _to_int(event.get("ProcessId")),
            "file": {"path": parent or None},
        },
    }
    ocsf["actor"] = {"user": {
        "name": event.get("SubjectUserName"),
        "domain": event.get("SubjectDomainName"),
        "uid": event.get("SubjectUserSid"),
    }}
    ocsf["unmapped"] = {
        "TokenElevationType": event.get("TokenElevationType"),
        "MandatoryLabel": event.get("MandatoryLabel"),
        "SubjectLogonId": event.get("SubjectLogonId"),
    }
    return ocsf


def map_sec_4689(event):
    """4689 - A process has exited -> Process Activity, Terminate."""
    ocsf = base_event(event, CLASS_PROCESS, CAT_SYSTEM, activity_id=2)
    ocsf["type_name"] = "Process Activity: Terminate"
    image = event.get("ProcessName", "")
    ocsf["process"] = {
        "name": image.split("\\")[-1] if image else None,
        "pid": _to_int(event.get("ProcessId")),
        "file": {"path": image or None},
        "exit_code": _to_int(event.get("Status")),
    }
    ocsf["actor"] = {"user": {
        "name": event.get("SubjectUserName"),
        "domain": event.get("SubjectDomainName"),
    }}
    return ocsf


def map_sec_handle(event):
    """4656 / 4663 / 4658 / 4690 - Acceso a objeto (handle).

    Es la vision de la auditoria de Windows del mismo acceso que Sysmon 10:
    fuente independiente para correlacion cruzada.
    """
    event_id = int(event.get("EventID"))
    activity = {4656: 3, 4663: 3, 4658: 4, 4690: 0}.get(event_id, 0)
    ocsf = base_event(event, CLASS_PROCESS, CAT_SYSTEM, activity_id=activity)
    ocsf["type_name"] = f"Object Handle Activity ({event_id})"

    proc_name = event.get("ProcessName", "")
    object_name = event.get("ObjectName", "") or ""

    ocsf["actor"] = {
        "process": {
            "name": proc_name.split("\\")[-1] if proc_name else None,
            "pid": _to_int(event.get("ProcessId")),
            "file": {"path": proc_name or None},
        },
        "user": {
            "name": event.get("SubjectUserName"),
            "domain": event.get("SubjectDomainName"),
            "uid": event.get("SubjectUserSid"),
        },
    }
    ocsf["unmapped"] = {
        "ObjectName": object_name,
        "ObjectType": event.get("ObjectType"),
        "ObjectServer": event.get("ObjectServer"),
        "HandleId": event.get("HandleId"),
        "AccessMask": event.get("AccessMask"),
        "AccessList": event.get("AccessList"),
    }
    # Correlacion cruzada: mismo indicio que Sysmon 10
    ocsf["tfg"]["signal_lsass_access"] = "lsass.exe" in object_name.lower()
    return ocsf


def map_sec_1102(event):
    """1102 - The audit log was cleared -> Event Log Activity (1008).

    Senal de anti-forense / defense evasion (T1070.001).
    """
    ocsf = base_event(event, CLASS_EVENT_LOG, CAT_SYSTEM, activity_id=4)  # 4 = Clear
    ocsf["type_name"] = "Event Log Activity: Clear"
    ocsf["severity_id"] = 4  # High: borrar logs nunca es rutina
    ocsf["actor"] = {"user": {
        "name": event.get("SubjectUserName"),
        "domain": event.get("SubjectDomainName"),
        "uid": event.get("SubjectUserSid"),
    }}
    ocsf["unmapped"] = {"SubjectLogonId": event.get("SubjectLogonId")}
    ocsf["tfg"]["signal_log_cleared"] = True
    return ocsf


def map_sec_filtering(event):
    """5156 / 5158 - Windows Filtering Platform -> Network Activity (4001)."""
    event_id = int(event.get("EventID"))
    ocsf = base_event(event, CLASS_NETWORK, CAT_NETWORK, activity_id=1)
    ocsf["type_name"] = "Network Activity: Open"
    ocsf["metadata"]["profiles"] = ["host", "network"]

    app = event.get("Application", "") or ""
    ocsf["src_endpoint"] = {
        "ip": event.get("SourceAddress"),
        "port": _to_int(event.get("SourcePort")),
    }
    ocsf["dst_endpoint"] = {
        "ip": event.get("DestAddress"),
        "port": _to_int(event.get("DestPort")),
    }
    ocsf["connection_info"] = {
        "protocol_num": _to_int(event.get("Protocol")),
        "direction_id": 1 if str(event.get("Direction", "")).lower().startswith("%%14592") else 2,
    }
    ocsf["actor"] = {"process": {
        "pid": _to_int(event.get("ProcessId")),
        "file": {"path": app or None},
    }}
    ocsf["unmapped"] = {"FilterRTID": event.get("FilterRTID"), "LayerName": event.get("LayerName")}
    return ocsf


def map_sec_4624(event):
    """4624 - An account was successfully logged on -> Authentication (3002)."""
    ocsf = base_event(event, CLASS_AUTHENTICATION, CAT_IAM, activity_id=1)  # 1 = Logon
    ocsf["type_name"] = "Authentication: Logon"
    ocsf["status_id"] = 1  # Success
    ocsf["user"] = {
        "name": event.get("TargetUserName"),
        "domain": event.get("TargetDomainName"),
        "uid": event.get("TargetUserSid"),
    }
    ocsf["logon_type_id"] = _to_int(event.get("LogonType"))
    ocsf["src_endpoint"] = {
        "ip": event.get("IpAddress"),
        "hostname": event.get("WorkstationName"),
    }
    ocsf["unmapped"] = {
        "LogonProcessName": event.get("LogonProcessName"),
        "AuthenticationPackageName": event.get("AuthenticationPackageName"),
        "TargetLogonId": event.get("TargetLogonId"),
    }
    # Senal: logon remoto (tipo 3) o con credenciales explicitas (tipo 9)
    lt = _to_int(event.get("LogonType"))
    ocsf["tfg"]["signal_remote_logon"] = lt in (3, 10)
    return ocsf


def map_sec_4625(event):
    """4625 - An account failed to log on -> Authentication (3002), fallo."""
    ocsf = base_event(event, CLASS_AUTHENTICATION, CAT_IAM, activity_id=1)
    ocsf["type_name"] = "Authentication: Logon"
    ocsf["status_id"] = 2  # Failure
    ocsf["severity_id"] = 2
    ocsf["user"] = {
        "name": event.get("TargetUserName"),
        "domain": event.get("TargetDomainName"),
    }
    ocsf["logon_type_id"] = _to_int(event.get("LogonType"))
    ocsf["src_endpoint"] = {
        "ip": event.get("IpAddress"),
        "hostname": event.get("WorkstationName"),
    }
    ocsf["unmapped"] = {
        "FailureReason": event.get("FailureReason"),
        "SubStatus": event.get("SubStatus"),
    }
    return ocsf


def _to_int(value):
    if value is None:
        return None
    try:
        return int(str(value), 0)
    except (ValueError, TypeError):
        return None

def map_sec_privileges(event):
    """4672 / 4673 / 4703 - Privilegios especiales -> Authorize Session (3003)."""
    from pipeline.normalize.ocsf_common import CLASS_AUTHORIZE
    event_id = int(event.get("EventID"))
    ocsf = base_event(event, CLASS_AUTHORIZE, CAT_IAM, activity_id=1)
    ocsf["type_name"] = f"Authorize Session ({event_id})"
    ocsf["user"] = {
        "name": event.get("SubjectUserName"),
        "domain": event.get("SubjectDomainName"),
        "uid": event.get("SubjectUserSid"),
    }
    privs = event.get("PrivilegeList") or event.get("EnabledPrivilegeList") or ""
    ocsf["privileges"] = [p.strip() for p in str(privs).replace("\n", " ").split() if p.strip()][:20]
    ocsf["unmapped"] = {
        "PrivilegeList": str(privs)[:500],
        "ProcessName": event.get("ProcessName"),
        "Service": event.get("Service"),
    }
    ocsf["tfg"]["signal_special_privileges"] = "SeDebugPrivilege" in str(privs)
    return ocsf


def map_sec_logoff(event):
    """4634 / 4647 - Cierre de sesion -> Authentication (3002), Logoff."""
    ocsf = base_event(event, CLASS_AUTHENTICATION, CAT_IAM, activity_id=2)  # 2 = Logoff
    ocsf["type_name"] = "Authentication: Logoff"
    ocsf["user"] = {
        "name": event.get("TargetUserName"),
        "domain": event.get("TargetDomainName"),
        "uid": event.get("TargetUserSid"),
    }
    ocsf["logon_type_id"] = _to_int(event.get("LogonType"))
    return ocsf


def map_sec_group_membership(event):
    """4627 - Informacion de pertenencia a grupos -> Authentication (3002)."""
    ocsf = base_event(event, CLASS_AUTHENTICATION, CAT_IAM, activity_id=1)
    ocsf["type_name"] = "Authentication: Group Membership"
    ocsf["user"] = {
        "name": event.get("TargetUserName"),
        "domain": event.get("TargetDomainName"),
    }
    ocsf["unmapped"] = {
        "GroupMembership": str(event.get("GroupMembership"))[:2000],
        "TargetLogonId": event.get("TargetLogonId"),
    }
    return ocsf


def map_sec_audit_policy(event):
    """4670 / 4945 / 4907 - Cambios de politica de auditoria o permisos.

    Se mapean a Event Log Activity por su relacion con la integridad del
    registro de auditoria. Senal de posible manipulacion defensiva.
    """
    event_id = int(event.get("EventID"))
    ocsf = base_event(event, CLASS_EVENT_LOG, CAT_SYSTEM, activity_id=0)
    ocsf["type_name"] = f"Audit Policy Change ({event_id})"
    ocsf["severity_id"] = 3
    ocsf["actor"] = {"user": {
        "name": event.get("SubjectUserName"),
        "domain": event.get("SubjectDomainName"),
    }}
    ocsf["unmapped"] = {
        "ObjectName": event.get("ObjectName"),
        "ObjectType": event.get("ObjectType"),
        "OldSd": str(event.get("OldSd"))[:1000],
        "NewSd": str(event.get("NewSd"))[:1000],
        "RuleName": event.get("RuleName"),
    }
    ocsf["tfg"]["signal_audit_policy_change"] = True
    return ocsf