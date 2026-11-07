"""COMISET REAL v2: elige qué horas de qué hosts forman la muestra, a partir del censo (FA.3).

Entrada: CENSO.json de la primera pasada (fa_comiset_v2_extract.py --solo-censo), con los registros
de canales soportados (Sysmon, Security, PowerShell) por host, día y hora UTC.

Criterio, fijado antes de ver resultados de detección:
  - solo celdas (host, día, hora) con registros soportados;
  - CELDAS_POR_HOST horas por host, REPARTIDAS UNIFORMEMENTE a lo largo de toda su actividad
    (ordenada por día y hora), para cubrir días distintos, horas laborables y nocturnas;
  - una celda aporta como mucho TOPE_CELDA registros (los primeros de la hora, en orden de
    fichero, del orden de 10–15 min continuos de Sysmon): una hora ruidosa no se lleva la muestra.
Unidad de muestreo: la hora continua. Un muestreo al azar de eventos rompería las secuencias que
buscan los patrones.

Salida: SELECCION.json (lista de celdas y recuentos previstos), entrada de
fa_comiset_v2_extract.py --seleccion.

Uso: python3 -I detection/evaluation/fa_comiset_v2_select.py data/external/comiset/real-v2-censo/CENSO.json \
       --salida data/external/comiset/real-v2-censo/SELECCION.json
"""
import argparse
import collections
import json
from pathlib import Path

CELDAS_POR_HOST = 8
TOPE_CELDA = 20_000
FRANJAS = [(0, 6), (6, 12), (12, 18), (18, 24)]


def franja(hora):
    return next(i for i, (a, b) in enumerate(FRANJAS) if a <= hora < b)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("censo", type=Path)
    ap.add_argument("--salida", type=Path, required=True)
    args = ap.parse_args()
    censo = json.loads(args.censo.read_text(encoding="utf-8"))
    celdas = collections.defaultdict(list)                 # host -> [(dia, hora, soportados)]
    for r in censo["por_hora"]:
        if r.get("soportados", 0) > 0:
            celdas[r["host"]].append((r["dia"], r["hora_utc"], r["soportados"]))

    elegidas, por_host = [], collections.Counter()
    for h, cs in sorted(celdas.items()):
        cs = sorted(cs)
        k = min(CELDAS_POR_HOST, len(cs))
        indices = sorted({round(i * (len(cs) - 1) / max(k - 1, 1)) for i in range(k)})
        for i in indices:
            dia, hora, n = cs[i]
            aporte = min(n, TOPE_CELDA)
            elegidas.append({"host": h, "dia": dia, "hora_utc": hora, "soportados": n, "previstos": aporte})
            por_host[h] += aporte

    total = sum(c["previstos"] for c in elegidas)
    resumen = {
        "celdas_por_host": CELDAS_POR_HOST, "tope_celda": TOPE_CELDA, "celdas": len(elegidas), "previstos": total,
        "hosts_con_soportados": len(celdas), "hosts_elegidos": len(por_host),
        "dias": len({c["dia"] for c in elegidas}),
        "por_franja": dict(collections.Counter(f"{FRANJAS[franja(c['hora_utc'])][0]:02d}-{FRANJAS[franja(c['hora_utc'])][1]:02d}"
                                               for c in elegidas)),
        "por_host": dict(sorted(por_host.items())),
    }
    args.salida.write_text(json.dumps({"resumen": resumen, "celdas": elegidas}, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(resumen, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
