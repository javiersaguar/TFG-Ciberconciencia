# label_dataset.py
import json
import pandas as pd

TELEMETRY = r"C:\Lab\telemetry_clean.json"
MANIFEST  = r"C:\Lab\manifest.csv"
OUT       = r"C:\Lab\dataset_etiquetado.csv"
TOL       = pd.Timedelta(seconds=1)   # tolerancia por jitter de reloj

# 1) Telemetria (un JSON por linea)
eventos = []
with open(TELEMETRY, encoding="utf-8-sig") as f:
    for linea in f:
        linea = linea.strip()
        if linea:
            eventos.append(json.loads(linea))
df = pd.DataFrame(eventos)
df["TimeCreated"] = pd.to_datetime(df["TimeCreated"])

# 2) Manifiesto de ventanas
man = pd.read_csv(MANIFEST, encoding="utf-8-sig")
man["Inicio"] = pd.to_datetime(man["Inicio"])
man["Fin"]    = pd.to_datetime(man["Fin"])

# 3) Etiquetado por defecto
df["Etiqueta"] = "benigno"
df["Tecnica"]  = ""
df["Test"]     = ""

# 4) Join por ventana temporal
for _, w in man.iterrows():
    mask = (df["TimeCreated"] >= w["Inicio"] - TOL) & (df["TimeCreated"] <= w["Fin"] + TOL)
    df.loc[mask, "Etiqueta"] = "malicioso"
    df.loc[mask, "Tecnica"]  = w["Tecnica"]
    df.loc[mask, "Test"]     = str(w["Test"])

# 5) Resumen y guardado
print(df["Etiqueta"].value_counts())
print(df[df["Etiqueta"] == "malicioso"]["Tecnica"].value_counts())
df.to_csv(OUT, index=False, encoding="utf-8-sig")
print(f"\nGuardado -> {OUT}  ({len(df)} eventos)")