"""Fidelidad de OpenCTI frente al paquete de partida (criterio de F4.2).

Compara el paquete STIX original (p. ej. ATT&CK v19.2, lo que carga el plan B tal cual)
con lo que OpenCTI devuelve al exportarlo (cti.comparativa.opencti_export):

  objetos       por tipo: cuantos conserva, cuantos pierde y por que (revocado,
                obsoleto) y cuantos fusiona (varios originales en un solo objeto);
  relaciones    por tipo, emparejadas por (tipo, origen, destino) con los ids originales;
  propiedades   si se conservan las que usa el proyecto (plataformas, subtecnica,
                tacticas, alias...).

OpenCTI reescribe los ids STIX (uuid5 propio) y guarda los originales en la extension
`stix_ids`: se usan para emparejar.

Uso (desde la raiz del repo):
  .venv/bin/python -m cti.comparativa.fidelidad data/cti/attack/enterprise-attack-19.2.json \\
      data/cti/opencti/export-attack.json
"""
import argparse
import collections
import json
from pathlib import Path

TIPOS = ["attack-pattern", "intrusion-set", "malware", "tool", "campaign", "course-of-action",
         "x-mitre-tactic", "x-mitre-data-source", "x-mitre-data-component",
         "x-mitre-detection-strategy", "x-mitre-analytic"]

# Propiedades que el proyecto usa (servicio de normalizacion, cargador, ML-2)
PROPIEDADES = ["name", "description", "external_references", "kill_chain_phases", "aliases",
               "x_mitre_platforms", "x_mitre_is_subtechnique", "x_mitre_deprecated", "revoked",
               "x_mitre_version", "x_mitre_aliases"]


def ids_originales(obj):
    """Ids STIX originales de un objeto exportado por OpenCTI (mas el suyo propio)."""
    ids = {obj["id"]}
    for ext in (obj.get("extensions") or {}).values():
        if isinstance(ext, dict):
            ids.update(ext.get("stix_ids") or [])
    ids.update(obj.get("x_opencti_stix_ids") or [])
    return ids


# Nombre con que OpenCTI guarda algunas propiedades de MITRE en su extension
EQUIVALENTES = {"x_mitre_platforms": ["platforms"], "x_mitre_aliases": ["aliases"]}


def tiene(obj, prop):
    """La propiedad (o su equivalente de OpenCTI) esta en el objeto o en una extension."""
    nombres = [prop] + EQUIVALENTES.get(prop, [])
    if any(obj.get(n) not in (None, [], "") for n in nombres):
        return True
    return any(isinstance(e, dict) and e.get(n) not in (None, [], "")
               for e in (obj.get("extensions") or {}).values() for n in nombres)


def estado(o):
    return "revocado" if o.get("revoked") else ("obsoleto" if o.get("x_mitre_deprecated") else "vigente")


def comparar(original, exportado):
    orig = {o["id"]: o for o in original["objects"]}
    exp_obj = [o for o in exportado["objects"] if o.get("type") != "relationship"]
    exp_rel = [o for o in exportado["objects"] if o.get("type") == "relationship"]

    a_exportado = {}        # id original -> objeto exportado
    for o in exp_obj:
        for i in ids_originales(o):
            if i in orig:
                a_exportado[i] = o

    print("== Objetos por tipo (original -> OpenCTI) ==")
    print(f"{'tipo':<28}{'orig':>6}{'conserv':>8}{'fusion':>7}  perdidos por estado")
    for t in TIPOS:
        de_tipo = [o for o in orig.values() if o["type"] == t]
        if not de_tipo:
            continue
        conservados = [o for o in de_tipo if o["id"] in a_exportado]
        perdidos = collections.Counter(estado(o) for o in de_tipo if o["id"] not in a_exportado)
        destinos = collections.Counter(id(a_exportado[o["id"]]) for o in conservados)
        fusionados = sum(n - 1 for n in destinos.values() if n > 1)
        print(f"{t:<28}{len(de_tipo):>6}{len(conservados):>8}{fusionados:>7}  {dict(perdidos) or '-'}")

    print("\n== Fusiones (varios originales en un mismo objeto de OpenCTI) ==")
    grupos = collections.defaultdict(list)
    for i, o in a_exportado.items():
        grupos[o["id"]].append(i)
    for oid, ids in grupos.items():
        if len(ids) > 1:
            print(f"  {orig[ids[0]]['type']}: " + " + ".join(
                f"{orig[i].get('name')} ({estado(orig[i])})" for i in ids))

    print("\n== Relaciones por tipo (emparejadas por ids originales) ==")
    # mapa id OpenCTI -> ids originales de ese objeto
    a_orig = {o["id"]: ids_originales(o) & set(orig) for o in exp_obj}
    exp_claves = set()
    for r in exp_rel:
        for s in a_orig.get(r["source_ref"], ()):
            for d in a_orig.get(r["target_ref"], ()):
                exp_claves.add((r["relationship_type"], s, d))
    rel_orig = [o for o in orig.values() if o["type"] == "relationship"]
    por_tipo = collections.defaultdict(lambda: [0, 0, collections.Counter()])
    for r in rel_orig:
        k = (r["relationship_type"], r["source_ref"], r["target_ref"])
        fila = por_tipo[r["relationship_type"]]
        fila[0] += 1
        if k in exp_claves:
            fila[1] += 1
        else:
            extremos = [orig.get(r["source_ref"], {}), orig.get(r["target_ref"], {})]
            motivo = "extremo revocado/obsoleto" if any(estado(e) != "vigente" for e in extremos) \
                else ("relacion revocada/obsoleta" if estado(r) != "vigente" else "otro")
            fila[2][motivo] += 1
    print(f"{'tipo':<18}{'orig':>7}{'conserv':>9}  perdidas por motivo")
    for t, (n, c, m) in sorted(por_tipo.items(), key=lambda x: -x[1][0]):
        print(f"{t:<18}{n:>7}{c:>9}  {dict(m) or '-'}")
    print(f"Relaciones exportadas por OpenCTI: {len(exp_rel)} "
          f"(incluye las que crea él mismo, p. ej. hacia la organización autora)")

    print("\n== Propiedades conservadas en técnicas vigentes (attack-pattern) ==")
    tecnicas = [o for o in orig.values() if o["type"] == "attack-pattern" and o["id"] in a_exportado]
    for p in PROPIEDADES:
        en_orig = [o for o in tecnicas if tiene(o, p)]
        if not en_orig:
            continue
        conservada = sum(tiene(a_exportado[o["id"]], p) for o in en_orig)
        print(f"  {p:<26} {conservada:>4}/{len(en_orig):<4}")
    print("  (x_mitre_is_subtechnique se deduce de la relacion subtechnique-of, que se conserva)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("original", type=Path)
    ap.add_argument("exportado", type=Path)
    args = ap.parse_args()
    comparar(json.loads(args.original.read_text(encoding="utf-8")),
             json.loads(args.exportado.read_text(encoding="utf-8")))


if __name__ == "__main__":
    main()
