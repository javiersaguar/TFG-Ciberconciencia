"""Encaje de OpenCTI con ML-2: el conector ImportDocument como linea base (F4.2).

Pasa por el conector de importacion de documentos de OpenCTI los MISMOS 6 informes de Microsoft sobre
APT29 que la evaluacion 6a de ML-2 (cti.extract.perfil_apt29), con las mismas frases de analisis y sin las
tablas "MITRE ATT&CK techniques observed" del editor. El conector se lanza en modo `workbench`, asi que lo
que extrae queda pendiente de validar y NO se escribe en la plataforma. Se descarga ese paquete STIX y se
cuentan las tecnicas que reconoce (attack-pattern), subidas a padre.

Puntuacion: igual que 6a (cti.extract.perfil_apt29.puntuar), contra G0016 y G0016+campanas de ATT&CK v19.2,
en dos espacios: el de ML-2 (59 tecnicas) y el completo (el conector no esta limitado a 59).

  subir    escribe los textos, los sube y lanza el conector (un work por informe)
  evaluar  descarga los resultados del workbench y puntua

Uso (desde la raiz del repo, con `./scripts/up.sh cti` levantado):
  .venv/bin/python -m cti.comparativa.opencti_documentos subir
  .venv/bin/python -m cti.comparativa.opencti_documentos evaluar
"""
import argparse
import collections
import json
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from cti.attack_ids import por_defecto
from cti.comparativa.opencti_export import URL, graphql, token
from cti.extract.informes import APT29, frases
from cti.extract.perfil_apt29 import puntuar, referencia

CARPETA = Path("data/cti/opencti/documentos")
REGISTRO = CARPETA / "registro.json"
RESULTADO = Path("data/ml2/resultados/opencti-documentos.json")
SUBIR = 'mutation($file: Upload!) { uploadImport(file: $file) { id name } }'
LANZAR = """mutation($f: ID!, $c: String) {
  askJobImport(fileName: $f, connectorId: $c, validationMode: workbench) { id name } }"""


def subir_texto(tok, nombre, contenido):
    limite = f"----tfg{uuid.uuid4().hex}"
    ops = json.dumps({"query": SUBIR, "variables": {"file": None}})
    cabecera = (f'--{limite}\r\nContent-Disposition: form-data; name="operations"\r\n\r\n{ops}\r\n'
                f'--{limite}\r\nContent-Disposition: form-data; name="map"\r\n\r\n{{"0": ["variables.file"]}}\r\n'
                f'--{limite}\r\nContent-Disposition: form-data; name="0"; filename="{nombre}"\r\n'
                f'Content-Type: text/plain\r\n\r\n')
    cuerpo = cabecera.encode() + contenido + f"\r\n--{limite}--\r\n".encode()
    req = urllib.request.Request(URL, data=cuerpo, headers={
        "Authorization": f"Bearer {tok}", "Content-Type": f"multipart/form-data; boundary={limite}",
        "apollo-require-preflight": "true"})
    with urllib.request.urlopen(req, timeout=300) as r:
        d = json.load(r)
    if d.get("errors"):
        raise RuntimeError(d["errors"])
    return d["data"]["uploadImport"]


def conector(tok):
    cs = graphql(tok, "{ connectorsForImport { id name active } }", {})["connectorsForImport"]
    c = next(c for c in cs if c["name"] == "ImportDocument")
    if not c["active"]:
        raise SystemExit("El conector ImportDocument no esta activo")
    return c["id"]


def subir(_args):
    tok = token()
    cid = conector(tok)
    CARPETA.mkdir(parents=True, exist_ok=True)
    reg = {"conector": cid, "informes": []}
    for doc in APT29:
        analisis = [f["texto"] for f in frases(doc) if f["tipo"] == "analisis"]
        nombre = f"tfg-ml2-{doc}.txt"
        datos = ("\n".join(analisis) + "\n").encode("utf-8")
        (CARPETA / nombre).write_bytes(datos)
        f = subir_texto(tok, nombre, datos)
        graphql(tok, LANZAR, {"f": f["id"], "c": cid})
        reg["informes"].append({"doc": doc, "fichero": nombre, "id": f["id"], "frases": len(analisis),
                                "lanzado": time.time()})
        print(f"{doc}: {len(analisis)} frases, subido y lanzado", flush=True)
    REGISTRO.write_text(json.dumps(reg, indent=1), encoding="utf-8")


def pendientes(tok):
    d = graphql(tok, "{ pendingFiles(first: 200) { edges { node { id name lastModified metaData { entity_id } } } } }", {})
    return [e["node"] for e in d["pendingFiles"]["edges"]]


def descargar(tok, fid):
    req = urllib.request.Request(f"{URL.rsplit('/', 1)[0]}/storage/get/{urllib.parse.quote(fid, safe='')}",
                                 headers={"Authorization": f"Bearer {tok}"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def evaluar(_args):
    tok = token()
    reg = json.loads(REGISTRO.read_text(encoding="utf-8"))
    idx = por_defecto()
    pend = pendientes(tok)
    por_doc, tipos = {}, collections.Counter()
    for inf in reg["informes"]:
        base = inf["fichero"].rsplit(".", 1)[0].lower()   # OpenCTI guarda el nombre en minusculas
        cand = [p for p in pend if p["name"].lower().startswith(base)]
        if not cand:
            raise SystemExit(f"{inf['doc']}: el conector aun no ha dejado su resultado en el workbench")
        bundle = descargar(tok, sorted(cand, key=lambda p: p["lastModified"])[-1]["id"])
        objs = bundle.get("objects", [])
        tipos.update(o["type"] for o in objs)
        tecs = set()
        for o in objs:
            if o["type"] == "attack-pattern":
                ext = o.get("x_mitre_id") or next((r.get("external_id") for r in o.get("external_references", [])
                                                   if r.get("source_name") == "mitre-attack"), None)
                p = idx.padre(ext) if ext else None
                if p:
                    tecs.add(p)
        por_doc[inf["doc"]] = sorted(tecs)
    etiquetas = json.loads(Path("data/ml2/annoctr/etiquetas.json").read_text(encoding="utf-8"))
    E = set(etiquetas["espacio"])
    perfil = set().union(*map(set, por_doc.values()))
    ref = referencia()
    tabla = {}
    for ref_n in ("G0016", "G0016+campanas"):
        tabla[f"espacio ML-2 | {ref_n}"] = puntuar(perfil & E, ref[ref_n] & E)
        tabla[f"completo | {ref_n}"] = puntuar(perfil, ref[ref_n])
    salida = {"informes": por_doc, "objetos_por_tipo": dict(tipos), "perfil": sorted(perfil),
              "fuera_del_espacio": sorted(perfil - E), "tabla": tabla}
    RESULTADO.write_text(json.dumps(salida, indent=1, ensure_ascii=False), encoding="utf-8")
    print("Objetos en los workbench:", dict(tipos))
    for d, t in por_doc.items():
        print(f"  {d}: {len(t)} técnicas {t}")
    print("| Espacio | Referencia | Técnicas | Aciertos | P | R | F1 |\n|---|---|---:|---:|---:|---:|---:|")
    for k, v in tabla.items():
        e, r = k.split(" | ")
        print(f"| {e} | {r} | {v['tecnicas']} | {v['aciertos']} | {v['precision']:.3f} | {v['exhaustividad']:.3f} | {v['f1']:.3f} |")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="orden", required=True)
    sub.add_parser("subir")
    sub.add_parser("evaluar")
    args = ap.parse_args()
    {"subir": subir, "evaluar": evaluar}[args.orden](args)


if __name__ == "__main__":
    main()
