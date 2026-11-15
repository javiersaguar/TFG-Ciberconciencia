# Dagster para el ciclo del grafo razonado (F5.5). Parte de la imagen de Soufflé para que el razonador
# se ejecute dentro del mismo contenedor, sin acceso al socket de Docker.
# Requiere construir antes la base:  docker compose --profile reason build souffle
FROM tfg/souffle:2.5

USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir \
      dagster==1.13.30 dagster-webserver==1.13.30 neo4j==5.28.8 clickhouse-connect==1.6.0 \
 && mkdir /dagster_home && chown razonador /dagster_home

ENV PATH=/opt/venv/bin:$PATH \
    PYTHONPATH=/app \
    PYTHONDONTWRITEBYTECODE=1 \
    DAGSTER_HOME=/dagster_home
USER razonador
WORKDIR /app
ENTRYPOINT []
CMD ["dagster", "dev", "-h", "0.0.0.0", "-p", "3000", "-m", "orchestration.definitions"]
