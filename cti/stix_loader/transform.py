"""STIX 2.1 -> filas para Neo4j (sin dependencias: se prueba sin base de datos).

Un paquete STIX se convierte en tres listas:

  nodos      un nodo por objeto de dominio (SDO), con la etiqueta comun :StixObject,
             la de su tipo (:Technique, :Tactic, :IntrusionSet...) y solo propiedades
             escalares o listas de escalares, que es lo que Neo4j sabe guardar.
  relaciones una por relacion STIX (SRO), con el tipo en mayusculas (uses -> USES).
  tacticas   las fases de kill chain de cada tecnica, que STIX lleva DENTRO del objeto y
             no como relacion: se convierten en aristas (:Technique)-[:IN_TACTIC]->(:Tactic).

Los `object_refs` de un `report` (lo que el informe contiene) tambien van DENTRO del objeto:
se convierten en aristas (:Report)-[:REFERS_TO]->(objeto), con id determinista
`<informe>|<objeto>`, de modo que recargar el informe no las duplica.

La identidad es el `id` STIX: cargar dos veces el mismo paquete no duplica nada. Sirve
igual para ATT&CK, para un feed de IOCs y para los perfiles que genere ML-2.
"""
import re

# Etiqueta propia por tipo STIX. Las de ATT&CK siguen el modelo del grafo (graph/model.md).
# `campaign` de STIX es la campana documentada por CTI: se etiqueta :CtiCampaign para no
# confundirla con las campanas que detecta el Pilar A.
ETIQUETAS = {
    "attack-pattern": ["Technique"],
    "x-mitre-tactic": ["Tactic"],
    "intrusion-set": ["IntrusionSet", "Actor"],
    "threat-actor": ["ThreatActor", "Actor"],
    "malware": ["Malware", "Software"],
    "tool": ["Tool", "Software"],
    "course-of-action": ["Mitigation"],
    "campaign": ["CtiCampaign"],
    "x-mitre-data-source": ["DataSource"],
    "x-mitre-data-component": ["DataComponent"],
    "x-mitre-detection-strategy": ["DetectionStrategy"],
    "x-mitre-analytic": ["Analytic"],
    "x-mitre-matrix": ["Matrix"],
    "x-mitre-collection": ["Collection"],
    "identity": ["Identity"],
    "report": ["Report"],
    "indicator": ["Indicator"],
    "vulnerability": ["Vulnerability"],
}

# Tipos que no son conocimiento: se ignoran.
IGNORADOS = {"marking-definition", "bundle", "language-content", "extension-definition"}

# Propiedades que no se copian: referencias internas o estructuras que van por otro camino.
NO_COPIAR = {"external_references", "object_marking_refs", "created_by_ref",
             "x_mitre_modified_by_ref", "kill_chain_phases", "granular_markings",
             "object_refs", "x_mitre_contents", "extensions"}

FUENTES_ATTACK = {"mitre-attack", "mitre-mobile-attack", "mitre-ics-attack"}
TIPO_REL = re.compile(r"^[A-Z][A-Z0-9_]*$")
ETIQUETA = re.compile(r"^[A-Z][A-Za-z0-9]*$")


def etiquetas(tipo):
    """Etiquetas de Neo4j para un tipo STIX; los tipos desconocidos se pasan a CamelCase."""
    if tipo in ETIQUETAS:
        return ETIQUETAS[tipo]
    camel = "".join(p.capitalize() for p in re.split(r"[^a-zA-Z0-9]+", tipo) if p)
    return [camel] if camel and ETIQUETA.match(camel) else []


def tipo_relacion(rel_type):
    """`subtechnique-of` -> `SUBTECHNIQUE_OF`. Devuelve None si no es un nombre seguro."""
    t = re.sub(r"[^A-Za-z0-9]+", "_", rel_type or "").strip("_").upper()
    return t if TIPO_REL.match(t) else None


def _escalar(v):
    return isinstance(v, (str, int, float, bool))


def _nombre_propiedad(clave):
    return clave[len("x_mitre_"):] if clave.startswith("x_mitre_") else clave


def propiedades(obj):
    """Propiedades guardables: escalares y listas de escalares, sin el prefijo x_mitre_."""
    props = {}
    for k, v in obj.items():
        if k in NO_COPIAR or v is None:
            continue
        if _escalar(v) or (isinstance(v, list) and v and all(_escalar(x) for x in v)):
            props[_nombre_propiedad(k)] = v
    for ref in obj.get("external_references") or []:
        if ref.get("source_name") in FUENTES_ATTACK and ref.get("external_id"):
            props["external_id"] = ref["external_id"]
            if ref.get("url"):
                props["url"] = ref["url"]
            break
    return props


def fases(obj):
    """Nombres cortos de las tacticas de ATT&CK de una tecnica (kill_chain_phases)."""
    return sorted({p["phase_name"] for p in obj.get("kill_chain_phases") or []
                   if p.get("kill_chain_name", "").startswith("mitre") and p.get("phase_name")})


def transformar(bundle):
    """Paquete STIX (dict) -> (nodos, relaciones, tacticas, descartes)."""
    nodos, relaciones, tacticas = [], [], []
    descartes = {"tipo_ignorado": 0, "sin_etiqueta": 0, "relacion_no_valida": 0}
    for obj in bundle.get("objects", []):
        tipo = obj.get("type")
        if tipo in IGNORADOS:
            descartes["tipo_ignorado"] += 1
            continue
        if tipo == "relationship":
            rt = tipo_relacion(obj.get("relationship_type"))
            if not (rt and obj.get("source_ref") and obj.get("target_ref")):
                descartes["relacion_no_valida"] += 1
                continue
            props = {k: v for k, v in propiedades(obj).items()
                     if k not in {"source_ref", "target_ref", "relationship_type"}}
            relaciones.append({"id": obj["id"], "tipo": rt, "origen": obj["source_ref"],
                               "destino": obj["target_ref"], "props": props})
            continue
        labels = etiquetas(tipo)
        if not labels:
            descartes["sin_etiqueta"] += 1
            continue
        nodos.append({"id": obj["id"], "labels": labels, "props": propiedades(obj)})
        if tipo == "report":
            relaciones.extend({"id": f"{obj['id']}|{ref}", "tipo": "REFERS_TO", "origen": obj["id"],
                               "destino": ref, "props": {}} for ref in obj.get("object_refs") or [])
        if tipo == "attack-pattern":
            tacticas.extend({"tecnica": obj["id"], "tactica": f} for f in fases(obj))
    return nodos, relaciones, tacticas, descartes
