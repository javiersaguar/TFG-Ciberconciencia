"""Paso 5 de ML-2 ampliado: perfiles de los otros 9 informes de Microsoft, en STIX 2.1 (F4.3).

Completa el DoD 5 de F4 (>= 10 informes procesados y cargados en el grafo): los 6 de APT29 estan en
cti.extract.perfil_stix; aqui van los otros 9 del corpus (data/external/cti-public-reports), con el MISMO
sistema adoptado (SecureBERT 2.0 aumentado, media de 3 semillas y umbral mediano, UNION diccionario podado)
y las mismas frases de ANALISIS (cti.extract.informes).

Actor de cada informe: el grupo de ATT&CK v19.2 cuyo nombre o alias coincide EXACTAMENTE con el nombre de
Microsoft (comprobado por alias, no a mano). Storm-0558 no tiene grupo en ATT&CK y MS-2020-03-05 trata de
varios actores: esos dos entran solo como `report`, sin relacion `uses`.

Evaluacion extrinseca (como 6a, ahora sobre actores que no se usaron para disenar nada): por actor, el
perfil (tecnicas padre en >= 1 frase) frente a su ficha de ATT&CK (grupo + campanas atribuidas), solo dentro
del espacio de 62 etiquetas. Misma circularidad que APT29: las fichas de ATT&CK se construyen en parte con
estos mismos informes de Microsoft.

Salida: data/ml2/stix/informes-perfil.json y data/ml2/resultados/perfiles-informes.json. Ids uuid5 con el
mismo espacio de nombres que perfil_stix: recargar no duplica.

Uso (desde la raiz del repo):
  .venv-ml/bin/python -m cti.extract.perfiles_informes
  .venv/bin/python -m cti.stix_loader.load data/ml2/stix/informes-perfil.json --source ml2-informes
"""
import collections
import json
import statistics
from pathlib import Path

from cti.attack_ids import PAQUETE
from cti.extract import diccionario as dic
from cti.extract.informes import frases
from cti.extract.perfil_apt29 import probabilidades, puntuar, referencia
from cti.extract.perfil_stix import (CONFIANZA_DICCIONARIO, CREADO, DATOS, MODELO, MODIFICADO,
                                     metadatos_informes, sid)

SALIDA = Path("data/ml2/stix/informes-perfil.json")
RESULTADO = Path("data/ml2/resultados/perfiles-informes.json")
# informe -> nombre de Microsoft del actor (None si no hay un actor unico)
INFORMES = {
    "MS-2023-05-24": "Volt Typhoon", "MS-2023-07-14": "Storm-0558", "MS-2023-09-14": "Peach Sandstorm",
    "MS-2024-04-22": "Forest Blizzard", "MS-2024-09-26": "Storm-0501", "MS-2023-10-25": "Octo Tempest",
    "MS-2024-05-15": "Storm-1811", "MS-2023-04-18": "Mint Sandstorm", "MS-2020-03-05": None,
}


def indice_attack():
    objs = json.loads(Path(PAQUETE).read_text(encoding="utf-8"))["objects"]
    ext = lambda o: next((r["external_id"] for r in o.get("external_references", [])
                          if r.get("source_name") == "mitre-attack"), None)
    vivos = [o for o in objs if not o.get("revoked") and not o.get("x_mitre_deprecated")]
    tecnicas = {ext(o): o["id"] for o in vivos if o["type"] == "attack-pattern" and ext(o)}
    grupos = {}
    for o in vivos:
        if o["type"] == "intrusion-set":
            for n in [o["name"]] + o.get("aliases", []):
                grupos.setdefault(n.lower(), []).append((ext(o), o["id"]))
    return tecnicas, grupos


