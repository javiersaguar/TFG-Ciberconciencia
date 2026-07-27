"""Despachador: (Channel, EventID) -> funcion de mapeo."""
from pipeline.normalize import sysmon, winsecurity
from pipeline.normalize import sysmon, winsecurity, powershell

SECURITY_CHANNEL = "security"
SYSMON_CHANNEL = "microsoft-windows-sysmon/operational"

# Registro de mapeadores. Clave: (canal_normalizado, event_id)
MAPPERS = {
    (SYSMON_CHANNEL, 1): sysmon.map_sysmon_1,
    (SYSMON_CHANNEL, 3): sysmon.map_sysmon_3,
    (SYSMON_CHANNEL, 5): sysmon.map_sysmon_5,
    (SYSMON_CHANNEL, 7): sysmon.map_sysmon_7,
    (SYSMON_CHANNEL, 10): sysmon.map_sysmon_10,
    (SYSMON_CHANNEL, 11): sysmon.map_sysmon_11,
    (SYSMON_CHANNEL, 12): sysmon.map_sysmon_registry,
    (SYSMON_CHANNEL, 13): sysmon.map_sysmon_registry,
    (SYSMON_CHANNEL, 14): sysmon.map_sysmon_registry,
    (SECURITY_CHANNEL, 4688): winsecurity.map_sec_4688,
    (SECURITY_CHANNEL, 4689): winsecurity.map_sec_4689,
    (SECURITY_CHANNEL, 4656): winsecurity.map_sec_handle,
    (SECURITY_CHANNEL, 4663): winsecurity.map_sec_handle,
    (SECURITY_CHANNEL, 4658): winsecurity.map_sec_handle,
    (SECURITY_CHANNEL, 4690): winsecurity.map_sec_handle,
    (SECURITY_CHANNEL, 1102): winsecurity.map_sec_1102,
    (SECURITY_CHANNEL, 5156): winsecurity.map_sec_filtering,
    (SECURITY_CHANNEL, 5158): winsecurity.map_sec_filtering,
    (SECURITY_CHANNEL, 4624): winsecurity.map_sec_4624,
    (SECURITY_CHANNEL, 4625): winsecurity.map_sec_4625,
    ("microsoft-windows-powershell/operational", 4104): powershell.map_ps_script_block,
    ("microsoft-windows-powershell/operational", 4103): powershell.map_ps_module,
    ("windows powershell", 800): powershell.map_ps_classic,
    ("windows powershell", 400): powershell.map_ps_classic,
    ("windows powershell", 600): powershell.map_ps_classic,
    (SECURITY_CHANNEL, 5447): winsecurity.map_sec_filtering,
    (SECURITY_CHANNEL, 5154): winsecurity.map_sec_filtering,
    (SECURITY_CHANNEL, 5145): winsecurity.map_sec_filtering,
    (SYSMON_CHANNEL, 2): sysmon.map_sysmon_2,
    (SYSMON_CHANNEL, 8): sysmon.map_sysmon_8,
    (SYSMON_CHANNEL, 9): sysmon.map_sysmon_9,
    (SYSMON_CHANNEL, 18): sysmon.map_sysmon_18,
    (SYSMON_CHANNEL, 23): sysmon.map_sysmon_23,
    (SECURITY_CHANNEL, 4672): winsecurity.map_sec_privileges,
    (SECURITY_CHANNEL, 4673): winsecurity.map_sec_privileges,
    (SECURITY_CHANNEL, 4703): winsecurity.map_sec_privileges,
    (SECURITY_CHANNEL, 4634): winsecurity.map_sec_logoff,
    (SECURITY_CHANNEL, 4647): winsecurity.map_sec_logoff,
    (SECURITY_CHANNEL, 4627): winsecurity.map_sec_group_membership,
    (SECURITY_CHANNEL, 4670): winsecurity.map_sec_audit_policy,
    (SECURITY_CHANNEL, 4945): winsecurity.map_sec_audit_policy,
}


class UnmappedEvent(Exception):
    """No hay mapeador para este (canal, EventID)."""


def normalize(event, dataset_id=None):
    """Normaliza un evento crudo a OCSF.

    Lanza UnmappedEvent si no existe mapeador, para que el job lo derive a DLQ.
    """
    channel = str(event.get("Channel", "")).strip().lower()
    try:
        event_id = int(event.get("EventID"))
    except (TypeError, ValueError):
        raise UnmappedEvent("EventID ausente o no numerico")

    mapper = MAPPERS.get((channel, event_id))
    if mapper is None:
        raise UnmappedEvent(f"sin mapeador para ({channel}, {event_id})")

    ocsf = mapper(event)
    if dataset_id:
        ocsf["tfg"]["dataset_id"] = dataset_id
    return ocsf


def supported_keys():
    """Devuelve las combinaciones (canal, EventID) soportadas."""
    return sorted(MAPPERS.keys())