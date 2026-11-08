"""COMISET LAB: recorta las horas extraídas a ventanas alrededor de la actividad etiquetada (FA.3).

Entrada: la extracción de fa_comiset_v2_extract.py --seleccion (horas enteras) y su SELECCION.json.
  - Hora de ATAQUE: se queda [primera etiqueta de interés − MARGEN, última + MARGEN], ordenado por
    tiempo, con un tope de TOPE_ATAQUE registros (si la ventana es mayor, se centra en la zona con
    más etiquetas de interés).
  - Hora de CONTROL: los primeros TOPE_CONTROL registros en orden de tiempo.
El presupuesto total (~600.000) lo fija la detección: LAB es un solo equipo, cae en una sola
partición y se detecta con un único proceso (~200 eventos/s).

Salida: una partición por hora en el formato de real-sample-v2 (host/día/hHH.jsonl.gz), lista para
fa_prepare_sources.py comiset-v2 con --origen.

Uso: python3 -I detection/evaluation/fa_comiset_lab_ventanas.py data/external/comiset/lab-horas \
       data/external/comiset/lab-censo-horas/SELECCION.json --salida data/external/comiset/lab-sample
"""
import argparse
import gzip
import json
import re
from datetime import datetime
from pathlib import Path

MARGEN_MS = 10 * 60 * 1000
TOPE_ATAQUE, TOPE_CONTROL = 45_000, 12_000
INTERES = re.compile(r"^(T1003|T1055|T1548|T1134|T1068|T1021|T1210|T1550|T1078)(\.\d{3})?$")


def instante(linea):
    s = json.loads(linea)["_source"]
    t = s["event_original_time"]
    return int(datetime.fromisoformat(t.replace("Z", "+00:00")).timestamp() * 1000), str(s.get("rule_technique_id") or "")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("extraccion", type=Path)
    ap.add_argument("seleccion", type=Path)
    ap.add_argument("--salida", type=Path, required=True)
    args = ap.parse_args()
    sel = {(c["host"], c["dia"], f"h{c['hora_utc']:02d}"): c for c in json.loads(args.seleccion.read_text())["celdas"]}
    args.salida.mkdir(parents=True, exist_ok=False)
    resumen = []
    for ruta in sorted(args.extraccion.glob("host-*/*/h*.jsonl.gz")):
        host, dia, hora = ruta.relative_to(args.extraccion).parts
        celda = sel[(host, dia, hora.split(".")[0])]
        with gzip.open(ruta, "rb") as fh:
            filas = []
            for linea in fh:
                t, tec = instante(linea)
                filas.append((t, INTERES.match(tec) is not None, linea))
        filas.sort(key=lambda x: x[0])
        if celda["tipo"] == "ataque":
            marcas = [t for t, interes, _ in filas if interes]
            ini, fin = (marcas[0] - MARGEN_MS, marcas[-1] + MARGEN_MS) if marcas else (filas[0][0], filas[-1][0])
            ventana = [f for f in filas if ini <= f[0] <= fin]
            if len(ventana) > TOPE_ATAQUE:
                # centrar en la mediana de las etiquetas de interés
                centro = sorted(marcas)[len(marcas) // 2] if marcas else ventana[len(ventana) // 2][0]
                i = min(range(len(ventana)), key=lambda k: abs(ventana[k][0] - centro))
                a = max(0, i - TOPE_ATAQUE // 2)
                ventana = ventana[a:a + TOPE_ATAQUE]
        else:
            ventana = filas[:TOPE_CONTROL]
        destino = args.salida / host / dia / hora
        destino.parent.mkdir(parents=True, exist_ok=True)
        with gzip.open(destino, "wb") as out:
            for _, _, linea in ventana:
                out.write(linea if linea.endswith(b"\n") else linea + b"\n")
        resumen.append({"particion": str(destino.relative_to(args.salida)), "tipo": celda["tipo"], "extraidas": len(filas),
                        "conservadas": len(ventana), "etiquetas_interes": sum(1 for f in ventana if f[1]),
                        "desde_ms": ventana[0][0] if ventana else None, "hasta_ms": ventana[-1][0] if ventana else None})
        print(f"{resumen[-1]['tipo']:<8} {resumen[-1]['particion']}: {len(filas):>8,} -> {len(ventana):>6,} "
              f"(etiquetas de interés conservadas: {resumen[-1]['etiquetas_interes']})", flush=True)
    (args.salida / "VENTANAS.json").write_text(json.dumps({"margen_ms": MARGEN_MS, "tope_ataque": TOPE_ATAQUE,
                                                           "tope_control": TOPE_CONTROL, "particiones": resumen},
                                                          indent=1, ensure_ascii=False), encoding="utf-8")
    print("total conservadas:", sum(r["conservadas"] for r in resumen))


if __name__ == "__main__":
    main()
