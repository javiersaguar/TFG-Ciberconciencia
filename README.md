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
| **F1** | Ingesta, normalización OCSF, persistencia y observabilidad | ✅ Completada |
| **F2** | Detección base con reglas Sigma | 🔵 En curso |
| **F3** | Pilar A — detección multi-etapa (CEP) | ⏳ Pendiente |
| **F4** | Plano CTI (OpenCTI + ATT&CK + extracción de TTPs) | ⏳ Pendiente |
| **F5** | Pilar B — grafo de ataque y razonamiento Datalog | ⏳ Pendiente |
| **F6** | Pilar C — priorización explicable + API | ⏳ Pendiente |
| **F7** | Evaluación cuantitativa | ⏳ Pendiente |
| **F8** | Frontend | ⏳ Pendiente |
| **F9** | Despliegue, memoria y defensa | ⏳ Pendiente |

**Hitos alcanzados:**

- Normalización a OCSF con **100 % de cobertura** sobre el dataset de referencia (184/184 eventos, 0 rechazos), validada en batch y en *streaming*.
- Observabilidad completa: Prometheus sobre todos los componentes del *pipeline* y tres cuadros de mando de Grafana aprovisionados de forma declarativa.
- **Pipeline propia de traducción Sigma → OCSF**, que corrige tres desviaciones semánticas detectadas en la pipeline oficial de la comunidad. Primera detección validada: la regla de volcado de LSASS (T1003.001) dispara exactamente la alerta esperada sobre datos reales.

Plan detallado en [`docs/ROADMAP.md`](docs/ROADMAP.md) · La memoria y el registro de decisiones se mantienen en un repositorio aparte (`tfg-memoria`, privado).

---

## Stack tecnológico

**Ingeniería de datos**
`Redpanda` (bus de eventos) · `Apache Flink 2.2.1` (streaming + CEP) · `ClickHouse` (OLAP) · `Dagster` (orquestación) · `FastAPI` · `MinIO` · `Prometheus` + `Grafana` · `Docker` / `Kubernetes`

**Ciberseguridad**
`MITRE ATT&CK` · `OCSF` (esquema canónico) · `Sigma` + `pySigma` (reglas de detección, con pipeline OCSF propia) · `STIX 2.1` / `OpenCTI` / `MISP` · `TRAM` (extracción de TTPs) · `Atomic Red Team` / `CALDERA` (emulación de adversario)

**Razonamiento**
`Neo4j` + `Graph Data Science` · `Soufflé` (Datalog, enfoque MulVAL)

---

## Estructura del repositorio

```
├── pipeline/       Ingesta, normalización OCSF y jobs de streaming
│   ├── normalize/    Mapeadores por fuente + despachador + métricas de cobertura
│   └── jobs/         Jobs ejecutables del pipeline
├── detection/      Pipeline Sigma→OCSF y reglas de detección seleccionadas
├── infra/          docker-compose (perfiles por fase), Flink, Grafana, Kubernetes
├── scripts/        Arranque y parada de la infraestructura
├── cti/            Extracción de TTPs, conectores STIX
├── graph/          Modelo Neo4j, reglas Datalog, analítica de grafos
├── scoring/        Priorización explicable de incidentes
├── eval/           Protocolo de evaluación, métricas y resultados
├── emulation/      Escenarios de emulación de adversario
├── frontend/       Portal web (F8): base con datos simulados, ver frontend/README.md
├── docs/           Documentación técnica y roadmap
├── Memoria/        Memoria del TFG (LaTeX)
└── data/           Datasets y reglas (no versionado)
```

---

## Puesta en marcha

**Requisitos:** Docker + Docker Compose · Python 3.12+ · Java 17