def main():
    espacio = json.loads((DATOS / "etiquetas.json").read_text(encoding="utf-8"))["espacio"]
    E = set(espacio)
    tecnicas, grupos = indice_attack()
    actor = {}
    for d, n in INFORMES.items():
        hits = sorted(set(grupos.get(n.lower(), []))) if n else []
        if len(hits) > 1:
            raise SystemExit(f"{n}: alias ambiguo en ATT&CK {hits}")
        actor[d] = hits[0] if hits else None

    usadas = [f for d in INFORMES for f in frases(d) if f["tipo"] == "analisis"]
    terminos = dic.diccionario()
    dev = [json.loads(l) for l in (DATOS / "dev.jsonl").open(encoding="utf-8")]
    quitados = dic.podar(terminos, dic.compilar(terminos), dev, E)
    podado = {t: v for t, v in terminos.items() if t not in quitados}
    patron = dic.compilar(podado)
    semillas = probabilidades([f["texto"] for f in usadas], MODELO)
    umbral = statistics.median(d["umbral"] for d in semillas.values())
    media = [[statistics.mean(d["probs"][i][j] for d in semillas.values()) for j in range(len(espacio))]
             for i in range(len(usadas))]

    # evidencia por (informe, tecnica)
    evid = collections.defaultdict(lambda: {"frases": 0, "conf": 0, "metodo": set(), "evidencia": None})
    for f, probs in zip(usadas, media):
        modelo = {espacio[j]: p for j, p in enumerate(probs) if p >= umbral}
        diccionario = dic.predecir(f["texto"], patron, podado) & E
        for t in set(modelo) | diccionario:
            e = evid[(f["doc"], t)]
            c = round(100 * modelo[t]) if t in modelo else CONFIANZA_DICCIONARIO
            e["frases"] += 1
            e["metodo"] |= ({"modelo"} if t in modelo else set()) | ({"diccionario"} if t in diccionario else set())
            if c > e["conf"]:
                e["conf"], e["evidencia"] = c, f"[{f['doc']}] {f['texto'][:300]}"

    meta = metadatos_informes()
    autor = sid("identity", "tfg-ml2")
    objs = [{"type": "identity", "spec_version": "2.1", "id": autor, "created": CREADO, "modified": MODIFICADO,
             "name": "TFG ML-2: SecureBERT 2.0 (aumentado) + diccionario ATT&CK", "identity_class": "system"}]
    por_actor = collections.defaultdict(dict)   # (gid, stix) -> tecnica -> evidencia agregada
    resumen = {"umbral": umbral, "informes": {}, "actores": {}}
    for d in INFORMES:
        tec_d = sorted(t for (doc, t) in evid if doc == d)
        refs = sorted(tecnicas[t] for t in tec_d if t in tecnicas)
        m = meta.get(d, {})
        a = actor[d]
        objs.append({"type": "report", "spec_version": "2.1", "id": sid("report", f"ml2|{d}"),
                     "created": CREADO, "modified": MODIFICADO, "created_by_ref": autor,
                     "name": m.get("titulo", d), "published": f"{d[3:]}T00:00:00.000Z",
                     "report_types": ["threat-actor", "attack-pattern"] if a else ["attack-pattern"],
                     "object_refs": ([a[1]] if a else []) + refs,
                     "external_references": [{"source_name": "microsoft-security-blog", "url": m["url"]}] if m.get("url") else [],
                     "x_tfg_informe": d, "x_tfg_tecnicas": len(refs), "x_tfg_actor_microsoft": INFORMES[d]})
        resumen["informes"][d] = {"actor_microsoft": INFORMES[d], "grupo": a[0] if a else None,
                                  "frases": sum(f["doc"] == d for f in usadas), "tecnicas": tec_d}
        if a:
            for t in tec_d:
                e, ag = evid[(d, t)], por_actor[a].setdefault(t, {"frases": 0, "conf": 0, "metodo": set(), "evidencia": None})
                ag["frases"] += e["frases"]
                ag["metodo"] |= e["metodo"]
                if e["conf"] > ag["conf"]:
                    ag["conf"], ag["evidencia"] = e["conf"], e["evidencia"]
    for (gid, gstix), tecs in sorted(por_actor.items()):
        for t, e in sorted(tecs.items()):
            if t not in tecnicas:
                continue
            objs.append({"type": "relationship", "spec_version": "2.1", "id": sid("relationship", f"ml2|{gid}|{t}"),
                         "created": CREADO, "modified": MODIFICADO, "created_by_ref": autor,
                         "relationship_type": "uses", "source_ref": gstix, "target_ref": tecnicas[t],
                         "confidence": e["conf"], "x_tfg_tecnica": t,
                         "x_tfg_metodo": "ambos" if len(e["metodo"]) == 2 else next(iter(e["metodo"])),
                         "x_tfg_frases": e["frases"], "x_tfg_evidencia": e["evidencia"], "x_tfg_fuente": "ml2"})
        ref = referencia(gid)["G0016+campanas"] & E   # (la clave se llama asi para cualquier grupo)
        resumen["actores"][gid] = {"perfil": sorted(tecs), "referencia_en_espacio": len(ref),
                                   **puntuar(set(tecs) & E, ref)}
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps({"type": "bundle", "id": sid("bundle", "ml2|informes-perfil"), "objects": objs},
                                 indent=1, ensure_ascii=False), encoding="utf-8")
    RESULTADO.write_text(json.dumps(resumen, indent=1, ensure_ascii=False), encoding="utf-8")

    print(f"{SALIDA}: {len(objs)} objetos; umbral {umbral}")
    for d, r in resumen["informes"].items():
        print(f"  {d} {str(r['actor_microsoft']):<16} {str(r['grupo']):<6} frases {r['frases']:>4}  técnicas {len(r['tecnicas'])}")
    print("| Grupo | Técnicas | Ref. en espacio | Aciertos | P | R | F1 |\n|---|---:|---:|---:|---:|---:|---:|")
    for g, r in resumen["actores"].items():
        print(f"| {g} | {r['tecnicas']} | {r['referencia_en_espacio']} | {r['aciertos']} | {r['precision']:.3f} | "
              f"{r['exhaustividad']:.3f} | {r['f1']:.3f} |")
    f1s = [r["f1"] for r in resumen["actores"].values()]
    print(f"F1 medio por actor: {statistics.mean(f1s):.3f} (min {min(f1s):.3f}, max {max(f1s):.3f})")


if __name__ == "__main__":
    main()
