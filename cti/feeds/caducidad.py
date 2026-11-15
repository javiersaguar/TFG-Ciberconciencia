"""Caducidad de los indicadores por tipo (F5.5; idea tomada de OpenCTI en F4.2).

Un indicador no vale para siempre: una IP o una URL cambian de manos en semanas, un dominio dura mas y
el hash de un fichero casi no caduca. Se usan las mismas vidas que las reglas de serie de OpenCTI
(47 dias para IP y URL, 300 para dominios y 460 para ficheros), contadas desde `valid_from`.

Escribe en cada :Indicator `valid_until` y `expired` (a la fecha que se le pase). No borra nada: la
priorizacion (F6) decide que hacer con un indicador caducado.

Uso (desde la raiz del repo, con Neo4j levantado):
  .venv/bin/python -m cti.feeds.caducidad                 # a fecha de hoy
  .venv/bin/python -m cti.feeds.caducidad --fecha 2026-11-15
"""
import argparse
import os
from datetime import date, datetime, timedelta, timezone

VIDA_DIAS = {"ip:port": 47, "url": 47, "domain": 300, "md5_hash": 460, "sha1_hash": 460, "sha256_hash": 460}
VIDA_POR_DEFECTO = 470   # la regla «por defecto» de OpenCTI, para tipos no previstos


def caduca(valid_from, tipo):
    """Fecha y hora en que caduca un indicador (ISO 8601, UTC)."""
    inicio = datetime.fromisoformat(valid_from.replace("Z", "+00:00"))
    return (inicio + timedelta(days=VIDA_DIAS.get(tipo, VIDA_POR_DEFECTO))).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def aplicar(session, fecha):
    """Marca la caducidad de todos los indicadores a `fecha` (date). Devuelve el recuento por tipo."""
    limite = datetime(fecha.year, fecha.month, fecha.day, tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    filas = session.run("""
        MATCH (i:Indicator) WHERE i.valid_from IS NOT NULL
        WITH i, coalesce($vida[i.x_ioc_type], $defecto) AS dias
        WITH i, toString(datetime(i.valid_from) + duration({days: dias})) AS hasta
        SET i.valid_until = hasta, i.expired = datetime(hasta) < datetime($limite), i.expiry_checked = $limite
        RETURN coalesce(i.x_ioc_type, 'otro') AS tipo, count(*) AS total, sum(CASE WHEN i.expired THEN 1 ELSE 0 END) AS caducados
        ORDER BY total DESC""", vida=VIDA_DIAS, defecto=VIDA_POR_DEFECTO, limite=limite).data()
    return {"fecha": fecha.isoformat(), "total": sum(f["total"] for f in filas),
            "caducados": sum(f["caducados"] for f in filas), "por_tipo": filas}


def ejecutar(fecha=None, uri=None, user="neo4j", password="tfg-neo4j"):
    from neo4j import GraphDatabase
    uri = uri or os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    with GraphDatabase.driver(uri, auth=(user, password)) as driver, driver.session() as s:
        return aplicar(s, fecha or date.today())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fecha", type=date.fromisoformat, default=None)
    args = ap.parse_args()
    r = ejecutar(args.fecha)
    print(f"A {r['fecha']}: {r['caducados']} de {r['total']} indicadores caducados")
    for f in r["por_tipo"]:
        print(f"  {f['tipo']:<12} {f['caducados']:>7} de {f['total']:>7}  (vida {VIDA_DIAS.get(f['tipo'], VIDA_POR_DEFECTO)} días)")


if __name__ == "__main__":
    main()
