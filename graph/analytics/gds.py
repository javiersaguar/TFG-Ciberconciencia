"""Analitica de grafos con Neo4j GDS sobre un escenario (F5.2).

Dos grafos, dos preguntas:

  1. RED (equipos y conexiones observadas): ¿que equipos son puntos de paso?
       PageRank y centralidad de intermediacion, dirigidas. Se escriben en los :Host
       (`gds_pagerank`, `gds_betweenness`).

  2. GRAFO DE DERIVACION (estados del adversario y aplicaciones de regla, de graph.datalog.razonar):
       - intermediacion de cada estado (`gds_betweenness` en :AttackState), que se compara con el
         analisis EXACTO de cortes que ya trae el estado (`cuts_assets`: activos que se pierden si el
         adversario no puede lograr ese estado);
       - camino de menor coste del adversario a cada activo (Dijkstra), con el coste de cada paso en
         la relacion CONCLUDES: 0 si esta confirmado, -ln(EPSS) si explota una vulnerabilidad y 1 para
         el resto.

Limite que se mide y se informa: GDS trata el grafo de derivacion como un grafo normal, y una regla
con dos precondiciones (ejecutar en A Y tener las credenciales de U) le parece alcanzable con una sola.
Por cada camino de Dijkstra se comprueba si es una prueba valida (`prueba_valida`): si no lo es, le
falta alguna precondicion y el camino no es un ataque completo.

No se calculan comunidades (Louvain): con 4 equipos monitorizados no aportan nada.

Uso (desde la raiz del repo, con Neo4j levantado y la capa derivada cargada):
  .venv/bin/python -m graph.analytics.gds apt29-day1
"""
import argparse
import json
import os
from pathlib import Path

SALIDA = Path("data/graph")
INICIO = "adversario"


def _proyectar(s, nombre, consulta, **params):
    s.run("CALL gds.graph.drop($n, false)", n=nombre).consume()
    r = s.run(consulta, n=nombre, **params).single()
    return r["nodos"], r["relaciones"]


def red(s, esc):
    """PageRank e intermediacion de los equipos sobre las conexiones observadas."""
    g = f"tfg-red-{esc}"
    nodos, rels = _proyectar(s, g, """
        MATCH (a:Host {escenario: $e})-[c:CONNECTS_TO]->(b:Host)
        WITH a, b, count(c) AS servicios
        WITH gds.graph.project($n, a, b, {relationshipProperties: {servicios: servicios}}) AS p
        RETURN p.nodeCount AS nodos, p.relationshipCount AS relaciones""", e=esc)
    s.run("""CALL gds.pageRank.stream($n) YIELD nodeId, score
             WITH gds.util.asNode(nodeId) AS h, score SET h.gds_pagerank = round(score, 4)""", n=g).consume()
    s.run("""CALL gds.betweenness.stream($n) YIELD nodeId, score
             WITH gds.util.asNode(nodeId) AS h, score SET h.gds_betweenness = round(score, 4)""", n=g).consume()
    filas = s.run("""MATCH (h:Host {escenario: $e}) WHERE h.gds_pagerank IS NOT NULL
                     RETURN h.name AS equipo, h.role AS papel, h.monitored AS monitorizado,
                            h.gds_pagerank AS pagerank, h.gds_betweenness AS intermediacion
                     ORDER BY pagerank DESC, equipo""", e=esc).data()
    s.run("CALL gds.graph.drop($n)", n=g).consume()
    return {"nodos": nodos, "relaciones": rels, "equipos": filas}


