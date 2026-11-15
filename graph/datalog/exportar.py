"""Exporta de Neo4j los hechos de un escenario para el razonador Datalog (F5.3).

Cada relacion de entrada de graph/datalog/attack.dl sale de una consulta sobre el grafo (inventario
observado + capa sintetica) y se escribe en `<relacion>.facts`, separado por tabuladores, que es lo
que lee Soufflé. Junto a los hechos queda `PROCEDENCIA.json`: de que capa sale cada relacion.

Uso (desde la raiz del repo, con Neo4j levantado):
  .venv/bin/python -m graph.datalog.exportar apt29-day1
  cd infra && docker compose --profile reason run --rm souffle \\
      -F /work/apt29-day1/facts -D /work/apt29-day1/out /rules/attack.dl
"""
import argparse
import json
from pathlib import Path

SALIDA = Path("data/graph/datalog")
H = "(h:Host {escenario: $e})"
# relacion -> (capa, consulta que devuelve las columnas en orden)
CONSULTAS = {
    "host": ("inventario", f"MATCH {H}-[:IN_ZONE]->(z:Zone) RETURN h.name, h.role, z.kind, "
                           "CASE WHEN z.cidr = '' THEN z.kind ELSE z.cidr END"),
    "conn": ("inventario", f"MATCH {H}-[c:CONNECTS_TO]->(b:Host) RETURN DISTINCT h.name, b.name, c.proto, c.port"),
    "service": ("inventario", f"MATCH {H}-[:RUNS]->(s:Service) RETURN h.name, s.proto, s.port"),
    "logon": ("inventario", f"MATCH (u:User)-[l:LOGGED_ON]->{H} UNWIND l.logon_types AS t RETURN u.name, h.name, t"),
    "admin_of": ("inventario", f"MATCH (u:User)-[:ADMIN_OF]->{H} RETURN u.name, h.name"),
    "builtin_admin": ("inventario", "MATCH (u:User {escenario: $e}) WHERE u.builtin_admin RETURN u.name"),
    "campaign": ("inventario", f"MATCH (c:Campaign)-[o:OBSERVED_ON]->{H} RETURN c.id, c.pattern_id, h.name, o.role"),
    "campaign_tech": ("inventario", "MATCH (c:Campaign {escenario: $e}) UNWIND c.techniques AS t RETURN c.id, t"),
    "vuln_remote": ("sintetica", f"MATCH {H}-[r:HAS_VULN]->(v:Vulnerability) WHERE v.access = 'remoto' "
                                 "RETURN h.name, v.cve, r.proto, r.port, v.effect"),
    "vuln_local": ("sintetica", f"MATCH {H}-[:HAS_VULN]->(v:Vulnerability) WHERE v.access = 'local' "
                                "RETURN h.name, v.cve, v.effect"),
    "asset": ("sintetica", f"MATCH {H}-[:HOSTS]->(a:Asset) RETURN a.name, h.name, a.criticality, a.required_privilege"),
    "attacker_at": ("sintetica", f"MATCH (:Adversary)-[:LOCATED_AT]->{H} RETURN h.name"),
    # Los numeros de Soufflé son de 32 bits: el tiempo va en segundos desde el primer evento del escenario.
    "contact": ("inventario+sintetica",
                f"MATCH {H}-[c:CONNECTS_TO]->(x:Host)<-[:LOCATED_AT]-(:Adversary) "
                "WITH h, x, min(c.first_seen) AS t CALL () { MATCH (n:TfgObject {escenario: $e})-[r:CONNECTS_TO]->() "
                "RETURN min(r.first_seen) AS t0 } RETURN h.name, x.name, toInteger((t - t0) / 1000)"),
}
# Identificadores del grafo que necesita quien lea la salida del razonador.
MAPA = {
    "equipos": f"MATCH {H} RETURN h.name, h.id",
    "activos": f"MATCH {H}-[:HOSTS]->(a:Asset) RETURN a.name, a.id",
}


def celda(v):
    t = str(v)
    if "\t" in t or "\n" in t:
        raise ValueError(f"Valor no exportable a .facts: {t!r}")
    return t


def exportar(session, escenario, destino):
    destino.mkdir(parents=True, exist_ok=True)
    resumen = {}
    for rel, (capa, q) in CONSULTAS.items():
        filas = sorted({tuple(celda(v) for v in fila) for fila in session.run(q, e=escenario).values()})
        (destino / f"{rel}.facts").write_text("".join("\t".join(f) + "\n" for f in filas), encoding="utf-8")
        resumen[rel] = {"capa": capa, "hechos": len(filas)}
    mapa = {k: dict(map(tuple, session.run(q, e=escenario).values())) for k, q in MAPA.items()}
    (destino / "PROCEDENCIA.json").write_text(json.dumps({"escenario": escenario, "relaciones": resumen, **mapa},
                                                         indent=1, ensure_ascii=False), encoding="utf-8")
    return resumen


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("escenario")
    ap.add_argument("--uri", default="bolt://localhost:7687")
    ap.add_argument("--user", default="neo4j")
    ap.add_argument("--password", default="tfg-neo4j")
    args = ap.parse_args()
    from neo4j import GraphDatabase
    with GraphDatabase.driver(args.uri, auth=(args.user, args.password)) as driver, driver.session() as s:
        resumen = exportar(s, args.escenario, SALIDA / args.escenario / "facts")
    (SALIDA / args.escenario / "out").mkdir(parents=True, exist_ok=True)
    print(f"{SALIDA / args.escenario / 'facts'}:")
    for rel, r in resumen.items():
        print(f"  {rel:<14} {r['hechos']:>4}  ({r['capa']})")


if __name__ == "__main__":
    main()
