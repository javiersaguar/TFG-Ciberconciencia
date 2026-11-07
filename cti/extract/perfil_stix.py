"""Paso 5 de ML-2: perfil de APT29 extraido de los informes, en STIX 2.1, para el grafo (F4.3).

Sistema: el decidido por validacion cruzada, SecureBERT 2.0 UNION diccionario podado.
  - Modelo: media de las probabilidades de las 3 semillas de la particion publicada, con el
    umbral mediano de las tres (0,20).
  - Diccionario: el de la LB-a (poda decidida en desarrollo).
Solo se usan las frases de ANALISIS (cti.extract.informes): ni las secciones de defensa ni
las tablas ATT&CK del propio editor.

Salida (data/ml2/stix/apt29-perfil.json), sin objetos de ATT&CK: los extremos ya estan en el
grafo desde la carga de F4.1 y se enlazan por su id STIX.
  - identity   el extractor (TFG ML-2);
  - report     uno por informe, con object_refs a G0016 y a las tecnicas extraidas de el
               (el cargador las convierte en (:Report)-[:REFERS_TO]->());
  - relationship G0016 -uses-> tecnica, una por tecnica del perfil, con:
      confidence        0-100. Si la saca el modelo: 100 x su probabilidad maxima en una frase.
                        Si solo la saca el diccionario: 61, la precision del diccionario en la
                        validacion cruzada (no se mira prueba);
      x_tfg_metodo      modelo | diccionario | ambos;
      x_tfg_frases, x_tfg_informes, x_tfg_evidencia (la frase de mas confianza, recortada).
Los ids son uuid5 deterministas: recargar no duplica.

Uso (desde la raiz del repo):
  .venv-ml/bin/python -m cti.extract.perfil_stix
  .venv/bin/python -m cti.stix_loader.load data/ml2/stix/apt29-perfil.json --source ml2-apt29   # con Neo4j
"""
import collections
import json
import re
import statistics
import uuid
from pathlib import Path

from cti.attack_ids import PAQUETE
from cti.extract import diccionario as dic
from cti.extract.informes import APT29, CARPETA, frases
from cti.extract.perfil_apt29 import probabilidades

DATOS = Path("data/ml2/annoctr")
SALIDA = Path("data/ml2/stix/apt29-perfil.json")
NS = uuid.UUID("6f1c2a5e-6d1b-4e0c-9f2a-7c3d5b1e8a40")   # espacio de nombres propio de ML-2
CREADO = "2026-11-07T00:00:00.000Z"
CONFIANZA_DICCIONARIO = 61
GRUPO = "G0016"


def sid(tipo, clave):
    return f"{tipo}--{uuid.uuid5(NS, clave)}"


def indice_attack():
    objs = json.loads(Path(PAQUETE).read_text(encoding="utf-8"))["objects"]
    ext = lambda o: next((r["external_id"] for r in o.get("external_references", [])
                          if r.get("source_name") == "mitre-attack"), None)
    tecnicas = {ext(o): o["id"] for o in objs if o["type"] == "attack-pattern"
                and not o.get("revoked") and not o.get("x_mitre_deprecated") and ext(o)}
    grupo = next(o["id"] for o in objs if o["type"] == "intrusion-set" and ext(o) == GRUPO)
    return tecnicas, grupo


def metadatos_informes():
    """Titulo y URL de cada informe, de REPORTS.md (tabla | id | titulo | url | ...)."""
    out = {}
    for linea in (CARPETA / "REPORTS.md").read_text(encoding="utf-8").splitlines():
        c = [x.strip() for x in linea.strip().strip("|").split("|")]
        if len(c) >= 3 and re.match(r"^MS-\d{4}-\d{2}-\d{2}$", c[0]):
            out[c[0]] = {"titulo": c[1], "url": c[2]}
    return out


