"""Feed de IOCs de ThreatFox (abuse.ch) -> paquete STIX 2.1.

ThreatFox no publica STIX: exporta CSV. Este modulo lo descarga con la Auth-Key de
abuse.ch (leida de .env, nunca del codigo) y lo convierte en un paquete STIX que se carga
con el mismo cargador que ATT&CK (cti.stix_loader.load):

  indicator      uno por IOC, con su patron STIX (ip:puerto, dominio, URL o hash);
  malware        una familia por `fk_malware` (identificador de Malpedia);
  relationship   indicator -[indicates]-> malware.

Los identificadores STIX son deterministas (uuid5 del id de ThreatFox), asi que recargar
el mismo export no duplica y uno nuevo actualiza. Desde 2025-05-01 los exports solo traen
IOCs de los ultimos seis meses.

Uso (desde la raiz del repo):
  .venv/bin/python -m cti.feeds.threatfox descargar        # -> data/cti/threatfox/<fecha>/
  .venv/bin/python -m cti.feeds.threatfox convertir data/cti/threatfox/<fecha>/full.csv.zip
"""
import argparse
import csv
import hashlib
import io
import json
import os
import sys
import urllib.request
import uuid
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

URL_EXPORT = "https://threatfox-api.abuse.ch/v2/files/exports/{clave}/full.csv.zip"
DESTINO = Path("data/cti/threatfox")
NS = uuid.UUID("6f1c8a52-3c0e-4b8e-9a8e-74667468726f")  # espacio de nombres propio del TFG

COLUMNAS = ["first_seen_utc", "ioc_id", "ioc_value", "ioc_type", "threat_type", "fk_malware",
            "malware_alias", "malware_printable", "last_seen_utc", "confidence_level",
            "reference", "tags", "anonymous", "reporter"]

HASHES = {"md5_hash": "MD5", "sha1_hash": "SHA-1", "sha256_hash": "SHA-256"}


def leer_clave(env=Path(".env")):
    clave = os.environ.get("ABUSECH_AUTH_KEY")
    if not clave and env.exists():
        for linea in env.read_text(encoding="utf-8").splitlines():
            if linea.startswith("ABUSECH_AUTH_KEY="):
                clave = linea.split("=", 1)[1].strip().strip('"').strip("'")
    if not clave:
        sys.exit("Falta ABUSECH_AUTH_KEY (en el entorno o en .env)")
    return clave


def sid(tipo, clave):
    return f"{tipo}--{uuid.uuid5(NS, f'threatfox:{tipo}:{clave}')}"


def _literal(v):
    """Literal de cadena de un patron STIX: escapa barra invertida y comilla simple."""
    return "'" + v.replace("\\", "\\\\").replace("'", "\\'") + "'"


def patron(ioc_type, valor):
    """Patron STIX del IOC, o None si el tipo no se reconoce."""
    if ioc_type == "ip:port":
        ip, _, puerto = valor.rpartition(":")
        tipo_ip = "ipv6-addr" if ":" in ip else "ipv4-addr"
        ip = ip.strip("[]")
        if puerto.isdigit():
            return (f"[network-traffic:dst_ref.type = '{tipo_ip}' AND "
                    f"network-traffic:dst_ref.value = {_literal(ip)} AND "
                    f"network-traffic:dst_port = {int(puerto)}]")
        return f"[{tipo_ip}:value = {_literal(valor)}]"
    if ioc_type == "domain":
        return f"[domain-name:value = {_literal(valor)}]"
    if ioc_type == "url":
        return f"[url:value = {_literal(valor)}]"
    if ioc_type in HASHES:
        return f"[file:hashes.'{HASHES[ioc_type]}' = {_literal(valor.lower())}]"
    return None


def _fecha(v):
    """'2026-11-05 10:11:12' (UTC) -> '2026-11-05T10:11:12Z'."""
    v = (v or "").strip()
    if not v:
        return None
    return datetime.strptime(v, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc) \
        .strftime("%Y-%m-%dT%H:%M:%SZ")


def filas_csv(texto):
    """Filas del CSV de ThreatFox. Las lineas de comentario (#) se ignoran; la cabecera,
    que va comentada, se reconoce si trae 'first_seen_utc'."""
    columnas = COLUMNAS
    datos = []
    for linea in texto.splitlines():
        if linea.startswith("#"):
            if "first_seen_utc" in linea:
                columnas = [c.strip().strip('"') for c in linea.lstrip("# ").split(",")]
            continue
        if linea.strip():
            datos.append(linea)
    for valores in csv.reader(datos, skipinitialspace=True):
        yield {c: (v.strip() if v.strip().lower() not in ("none", "") else "")
               for c, v in zip(columnas, valores)}