def derivacion(s, esc):
    """Intermediacion de los estados y caminos de menor coste hacia los activos."""
    g = f"tfg-derivacion-{esc}"
    nodos, rels = _proyectar(s, g, """
        MATCH (a:TfgObject {escenario: $e})-[r:ENABLES|CONCLUDES]->(b:TfgObject)
        WITH gds.graph.project($n, a, b, {relationshipProperties: {cost: r.cost}}) AS p
        RETURN p.nodeCount AS nodos, p.relationshipCount AS relaciones""", e=esc)
    estados = s.run("""
        CALL gds.betweenness.stream($n) YIELD nodeId, score
        WITH gds.util.asNode(nodeId) AS x, score WHERE x:AttackState
        SET x.gds_betweenness = round(score, 2)
        RETURN x.state AS estado, x.gds_betweenness AS intermediacion, x.cuts_assets AS activos_que_corta,
               x.cuts AS corta ORDER BY intermediacion DESC, estado""", n=g).data()
    caminos = []
    objetivos = s.run("""
        MATCH (a:Asset {escenario: $e})<-[:HOSTS]-(h:Host)
        MATCH (t:AttackState {escenario: $e}) WHERE a.name IN t.goal_of
        RETURN a.name AS activo, a.criticality AS criticidad, t.id AS destino ORDER BY criticidad DESC, activo""", e=esc).data()
    for o in objetivos:
        r = s.run("""
            MATCH (i:AttackState {escenario: $e, state: $inicio}), (t:AttackState {id: $destino})
            CALL gds.shortestPath.dijkstra.stream($n, {sourceNode: i, targetNode: t, relationshipWeightProperty: 'cost'})
            YIELD totalCost, nodeIds
            RETURN totalCost, [x IN gds.util.asNodes(nodeIds) | {id: x.id, etiquetas: labels(x), estado: x.state,
                               app: x.app, regla: x.rule, base: x.basis, confirmado: x.confirmed}] AS nodos""",
                  n=g, e=esc, inicio=INICIO, destino=o["destino"]).single()
        if r is None:
            caminos.append({**o, "alcanzable": False})
            continue
        pasos = [x for x in r["nodos"] if "RuleApp" in x["etiquetas"] and x["base"] != "trivial"]
        en_camino = {x["estado"] for x in r["nodos"] if "AttackState" in x["etiquetas"]}
        apps = [x["id"] for x in r["nodos"] if "RuleApp" in x["etiquetas"]]
        faltan = s.run("""MATCH (p:AttackState)-[:ENABLES]->(a:RuleApp) WHERE a.id IN $apps AND NOT p.state IN $estados
                          RETURN collect(DISTINCT p.state) AS faltan""", apps=apps, estados=sorted(en_camino)).single()["faltan"]
        caminos.append({**o, "alcanzable": True, "coste": round(r["totalCost"], 4), "pasos": len(pasos),
                        "reglas": [x["regla"] for x in pasos], "confirmados": sum(bool(x["confirmado"]) for x in pasos),
                        "prueba_valida": not faltan, "precondiciones_que_faltan": sorted(faltan)})
    s.run("CALL gds.graph.drop($n)", n=g).consume()
    return {"nodos": nodos, "relaciones": rels, "estados": estados, "caminos": caminos}


def analizar(escenario, uri, user, password):
    from neo4j import GraphDatabase
    with GraphDatabase.driver(uri, auth=(user, password)) as driver, driver.session() as s:
        version = s.run("RETURN gds.version() AS v").single()["v"]
        return {"escenario": escenario, "gds": version, "red": red(s, escenario), "derivacion": derivacion(s, escenario)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("escenario")
    ap.add_argument("--uri", default=os.environ.get("NEO4J_URI", "bolt://localhost:7687"))
    ap.add_argument("--user", default="neo4j")
    ap.add_argument("--password", default="tfg-neo4j")
    args = ap.parse_args()
    r = analizar(args.escenario, args.uri, args.user, args.password)
    destino = SALIDA / f"analitica-{args.escenario}.json"
    destino.write_text(json.dumps(r, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{args.escenario} · GDS {r['gds']} · {destino}")
    print(f"\nRed: {r['red']['nodos']} equipos y {r['red']['relaciones']} pares conectados")
    for h in r["red"]["equipos"]:
        print(f"  {h['equipo']:<14} {h['papel']:<18} PageRank {h['pagerank']:<7} intermediación {h['intermediacion']}")
    d = r["derivacion"]
    print(f"\nGrafo de derivación: {d['nodos']} nodos y {d['relaciones']} relaciones")
    print("  estado                         intermediación  activos que corta")
    for e in d["estados"]:
        print(f"  {e['estado']:<30} {e['intermediacion']:>10}      {e['activos_que_corta']}  {', '.join(e['corta'])}")
    print("\nCamino de menor coste (Dijkstra) a cada activo:")
    for c in d["caminos"]:
        if not c["alcanzable"]:
            print(f"  {c['activo']}: no alcanzable")
            continue
        estado = "prueba válida" if c["prueba_valida"] else f"NO es una prueba: faltan {c['precondiciones_que_faltan']}"
        print(f"  {c['activo']}: coste {c['coste']}, {c['pasos']} pasos ({c['confirmados']} confirmados) — {estado}")
        print(f"      {' → '.join(c['reglas'])}")


if __name__ == "__main__":
    main()
