"""Mapeadores de eventos de PowerShell a OCSF Script Activity (1009)."""
from pipeline.normalize.ocsf_common import base_event, CAT_SYSTEM, CLASS_SCRIPT


def map_ps_script_block(event):
    """PowerShell 4104 - Script Block Logging -> Script Activity (1009).

    Registra el bloque de codigo ejecutado. Es la fuente mas valiosa para
    detectar ofuscacion y comandos maliciosos.
    """
    ocsf = base_event(event, CLASS_SCRIPT, CAT_SYSTEM, activity_id=1)  # 1 = Execute
    ocsf["type_name"] = "Script Activity: Execute"

    script = event.get("ScriptBlockText") or ""
    ocsf["script"] = {
        "type_id": 2,  # PowerShell
        "type": "PowerShell",
        "file": {"path": event.get("Path")},
        "script_content": script[:8000],
    }
    ocsf["unmapped"] = {
        "MessageNumber": event.get("MessageNumber"),
        "MessageTotal": event.get("MessageTotal"),
        "ScriptBlockId": event.get("ScriptBlockId"),
        "Path": event.get("Path"),
    }
    _add_script_signals(ocsf, script)
    return ocsf


def map_ps_module(event):
    """PowerShell 4103 - Module/Pipeline Logging -> Script Activity (1009)."""
    ocsf = base_event(event, CLASS_SCRIPT, CAT_SYSTEM, activity_id=1)
    ocsf["type_name"] = "Script Activity: Execute"

    payload = event.get("Payload") or ""
    context = event.get("ContextInfo") or ""
    ocsf["script"] = {
        "type_id": 2,
        "type": "PowerShell",
        "script_content": payload[:8000],
    }
    ocsf["unmapped"] = {
        "Payload": payload[:4000],
        "ContextInfo": context[:4000],
        "UserId": event.get("UserId"),
    }
    _add_script_signals(ocsf, payload + " " + context)
    return ocsf


def map_ps_classic(event):
    """PowerShell 800 - Pipeline Execution (motor clasico) -> Script Activity."""
    ocsf = base_event(event, CLASS_SCRIPT, CAT_SYSTEM, activity_id=1)
    ocsf["type_name"] = "Script Activity: Execute"

    data = event.get("Data") or event.get("param2") or ""
    if isinstance(data, list):
        data = " ".join(str(d) for d in data)
    ocsf["script"] = {
        "type_id": 2,
        "type": "PowerShell",
        "script_content": str(data)[:8000],
    }
    ocsf["unmapped"] = {
        "Data": str(data)[:4000],
        "param1": event.get("param1"),
        "param2": str(event.get("param2"))[:2000],
    }
    _add_script_signals(ocsf, str(data))
    return ocsf


# Indicadores habituales de PowerShell ofuscado o malicioso
_SUSPICIOUS = (
    "downloadstring", "downloadfile", "invoke-expression", "iex ",
    "frombase64string", "-enc", "-encodedcommand", "-nop", "-noprofile",
    "-windowstyle hidden", "-w hidden", "bypass", "invoke-mimikatz",
    "invoke-webrequest", "net.webclient", "reflection.assembly",
    "system.io.compression", "add-type", "invoke-command",
)


def _add_script_signals(ocsf, text):
    """Precalcula senales sobre el contenido del script."""
    low = (text or "").lower()
    hits = [k for k in _SUSPICIOUS if k in low]
    ocsf["tfg"]["signal_ps_suspicious"] = bool(hits)
    if hits:
        ocsf["tfg"]["ps_indicators"] = hits[:6]
    ocsf["tfg"]["signal_ps_encoded"] = any(
        k in low for k in ("-enc", "-encodedcommand", "frombase64string")
    )
    ocsf["tfg"]["script_length"] = len(text or "")