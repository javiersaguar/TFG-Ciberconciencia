"""Aumento de datos de ML-2 con ejemplos de procedimiento de ATT&CK (F4.3, mejora del 07-11-2026).

Problema: tres técnicas centrales para los patrones del Pilar A no están en el espacio de
etiquetas porque AnnoCTR casi no las contiene: T1003 (volcado de credenciales, núcleo de P1) tiene
1 frase de entrenamiento, T1548 (elevación, P3) 2 y T1569 (ejecución por servicios, P2) ninguna.

Fuente: las relaciones `uses` de ATT&CK v19.2 llevan una descripción del PROCEDIMIENTO («X ha
usado Mimikatz para volcar credenciales…»), ligada a la técnica. Son frases cortas y etiquetadas
de forma natural, con la misma licencia que ATT&CK.

Construcción:
  - se toman las descripciones de las relaciones `uses` hacia las subtécnicas o la técnica padre de
    cada objetivo, sin revocadas ni obsoletas;
  - se EXCLUYEN las de G0016 (APT29) y sus campañas atribuidas, para no filtrar información hacia
    la evaluación sobre APT29 (perfil 6a y comparación con lo detectado 6b);
  - se limpia el marcado: enlaces [texto](url) -> texto y se quitan las citas (Citation: …);
  - se deduplican y se toma una muestra fija de hasta TOPE por técnica (semilla fija);
  - cada frase se etiqueta con su técnica padre.
Las particiones de AnnoCTR no cambian: el aumento solo se añade a entrenamiento, y desarrollo y
prueba siguen siendo las publicadas.

Salida en data/ml2/annoctr_aug/: train.jsonl (AnnoCTR + aumento), dev.jsonl y test.jsonl
(copias), etiquetas.json (espacio de 59 + los objetivos) y aumento.json (recuentos).

Uso (desde la raíz del repo):
  .venv/bin/python -m cti.extract.aumento_attack
"""
import json
import random
import re
import shutil
from pathlib import Path

from cti.attack_ids import PAQUETE, por_defecto

ORIGEN = Path("data/ml2/annoctr")
SALIDA = Path("data/ml2/annoctr_aug")
OBJETIVOS = ["T1003", "T1548", "T1569"]
TOPE = 300
SEMILLA = 2026
GRUPO_EXCLUIDO = "G0016"

_ENLACE = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_CITA = re.compile(r"\s*\(Citation:[^)]*\)")


def limpiar(texto):
    t = _ENLACE.sub(r"\1", texto or "")
    t = _CITA.sub("", t)
    t = re.sub(r"</?[a-zA-Z][^>]*>", "", t)        # etiquetas HTML como <code>
    return re.sub(r"\s+", " ", t).strip()


def main():
    idx = por_defecto()
    objs = json.loads(Path(PAQUETE).read_text(encoding="utf-8"))["objects"]
    ext = lambda o: next((r["external_id"] for r in o.get("external_references", [])
                          if r.get("source_name") == "mitre-attack"), None)
    vivo = lambda o: not o.get("revoked") and not o.get("x_mitre_deprecated")
    por_id = {o["id"]: o for o in objs}
    grupo = next(o["id"] for o in objs if o["type"] == "intrusion-set" and ext(o) == GRUPO_EXCLUIDO)
    excluidos = {grupo} | {o["source_ref"] for o in objs if o["type"] == "relationship"
                           and o.get("relationship_type") == "attributed-to" and o.get("target_ref") == grupo}

    candidatos = {t: set() for t in OBJETIVOS}
    excluidas = 0
    for r in objs:
        if r["type"] != "relationship" or r.get("relationship_type") != "uses" or not vivo(r):
            continue
        ap = por_id.get(r.get("target_ref"))
        if not ap or ap["type"] != "attack-pattern" or not vivo(ap):
            continue
        padre = idx.padre(ext(ap))
        if padre not in candidatos:
            continue
        if r.get("source_ref") in excluidos:
            excluidas += 1
            continue
        frase = limpiar(r.get("description"))
        if 20 <= len(frase) <= 600:
            candidatos[padre].add(frase)

    rng = random.Random(SEMILLA)
    aumento, recuento = [], {}
    for t in OBJETIVOS:
        frases = sorted(candidatos[t])
        rng.shuffle(frases)
        elegidas = frases[:TOPE]
        recuento[t] = {"disponibles": len(frases), "usadas": len(elegidas)}
        for i, f in enumerate(elegidas):
            aumento.append({"id": f"attack-{t}-{i:04d}", "doc": f"attack-procedimientos-{t}", "particion": "train",
                            "texto": f, "etiquetas": [t], "menciones": [{"texto": f, "clase": "procedimiento",
                                                                          "original": t, "tecnica": t}]})

    SALIDA.mkdir(parents=True, exist_ok=True)
    tren = [json.loads(l) for l in (ORIGEN / "train.jsonl").open(encoding="utf-8")]
    with (SALIDA / "train.jsonl").open("w", encoding="utf-8") as fh:
        for f in tren + aumento:
            fh.write(json.dumps(f, ensure_ascii=False) + "\n")
    for p in ("dev", "test"):
        shutil.copyfile(ORIGEN / f"{p}.jsonl", SALIDA / f"{p}.jsonl")
    etiquetas = json.loads((ORIGEN / "etiquetas.json").read_text(encoding="utf-8"))
    etiquetas["espacio"] = sorted(set(etiquetas["espacio"]) | set(OBJETIVOS))
    for t in OBJETIVOS:
        etiquetas["frecuencia_train"][t] = etiquetas["frecuencia_train"].get(t, 0) + recuento[t]["usadas"]
        etiquetas["nombres"].setdefault(t, idx.resolver(t).nombre)
    (SALIDA / "etiquetas.json").write_text(json.dumps(etiquetas, indent=1, ensure_ascii=False), encoding="utf-8")
    info = {"objetivos": OBJETIVOS, "tope": TOPE, "semilla": SEMILLA, "grupo_excluido": GRUPO_EXCLUIDO,
            "fuentes_excluidas": len(excluidos), "relaciones_excluidas": excluidas, "recuento": recuento,
            "frases_train": len(tren) + len(aumento), "espacio": len(etiquetas["espacio"])}
    (SALIDA / "aumento.json").write_text(json.dumps(info, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(info, indent=1, ensure_ascii=False))
    for t in OBJETIVOS:
        ej = next(a["texto"] for a in aumento if a["etiquetas"] == [t])
        print(f"  ej. {t}: {ej[:160]}")


if __name__ == "__main__":
    main()
