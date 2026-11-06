"""Carga un paquete STIX 2.1 en Neo4j, de forma idempotente.

Cada objeto se identifica por su `id` STIX (restriccion de unicidad sobre :StixObject),
asi que recargar el mismo paquete sobrescribe en lugar de duplicar. Cada nodo y cada
relacion guardan en `sources` las cargas que los han traido (p. ej. `attack-19.2`), lo que
permite comparar despues que aporta cada fuente.

Uso (desde la raiz del repo):
  .venv/bin/python -m cti.stix_loader.load data/cti/attack/enterprise-attack-19.2.json \\
      --source attack-19.2
  .venv/bin/python -m cti.stix_loader.load <paquete.json> --source <nombre> --dry-run
"""
import argparse
import collections
import json
import time
from pathlib import Path

from cti.stix_loader.transform import transformar

LOTE = 1000

ESQUEMA = [
    "CREATE CONSTRAINT stix_id IF NOT EXISTS FOR (n:StixObject) REQUIRE n.id IS UNIQUE",
    "CREATE INDEX stix_external_id IF NOT EXISTS FOR (n:StixObject) ON (n.external_id)",
    "CREATE INDEX technique_external_id IF NOT EXISTS FOR (n:Technique) ON (n.external_id)",
    "CREATE INDEX tactic_shortname IF NOT EXISTS FOR (n:Tactic) ON (n.shortname)",
]

# Anade la fuente a la lista `sources` sin repetirla.
_FUENTE = "coalesce({v}.sources, []) + CASE WHEN $src IN coalesce({v}.sources, []) THEN [] ELSE [$src] END"


def lotes(filas, n=LOTE):
    for i in range(0, len(filas), n):
        yield filas[i:i + n]


def cargar_nodos(session, nodos, src):
    por_etiquetas = collections.defaultdict(list)
    for n in nodos:
        por_etiquetas[tuple(n["labels"])].append({"id": n["id"], "props": n["props"]})
    for labels, filas in por_etiquetas.items():
        extra = "".join(f":{l}" for l in labels)  # validadas en transform (ETIQUETA)
        q = ("UNWIND $filas AS f MERGE (n:StixObject {id: f.id}) "
             f"SET n += f.props, n{extra}, n.sources = {_FUENTE.format(v='n')}")
        for lote in lotes(filas):
            session.run(q, filas=lote, src=src).consume()


def cargar_relaciones(session, relaciones, src):
    por_tipo = collections.defaultdict(list)
    for r in relaciones:
        por_tipo[r["tipo"]].append(r)
    sin_extremo = 0
    for tipo, filas in por_tipo.items():  # validado en transform (TIPO_REL)
        q = ("UNWIND $filas AS f "
             "MATCH (a:StixObject {id: f.origen}) MATCH (b:StixObject {id: f.destino}) "
             f"MERGE (a)-[r:{tipo} {{id: f.id}}]->(b) "
             f"SET r += f.props, r.sources = {_FUENTE.format(v='r')} "
             "RETURN count(*) AS n")
        for lote in lotes(filas):
            n = session.run(q, filas=lote, src=src).single()["n"]
            sin_extremo += len(lote) - n
    return sin_extremo


def cargar_tacticas(session, tacticas):
    q = ("UNWIND $filas AS f MATCH (t:Technique {id: f.tecnica}) "
         "MATCH (ta:Tactic {shortname: f.tactica}) MERGE (t)-[:IN_TACTIC]->(ta)")
    for lote in lotes(tacticas):
        session.run(q, filas=lote).consume()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paquete", type=Path, help="Fichero JSON con un bundle STIX 2.1")
    ap.add_argument("--source", required=True, help="Nombre de la carga, p. ej. attack-19.2")
    ap.add_argument("--uri", default="bolt://localhost:7687")
    ap.add_argument("--user", default="neo4j")
    ap.add_argument("--password", default="tfg-neo4j")
    ap.add_argument("--dry-run", action="store_true", help="Solo transforma y resume, sin tocar Neo4j")
    args = ap.parse_args()

    bundle = json.loads(args.paquete.read_text(encoding="utf-8"))
    nodos, relaciones, tacticas, descartes = transformar(bundle)
    etiq = collections.Counter(n["labels"][0] for n in nodos)
    print(f"{args.paquete.name}: {len(nodos)} nodos, {len(relaciones)} relaciones, "
          f"{len(tacticas)} aristas tecnica-tactica; descartes {descartes}")
    print("  nodos por tipo:", dict(etiq.most_common()))
    print("  relaciones por tipo:", dict(collections.Counter(r["tipo"] for r in relaciones).most_common()))
    if args.dry_run:
        return

    from neo4j import GraphDatabase  # solo hace falta para cargar de verdad

    t0 = time.time()
    with GraphDatabase.driver(args.uri, auth=(args.user, args.password)) as driver:
        with driver.session() as s:
            for q in ESQUEMA:
                s.run(q).consume()
            cargar_nodos(s, nodos, args.source)
            sin_extremo = cargar_relaciones(s, relaciones, args.source)
            cargar_tacticas(s, tacticas)
            total_n = s.run("MATCH (n:StixObject) RETURN count(n) AS n").single()["n"]
            total_r = s.run("MATCH (:StixObject)-[r]->(:StixObject) RETURN count(r) AS n").single()["n"]
    print(f"Cargado en {time.time() - t0:.1f} s. Relaciones sin alguno de sus extremos: {sin_extremo}")
    print(f"Grafo: {total_n} nodos StixObject y {total_r} relaciones entre ellos")


if __name__ == "__main__":
    main()
