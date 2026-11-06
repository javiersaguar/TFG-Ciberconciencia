"""Sube un paquete STIX grande a OpenCTI por trozos y mide su ingesta (F4.2).

El paquete de ThreatFox (cti.feeds.threatfox) tiene unos 272.000 objetos y 137 MB. Se parte
en trozos de N indicadores; cada trozo lleva sus relaciones `indicates` y las familias de
malware que estas referencian (repetir una familia en varios trozos no duplica: OpenCTI
la reconoce por su id). Cada trozo se sube con la mutacion `uploadImport` y el conector
ImportFileStix (CONNECTOR_AUTO=true) lo procesa solo, creando un "work" por fichero.

  subir   parte y sube; guarda la hora y el nombre de cada trozo en el registro.
  estado  suma los works de esos ficheros: procesados/esperados, inicio y fin.

Uso (desde la raiz del repo, con `./scripts/up.sh cti` levantado):
  .venv/bin/python -m cti.comparativa.opencti_import subir \\
      data/cti/threatfox/2026-11-06/threatfox-stix.json --trozo 20000
  .venv/bin/python -m cti.comparativa.opencti_import estado
"""
import argparse
import json
import sys
import time
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

from cti.comparativa.opencti_export import URL, graphql, token

REGISTRO = Path("data/cti/opencti/import-threatfox.json")
SUBIR = 'mutation($file: Upload!) { uploadImport(file: $file) { id name } }'


def trozos(bundle, n):
    """Parte el paquete en trozos de n indicadores con sus relaciones y familias."""
    objs = bundle["objects"]
    por_id = {o["id"]: o for o in objs}
    indicadores = [o for o in objs if o["type"] == "indicator"]
    rel_de = {}
    for o in objs:
        if o["type"] == "relationship":
            rel_de.setdefault(o["source_ref"], []).append(o)
    for i in range(0, len(indicadores), n):
        lote = indicadores[i:i + n]
        rels = [r for ind in lote for r in rel_de.get(ind["id"], [])]
        familias = {r["target_ref"] for r in rels}
        yield {"type": "bundle", "id": f"bundle--{uuid.uuid4()}",
               "objects": [por_id[f] for f in sorted(familias)] + lote + rels}


def subir_fichero(tok, nombre, contenido):
    """POST multipart segun la especificacion de subidas de GraphQL."""
    limite = f"----tfg{uuid.uuid4().hex}"
    ops = json.dumps({"query": SUBIR, "variables": {"file": None}})
    partes = [
        f'--{limite}\r\nContent-Disposition: form-data; name="operations"\r\n\r\n{ops}\r\n',
        f'--{limite}\r\nContent-Disposition: form-data; name="map"\r\n\r\n{{"0": ["variables.file"]}}\r\n',
        f'--{limite}\r\nContent-Disposition: form-data; name="0"; filename="{nombre}"\r\n'
        f'Content-Type: application/json\r\n\r\n',
    ]
    cuerpo = "".join(partes).encode() + contenido + f"\r\n--{limite}--\r\n".encode()
    req = urllib.request.Request(URL, data=cuerpo, headers={
        "Authorization": f"Bearer {tok}", "Content-Type": f"multipart/form-data; boundary={limite}",
        "apollo-require-preflight": "true"})
    with urllib.request.urlopen(req, timeout=600) as r:
        d = json.load(r)
    if d.get("errors"):
        raise RuntimeError(d["errors"])
    return d["data"]["uploadImport"]


def subir(args):
    tok = token()
    bundle = json.loads(args.paquete.read_text(encoding="utf-8"))
    registro = {"paquete": str(args.paquete), "objetos_total": len(bundle["objects"]),
                "trozo": args.trozo, "ficheros": []}
    REGISTRO.parent.mkdir(parents=True, exist_ok=True)
    for k, t in enumerate(trozos(bundle, args.trozo), 1):
        nombre = f"threatfox-{k:02d}.json"
        datos = json.dumps(t).encode()
        if args.dry_run:
            print(f"{nombre}: {len(t['objects'])} objetos, {len(datos) / 1e6:.1f} MB (sin subir)")
            continue
        r = subir_fichero(tok, nombre, datos)
        registro["ficheros"].append({"nombre": nombre, "id": r["id"], "objetos": len(t["objects"]),
                                     "subido": datetime.now(timezone.utc).isoformat()})
        REGISTRO.write_text(json.dumps(registro, indent=1), encoding="utf-8")
        print(f"{nombre}: {len(t['objects'])} objetos, {len(datos) / 1e6:.1f} MB -> subido", flush=True)
    if not args.dry_run:
        print(f"Registro en {REGISTRO}. Sigue la ingesta con: "
              f".venv/bin/python -m cti.comparativa.opencti_import estado")


CONSULTA_WORKS = """query($after: ID) {
  works(first: 200, after: $after, orderBy: timestamp, orderMode: asc) {
    edges { node { name status received_time completed_time
      tracking { import_expected_number import_processed_number } } }
    pageInfo { endCursor hasNextPage } } }"""


def estado(_args):
    tok = token()
    reg = json.loads(REGISTRO.read_text(encoding="utf-8"))
    nombres = {f["nombre"] for f in reg["ficheros"]}
    works, cursor = [], None
    while True:
        d = graphql(tok, CONSULTA_WORKS, {"after": cursor})["works"]
        works += [e["node"] for e in d["edges"] if any(n in (e["node"]["name"] or "") for n in nombres)]
        if not d["pageInfo"]["hasNextPage"]:
            break
        cursor = d["pageInfo"]["endCursor"]
    if not works:
        print("Ningun work con el nombre de los trozos todavia. Ultimos works:")
        d = graphql(tok, "{ works(first: 5, orderBy: timestamp, orderMode: desc) { edges { node { name status } } } }", {})
        for e in d["works"]["edges"]:
            print("  ", e["node"]["name"], e["node"]["status"])
        return
    esp = sum((w["tracking"] or {}).get("import_expected_number") or 0 for w in works)
    pro = sum((w["tracking"] or {}).get("import_processed_number") or 0 for w in works)
    hechos = sum(w["status"] == "complete" for w in works)
    inicio = min((w["received_time"] for w in works if w["received_time"]), default=None)
    fin = max((w["completed_time"] for w in works if w["completed_time"]), default=None)
    print(f"{datetime.now().strftime('%H:%M:%S')}  works {hechos}/{len(reg['ficheros'])} completos  "
          f"objetos {pro}/{esp}  inicio {inicio}  ultimo fin {fin}")
    if works and hechos == len(reg["ficheros"]) and inicio and fin:
        t0 = datetime.fromisoformat(inicio.replace("Z", "+00:00"))
        t1 = datetime.fromisoformat(fin.replace("Z", "+00:00"))
        print(f"INGESTA COMPLETA en {t1 - t0} ({pro / (t1 - t0).total_seconds():.1f} objetos/s)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="orden", required=True)
    s = sub.add_parser("subir")
    s.add_argument("paquete", type=Path)
    s.add_argument("--trozo", type=int, default=20000)
    s.add_argument("--dry-run", action="store_true")
    sub.add_parser("estado")
    args = ap.parse_args()
    {"subir": subir, "estado": estado}[args.orden](args)


if __name__ == "__main__":
    main()