```bash
# 1. Levantar la infraestructura (perfiles: core | stream | store | obs | all)
./scripts/up.sh all

# 2. Crear los topics
docker exec -it redpanda rpk topic create raw.host.windows -p 3
docker exec -it redpanda rpk topic create norm.events -p 6
docker exec -it redpanda rpk topic create dlq.normalize -p 1

# 3. Obtener los datasets de referencia y las reglas de detección
git clone --depth 1 https://github.com/OTRF/Security-Datasets.git data/Security-Datasets
git clone --depth 1 https://github.com/SigmaHQ/sigma.git data/sigma

# 4. Reproducir un dataset hacia el bus de eventos
python -m pipeline.replay_dataset \
  --file data/samples/<dataset>.json \
  --topic raw.host.windows \
  --dataset-id <id>

# 5. Normalizar a OCSF
python -m pipeline.jobs.normalize_job --from-beginning --idle-exit 10

# 6. Persistir en el almacén analítico
python -m pipeline.jobs.sink_clickhouse --from-beginning --idle-exit 8 --ch-host 127.0.0.1

# 7. Parar la infraestructura (conserva los datos en los volúmenes)
./scripts/down.sh
```

**Interfaces web**

| Servicio | URL | Credenciales |
|---|---|---|
| Redpanda Console | http://localhost:8080 | — |
| Flink Dashboard | http://localhost:8081 | — |
| ClickHouse HTTP | http://localhost:8123 | `tfg` / `tfg` |
| Grafana | http://localhost:3001 | `admin` / `admin` |
| Prometheus | http://localhost:9090 | — |

**Utilidades**

```bash
# Medir la cobertura de normalización sobre un dataset
python -m pipeline.normalize.coverage --file data/samples/<dataset>.json

# Convertir una regla Sigma al esquema OCSF del proyecto
sigma convert -t clickhouse -p detection/pipelines/ocsf-tfg.yml <regla.yml>

# Compilar la memoria
cd Memoria && make pdf
```

---

## Topics

| Topic | Part. | Clave | Contenido |
|---|:--:|---|---|
| `raw.host.windows` | 3 | hostname | Telemetría cruda de host (Sysmon, Security) |
| `raw.net.zeek` | 3 | IP origen | Telemetría cruda de red |
| `norm.events` | 6 | hostname | Eventos normalizados a OCSF |
| `det.alerts` | 3 | hostname | Alertas de reglas Sigma |
| `det.campaigns` | 3 | hostname | Campañas multi-etapa detectadas por CEP |
| `enr.incidents` | 3 | id incidente | Incidentes priorizados |
| `dlq.*` | 1 | — | Eventos rechazados, para inspección |

Convención: prefijo por etapa (`raw` → `norm` → `det` → `enr`), clave de partición por *host* para garantizar el orden de eventos por máquina — requisito de la detección de secuencias.

---

## Perfiles de despliegue

Los servicios se organizan en perfiles de Docker Compose para no levantar todo simultáneamente:

| Perfil | Servicios | Uso |
|---|---|---|
| `core` | Redpanda + Console | Siempre activo |
| `stream` | Flink (JobManager + TaskManager) | Desarrollo de detección |
| `store` | ClickHouse | Consulta analítica y evaluación |
| `obs` | Prometheus + Grafana | Monitorización |
| `graph` | Neo4j | Trabajo sobre el Pilar B *(F5)* |
| `cti` | OpenCTI y dependencias | Ingesta de inteligencia *(F4)* |

---

## Datos y licencias

Los datasets utilizados son públicos y están etiquetados con MITRE ATT&CK ([OTRF Security-Datasets](https://github.com/OTRF/Security-Datasets)), y las reglas de detección proceden del repositorio comunitario [SigmaHQ](https://github.com/SigmaHQ/sigma). Toda la emulación de adversario se realiza en un **entorno de laboratorio aislado**. Este repositorio no contiene datos personales ni telemetría de sistemas reales de terceros.

---

## Autor

**Javier Saguar Antona** — Grado en Ingeniería y Sistemas de Datos, ETSIT-UPM