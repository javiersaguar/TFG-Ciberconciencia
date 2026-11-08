"""COMISET REAL v2: censo completo y muestra con margen en UNA pasada sobre el ZIP (FA.3).

El JSON de REAL ocupa 934,5 GB dentro de un ZIP de 31,7 GB: no se extrae, se lee en streaming.
El piloto v1 solo leyó un prefijo (128 MB, dos hosts, ~6 min cada uno), así que no se sabe cómo
se reparte el conjunto. Esta pasada hace dos cosas a la vez:

  1. CENSO de todo el fichero: registros por host, día y hora UTC, y por host y canal. Describe el
     conjunto y permite elegir la v2 con datos.
  2. MUESTRA CON MARGEN de los canales que el pipeline normaliza (Sysmon, Security, PowerShell):
       - solo en 1 de cada 4 parejas (host, día), elegidas por hash (determinista, sin mirar el
         contenido);
       - en tres VENTANAS CONTINUAS de una hora UTC: 08–09 y 15–16 (mañana y tarde laborables en
         España, UTC+2 en verano) y 01–02 (noche). Ventanas continuas, no muestreo al azar:
         los patrones buscan secuencias y un muestreo al azar las rompería;
       - con topes por ventana (100.000), por host (400.000) y global (8 M), para que un host
         ruidoso no se lleve la muestra.
     La v2 definitiva (1–2 M de registros, estratificada) se elige después sobre esta muestra con
     el censo delante.

Los datos son de terceros y no fiables: no se ejecuta nada de ellos, solo se leen con expresiones
regulares sobre bytes y se copian las líneas tal cual. Los hosts se seudonimizan igual que en el
piloto: host-<sha256(nombre)[:12]>.

Uso (desde la raíz del repo; tarda horas, en segundo plano):
  python3 -I detection/evaluation/fa_comiset_v2_extract.py --output data/external/comiset/real-sample-v2-raw
"""
import argparse
import collections
import gzip
import hashlib
import json
import re
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ZIP = Path("data/external/comiset/Comiset23_Real_Environment_Dataset.zip")
MIEMBRO = "Comiset23_Real_Environment_Dataset.json"
SOPORTADOS = {"microsoft-windows-sysmon/operational", "security", "windows powershell",
              "microsoft-windows-powershell/operational"}
VENTANAS = {8: "manana", 15: "tarde", 1: "noche"}       # hora UTC de inicio -> nombre
FRACCION_HOST_DIA = 4                                    # 1 de cada 4 parejas (host, día)
TOPE_VENTANA, TOPE_HOST, TOPE_GLOBAL = 100_000, 400_000, 8_000_000
LINEA_MAX = 1 << 20                                      # líneas de más de 1 MiB: se cuentan y no se copian

RX_HOST = re.compile(rb'"host_name"\s*:\s*"([^"]{1,255})"')
RX_LOG = re.compile(rb'"log_name"\s*:\s*"([^"]{1,255})"')
RX_TIEMPO = re.compile(rb'"event_original_time"\s*:\s*"(\d{4}-\d{2}-\d{2})T(\d{2})')
# Campos cuyo nombre sugiere una etiqueta (para localizar el etiquetado ATT&CK de LAB)
RX_ETIQUETA = re.compile(rb'"([A-Za-z0-9_@.]*(?:[Mm]itre|[Tt]echnique|[Tt]actic|[Aa]ttack|[Tt]hreat|RuleName|[Ll]abel)[A-Za-z0-9_@.]*)"\s*:\s*"([^"]{0,120})"')
RX_TID = re.compile(rb'\bT1\d{3}(?:\.\d{3})?\b')
RX_REGLA_TID = re.compile(rb'"rule_technique_id"\s*:\s*"([^"]{1,40})"')


def clave_host(host):
    return "host-" + hashlib.sha256(host.encode()).hexdigest()[:12]


def elegido(host, dia):
    return int(hashlib.sha256(f"{host}|{dia}".encode()).hexdigest()[:8], 16) % FRACCION_HOST_DIA == 0


