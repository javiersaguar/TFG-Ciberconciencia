"""Exporta de OpenCTI a un paquete STIX 2.1 por su API GraphQL (campo `toStix`).

Sirve para la comparativa de F4.2: lo que sale de OpenCTI se compara con el paquete de
partida (cti.comparativa.fidelidad). No usa el conector de exportacion, que trabaja por
ficheros y de forma asincrona. Lee el token de infra/.env y no lo imprime.

Uso (desde la raiz del repo, con el perfil `cti` levantado):
  .venv/bin/python -m cti.comparativa.opencti_export data/cti/opencti/export-attack.json
"""
import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

URL = "http://localhost:8082/graphql"
PAGINA = 500

CONSULTA = """query($first: Int, $after: ID) {
  %s(first: $first, after: $after) {
    edges { node { toStix } }
    pageInfo { endCursor hasNextPage globalCount }
  }
}"""


def token(env=Path("infra/.env")):
    for linea in env.read_text(encoding="utf-8").splitlines():
        if linea.startswith("OPENCTI_ADMIN_TOKEN="):
            return linea.split("=", 1)[1].strip()
    sys.exit("Falta OPENCTI_ADMIN_TOKEN en infra/.env")


def graphql(tok, query, variables):
    req = urllib.request.Request(URL, data=json.dumps({"query": query, "variables": variables}).encode(),
                                 headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        d = json.load(r)
    if d.get("errors"):
        raise RuntimeError(d["errors"])
    return d["data"]


def paginar(tok, campo):
    objetos, cursor, total = [], None, None
    while True:
        datos = graphql(tok, CONSULTA % campo, {"first": PAGINA, "after": cursor})[campo]
        total = datos["pageInfo"]["globalCount"]
        objetos.extend(json.loads(e["node"]["toStix"]) for e in datos["edges"])
        print(f"\r  {campo}: {len(objetos)}/{total}", end="", flush=True)
        if not datos["pageInfo"]["hasNextPage"]:
            break
        cursor = datos["pageInfo"]["endCursor"]
    print()
    return objetos


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("salida", type=Path)
    args = ap.parse_args()
    tok = token()
    t0 = time.time()
    objetos = paginar(tok, "stixCoreObjects") + paginar(tok, "stixCoreRelationships")
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_text(json.dumps({"type": "bundle", "id": "bundle--opencti-export", "objects": objetos}),
                           encoding="utf-8")
    print(f"{args.salida}: {len(objetos)} objetos en {time.time() - t0:.1f} s")


if __name__ == "__main__":
    main()
