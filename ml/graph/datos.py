"""ML-3: extrae de Neo4j los datos para predecir tecnicas (F5.4).

Sale un unico JSON (data/ml3/attack.json) con lo que hace falta para entrenar y evaluar sin base de datos:

  entidades   grupos (intrusion-set) y campanas documentadas de ATT&CK v19.2, cada una con el conjunto de
              tecnicas PADRE que usa (las subtecnicas se suben a su padre, como en ML-2) y su FAMILIA;
  tecnicas    las tecnicas padre vigentes, con su nombre y sus tacticas;
  software    el malware y las herramientas con las tecnicas que usan (conocimiento, no evaluacion).

Familia: un grupo y las campanas que ATT&CK le atribuye van juntos. Comparten tecnicas, asi que
repartirlos en bloques distintos filtraria informacion del conjunto de evaluacion al de entrenamiento.

Solo cuentan las relaciones `uses` cargadas de ATT&CK (fuente attack-19.2): las de los perfiles de ML-2
se dejan fuera, porque son predicciones de otro modelo.

Uso (desde la raiz del repo, con Neo4j levantado):
  .venv/bin/python -m ml.graph.datos
"""
import hashlib
import json
import os
from pathlib import Path

SALIDA = Path("data/ml3/attack.json")
FUENTE = "attack-19.2"
VIVO = "NOT coalesce({v}.revoked, false) AND NOT coalesce({v}.deprecated, false)"

ENTIDADES = f"""
MATCH (e)-[u:USES]->(t:Technique)
WHERE (e:IntrusionSet OR e:CtiCampaign) AND $fuente IN u.sources AND {VIVO.format(v='e')} AND {VIVO.format(v='t')}
OPTIONAL MATCH (t)-[:SUBTECHNIQUE_OF]->(p:Technique)
WITH e, coalesce(p, t) AS padre WHERE {VIVO.format(v='padre')}
RETURN e.id AS id, e.external_id AS ext, e.name AS nombre,
       CASE WHEN e:IntrusionSet THEN 'grupo' ELSE 'campana' END AS tipo,
       collect(DISTINCT padre.external_id) AS tecnicas ORDER BY ext"""
ATRIBUCION = """
MATCH (c:CtiCampaign)-[a:ATTRIBUTED_TO]->(g:IntrusionSet) WHERE $fuente IN a.sources
RETURN c.external_id AS campana, g.external_id AS grupo"""
TECNICAS = f"""
MATCH (t:Technique) WHERE {VIVO.format(v='t')} AND NOT coalesce(t.is_subtechnique, false) AND $fuente IN t.sources
OPTIONAL MATCH (t)-[:IN_TACTIC]->(ta:Tactic)
RETURN t.external_id AS ext, t.name AS nombre, collect(DISTINCT ta.shortname) AS tacticas ORDER BY ext"""
SOFTWARE = f"""
MATCH (s:Software)-[u:USES]->(t:Technique) WHERE $fuente IN u.sources AND {VIVO.format(v='s')} AND {VIVO.format(v='t')}
OPTIONAL MATCH (t)-[:SUBTECHNIQUE_OF]->(p:Technique)
WITH s, coalesce(p, t) AS padre WHERE {VIVO.format(v='padre')}
RETURN s.external_id AS ext, collect(DISTINCT padre.external_id) AS tecnicas ORDER BY ext"""


def familias(entidades, atribuciones):
    """Componentes conexas de la atribucion campana -> grupo. La familia se nombra por su menor identificador."""
    padre = {e["ext"]: e["ext"] for e in entidades}

    def raiz(x):
        while padre[x] != x:
            padre[x] = padre[padre[x]]
            x = padre[x]
        return x

    for a in atribuciones:
        if a["campana"] in padre and a["grupo"] in padre:
            ra, rb = sorted((raiz(a["campana"]), raiz(a["grupo"])))
            padre[rb] = ra
    return {x: raiz(x) for x in padre}


def extraer(session):
    entidades = session.run(ENTIDADES, fuente=FUENTE).data()
    fam = familias(entidades, session.run(ATRIBUCION, fuente=FUENTE).data())
    tecnicas = session.run(TECNICAS, fuente=FUENTE).data()
    validas = {t["ext"] for t in tecnicas}
    for e in entidades:
        e["tecnicas"] = sorted(set(e["tecnicas"]) & validas)
        e["familia"] = fam[e["ext"]]
    software = [{"ext": s["ext"], "tecnicas": sorted(set(s["tecnicas"]) & validas)}
                for s in session.run(SOFTWARE, fuente=FUENTE).data()]
    doc = {"fuente": FUENTE, "entidades": entidades, "tecnicas": tecnicas, "software": software}
    doc["sha256"] = hashlib.sha256(json.dumps(doc, sort_keys=True).encode()).hexdigest()
    return doc


def main():
    from neo4j import GraphDatabase
    uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    with GraphDatabase.driver(uri, auth=("neo4j", "tfg-neo4j")) as driver, driver.session() as s:
        doc = extraer(s)
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(doc, indent=1, ensure_ascii=False), encoding="utf-8")
    ent = doc["entidades"]
    print(f"{SALIDA}: {len(ent)} entidades ({sum(e['tipo'] == 'grupo' for e in ent)} grupos, "
          f"{sum(e['tipo'] == 'campana' for e in ent)} campañas) en {len({e['familia'] for e in ent})} familias; "
          f"{sum(len(e['tecnicas']) for e in ent)} relaciones; {len(doc['tecnicas'])} técnicas padre; "
          f"{len(doc['software'])} programas")
    print(f"  con 5 técnicas o más: {sum(len(e['tecnicas']) >= 5 for e in ent)}; sha256 {doc['sha256'][:12]}")
    apt29 = [e for e in ent if e["familia"] == next(x["familia"] for x in ent if x["ext"] == "G0016")]
    print("  familia de APT29:", [(e["ext"], len(e["tecnicas"])) for e in apt29])


if __name__ == "__main__":
    main()