def ahora():
    return datetime.now(timezone.utc).isoformat()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--output", type=Path, required=True)
    ap.add_argument("--zip", type=Path, default=ZIP, help="ZIP de origen (por defecto, REAL)")
    ap.add_argument("--miembro", default=MIEMBRO)
    ap.add_argument("--limite-bytes", type=int, default=0, help="Para pruebas: parar tras leer N bytes")
    ap.add_argument("--seleccion", type=Path, default=None,
                    help="Segunda pasada: copiar solo las celdas (host, día, hora) de SELECCION.json "
                         "(fa_comiset_v2_select.py), con su tope por celda")
    ap.add_argument("--sin-campos-etiqueta", action="store_true",
                    help="No buscar campos candidatos a etiqueta (más rápido); sí cuenta rule_technique_id por hora")
    ap.add_argument("--solo-censo", action="store_true",
                    help="Primera pasada: solo el censo (incluido el de canales soportados), sin copiar nada")
    args = ap.parse_args()
    out = args.output
    if out.exists() and any(out.iterdir()):
        sys.exit(f"{out} ya existe y no está vacío: no se sobrescribe")
    out.mkdir(parents=True, exist_ok=True)

    inicio = ahora()
    t0 = time.time()
    censo_hora = collections.Counter()           # (hostkey, día, hora) -> registros
    censo_canal = collections.Counter()          # (hostkey, canal) -> registros
    censo_soportado = collections.Counter()      # (hostkey, día, hora) -> registros de canales soportados
    nombres = {}                                 # hostkey -> nombre original (queda en data/)
    sin_campos = collections.Counter()
    ventana_n = collections.Counter()            # (hostkey, día, ventana) -> copiadas
    host_n = collections.Counter()
    abiertos = {}                                # (hostkey, día, ventana) -> (gzip, ruta)
    particiones = {}
    copiadas = leidas = bytes_leidos = 0
    tope_global_alcanzado = False
    progreso = out / "PROGRESO.json"
    etiquetas = collections.Counter()            # nombre de campo candidato -> apariciones
    ejemplos_etq = collections.defaultdict(collections.Counter)   # campo -> valores (muestra)
    tids = collections.Counter()                 # identificadores T1xxx vistos en cualquier parte
    etiqueta_hora = collections.Counter()        # (hostkey, día, hora, rule_technique_id) -> eventos
    seleccion, tope_celda = None, None
    if args.seleccion:
        sel = json.loads(args.seleccion.read_text(encoding="utf-8"))
        seleccion = {(c["host"], c["dia"], c["hora_utc"]) for c in sel["celdas"]}
        tope_celda = sel["resumen"]["tope_celda"]

    with zipfile.ZipFile(args.zip) as z, z.open(args.miembro) as fh:
        for ordinal, linea in enumerate(fh, 1):
            leidas += 1
            bytes_leidos += len(linea)
            if len(linea) > LINEA_MAX:
                sin_campos["linea_mayor_1MiB"] += 1
                continue
            mh, ml, mt = RX_HOST.search(linea), RX_LOG.search(linea), RX_TIEMPO.search(linea)
            if not (mh and ml and mt):
                sin_campos["sin_host_canal_o_tiempo"] += 1
                continue
            host = mh.group(1).decode("utf-8", "replace")
            canal = ml.group(1).decode("utf-8", "replace")
            dia, hora = mt.group(1).decode(), int(mt.group(2))
            hk = clave_host(host)
            nombres.setdefault(hk, host)
            censo_hora[(hk, dia, hora)] += 1
            mr = RX_REGLA_TID.search(linea)
            if mr:
                etiqueta_hora[(hk, dia, hora, mr.group(1).decode("utf-8", "replace"))] += 1
            for m in ([] if args.sin_campos_etiqueta else RX_ETIQUETA.finditer(linea)):
                k = m.group(1).decode("utf-8", "replace")
                etiquetas[k] += 1
                if len(ejemplos_etq[k]) < 50 or m.group(2) in ejemplos_etq[k]:
                    ejemplos_etq[k][m.group(2).decode("utf-8", "replace")] += 1
            for m in ([] if args.sin_campos_etiqueta else RX_TID.finditer(linea)):
                tids[m.group(0).decode()] += 1
            censo_canal[(hk, canal)] += 1
            soportado = canal.lower() in SOPORTADOS
            if soportado:
                censo_soportado[(hk, dia, hora)] += 1

            if seleccion is not None:
                copiar = soportado and (hk, dia, hora) in seleccion
                clave = (hk, dia, f"h{hora:02d}")
                limite_ok = copiar and ventana_n[clave] < tope_celda
            else:
                copiar = (not args.solo_censo and not tope_global_alcanzado and hora in VENTANAS and soportado
                          and elegido(host, dia))
                clave = (hk, dia, VENTANAS.get(hora, ""))
                limite_ok = copiar and ventana_n[clave] < TOPE_VENTANA and host_n[hk] < TOPE_HOST
            if copiar:
                if limite_ok:
                    if clave not in abiertos:
                        ruta = out / hk / dia / f"{clave[2]}.jsonl.gz"
                        ruta.parent.mkdir(parents=True, exist_ok=True)
                        # Si ya existía (se cerró por haber demasiados abiertos), se reabre en modo AÑADIR:
                        # un gzip con varios miembros es válido y se lee entero con gzip.open.
                        modo = "ab" if clave in particiones else "wb"
                        abiertos[clave] = (gzip.open(ruta, modo, compresslevel=5), ruta)
                        if clave not in particiones:
                            particiones[clave] = {"ruta": ruta.relative_to(out).as_posix(), "host": hk, "dia": dia,
                                                  "ventana": clave[2], "hora_utc": hora, "filas": 0,
                                                  "sha256_crudo": hashlib.sha256(), "primer_ordinal": ordinal}
                    g, _ = abiertos[clave]
                    datos = linea if linea.endswith(b"\n") else linea + b"\n"
                    g.write(datos)
                    p = particiones[clave]
                    p["filas"] += 1
                    p["sha256_crudo"].update(datos)
                    p["ultimo_ordinal"] = ordinal
                    ventana_n[clave] += 1
                    host_n[hk] += 1
                    copiadas += 1
                    if copiadas >= TOPE_GLOBAL:
                        tope_global_alcanzado = True
                    # cerrar ficheros de ventanas llenas para no agotar descriptores
                    if ventana_n[clave] >= (tope_celda or TOPE_VENTANA):
                        abiertos.pop(clave)[0].close()

            if leidas % 2_000_000 == 0:
                if len(abiertos) > 400:            # muchos abiertos: cerrar los más antiguos y reabrir en modo añadir
                    for k in list(abiertos)[:200]:
                        abiertos.pop(k)[0].close()
                progreso.write_text(json.dumps({
                    "actualizado": ahora(), "segundos": round(time.time() - t0), "lineas": leidas,
                    "gb_leidos": round(bytes_leidos / 1e9, 2), "fraccion": round(bytes_leidos / 934_500_576_290, 4),
                    "copiadas": copiadas, "hosts_vistos": len(nombres), "particiones": len(particiones),
                    "tope_global": tope_global_alcanzado}, indent=1), encoding="utf-8")
                print(f"{ahora()} {bytes_leidos / 1e9:8.1f} GB  {leidas:>12,} líneas  {copiadas:>9,} copiadas  "
                      f"{len(nombres)} hosts", flush=True)
            if args.limite_bytes and bytes_leidos >= args.limite_bytes:
                break

    for g, _ in abiertos.values():
        g.close()

    partes = []
    for p in particiones.values():
        p = dict(p)
        p["sha256_crudo"] = p["sha256_crudo"].hexdigest()
        p["bytes_gz"] = (out / p["ruta"]).stat().st_size
        partes.append(p)
    censo = {
        "por_hora": [{"host": h, "dia": d, "hora_utc": hr, "registros": n, "soportados": censo_soportado[(h, d, hr)]}
                     for (h, d, hr), n in sorted(censo_hora.items())],
        "por_canal": [{"host": h, "canal": c, "registros": n} for (h, c), n in sorted(censo_canal.items())],
        "campos_etiqueta": {k: {"apariciones": n, "valores": dict(ejemplos_etq[k].most_common(30))}
                            for k, n in etiquetas.most_common(40)},
        "identificadores_tecnica": dict(tids.most_common(200)),
        "etiquetas_por_hora": [{"host": h, "dia": d, "hora_utc": hr, "tecnica": tec, "eventos": n}
                               for (h, d, hr, tec), n in sorted(etiqueta_hora.items())],
    }
    (out / "CENSO.json").write_text(json.dumps(censo, ensure_ascii=False), encoding="utf-8")
    manifiesto = {
        "inicio": inicio, "fin": ahora(), "segundos": round(time.time() - t0),
        "zip": str(args.zip), "miembro": args.miembro, "lineas_leidas": leidas, "bytes_leidos": bytes_leidos,
        "lectura_completa": not args.limite_bytes, "solo_censo": args.solo_censo,
        "seleccion": str(args.seleccion) if args.seleccion else None, "lineas_descartadas": dict(sin_campos),
        "parametros": {"canales": sorted(SOPORTADOS), "ventanas_utc": VENTANAS, "fraccion_host_dia": FRACCION_HOST_DIA,
                       "tope_ventana": TOPE_VENTANA, "tope_host": TOPE_HOST, "tope_global": TOPE_GLOBAL},
        "tope_global_alcanzado": tope_global_alcanzado, "copiadas": copiadas,
        "hosts": {hk: {"nombre": n, "registros": sum(v for (h, _, _), v in censo_hora.items() if h == hk),
                       "copiadas": host_n[hk]} for hk, n in sorted(nombres.items())},
        "particiones": sorted(partes, key=lambda x: x["ruta"]),
        "nota": "REAL es actividad normal según el editor, no un etiquetado independiente por evento. "
                "Muestra con margen: la v2 definitiva se selecciona después a partir de CENSO.json.",
    }
    (out / "MANIFEST.json").write_text(json.dumps(manifiesto, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Terminado: {leidas:,} líneas, {copiadas:,} copiadas en {len(partes)} particiones, {len(nombres)} hosts")


if __name__ == "__main__":
    main()
