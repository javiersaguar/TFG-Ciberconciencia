# Plataforma de conciencia cibersituacional

> Detección de ataques multi-etapa, grafo de ataque razonado y priorización explicable de incidentes.

Trabajo Fin de Grado — Grado en Ingeniería y Sistemas de Datos, ETSIT · Universidad Politécnica de Madrid.

---

## El problema

Los centros de operaciones de seguridad (SOC) reciben un volumen de alertas inabarcable y, sobre todo, **sin contexto**: una alerta aislada no dice si corresponde a una técnica conocida de un actor conocido, ni qué activos pone en riesgo. Además, los ataques dirigidos se desarrollan **en varias etapas** a lo largo del tiempo (reconocimiento → acceso inicial → ejecución → movimiento lateral → exfiltración), por lo que evaden con facilidad las detecciones puntuales que analizan eventos de forma independiente.

## La propuesta

Un *pipeline* de datos en *streaming* que convierte telemetría cruda en **incidentes correlacionados, contextualizados y priorizados**, sobre tres pilares:

| Pilar | Qué aporta |
|---|---|
| **A — Detección multi-etapa (CEP)** | Detecta *secuencias* de la kill chain, no alertas sueltas |
| **B — Grafo de ataque razonado** | Deriva rutas de ataque factibles hacia los activos críticos, con trazabilidad lógica |
| **C — Priorización explicable** | Cada incidente recibe una puntuación descompuesta y un "por qué" legible |

Todo alineado con **MITRE ATT&CK** y con inteligencia de amenazas en formato **STIX 2.1**.

---

## Arquitectura

```
┌─ FUENTES ──────────────┐   ┌─ INGESTA ──────┐   ┌─ PROCESADO ─────────────────┐
│ OTRF Security-Datasets │   │                │   │  normalización → OCSF        │
│ Sysmon / Security      ├──►│   Redpanda     ├──►│  reglas Sigma        (F2)    │
│ Zeek / Suricata        │   │  raw.host.*    │   │  CEP multi-etapa     (F3)    │
└────────────────────────┘   └────────────────┘   └───────┬──────────────┬───────┘
                                                          │              │
                                   norm.events ◄──────────┘              │
                                   det.alerts / det.campaigns ◄──────────┘
                                                          │
                    ┌─────────────────────────────────────┼──────────────────┐
                    ▼                                     ▼                  ▼
            ┌──────────────┐            ┌────────────────────┐   ┌──────────────────┐
            │  ClickHouse  │◄──────────►│  Neo4j (+ GDS)     │◄─►│  Soufflé/Datalog │
            │  analítica   │            │  grafo de ataque   │   │  rutas de ataque │
            └──────────────┘            └─────────┬──────────┘   └──────────────────┘
                                                  ▲
                                      ┌───────────┴───────────┐
                                      │  OpenCTI (STIX 2.1)   │◄── ATT&CK, MISP, feeds
                                      └───────────────────────┘
                                                  │
                            scoring explicable → FastAPI → frontend
```

---

## Estado actual

| Fase | Descripción | Estado |
|---|---|---|
| **F0** | Entorno, repositorio e infraestructura base | ✅ Completada |
| **F1** | Ingesta, normalización OCSF y persistencia analítica | 🔵 En curso (F1.3 ✅) |
| **F2** | Detección base con reglas Sigma | ⏳ Pendiente |
| **F3** | Pilar A — detección multi-etapa (CEP) | ⏳ Pendiente |
| **F4** | Plano CTI (OpenCTI + ATT&CK + extracción de TTPs) | ⏳ Pendiente |
| **F5** | Pilar B — grafo de ataque y razonamiento Datalog | ⏳ Pendiente |
| **F6** | Pilar C — priorización explicable + API | ⏳ Pendiente |
| **F7** | Evaluación cuantitativa | ⏳ Pendiente |
| **F8** | Frontend | ⏳ Pendiente |
| **F9** | Despliegue, memoria y defensa | ⏳ Pendiente |

**Hito más reciente:** normalización a OCSF con **100 % de cobertura** sobre el dataset de referencia (184/184 eventos, 0 rechazos), validada tanto en batch como en *streaming*.

