"""Normalizacion de identificadores de ATT&CK contra una version fijada.

Cada parte del proyecto trae su propia version de ATT&CK: las etiquetas de Sigma, el plan
de emulacion de APT29, las fichas de OTRF, las anotaciones de AnnoCTR... En F3 eso obligo a
traducir a mano identificadores obsoletos (T1086 -> T1059.001). Este modulo lo resuelve
para todos con el paquete STIX oficial, sin depender de Neo4j:

  resolver("T1086")   -> T1059.001, estado "revocada" (se sigue la cadena revoked-by)
  resolver("T1064")   -> T1064, estado "obsoleta" (deprecated: no tiene sustituto)
  padre("T1059.001")  -> T1059 (para comparar con fuentes que solo anotan la tecnica padre)
  desde_etiqueta_sigma("attack.t1003.001") -> T1003.001

Uso (desde la raiz del repo):
  .venv/bin/python -m cti.attack_ids T1086 T1088 attack.t1003.001
  ... | .venv/bin/python -m cti.attack_ids --stdin      # lineas "id<TAB>recuento"
"""
import argparse
import collections
import json
import re
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

PAQUETE = Path("data/cti/attack/enterprise-attack-19.2.json")
VERSION = "19.2"

_ID = re.compile(r"^T\d{4}(\.\d{3})?$")
_SIGMA = re.compile(r"^attack\.(t\d{4}(?:\.\d{3})?)$", re.I)


@dataclass(frozen=True)
class Resolucion:
    original: str
    vigente: str | None   # identificador vigente; None si no existe en ATT&CK
    estado: str           # vigente | revocada | obsoleta | desconocida
    nombre: str | None = None


def normalizar_texto(tid):
    """'t1003.001', 'attack.t1003.001', ' T1003/001 ' -> 'T1003.001' (o None)."""
    if not tid:
        return None
    t = tid.strip()
    m = _SIGMA.match(t)
    if m:
        t = m.group(1)
    t = t.upper().replace("/", ".")
    return t if _ID.match(t) else None


def desde_etiqueta_sigma(tag):
    return normalizar_texto(tag) if _SIGMA.match(tag.strip()) else None


class AttackIds:
    """Indice de tecnicas de una version de ATT&CK, construido desde su paquete STIX."""

    def __init__(self, bundle, version=VERSION):
        self.version = version
        objetos = bundle["objects"]
        self._ext = {}        # stix id -> T...
        self._obj = {}        # T... -> objeto
        for o in objetos:
            if o["type"] != "attack-pattern":
                continue
            ext = next((r["external_id"] for r in o.get("external_references", [])
                        if r.get("source_name") == "mitre-attack" and r.get("external_id")), None)
            if ext:
                self._ext[o["id"]] = ext
                self._obj[ext] = o
        self._revocada_por = {}   # T... -> T...
        self._padre = {}          # T....nnn -> T....
        for r in objetos:
            if r["type"] != "relationship":
                continue
            a, b = self._ext.get(r["source_ref"]), self._ext.get(r["target_ref"])
            if not (a and b):
                continue
            if r["relationship_type"] == "revoked-by":
                self._revocada_por[a] = b
            elif r["relationship_type"] == "subtechnique-of":
                self._padre[a] = b
        # Tacticas: nombre corto (credential-access) -> TA0006
        self.tacticas = {}
        for o in objetos:
            if o["type"] == "x-mitre-tactic":
                ext = next((r["external_id"] for r in o.get("external_references", [])
                            if r.get("source_name") == "mitre-attack"), None)
                if ext:
                    self.tacticas[o["x_mitre_shortname"]] = ext

    @classmethod
    def desde_fichero(cls, ruta=PAQUETE, version=VERSION):
        return cls(json.loads(Path(ruta).read_text(encoding="utf-8")), version)

    def resolver(self, tid):
        t = normalizar_texto(tid)
        if t is None or t not in self._obj:
            return Resolucion(tid, None, "desconocida")
        estado, vistos = "vigente", set()
        while self._obj[t].get("revoked") and t in self._revocada_por and t not in vistos:
            vistos.add(t)
            t, estado = self._revocada_por[t], "revocada"
        o = self._obj[t]
        if o.get("revoked"):            # revocada sin sustituto conocido
            return Resolucion(tid, None, "revocada", o.get("name"))
        if o.get("x_mitre_deprecated"):
            return Resolucion(tid, t, "obsoleta", o.get("name"))
        return Resolucion(tid, t, estado, o.get("name"))

    def vigente(self, tid):
        """Identificador vigente, o None si no existe o fue revocado sin sustituto."""
        return self.resolver(tid).vigente

    def padre(self, tid):
        """Tecnica padre del identificador vigente (T1059.001 -> T1059; T1059 -> T1059)."""
        t = self.vigente(tid)
        if t is None:
            return None
        return self._padre.get(t, t.split(".")[0])

    def tacticas_de(self, tid):
        """Identificadores TA de la tecnica vigente."""
        t = self.vigente(tid)
        if t is None:
            return []
        fases = self._obj[t].get("kill_chain_phases") or []
        return sorted({self.tacticas[p["phase_name"]] for p in fases
                       if p.get("phase_name") in self.tacticas})


@lru_cache(maxsize=1)
def por_defecto():
    """Indice de la version fijada del proyecto (se carga una vez por proceso)."""
    return AttackIds.desde_fichero()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ids", nargs="*", help="Identificadores o etiquetas Sigma")
    ap.add_argument("--stdin", action="store_true",
                    help="Lee lineas 'id<TAB>recuento' y resume por estado, ponderando por recuento")
    args = ap.parse_args()
    idx = por_defecto()

    if args.stdin:
        por_estado, ids_estado, cambios = collections.Counter(), collections.Counter(), []
        for linea in sys.stdin:
            partes = linea.rstrip("\n").split("\t")
            if not partes[0]:
                continue
            n = int(partes[1]) if len(partes) > 1 and partes[1].isdigit() else 1
            r = idx.resolver(partes[0])
            por_estado[r.estado] += n
            ids_estado[r.estado] += 1
            if r.estado != "vigente":
                cambios.append((partes[0], r.vigente or "-", r.estado, n, r.nombre or ""))
        total = sum(por_estado.values())
        print(f"ATT&CK {idx.version}: {sum(ids_estado.values())} identificadores, {total} apariciones")
        for e in ("vigente", "revocada", "obsoleta", "desconocida"):
            if ids_estado[e]:
                print(f"  {e:<12} {ids_estado[e]:>4} ids  {por_estado[e]:>7} apariciones "
                      f"({100 * por_estado[e] / total:.1f} %)")
        for c in sorted(cambios, key=lambda c: -c[3]):
            print(f"    {c[0]:<12} -> {c[1]:<11} {c[2]:<11} {c[3]:>6}  {c[4]}")
        return

    for t in args.ids:
        r = idx.resolver(t)
        print(f"{t:<20} -> {r.vigente or '-':<11} {r.estado:<11} padre={idx.padre(t) or '-':<7} "
              f"tacticas={','.join(idx.tacticas_de(t)) or '-'}  {r.nombre or ''}")


if __name__ == "__main__":
    main()