def main():
    etiquetas = json.loads((DATOS / "etiquetas.json").read_text(encoding="utf-8"))
    espacio = etiquetas["espacio"]
    E = set(espacio)
    usadas = [f for d in APT29 for f in frases(d) if f["tipo"] == "analisis"]

    terminos = dic.diccionario()
    dev = [json.loads(l) for l in (DATOS / "dev.jsonl").open(encoding="utf-8")]
    quitados = dic.podar(terminos, dic.compilar(terminos), dev, E)
    podado = {t: v for t, v in terminos.items() if t not in quitados}
    patron = dic.compilar(podado)

    semillas = probabilidades([f["texto"] for f in usadas])
    umbral = statistics.median(d["umbral"] for d in semillas.values())
    media = [[statistics.mean(d["probs"][i][j] for d in semillas.values()) for j in range(len(espacio))]
             for i in range(len(usadas))]

    evid = collections.defaultdict(lambda: {"frases": 0, "informes": set(), "conf": 0, "metodo": set(),
                                            "evidencia": None, "conf_evidencia": -1})
    por_informe = collections.defaultdict(set)
    for f, probs in zip(usadas, media):
        modelo = {espacio[j]: p for j, p in enumerate(probs) if p >= umbral}
        diccionario = dic.predecir(f["texto"], patron, podado) & E
        for t in set(modelo) | diccionario:
            e = evid[t]
            c = round(100 * modelo[t]) if t in modelo else CONFIANZA_DICCIONARIO
            e["frases"] += 1
            e["informes"].add(f["doc"])
            e["metodo"] |= ({"modelo"} if t in modelo else set()) | ({"diccionario"} if t in diccionario else set())
            if c > e["conf_evidencia"]:
                e["conf_evidencia"], e["evidencia"] = c, f"[{f['doc']}] {f['texto'][:300]}"
            e["conf"] = max(e["conf"], c)
            por_informe[f["doc"]].add(t)

    tecnicas, grupo = indice_attack()
    meta = metadatos_informes()
    autor = sid("identity", "tfg-ml2")
    objs = [{"type": "identity", "spec_version": "2.1", "id": autor, "created": CREADO, "modified": CREADO,
             "name": "TFG ML-2: SecureBERT 2.0 + diccionario ATT&CK", "identity_class": "system"}]
    sin_id = []
    for d in APT29:
        refs = sorted(tecnicas[t] for t in por_informe[d] if t in tecnicas)
        m = meta.get(d, {})
        objs.append({"type": "report", "spec_version": "2.1", "id": sid("report", f"ml2|{d}"),
                     "created": CREADO, "modified": CREADO, "created_by_ref": autor,
                     "name": m.get("titulo", d), "published": f"{d[3:]}T00:00:00.000Z",
                     "report_types": ["threat-actor", "attack-pattern"],
                     "object_refs": [grupo] + refs,
                     "external_references": [{"source_name": "microsoft-security-blog", "url": m["url"]}] if m.get("url") else [],
                     "x_tfg_informe": d, "x_tfg_tecnicas": len(refs)})
    for t, e in sorted(evid.items()):
        if t not in tecnicas:
            sin_id.append(t)
            continue
        metodo = "ambos" if len(e["metodo"]) == 2 else next(iter(e["metodo"]))
        objs.append({"type": "relationship", "spec_version": "2.1", "id": sid("relationship", f"ml2|{GRUPO}|{t}"),
                     "created": CREADO, "modified": CREADO, "created_by_ref": autor,
                     "relationship_type": "uses", "source_ref": grupo, "target_ref": tecnicas[t],
                     "confidence": e["conf"], "x_tfg_tecnica": t, "x_tfg_metodo": metodo,
                     "x_tfg_frases": e["frases"], "x_tfg_informes": len(e["informes"]),
                     "x_tfg_evidencia": e["evidencia"], "x_tfg_fuente": "ml2"})
    paquete = {"type": "bundle", "id": sid("bundle", "ml2|apt29-perfil"), "objects": objs}
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(paquete, indent=1, ensure_ascii=False), encoding="utf-8")

    rels = [o for o in objs if o["type"] == "relationship"]
    print(f"{SALIDA}: {len(objs)} objetos ({len(APT29)} informes, {len(rels)} relaciones uses); umbral {umbral}")
    print(f"metodo: {dict(collections.Counter(o['x_tfg_metodo'] for o in rels))}; sin id en ATT&CK: {sin_id}")
    for o in sorted(rels, key=lambda o: -o["confidence"]):
        print(f"  {o['x_tfg_tecnica']:<6} conf {o['confidence']:>3} {o['x_tfg_metodo']:<11} "
              f"frases {o['x_tfg_frases']:>3} informes {o['x_tfg_informes']}")


if __name__ == "__main__":
    main()
