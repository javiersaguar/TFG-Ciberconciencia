"""Carga en Neo4j el inventario observado de un escenario (F5.1), de forma idempotente.

Lee el JSON de graph.inventory.extraer. Fusiona por `id` (los identificadores son deterministas) y
despues borra lo obsoleto: lo que quedaba de una carga anterior de ESE escenario con `origen`
observado o inferido y que ya no sale. No toca los nodos :StixObject ni nada con origen sintetico.

Las relaciones EVIDENCES van de una campana a la tecnica vigente de ATT&CK con ese `external_id`
(cargada por cti.stix_loader). Si una tecnica no esta en el grafo, se informa y no se inventa.

Uso (desde la raiz del repo, con Neo4j levantado):
  .venv/bin/python -m graph.inventory.cargar data/graph/inventario-apt29-day1.json
  .venv/bin/python -m graph.inventory.cargar data/graph/inventario-apt29-day1.json --dry-run
"""
import argparse
import collections
import json
import time
from pathlib import Path

ETIQUETAS = {"TfgObject", "Host", "Zone", "Service", "User", "Campaign"}
TIPOS = {"IN_ZONE", "RUNS", "CONNECTS_TO", "LOGGED_ON", "ADMIN_OF", "OBSERVED_ON", "EVIDENCES"}
ESQUEMA = [
    "CREATE CONSTRAINT tfg_id IF NOT EXISTS FOR (n:TfgObject) REQUIRE n.id IS UNIQUE",
    "CREATE INDEX tfg_escenario IF NOT EXISTS FOR (n:TfgObject) ON (n.escenario)",
    "CREATE INDEX host_name IF NOT EXISTS FOR (n:Host) ON (n.name)",
]
REGENERABLE = ["observado", "inferido"]


def validar(doc):
    for n in doc["nodos"]:
        if not set(n["labels"]) <= ETIQUETAS or "TfgObject" not in n["labels"]:
            raise ValueError(f"Etiquetas no previstas: {n['labels']}")
        if n["props"].get("escenario") != doc["escenario"] or n["props"].get("origen") not in REGENERABLE:
            raise ValueError(f"Nodo sin escenario u origen válidos: {n['id']}")
    for r in doc["relaciones"]:
        if r["tipo"] not in TIPOS:
            raise ValueError(f"Tipo de relación no previsto: {r['tipo']}")
        if r["props"].get("escenario") != doc["escenario"] or r["props"].get("origen") not in REGENERABLE:
            raise ValueError(f"Relación sin escenario u origen válidos: {r['id']}")


def cargar(tx, doc):
    por_etiquetas = collections.defaultdict(list)
    for n in doc["nodos"]:
        por_etiquetas[tuple(n["labels"])].append({"id": n["id"], "props": n["props"]})
    for labels, filas in por_etiquetas.items():      # etiquetas validadas contra ETIQUETAS
        extra = "".join(f":{l}" for l in labels)
        tx.run(f"UNWIND $filas AS f MERGE (n:TfgObject {{id: f.id}}) SET n += f.props, n{extra}", filas=filas).consume()

    por_tipo = collections.defaultdict(list)
    for r in doc["relaciones"]:
        por_tipo[(r["tipo"], "destino_externo" in r)].append(
            {"id": r["id"], "origen": r["origen"], "destino": r.get("destino") or r["destino_externo"], "props": r["props"]})
    sin_extremo = []
    for (tipo, externo), filas in por_tipo.items():   # tipo validado contra TIPOS
        destino = ("MATCH (b:Technique {external_id: f.destino}) WHERE NOT coalesce(b.revoked, false) "
                   "AND NOT coalesce(b.deprecated, false)") if externo else "MATCH (b:TfgObject {id: f.destino})"
        hechas = tx.run(f"UNWIND $filas AS f MATCH (a:TfgObject {{id: f.origen}}) {destino} "
                        f"MERGE (a)-[r:{tipo} {{id: f.id}}]->(b) SET r = f.props RETURN collect(f.id) AS ids",
                        filas=filas).single()["ids"]
        sin_extremo += sorted({f["id"] for f in filas} - set(hechas))

    # lo obsoleto de este escenario (solo las capas que regenera este cargador)
    esc = doc["escenario"]
    rels = tx.run("MATCH (:TfgObject)-[r]->() WHERE r.escenario = $e AND r.origen IN $o AND NOT r.id IN $ids "
                  "DELETE r RETURN count(r) AS n", e=esc, o=REGENERABLE, ids=[r["id"] for r in doc["relaciones"]]).single()["n"]
    nodos = tx.run("MATCH (n:TfgObject) WHERE n.escenario = $e AND n.origen IN $o AND NOT n.id IN $ids "
                   "DETACH DELETE n RETURN count(n) AS n", e=esc, o=REGENERABLE, ids=[n["id"] for n in doc["nodos"]]).single()["n"]
    return sin_extremo, rels, nodos


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inventario", type=Path, help="JSON de graph.inventory.extraer")
    ap.add_argument("--uri", default="bolt://localhost:7687")
    ap.add_argument("--user", default="neo4j")
    ap.add_argument("--password", default="tfg-neo4j")
    ap.add_argument("--dry-run", action="store_true", help="Solo valida y resume, sin tocar Neo4j")
    args = ap.parse_args()

    doc = json.loads(args.inventario.read_text(encoding="utf-8"))
    validar(doc)
    print(f"{args.inventario.name} ({doc['escenario']}): {len(doc['nodos'])} nodos y {len(doc['relaciones'])} relaciones")
    if args.dry_run:
        return

    from neo4j import GraphDatabase  # solo hace falta para cargar de verdad
    t0 = time.time()
    with GraphDatabase.driver(args.uri, auth=(args.user, args.password)) as driver:
        with driver.session() as s:
            for q in ESQUEMA:
                s.run(q).consume()
            sin_extremo, rels, nodos = s.execute_write(cargar, doc)
            total = s.run("MATCH (n:TfgObject {escenario: $e}) UNWIND labels(n) AS l WITH l, count(*) AS c "
                          "WHERE l <> 'TfgObject' RETURN l, c ORDER BY l", e=doc["escenario"]).values()
            tr = s.run("MATCH (:TfgObject)-[r]->() WHERE r.escenario = $e RETURN type(r) AS t, count(*) AS c ORDER BY t",
                       e=doc["escenario"]).values()
    print(f"Cargado en {time.time() - t0:.1f} s. Obsoletos borrados: {nodos} nodos y {rels} relaciones.")
    print(f"  relaciones sin alguno de sus extremos: {len(sin_extremo)} {sin_extremo[:5]}")
    print("  en el grafo:", dict(map(tuple, total)), dict(map(tuple, tr)))


if __name__ == "__main__":
    main()
