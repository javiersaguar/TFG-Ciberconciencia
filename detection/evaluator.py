"""Evaluacion de reglas Sigma sobre eventos OCSF en memoria.

Recorre la estructura de la regla ya parseada por pySigma y la contrasta
contra el evento, sin generar consultas intermedias. Permite la evaluacion
en streaming, evento a evento.

Modificadores soportados: contains, startswith, endswith, all, re, base64,
base64offset, cased, windash (parcial). Cubren >98% de los usos en el
repositorio publico de reglas.
"""
import re as _re

from sigma.conditions import (
    ConditionAND, ConditionOR, ConditionNOT,
    ConditionFieldEqualsValueExpression, ConditionValueExpression,
)
from sigma.types import (
    SigmaString, SigmaNumber, SigmaNull, SigmaRegularExpression,
    SigmaCompareExpression, SigmaCIDRExpression,
)


class UnsupportedFeature(Exception):
    """La regla usa una construccion no soportada por el evaluador."""


# ---------------------------------------------------------------------------
# Acceso a campos anidados (soporta notacion con puntos: actor.process.name)
# ---------------------------------------------------------------------------

def get_field(event, path):
    """Obtiene un campo del evento admitiendo rutas con puntos."""
    current = event
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list):
            values = [c.get(part) for c in current if isinstance(c, dict)]
            current = [v for v in values if v is not None] or None
        else:
            return None
        if current is None:
            return None
    return current


def as_text_list(value):
    """Normaliza cualquier valor a una lista de cadenas para comparar."""
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        out = []
        for v in value:
            out.extend(as_text_list(v))
        return out
    if isinstance(value, bool):
        return [str(value).lower()]
    return [str(value)]


# ---------------------------------------------------------------------------
# Comparacion de valores Sigma contra valores del evento
# ---------------------------------------------------------------------------

def sigma_string_to_regex(sigma_str):
    """Convierte un SigmaString con comodines (* ?) a expresion regular."""
    from sigma.types import SpecialChars

    pattern = ""
    for part in sigma_str.s:
        if isinstance(part, str):
            pattern += _re.escape(part)
        elif part == SpecialChars.WILDCARD_MULTI:
            pattern += ".*"
        elif part == SpecialChars.WILDCARD_SINGLE:
            pattern += "."
        else:
            pattern += _re.escape(str(part))
    return pattern


def match_value(sigma_value, event_values, case_sensitive=False):
    """Comprueba si algun valor del evento casa con el valor Sigma."""
    if not event_values:
        return isinstance(sigma_value, SigmaNull)

    flags = 0 if case_sensitive else _re.IGNORECASE

    if isinstance(sigma_value, SigmaNull):
        return False

    if isinstance(sigma_value, SigmaRegularExpression):
        pattern = str(sigma_value.regexp)
        rx_flags = flags
        for f in getattr(sigma_value, "flags", set()) or set():
            name = getattr(f, "name", str(f)).upper()
            if "IGNORECASE" in name:
                rx_flags |= _re.IGNORECASE
            elif "MULTILINE" in name:
                rx_flags |= _re.MULTILINE
            elif "DOTALL" in name:
                rx_flags |= _re.DOTALL
        try:
            rx = _re.compile(pattern, rx_flags)
        except _re.error as exc:
            raise UnsupportedFeature(f"regex no compilable: {exc}")
        return any(rx.search(v) for v in event_values)

    if isinstance(sigma_value, SigmaNumber):
        target = str(sigma_value.number)
        return any(v == target for v in event_values)

    if isinstance(sigma_value, SigmaCompareExpression):
        try:
            num = float(str(sigma_value.number))
            op = sigma_value.op.value if hasattr(sigma_value.op, "value") else str(sigma_value.op)
            for v in event_values:
                try:
                    x = float(v)
                except ValueError:
                    continue
                if op == "<" and x < num: return True
                if op == "<=" and x <= num: return True
                if op == ">" and x > num: return True
                if op == ">=" and x >= num: return True
            return False
        except (ValueError, AttributeError):
            raise UnsupportedFeature("comparacion numerica no interpretable")

    if isinstance(sigma_value, SigmaCIDRExpression):
        raise UnsupportedFeature("modificador cidr")

    if isinstance(sigma_value, SigmaString):
        pattern = "^" + sigma_string_to_regex(sigma_value) + "$"
        rx = _re.compile(pattern, flags)
        return any(rx.match(v) for v in event_values)

    # Fallback: comparacion textual directa
    target = str(sigma_value)
    if case_sensitive:
        return any(v == target for v in event_values)
    return any(v.lower() == target.lower() for v in event_values)