Plan detallado en [`docs/ROADMAP.md`](docs/ROADMAP.md) · Registro de decisiones y bitácora en [`BITACORA.md`](BITACORA.md).

---

## Stack tecnológico

**Ingeniería de datos**
`Redpanda` (bus de eventos) · `Apache Flink 2.2.1` (streaming + CEP) · `ClickHouse` (OLAP) · `Dagster` (orquestación) · `FastAPI` · `MinIO` · `Prometheus` + `Grafana` · `Docker` / `Kubernetes`

**Ciberseguridad**
`MITRE ATT&CK` · `OCSF` (esquema canónico) · `Sigma` (reglas de detección) · `STIX 2.1` / `OpenCTI` / `MISP` · `TRAM` (extracción de TTPs) · `Atomic Red Team` / `CALDERA` (emulación de adversario)

**Razonamiento**
`Neo4j` + `Graph Data Science` · `Soufflé` (Datalog, enfoque MulVAL)

---

## Estructura del repositorio

```
├── pipeline/       Ingesta, normalización OCSF y jobs de streaming
│   ├── normalize/    Mapeadores por fuente + despachador + métricas de cobertura
│   └── jobs/         Jobs ejecutables del pipeline
├── infra/          docker-compose (perfiles por fase), Flink, Kubernetes
├── cti/            Extracción de TTPs, conectores STIX
├── graph/          Modelo Neo4j, reglas Datalog, analítica de grafos
├── scoring/        Priorización explicable de incidentes
├── eval/           Protocolo de evaluación, métricas y resultados
├── emulation/      Escenarios de emulación de adversario
├── docs/           Documentación técnica y roadmap
├── Memoria/        Memoria del TFG (LaTeX)
└── data/           Datasets (no versionado)
```

---

## Puesta en marcha

**Requisitos:** Docker + Docker Compose · Python 3.12 · Java 17

```bash
# 1. Levantar la infraestructura base
cd infra
docker compose --profile core --profile stream up -d

# 2. Crear los topics
docker exec -it redpanda rpk topic create raw.host.windows -p 3
docker exec -it redpanda rpk topic create norm.events -p 6
docker exec -it redpanda rpk topic create dlq.normalize -p 1

# 3. Obtener los datasets de referencia
git clone --depth 1 https://github.com/OTRF/Security-Datasets.git data/Security-Datasets

# 4. Reproducir un dataset hacia el bus de eventos
python -m pipeline.replay_dataset \
  --file data/samples/<dataset>.json \
  --topic raw.host.windows \
  --dataset-id <id>

# 5. Normalizar a OCSF
python -m pipeline.jobs.normalize_job --from-beginning --idle-exit 10
```

**Interfaces web**

| Servicio | URL |
|---|---|
| Redpanda Console | http://localhost:8080 |
| Flink Dashboard | http://localhost:8081 |

**Medir la cobertura de normalización**

```bash
python -m pipeline.normalize.coverage --file data/samples/<dataset>.json
```

---

## Topics

| Topic | Contenido |
|---|---|
| `raw.host.windows` | Telemetría cruda de host (Sysmon, Security) |
| `raw.net.zeek` | Telemetría cruda de red |
| `norm.events` | Eventos normalizados a OCSF |
| `det.alerts` | Alertas de reglas Sigma |
| `det.campaigns` | Campañas multi-etapa detectadas por CEP |
| `dlq.*` | Eventos rechazados, para inspección |

Convención: prefijo por etapa (`raw` → `norm` → `det`), clave de partición por *host* para garantizar el orden de eventos por máquina.

---

## Datos y licencias

Los datasets utilizados son públicos y están etiquetados con MITRE ATT&CK ([OTRF Security-Datasets](https://github.com/OTRF/Security-Datasets)). Toda la emulación de adversario se realiza en un **entorno de laboratorio aislado**. Este repositorio no contiene datos personales ni telemetría de sistemas reales de terceros.

---

## Autor

**Javier Saguar Antona** — Grado en Ingeniería y Sistemas de Datos, ETSIT-UPM