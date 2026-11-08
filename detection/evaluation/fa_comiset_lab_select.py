"""COMISET LAB: elige horas de ataque y de control a partir del censo de etiquetas por hora (FA.3).

LAB no publica una verdad independiente: sus etiquetas (rule_technique_id) las pone un sistema de
reglas en tiempo real (Pérez-Sánchez et al., Data in Brief 2025). Además es, en la práctica, un único
equipo (desktop-4pvps6e.phoenix.local, 49,9 M de registros entre el 16 y el 25-11-2022), así que P2
(movimiento lateral, dos equipos) no se puede observar.

Criterio, fijado antes de ver ningún resultado de detección:
  - técnicas de interés (las de los ataques descritos en el artículo y las que miran P1 y P3):
    credenciales T1003*, inyección T1055*, elevación T1548*/T1134*/T1068, servicios remotos T1021*,
    explotación T1210, uso de credenciales T1550*/T1078*;
  - HORAS DE ATAQUE: las ATAQUE_N horas con más eventos etiquetados con esas técnicas;
  - HORAS DE CONTROL: CONTROL_N horas con eventos soportados y NINGUNA etiqueta de esas técnicas,
    repartidas uniformemente en el tiempo;
  - se extraen las horas enteras; luego fa_comiset_lab_ventanas.py recorta cada hora de ataque a
    [primera etiqueta − 10 min, última + 10 min] con tope, y las de control a sus primeros registros.

Uso: python3 -I detection/evaluation/fa_comiset_lab_select.py data/external/comiset/lab-censo-horas/CENSO.json \
       --salida data/external/comiset/lab-censo-horas/SELECCION.json
"""
import argparse
import collections
import json
import re
from pathlib import Path

ATAQUE_N, CONTROL_N = 12, 6
INTERES = re.compile(r"^(T1003|T1055|T1548|T1134|T1068|T1021|T1210|T1550|T1078)(\.\d{3})?$")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("censo", type=Path)
    ap.add_argument("--salida", type=Path, required=True)
    args = ap.parse_args()
    c = json.loads(args.censo.read_text(encoding="utf-8"))
    puntos = collections.Counter()
    detalle = collections.defaultdict(collections.Counter)
    for r in c["etiquetas_por_hora"]:
        if INTERES.match(r["tecnica"]):
            k = (r["host"], r["dia"], r["hora_utc"])
            puntos[k] += r["eventos"]
            detalle[k][r["tecnica"]] += r["eventos"]
    soportados = {(r["host"], r["dia"], r["hora_utc"]): r["soportados"] for r in c["por_hora"] if r["soportados"] > 0}
    ataque = [k for k, _ in puntos.most_common(ATAQUE_N)]
    tranquilas = sorted(k for k in soportados if puntos[k] == 0)
    paso = max(1, len(tranquilas) // CONTROL_N)
    control = tranquilas[::paso][:CONTROL_N]
    celdas = ([{"host": h, "dia": d, "hora_utc": hr, "tipo": "ataque", "soportados": soportados.get((h, d, hr), 0),
                "etiquetas_interes": puntos[(h, d, hr)], "tecnicas": dict(detalle[(h, d, hr)].most_common(8))}
               for h, d, hr in ataque]
              + [{"host": h, "dia": d, "hora_utc": hr, "tipo": "control", "soportados": soportados[(h, d, hr)],
                  "etiquetas_interes": 0, "tecnicas": {}} for h, d, hr in control])
    resumen = {"ataque_n": len(ataque), "control_n": len(control), "tope_celda": 10_000_000,
               "horas_con_etiquetas_de_interes": len(puntos), "horas_con_soportados": len(soportados),
               "registros_a_extraer": sum(x["soportados"] for x in celdas)}
    args.salida.write_text(json.dumps({"resumen": resumen, "celdas": celdas}, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(resumen, indent=1, ensure_ascii=False))
    for x in celdas:
        print(f"  {x['tipo']:<8} {x['dia']} {x['hora_utc']:02d}h  soportados {x['soportados']:>9,}  interés {x['etiquetas_interes']:>6}  {x['tecnicas']}")


if __name__ == "__main__":
    main()
