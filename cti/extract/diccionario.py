"""Linea base LB-a de ML-2: emparejar el texto con un diccionario de ATT&CK (F4.3).

El diccionario sale del paquete STIX de ATT&CK v19.2: el nombre de cada tecnica y
subtecnica (tambien los de las revocadas, que traen nombres antiguos como "Credential
Dumping"), y sus identificadores T1xxx y T1xxx.yyy. Cada termino apunta a la tecnica
padre vigente. Si un nombre lo comparten varias tecnicas (p. ej. "Domain Accounts"), se
predicen todas. Busqueda sin distinguir mayusculas y por palabra completa.

Hay dos variantes. La BRUTA usa todos los terminos. La PODADA quita los que, en la
particion de DESARROLLO, saltan al menos PODA_MIN veces con precision < PODA_PREC: son sobre
todo nombres de subtecnica que solo significan algo junto a su padre ("Malware" de
T1587.001, "At", "Server", "DNS", "Tool"...). La poda se decide solo con desarrollo; la
particion de prueba no se mira hasta el final.

Es el equivalente propio de lo que hacen los importadores de documentos de las
plataformas CTI. Por construccion solo puede acertar menciones EXPLICITAS: la comparacion
con el modelo afinado en las implicitas es el argumento a favor de aprender.

Uso (desde la raiz del repo, tras cti.extract.annoctr):
  .venv/bin/python -m cti.extract.diccionario
"""
import collections
import json
import re
from pathlib import Path

from cti.attack_ids import PAQUETE, por_defecto
from cti.extract.metricas import evaluar, resumen_texto

DATOS = Path("data/ml2/annoctr")
PODA_MIN, PODA_PREC = 3, 0.2
RESULTADOS = Path("data/ml2/resultados")


def diccionario(paquete=PAQUETE):
    idx = por_defecto()
    terminos = collections.defaultdict(set)
    for o in json.loads(Path(paquete).read_text(encoding="utf-8"))["objects"]:
        if o["type"] != "attack-pattern":
            continue
        ext = next((r["external_id"] for r in o.get("external_references", [])
                    if r.get("source_name") == "mitre-attack"), None)
        padre = idx.padre(ext) if ext else None
        if not padre:
            continue
        terminos[o["name"].lower()].add(padre)
        terminos[ext.lower()].add(padre)
    return terminos


def compilar(terminos):
    # los terminos mas largos primero, para que "spearphishing attachment" gane a "phishing"
    orden = sorted(terminos, key=len, reverse=True)
    return re.compile(r"(?<![\w.])(" + "|".join(re.escape(t) for t in orden) + r")(?![\w])", re.I)


def predecir(texto, patron, terminos):
    return {t for m in patron.finditer(texto) for t in terminos[m.group(1).lower()]}


def podar(terminos, patron, filas_dev, espacio):
    """Terminos que en desarrollo saltan >= PODA_MIN veces con precision < PODA_PREC."""
    vp, total = collections.Counter(), collections.Counter()
    for f in filas_dev:
        oro = set(f["etiquetas"])
        for m in patron.finditer(f["texto"]):
            t = m.group(1).lower()
            for tec in terminos[t] & espacio:
                total[t] += 1
                vp[t] += tec in oro
    return sorted(t for t, n in total.items() if n >= PODA_MIN and vp[t] / n < PODA_PREC)


def leer(part):
    with (DATOS / f"{part}.jsonl").open(encoding="utf-8") as fh:
        return [json.loads(l) for l in fh]


def main():
    terminos = diccionario()
    espacio = json.loads((DATOS / "etiquetas.json").read_text(encoding="utf-8"))["espacio"]
    filas = {part: leer(part) for part in ("dev", "test")}
    quitados = podar(terminos, compilar(terminos), filas["dev"], set(espacio))
    podado = {t: v for t, v in terminos.items() if t not in quitados}
    RESULTADOS.mkdir(parents=True, exist_ok=True)
    salida = {"modelo": "LB-a diccionario ATT&CK 19.2", "terminos": len(terminos),
              "poda": {"min": PODA_MIN, "precision": PODA_PREC, "quitados": quitados}}
    print(f"Diccionario: {len(terminos)} terminos; poda en desarrollo quita {len(quitados)}: {quitados}")
    for variante, dic in (("bruto", terminos), ("podado", podado)):
        patron = compilar(dic)
        for part in ("dev", "test"):
            m = evaluar(filas[part], [predecir(f["texto"], patron, dic) for f in filas[part]], espacio)
            salida[f"{variante}_{part}"] = m
            print(resumen_texto(f"LB-a {variante} {part}", m))
    (RESULTADOS / "lb-a.json").write_text(json.dumps(salida, indent=1, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