def convertir(filas):
    """Filas de ThreatFox -> (bundle STIX, resumen)."""
    objetos, familias = [], {}
    resumen = {"iocs": 0, "sin_patron": 0, "por_tipo": {}}
    for f in filas:
        pat = patron(f.get("ioc_type"), f.get("ioc_value", ""))
        if not pat or not f.get("ioc_id"):
            resumen["sin_patron"] += 1
            continue
        resumen["iocs"] += 1
        resumen["por_tipo"][f["ioc_type"]] = resumen["por_tipo"].get(f["ioc_type"], 0) + 1
        creado = _fecha(f.get("first_seen_utc")) or "1970-01-01T00:00:00Z"
        ind = {
            "type": "indicator", "spec_version": "2.1", "id": sid("indicator", f["ioc_id"]),
            "created": creado, "modified": _fecha(f.get("last_seen_utc")) or creado,
            "name": f["ioc_value"], "pattern": pat, "pattern_type": "stix", "valid_from": creado,
            "indicator_types": ["malicious-activity"],
            "labels": [t for t in (f.get("tags") or "").split(",") if t],
            "confidence": int(f["confidence_level"]) if f.get("confidence_level", "").isdigit() else None,
            "x_threatfox_id": f["ioc_id"], "x_ioc_type": f["ioc_type"],
            "x_threat_type": f.get("threat_type") or None,
            "external_references": [{"source_name": "threatfox",
                                     "url": f"https://threatfox.abuse.ch/ioc/{f['ioc_id']}/"}],
        }
        objetos.append({k: v for k, v in ind.items() if v not in (None, [])})
        fam = f.get("fk_malware")
        if fam:
            if fam not in familias:
                alias = [a for a in (f.get("malware_alias") or "").split(",") if a]
                familias[fam] = {
                    "type": "malware", "spec_version": "2.1", "id": sid("malware", fam),
                    "created": creado, "modified": creado, "is_family": True,
                    "name": f.get("malware_printable") or fam, "x_malpedia_id": fam,
                    **({"aliases": alias} if alias else {}),
                }
            objetos.append({
                "type": "relationship", "spec_version": "2.1",
                "id": sid("relationship", f"{f['ioc_id']}->{fam}"), "created": creado,
                "modified": creado, "relationship_type": "indicates",
                "source_ref": ind["id"], "target_ref": familias[fam]["id"],
            })
    objetos.extend(familias.values())
    resumen["familias"] = len(familias)
    bundle = {"type": "bundle", "id": f"bundle--{uuid.uuid4()}", "objects": objetos}
    return bundle, resumen


def descargar(destino=DESTINO):
    clave = leer_clave()
    carpeta = destino / date.today().isoformat()
    carpeta.mkdir(parents=True, exist_ok=True)
    ruta = carpeta / "full.csv.zip"
    req = urllib.request.Request(URL_EXPORT.format(clave=clave), headers={"User-Agent": "tfg-ciberconciencia"})
    with urllib.request.urlopen(req, timeout=300) as r:
        datos = r.read()
    ruta.write_bytes(datos)
    sha = hashlib.sha256(datos).hexdigest()
    (carpeta / "DOWNLOAD.json").write_text(json.dumps({
        "fuente": "ThreatFox full.csv.zip (abuse.ch)", "descargado": datetime.now(timezone.utc).isoformat(),
        "bytes": len(datos), "sha256": sha}, indent=2), encoding="utf-8")  # sin la clave
    print(f"{ruta}: {len(datos)} bytes, SHA-256 {sha}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="orden", required=True)
    sub.add_parser("descargar")
    c = sub.add_parser("convertir")
    c.add_argument("zip", type=Path)
    args = ap.parse_args()
    if args.orden == "descargar":
        descargar()
        return
    with zipfile.ZipFile(args.zip) as z:
        nombre = next(n for n in z.namelist() if n.endswith(".csv"))
        texto = io.TextIOWrapper(z.open(nombre), encoding="utf-8", errors="replace").read()
    bundle, resumen = convertir(filas_csv(texto))
    salida = args.zip.with_name("threatfox-stix.json")
    salida.write_text(json.dumps(bundle), encoding="utf-8")
    print(f"{salida}: {resumen['iocs']} IOCs, {resumen['familias']} familias, "
          f"{resumen['sin_patron']} sin patron; por tipo {resumen['por_tipo']}")


if __name__ == "__main__":
    main()
