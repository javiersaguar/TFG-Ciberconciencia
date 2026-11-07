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
                                      │   CTI en STIX 2.1     │◄── ATT&CK 19.2, ThreatFox,
                                      │ (OpenCTI en contraste)│    perfiles de ML-2
                                      └───────────────────────┘
                                                  │
                            scoring explicable → FastAPI → frontend
```

---

## Estado actual

*Actualizado el 07-11-2026.*

| Fase | Descripción | Estado |
|---|---|---|
| **F0** | Entorno, repositorio e infraestructura base | ✅ Completada |
| **F1** | Ingesta, normalización OCSF, persistencia y observabilidad | ✅ Completada |
| **F2** | Detección base con reglas Sigma y anomalías (ML-1) | ✅ Cerrada el 30-07-2026 |
| **F3** | Pilar A: detección multi-etapa (CEP en Flink) | ✅ Cerrada el 06-11-2026 |
| **F4** | Plano CTI: ATT&CK en el grafo, OpenCTI frente a carga directa y extracción de TTPs (ML-2) | 🔵 **En curso** |
| **F5** | Pilar B: grafo de ataque y razonamiento Datalog | ⏳ Pendiente |
| **F6** | Pilar C: priorización explicable y API | ⏳ Pendiente |
| **F7** | Evaluación cuantitativa | ⏳ Pendiente |
| **F8** | Frontend | 🔵 Base adelantada con datos simulados |
| **F9** | Despliegue, memoria y defensa | ⏳ Pendiente |
| **FA** | Ampliación de cobertura (red, Linux, DoS, datos externos) | ⏳ Condicionada al punto de control del 28-02-2027 |

**Dónde está F4:**
- **F4.1 ✅** ATT&CK v19.2 y el feed ThreatFox cargados en Neo4j con un cargador STIX idempotente, y un servicio que normaliza identificadores de técnica antiguos.
- **F4.2 🔵** OpenCTI medido frente a la carga directa (coste, ingesta y fidelidad); falta la decisión documentada.
- **F4.3 🔵** ML-2 entrenado y decidido. Quedan pendientes la carga del perfil en el grafo y la redacción.

**Hitos alcanzados:**

- **F1.** Normalización a OCSF con **100 % de cobertura** sobre el dataset de referencia, validada en batch y en *streaming*. Prometheus sobre todo el *pipeline* y tres cuadros de mando de Grafana declarativos.
- **F2.** **Pipeline propia de traducción Sigma → OCSF**, que corrige tres desviaciones semánticas de la oficial. Detección validada sobre APT29 (MITRE ATT&CK Evaluations).
- **F3.** Tres patrones de campaña multi-etapa en Flink SQL (`MATCH_RECOGNIZE`). Agrupar en campañas **reduce un 85,9 % las alertas de la evidencia de campaña** (un 12,2 % sobre todas las alertas), con una precisión por campaña de 0,69. Los falsos positivos se revisaron a mano.
- **F4.**
  - ATT&CK y 136.000 IOCs de ThreatFox en Neo4j en segundos. OpenCTI, para los mismos datos, tarda horas y ocupa unas cuatro veces más memoria.
  - **ML-2**, extracción de técnicas de informes de amenazas. SecureBERT 2.0 afinado y combinado con un diccionario de ATT&CK, elegido por validación cruzada. Sobre AnnoCTR, **F1 de 0,59 por frase y 0,71 por informe**, frente a 0,33 y 0,49 del diccionario solo.

Plan detallado en [`docs/ROADMAP.md`](docs/ROADMAP.md) · La memoria y el registro de decisiones se mantienen en un repositorio aparte (`tfg-memoria`, privado).

---

## Stack tecnológico

**Ingeniería de datos**
`Redpanda` (bus de eventos) · `Apache Flink 2.2.1` (streaming + CEP) · `ClickHouse` (OLAP) · `Dagster` (orquestación) · `FastAPI` · `MinIO` · `Prometheus` + `Grafana` · `Docker` / `Kubernetes`

**Ciberseguridad**
`MITRE ATT&CK` · `OCSF` (esquema canónico) · `Sigma` + `pySigma` (reglas de detección, con pipeline OCSF propia) · `STIX 2.1` / `OpenCTI` · `ThreatFox` (IOCs) · `Atomic Red Team` / `CALDERA` (emulación de adversario)

**Aprendizaje automático**
`PyTorch` + `Transformers` (SecureBERT 2.0 y ModernBERT para la extracción de TTPs) · `scikit-learn` (anomalías) · `MLflow` (registro de experimentos)

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
├── cti/            Cargador STIX, normalización ATT&CK, feeds, comparativa OpenCTI y ML-2 (extract/)
├── graph/          Modelo Neo4j, reglas Datalog, analítica de grafos
├── scoring/        Priorización explicable de incidentes
├── eval/           Protocolo de evaluación, métricas y resultados
├── emulation/      Escenarios de emulación de adversario
├── ml/             Anomalías (ML-1) y requisitos del entorno de ML-2
├── frontend/       Portal web (F8): base con datos simulados, ver frontend/README.md
├── docs/           Documentación técnica y roadmap
└── data/           Datasets, reglas y modelos (no versionado)
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

# Cargar un paquete STIX 2.1 (ATT&CK, feeds, perfiles de ML-2) en Neo4j
python -m cti.stix_loader.load <paquete.json> --source <nombre>
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
| `graph` | Neo4j + GDS + APOC (`localhost:7474`) | Grafo de ATT&CK, CTI y ataque *(F4–F5)* |
| `cti` | OpenCTI y dependencias (`localhost:8082`) | Comparativa de plataformas CTI *(F4.2)* |
| `mlops` | MLflow (`localhost:5000`) | Registro de experimentos de ML |
| `portal` | Portal web (Caddy, imagen `tfg/portal:local`) en `localhost:8090` | Demo del frontend *(F8)* |

---

## Datos y licencias

Los datasets utilizados son públicos y están etiquetados con MITRE ATT&CK ([OTRF Security-Datasets](https://github.com/OTRF/Security-Datasets)), y las reglas de detección proceden del repositorio comunitario [SigmaHQ](https://github.com/SigmaHQ/sigma). Para la CTI y ML-2 se usan [MITRE ATT&CK](https://attack.mitre.org/) v19.2, el feed [ThreatFox](https://threatfox.abuse.ch/) de abuse.ch (uso gratuito según sus términos de *fair use*), el corpus [AnnoCTR](https://github.com/boschresearch/anno-ctr-lrec-coling-2024) (CC BY-SA 4.0) e informes públicos de Microsoft (solo para investigación local, no se redistribuyen). La procedencia, la licencia y la suma SHA-256 de cada fuente están en `data/external/MANIFEST.md`. Toda la emulación de adversario se realiza en un **entorno de laboratorio aislado**. Este repositorio no contiene datos personales ni telemetría de sistemas reales de terceros.

---

## Autor

**Javier Saguar Antona** — Grado en Ingeniería y Sistemas de Datos, ETSIT-UPM