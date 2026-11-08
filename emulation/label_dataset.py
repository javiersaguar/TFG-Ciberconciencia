"""Etiquetado offline del laboratorio propio (F2.3): telemetría + manifiesto de ventanas -> CSV etiquetado.

Versión final, con los filtros de contaminación de F2.3. La original con esos filtros vivía solo
en la VM (C:\\Lab) y se perdió al borrarla. Esta se reconstruyó el 08-11-2026 a partir de los datos
conservados (data/emulation-lab/ y VBoxShared) y reproduce fila a fila dataset_etiquetado_final.csv
(14.895 eventos: 14.765 benignos y 130 maliciosos). La comprobación está en el bloque __main__.

Pasos:
  1. etiqueta por ventana temporal del manifiesto (tolerancia de 1 s por el reloj);
  2. quita de las ventanas el andamiaje del framework (whoami.exe y HOSTNAME.EXE que lanza
     Invoke-AtomicTest para identificar el equipo; no forman parte de la técnica);
  3. quita las escrituras de svchost.exe en InventoryApplicationFile durante las ventanas: es
     Windows inventariando el binario recién ejecutado, no la técnica.
El ruido de PowerShell Module Logging (EventID 4103) ya no llega aquí: lo quitaba la exportación
(telemetry_clean_*.json no tiene ningún 4103).

Uso: python3 -I emulation/label_dataset.py TELEMETRIA.json MANIFIESTO.csv SALIDA.csv [--comparar FINAL.csv]
"""
import argparse
import json

import pandas as pd

TOL = pd.Timedelta(seconds=1)
ANDAMIAJE = {"whoami.exe", "hostname.exe"}


def binario(serie):
    return serie.fillna("").str.lower().str.split("\\").str[-1]


def etiquetar(telemetria, manifiesto):
    with open(telemetria, encoding="utf-8-sig") as f:
        df = pd.DataFrame([json.loads(linea) for linea in f if linea.strip()])
    df["TimeCreated"] = pd.to_datetime(df["TimeCreated"])
    man = pd.read_csv(manifiesto, encoding="utf-8-sig")
    man["Inicio"], man["Fin"] = pd.to_datetime(man["Inicio"]), pd.to_datetime(man["Fin"])
    df["Etiqueta"], df["Tecnica"], df["Test"] = "benigno", "", ""
    for _, w in man.iterrows():
        m = (df["TimeCreated"] >= w["Inicio"] - TOL) & (df["TimeCreated"] <= w["Fin"] + TOL)
        df.loc[m, ["Etiqueta", "Tecnica", "Test"]] = ["malicioso", w["Tecnica"], str(w["Test"])]
    mal = df["Etiqueta"].eq("malicioso")
    andamiaje = mal & (binario(df["Image"]).isin(ANDAMIAJE) | binario(df.get("NewProcessName", pd.Series(dtype=str))).isin(ANDAMIAJE))
    inventario = mal & binario(df["Image"]).eq("svchost.exe") & df["TargetObject"].fillna("").str.contains("InventoryApplicationFile", case=False)
    print(f"eventos {len(df)}; quitados: andamiaje {andamiaje.sum()}, inventario {inventario.sum()}")
    return df[~andamiaje & ~inventario].reset_index(drop=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("telemetria")
    ap.add_argument("manifiesto")
    ap.add_argument("salida")
    ap.add_argument("--comparar", help="CSV final de referencia: comprueba que el resultado es idéntico")
    args = ap.parse_args()
    df = etiquetar(args.telemetria, args.manifiesto)
    print(df["Etiqueta"].value_counts().to_dict(), df[df["Etiqueta"] == "malicioso"]["Tecnica"].value_counts().to_dict())
    df.to_csv(args.salida, index=False, encoding="utf-8-sig")
    if args.comparar:
        a = pd.read_csv(args.salida, encoding="utf-8-sig", dtype=str, keep_default_na=False)
        b = pd.read_csv(args.comparar, encoding="utf-8-sig", dtype=str, keep_default_na=False)
        igual = list(a.columns) == list(b.columns) and a.equals(b)
        print("IDÉNTICO a la referencia" if igual else f"DISTINTO de la referencia ({len(a)} frente a {len(b)} filas)")
        raise SystemExit(0 if igual else 1)


if __name__ == "__main__":
    main()
