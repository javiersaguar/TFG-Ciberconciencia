"""AnnoCTR -> conjunto de datos de ML-2: frase -> tecnicas padre de ATT&CK (F4.3).

AnnoCTR anota por MENCION: un fragmento enlazado a una entidad de ATT&CK. La tarea de
ML-2 se plantea por FRASE (clasificacion multietiqueta), que es lo que despues se agrega
en el perfil de un informe:

  - las frases salen de `ner_json/{train,dev,test}.json` (todas, tambien las que no traen
    ninguna tecnica: son los ejemplos negativos);
  - cada mencion de tecnica marcada en una frase (capas `ce_tags` explicita y `ci_tags`
    implicita) se empareja, en orden, con su enlace de `linking_mitre_only` del mismo
    informe (por el texto de la mencion);
  - el identificador se normaliza a ATT&CK v19.2 y se sube a la tecnica padre
    (cti.attack_ids); los de ATT&CK Mobile y los desconocidos se descartan y se cuentan.

Las particiones son las publicadas, que ya separan por informe. Los 280 informes `ext`
no tienen anotaciones y no se usan. Se lee el ZIP directamente, sin extraerlo.

Salida en data/ml2/annoctr/: {train,dev,test}.jsonl (una frase por linea),
etiquetas.json (espacio de etiquetas y frecuencias) y resumen.json.

Uso (desde la raiz del repo):
  .venv/bin/python -m cti.extract.annoctr data/external/annoctr/AnnoCTR-d510b694.zip
"""
import argparse
import collections
import json
import re
import zipfile
from pathlib import Path

from cti.attack_ids import por_defecto

SALIDA = Path("data/ml2/annoctr")
PARTICIONES = ("train", "dev", "test")
MIN_FRASES = 5   # una tecnica entra en el espacio de etiquetas con >= 5 frases de entrenamiento

_ID_TECNICA = re.compile(r"(T\d{4}(?:[./]\d{3})?)")


def clave(texto):
    return re.sub(r"\s+", "", texto or "").lower()


def tramos(tokens, tags, tipo="TECHNIQUE"):
    """Textos de los tramos BIO de un tipo, en orden."""
    out, cur = [], None
    for tok, tag in zip(tokens, tags):
        if tag == f"B-{tipo}":
            if cur:
                out.append(cur)
            cur = [tok]
        elif tag == f"I-{tipo}" and cur is not None:
            cur.append(tok)
        else:
            if cur:
                out.append(cur)
            cur = None
    if cur:
        out.append(cur)
    return [" ".join(t) for t in out]


def leer_jsonl(z, ruta):
    return [json.loads(l) for l in z.read(ruta).decode("utf-8").splitlines() if l.strip()]


def construir(zip_path):
    idx = por_defecto()
    z = zipfile.ZipFile(zip_path)
    raiz = z.namelist()[0].split("/")[0] + "/AnnoCTR/"
    resumen = {"version_attack": idx.version, "particiones": {}}
    datos = {}
    for part in PARTICIONES:
        frases = leer_jsonl(z, f"{raiz}ner_json/{part}.json")
        enlaces = leer_jsonl(z, f"{raiz}linking_mitre_only/{part}.jsonl")
        cola = collections.defaultdict(lambda: collections.defaultdict(list))
        for e in enlaces:
            if e["entity_type"] == "TECHNIQUE":
                cola[e["document"]][clave(e["mention"])].append(e)
        filas, cont = [], collections.Counter()
        for s in frases:
            doc = s["id"].rsplit("__s", 1)[0]
            menciones = []
            for capa, clase in (("ce_tags", "explicita"), ("ci_tags", "implicita")):
                for texto in tramos(s["tokens"], s[capa]):
                    cont["menciones"] += 1
                    lista = cola[doc].get(clave(texto))
                    if not lista:
                        cont["sin_enlace"] += 1
                        continue
                    e = lista.pop(0)
                    m = _ID_TECNICA.search(e.get("label_link") or "")
                    original = m.group(1).replace("/", ".") if m else None
                    r = idx.resolver(original) if original else None
                    padre = idx.padre(original) if original else None
                    if not padre:
                        cont[f"descartada_{r.estado if r else 'sin_id'}"] += 1
                        continue
                    if r.estado != "vigente":
                        cont[f"traducida_{r.estado}"] += 1
                    menciones.append({"texto": texto, "clase": clase, "original": original, "tecnica": padre})
            etiquetas = sorted({m["tecnica"] for m in menciones})
            cont["frases"] += 1
            cont["frases_con_tecnica"] += bool(etiquetas)
            filas.append({"id": s["id"], "doc": doc, "particion": part, "texto": s["text"],
                          "etiquetas": etiquetas, "menciones": menciones})
        cont["enlaces_sin_frase"] = sum(len(v) for d in cola.values() for v in d.values())
        cont["informes"] = len({f["doc"] for f in filas})
        datos[part] = filas
        resumen["particiones"][part] = dict(cont)

    frec = collections.Counter(t for f in datos["train"] for t in f["etiquetas"])
    espacio = sorted(t for t, n in frec.items() if n >= MIN_FRASES)
    todas = collections.Counter(t for p in PARTICIONES for f in datos[p] for t in f["etiquetas"])
    resumen["espacio"] = {
        "min_frases_entrenamiento": MIN_FRASES, "tecnicas_en_espacio": len(espacio),
        "tecnicas_distintas_total": len(todas),
        "menciones_test_cubiertas": round(sum(
            1 for f in datos["test"] for m in f["menciones"] if m["tecnica"] in espacio) / max(1, sum(
            len(f["menciones"]) for f in datos["test"])), 3),
    }
    return datos, {"espacio": espacio, "frecuencia_train": dict(frec.most_common()),
                   "nombres": {t: idx.resolver(t).nombre for t in todas}}, resumen


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("zip", type=Path)
    args = ap.parse_args()
    datos, etiquetas, resumen = construir(args.zip)
    SALIDA.mkdir(parents=True, exist_ok=True)
    for part, filas in datos.items():
        with (SALIDA / f"{part}.jsonl").open("w", encoding="utf-8") as fh:
            for f in filas:
                fh.write(json.dumps(f, ensure_ascii=False) + "\n")
    (SALIDA / "etiquetas.json").write_text(json.dumps(etiquetas, indent=1, ensure_ascii=False), encoding="utf-8")
    (SALIDA / "resumen.json").write_text(json.dumps(resumen, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(resumen, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