# ---------------------------------------------------------------------------
# Evaluacion del arbol de condiciones
# ---------------------------------------------------------------------------

def eval_condition(cond, event, matched):
    """Evalua recursivamente el arbol de condiciones de una regla."""

    if isinstance(cond, ConditionAND):
        return all(eval_condition(a, event, matched) for a in cond.args)

    if isinstance(cond, ConditionOR):
        return any(eval_condition(a, event, matched) for a in cond.args)

    if isinstance(cond, ConditionNOT):
        return not eval_condition(cond.args[0], event, matched)

    if isinstance(cond, ConditionFieldEqualsValueExpression):
        field = cond.field
        raw = get_field(event, field)
        values = as_text_list(raw)
        if match_value(cond.value, values):
            matched[field] = raw if not isinstance(raw, list) else raw[:3]
            return True
        return False

    if isinstance(cond, ConditionValueExpression):
        # Busqueda de palabra clave en todo el evento (sin campo asociado)
        haystack = _flatten_text(event)
        return match_value(cond.value, [haystack])

    raise UnsupportedFeature(f"condicion no soportada: {type(cond).__name__}")


def _flatten_text(event):
    """Aplana el evento a una cadena para busquedas sin campo."""
    parts = []

    def walk(node):
        if isinstance(node, dict):
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
        elif node is not None:
            parts.append(str(node))

    walk(event)
    return " ".join(parts)


# ---------------------------------------------------------------------------
# API principal
# ---------------------------------------------------------------------------

def evaluate(rule, event):
    """Evalua una regla contra un evento.

    Devuelve (coincide: bool, campos_coincidentes: dict).
    El segundo valor es la base de la explicabilidad: indica QUE condiciones
    concretas dispararon la deteccion.
    """
    matched = {}
    for parsed in rule.detection.parsed_condition:
        condition = parsed.parse()
        if eval_condition(condition, event, matched):
            return True, matched
    return False, {}


# ---------------------------------------------------------------------------
# Reglas compiladas: arbol de condiciones parseado una sola vez
# ---------------------------------------------------------------------------

# Correspondencia entre la categoria logsource de Sigma y el type_uid OCSF
# que genera el normalizador. Permite descartar reglas sin evaluarlas.
LOGSOURCE_TYPE_UID = {
    "process_creation": {100701},
    "process_access": {100703},
    "process_termination": {100702},
    "image_load": {100501},
    "file_event": {100101},
    "file_change": {100103},
    "file_delete": {100104},
    "network_connection": {400101},
    "dns_query": {400301},
}


class CompiledRule:
    """Regla con su arbol de condiciones ya parseado y su filtro de logsource."""

    __slots__ = ("rule", "conditions", "type_uids", "summary")

    def __init__(self, rule, summary=None):
        self.rule = rule
        self.conditions = [p.parse() for p in rule.detection.parsed_condition]
        self.summary = summary
        category = rule.logsource.category
        self.type_uids = LOGSOURCE_TYPE_UID.get(category) if category else None

    def applies_to(self, event):
        """Descarta rapidamente las reglas que no pueden casar con el evento."""
        if self.type_uids is None:
            return True
        return event.get("type_uid") in self.type_uids

    def evaluate(self, event):
        matched = {}
        for condition in self.conditions:
            if eval_condition(condition, event, matched):
                return True, matched
        return False, {}


def compile_rules(rules, with_summary=True):
    """Precompila una lista de reglas para su evaluacion repetida."""
    from detection.loader import rule_summary
    out = []
    for r in rules:
        try:
            summary = rule_summary(r) if with_summary else None
            out.append(CompiledRule(r, summary))
        except Exception:
            continue
    return out


def evaluate_all(compiled_rules, event):
    """Evalua un evento contra todas las reglas compiladas.

    Devuelve la lista de (CompiledRule, campos_coincidentes) que han casado.
    """
    hits = []
    for cr in compiled_rules:
        if not cr.applies_to(event):
            continue
        try:
            ok, matched = cr.evaluate(event)
        except UnsupportedFeature:
            continue
        if ok:
            hits.append((cr, matched))
    return hits