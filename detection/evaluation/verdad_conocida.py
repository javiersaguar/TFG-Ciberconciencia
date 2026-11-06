"""Verdad conocida por dataset para cerrar F3: que patrones DEBERIAN disparar.

Genera detection/evaluation/verdad_datasets.csv con una fila por dataset del
corpus de F3 y por cada captura atomica de host que carga pipeline.load_atomics.
Cada fila trae las tecnicas y tacticas de ATT&CK de la verdad conocida y, a
partir de ellas, si cada patron esta ESPERADO:

  P1 robo de credenciales  -> alguna tecnica de la familia T1003.
  P2 movimiento lateral    -> la tactica TA0008 o una tecnica T1021, T1569.002
                              o T1570.
  P3 escalada + otra etapa -> escalada (tactica TA0004 o tecnica de las familias
                              T1548, T1134, T1055 o T1068) Y ademas descubrimiento
                              (TA0007) o persistencia (TA0003). Es multi-etapa por
                              definicion: una captura de una sola tactica no lo
                              cumple.

Una campana de un patron NO esperado en su dataset es un FALSO POSITIVO
candidato. Se revisa a mano antes de darlo por tal: un metadato puede no listar
actividad real del entorno de captura (p. ej. el C2 haciendo su reconocimiento).

Fuentes de la verdad:
  - atomicos: atomic/_metadata/*.yaml de OTRF (attack_mappings);
  - LSASS_campaign_01..07: compound/_metadata/LSASS_campaign_0X.yaml;
  - apt29 day1: el plan de emulacion (docs/scenarios/apt29-day1.md), con los
    identificadores traducidos a ATT&CK actual;
  - seis atomicos sin ficha: tactica de su carpeta y tecnica de su nombre,
    marcados como verdad PARCIAL.

Uso (desde la raiz del repo):
  .venv/bin/python -m detection.evaluation.verdad_conocida
"""
import csv
from pathlib import Path

import yaml

from pipeline.load_atomics import ATOMIC_BASE, load_metadata_index, summarize

COMPOUND_META = Path("data/Security-Datasets/datasets/compound/_metadata")
SALIDA = Path("detection/evaluation/verdad_datasets.csv")

# Tactica por carpeta de OTRF (para los atomicos sin ficha)
TACTICA_CARPETA = {
    "credential_access": "TA0006", "defense_evasion": "TA0005", "discovery": "TA0007",
    "execution": "TA0002", "lateral_movement": "TA0008", "persistence": "TA0003",
    "privilege_escalation": "TA0004", "collection": "TA0009",
}

# Atomicos sin ficha: tecnica deducida del nombre del fichero (verdad parcial)
SIN_FICHA = {
    "cmd_dumping_ntds_dit_file_volume_shadow_copy": ["T1003.003"],
    "empire_mimikatz_lsadump_inject_protected_mode": ["T1003"],
    "cmd_process_herpaderping_mimiexplorer": [],
    "covenant_com_wsman_automation": ["T1021.006"],
    "covenant_dcom_executeexcel4macro_blocked": ["T1021.003"],
    "covenant_psremoting_grunt": ["T1021.006"],
}

# apt29 day1: tecnicas del plan, ya en ATT&CK actual (docs/scenarios/apt29-day1.md)
APT29_DAY1 = {
    "techniques": [
        "T1003.001", "T1005", "T1018", "T1021.002", "T1021.006", "T1027", "T1027.002",
        "T1033", "T1036", "T1041", "T1056", "T1057", "T1059.001", "T1070.004", "T1074",
        "T1078", "T1082", "T1083", "T1105", "T1106", "T1112", "T1113", "T1115", "T1119",
        "T1140", "T1204", "T1543.003", "T1546.015", "T1547.001", "T1548.002", "T1552.001",
        "T1552.004", "T1560", "T1569.002", "T1570", "T1571",
    ],
    "tactics": ["TA0002", "TA0003", "TA0004", "TA0005", "TA0006", "TA0007", "TA0008",
                "TA0009", "TA0010", "TA0011"],
}

# Los 9 datasets del corpus de F3 (scripts/load_f3_corpus.sh)
LSASS = [f"LSASS_campaign_0{i}" for i in range(1, 8)]
COMSVCS = "SDWIN-201018195009"


def familia(tec):
    return tec.split(".")[0]


def esperados(techs, tactics):
    fams = {familia(t) for t in techs}
    tacs = set(tactics)
    p1 = "T1003" in fams
    p2 = "TA0008" in tacs or bool(fams & {"T1021", "T1570"}) or "T1569.002" in techs
    escalada = "TA0004" in tacs or bool(fams & {"T1548", "T1134", "T1055", "T1068"})
    p3 = escalada and bool(tacs & {"TA0007", "TA0003"})
    return p1, p2, p3


def fila(dataset_id, origen, titulo, techs, tactics, verdad="completa"):
    techs = sorted(set(techs))
    tactics = sorted(set(tactics))
    p1, p2, p3 = esperados(techs, tactics)
    return {
        "dataset_id": dataset_id, "origen": origen, "titulo": titulo or "",
        "tecnicas": "|".join(techs), "tacticas": "|".join(tactics), "verdad": verdad,
        "p1_esperado": int(p1), "p2_esperado": int(p2), "p3_esperado": int(p3),
    }


def main():
    filas = [fila("SDWIN-200501225525", "corpus", "APT29 day1 (MITRE ATT&CK Evaluations)",
                  APT29_DAY1["techniques"], APT29_DAY1["tactics"])]

    for ds in LSASS:
        meta = yaml.safe_load((COMPOUND_META / f"{ds}.yaml").read_text(encoding="utf-8"))
        s = summarize(meta)
        filas.append(fila(ds, "corpus", s["title"], s["techniques"], s["tactics"]))

    meta_index = load_metadata_index()
    vistos = set()
    for z in sorted(ATOMIC_BASE.rglob("*.zip")):
        if "host" not in z.parts:
            continue
        s = summarize(meta_index.get(z.name))
        if s["id"]:
            ds_id, origen = s["id"], ("corpus" if s["id"] == COMSVCS else "atomico")
            if ds_id in vistos:
                continue
            vistos.add(ds_id)
            filas.append(fila(ds_id, origen, s["title"], s["techniques"], s["tactics"]))
        else:
            # Mismo identificador que asigna pipeline.load_atomics
            ds_id = f"ATOMIC-{z.stem[:40]}"
            tac = TACTICA_CARPETA.get(z.relative_to(ATOMIC_BASE).parts[0])
            filas.append(fila(ds_id, "atomico", z.stem, SIN_FICHA.get(z.stem, []),
                              [tac] if tac else [], verdad="parcial"))

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    with SALIDA.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(filas[0]))
        w.writeheader()
        w.writerows(filas)

    n = len(filas)
    print(f"{SALIDA}: {n} datasets "
          f"({sum(f['origen'] == 'corpus' for f in filas)} del corpus, "
          f"{sum(f['origen'] == 'atomico' for f in filas)} atomicos, "
          f"{sum(f['verdad'] == 'parcial' for f in filas)} con verdad parcial)")
    for p in ("p1", "p2", "p3"):
        print(f"  {p.upper()} esperado en {sum(f[p + '_esperado'] for f in filas)}")


if __name__ == "__main__":
    main()
