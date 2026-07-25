# BITÁCORA DEL TFG — Plataforma de conciencia cibersituacional (detección multi-etapa + grafo de ataque razonado)

> ## LÉEME PRIMERO (para cualquier IA / agente)
> Este archivo es **la memoria del proyecto**. Antes de ayudar:
> 1. Lee **§1 Contexto** y **§2 Decisiones clave** para entender el proyecto. **No revoques una decisión de §2 sin un motivo explícito y sin avisar.**
> 2. Mira **§4 Estado actual** para ver en qué punto estamos y qué toca.
> 3. Cuando termines de ayudar, **añade una entrada al final (Diario)** con la plantilla de §6 y **actualiza §4** si algo cambió.
> Idioma: documentación y diario en **español**; código y nombres técnicos en **inglés**.

---

## 1. Contexto del proyecto
- **Qué es:** Trabajo Fin de Grado del Grado en Ingeniería y Sistemas de Datos (ETSIT-UPM).
- **Tutor objetivo:** Prof. Víctor Villagrá / Carmen Sánchez-Zas — grupo RSTI, Dpto. de Ingeniería de Sistemas Telemáticos (DIT).
- **Fechas:** arranque ~agosto 2026 · defensa junio 2027.
- **Objetivo:** plataforma de datos que detecta ataques multi-etapa en tiempo real y prioriza incidentes de forma explicable, fusionando telemetría (red/host) con inteligencia de amenazas (CTI) alineada con MITRE ATT&CK, y razonando sobre rutas de ataque hacia activos críticos. Fin: reducir la fatiga de alertas y aportar conciencia cibersituacional.
- **Arquitectura (resumen):** dos planos (telemetría + CTI) que convergen en una capa de correlación, sobre tres pilares:
  - **Pilar A** — detección multi-etapa por CEP (secuencias de la kill chain).
  - **Pilar B** — grafo de ataque + razonamiento lógico de rutas.
  - **Pilar C** — priorización explicable de incidentes.
- **Núcleo mínimo defendible:** Pilares A + B + evaluación. El Pilar C avanzado y las extensiones (LLM+RAG para sembrar el grafo, cadena de suministro) son trabajo futuro si falta tiempo.
- **Documentos de apoyo (en `docs/`):** anteproyecto, planning ago2026–jun2027, estudio de recursos/coste, guía de infra y acceso remoto, estudios de temas.

## 2. Decisiones clave (no revocar sin motivo)
| Área | Decisión | Por qué |
|---|---|---|
| Grafo / consultas | Neo4j + Cypher + GDS (property graph). Alternativa streaming: Memgraph | Estándar de facto en seguridad (BloodHound); analítica de grafos (centralidad, caminos) |
| SPARQL / RDF / OWL | Descartado | No es el estándar en operaciones de seguridad; se sustituye por lo de arriba + Datalog |
| Razonamiento de rutas | Datalog estilo MulVAL (Soufflé) | Security-native, canónico, explicable, corre en el portátil |
| Streaming + CEP | Apache Flink + FlinkCEP (no Spark) | Streaming real con estado; habilita detección multi-etapa |
| Bus de eventos | Redpanda (no Kafka) | Compatible con la API de Kafka, sin JVM/ZooKeeper |
| Store analítico | ClickHouse (no Cassandra) | OLAP columnar rápido para hunting |
| Orquestación | Dagster (no Airflow) | Orientado a assets, moderno |
| API / servicios | FastAPI (no Flask) | Async, tipado |
| Plataforma CTI | OpenCTI (STIX 2.1) + MISP + feeds | Grafo CTI nativo con conector ATT&CK |
| Extracción de TTPs | TRAM / SecureBERT (inferencia; LoRA ligero opcional) | Modelos pequeños/preentrenados |
| Uso de ML | Solo inferencia + fine-tuning ligero. NADA de entrenar modelos grandes | RTX 5070 Laptop (~8 GB): inferencia OK, entrenamiento pesado no |
| Infra | Contenedores Docker en 1 host (WSL2), no una VM por servicio | Evitar overhead; opcional VMs víctima/atacante para telemetría real |
| Cómputo | Portátil propio para todo el desarrollo; nube solo para fase de despliegue | El portátil (64 GB/16c) es coste hundido y más potente que las VMs de gama media |
| Despliegue K8s | minikube/kind local; si se quiere nube: Azure for Students / GitHub Student Pack | La prueba GCP de 300 $ ya está gastada y no se puede repetir |
| Docker | Docker Engine dentro de WSL (no Docker Desktop) | Montaje profesional, igual que en servidores reales |

## 3. Convenciones
- **Entorno:** WSL2 (Ubuntu) como host Docker; `.wslconfig` con `memory=44GB`, `processors=24`, `swap=8GB`; systemd activado (`/etc/wsl.conf`).
- **Ejecución:** `docker compose` con perfiles por fase (levantar solo el subconjunto necesario).
- **Datos:** el working set en el disco interno; datasets grandes/"fríos" en disco externo (git-ignored). `docker system prune` periódico para no hinchar el disco.
- **Git:** rama `main` estable; ramas `feat/<fase>` por trabajo; commits pequeños y descriptivos.
- **Editor:** VS Code + WSL/Remote-SSH; en remoto, sobre Tailscale.
- **Rutas:** el repo vive en `~/proyectos/tfg-ciberconciencia` (disco Linux, no `/mnt/c`).
- **Autoría (REGLA ESTRICTA):** todos los commits son exclusivamente de Javier Saguar <javisaguarantona@gmail.com>. **Ningún agente de IA debe figurar como autor ni co-autor**: prohibido añadir `Co-Authored-By`, "Generated with", "Assisted by" o cualquier atribución similar en mensajes de commit, PRs o código. Ninguna IA debe ejecutar `git commit`/`git push` de forma autónoma; los comandos se proponen y los ejecuta Javier. Guardián técnico: hook `.githooks/commit-msg` (activar tras clonar con `git config core.hooksPath .githooks`).

## 4. Estado actual
- **Fase:** F1.4 completada — pipeline `raw → norm → ClickHouse` operativo.
- **Hecho:** ClickHouse 25.3 en compose (perfil `store`), tabla `tfg.events` (26 columnas: campos OCSF promocionados + señales + `raw` JSON, MergeTree particionado por mes, ORDER BY host+time). Sink `sink_clickhouse.py` volcando `norm.events` → ClickHouse (184/184). Scripts `up.sh`/`down.sh` + alias `tfg`. README completo. Kill chain del ataque reconstruible con SQL.
- **En curso:** cerrar sesión.
- **Siguiente:** F1.5 observabilidad (Prometheus/Grafana) o saltar a F2 (Sigma). Pendiente: arrancar la memoria (estado del arte, agosto).

## 5. Estructura del repo
```
tfg-ciberconciencia/
├── BITACORA.md          # este archivo (memoria del proyecto)
├── AGENTS.md            # copia/enlace de esta bitácora para agentes que la auto-cargan (o CLAUDE.md)
├── README.md
├── .gitignore
├── docs/                # anteproyecto, planning, estudios, memoria
├── infra/               # docker-compose, perfiles, k8s/minikube
├── pipeline/            # ingesta, jobs Flink/CEP, normalización OCSF
├── cti/                 # extracción TRAM/NER, conectores OpenCTI, STIX
├── graph/               # esquema Neo4j, cypher, reglas Datalog/MulVAL, GDS
├── scoring/             # priorización explicable
├── eval/                # referencias a datasets, métricas, notebooks
├── emulation/           # Atomic Red Team, escenarios CALDERA
└── data/                # git-ignored (working set; fríos en disco externo)
```

## 6. Cómo usar esta bitácora — plantilla de entrada del diario
Copia esto al final, en la sección Diario (lo más nuevo abajo):
```
### YYYY-MM-DD — <título corto de la sesión>
- **Con qué/quién:** <IA o agente usado: Claude / Claude Code / otro / a mano>
- **Objetivo:** <qué querías conseguir>
- **Hecho:** <qué se hizo de verdad>
- **Decisiones:** <cualquier decisión nueva; si afecta a §2 o §4, actualízalas también>
- **Problemas / pendiente:** <lo que quedó a medias o falló>
- **Siguiente paso:** <lo inmediato>
- **Archivos tocados:** <rutas>
```

---

## DIARIO DE TRABAJO
*(append-only; lo más nuevo abajo)*

### 2026-07-12 — Arranque y cierre de decisiones de diseño
- **Con qué/quién:** Claude (chat) — planificación.
- **Objetivo:** definir el tema del TFG, el stack, el plan y el entorno.
- **Hecho:** elegido el tema (fusión detección multi-etapa + grafo CTI razonado); definida arquitectura y stack; redactado anteproyecto para el tutor; hecho el planning ago2026–jun2027; estudios de recursos, coste y acceso remoto; creada esta bitácora.
- **Decisiones:** las de §2 (Neo4j+Datalog en lugar de SPARQL; Flink/Redpanda/ClickHouse/Dagster/FastAPI; ML solo inferencia; contenedores en 1 host; portátil sobre nube).
- **Problemas / pendiente:** falta montar el entorno y confirmar tutor.
- **Siguiente paso:** crear repo con esta estructura; WSL2 + Docker + `.wslconfig`; levantar Redpanda de prueba; escribir al tutor en agosto.
- **Archivos tocados:** `BITACORA.md` (nuevo).

### 2026-07-21 — F0: montaje del entorno base
- **Con qué/quién:** Claude (chat), paso a paso a mano.
- **Objetivo:** dejar el entorno de trabajo listo desde cero.
- **Hecho:** instalado WSL2 + Ubuntu (systemd activado); `.wslconfig` con 44GB/24/swap 8GB; Docker Engine dentro de WSL (no Docker Desktop) funcionando sin sudo (hello-world OK); VS Code conectado a WSL; repo creado en `~/proyectos/tfg-ciberconciencia` con estructura + README + .gitignore + bitácora.
- **Decisiones:** Docker Engine-in-WSL en vez de Docker Desktop (montaje profesional). Repo de Docker fijado al codename `noble` porque Ubuntu va por `resolute` (sin repo de Docker aún).
- **Problemas / pendiente:** ninguno relevante.
- **Siguiente paso:** primer commit; luego `docker-compose` con perfiles + Redpanda de prueba.
- **Archivos tocados:** repo inicial, README.md, .gitignore, BITACORA.md.

### 2026-07-21 — F1: Redpanda operativo
- **Con qué/quién:** Claude (chat), paso a paso.
- **Objetivo:** montar el bus de eventos, primer servicio real del pipeline.
- **Hecho:** creado `infra/docker-compose.yml` con perfil `core` (Redpanda v25.2.1 + Console v3.1.0, límites 2 CPU/2G). Levantado con `docker compose --profile core up -d`. Verificado: clúster `Healthy: true`, ciclo producir→consumir OK, consola web en `localhost:8080`. GitHub: repo privado sincronizado.
- **Decisiones:** Redpanda Console incluida desde el inicio. Topics internos por `redpanda:29092`, externos por `localhost:9092`.
- **Problemas / pendiente:** ninguno.
- **Siguiente paso:** replay de dataset (OTRF/Mordor) → Redpanda.
- **Archivos tocados:** `infra/docker-compose.yml` (nuevo), `BITACORA.md`.

### 2026-07-23 — F1: primer replay de datos reales a Redpanda
- **Con qué/quién:** Claude (chat), paso a paso.
- **Objetivo:** localizar datasets de seguridad e ingerirlos en el bus de eventos.
- **Hecho:** clonado OTRF Security-Datasets (shallow, 1.2 GB) en `data/`. Explorados `atomic` (por tácticas ATT&CK) y `compound` (apt29 day1/day2, LSASS_campaign_01..07, Log4Shell, GoldenSAML). Elegido para arrancar el atomic `psh_lsass_memory_dump_comsvcs` (T1003.001 / TA0006, metadatos en `SDWIN-201018195009.yaml`, 184 eventos JSON Lines). Creado venv + `confluent-kafka` 2.15.0. Escrito `pipeline/replay_dataset.py` y ejecutado el replay completo (184 ev, 0 omitidos, ~3300 ev/s). Verificada la técnica en los datos.
- **Decisiones:** taxonomía de topics `raw.* / norm.* / det.*`; clave de partición = hostname (orden por máquina, requisito del CEP); timestamp del evento original como timestamp Kafka (habilita *event time* en Flink); cliente `confluent-kafka` (librdkafka) en vez de kafka-python. Añadida regla estricta de autoría + hook `.githooks/commit-msg`.
- **Problemas / pendiente:** Ubuntu `resolute` y Python 3.14 son muy nuevos; hubo que fijar el repo de Docker a `noble`. `confluent-kafka` sí tenía wheel para cp314.
- **Siguiente paso:** Flink en el compose + job consumidor con normalización OCSF.
- **Archivos tocados:** `pipeline/replay_dataset.py` (nuevo), `.githooks/commit-msg` (nuevo), `BITACORA.md`, `AGENTS.md`.

### 2026-07-24 — F1: Flink operativo + prueba de humo CEP superada
- **Con qué/quién:** Claude (chat), paso a paso.
- **Objetivo:** levantar Flink y validar la vía SQL MATCH_RECOGNIZE antes de comprometerla.
- **Hecho:** añadidos flink-jobmanager/taskmanager (2.2.1-java17) al compose (perfil `stream`). Descargado conector Kafka 5.0.0-2.2. SQL Client: CREATE TABLE sobre raw.host.windows (formato raw), verificado COUNT=184, y MATCH_RECOGNIZE emparejando pares A B con event-time de 2020.
- **Decisiones:** API de Flink = **PyFlink + SQL MATCH_RECOGNIZE** (plan B de Java descartado). Se eligió Flink 2.2.x porque el conector Kafka aún no existe para 2.3.
- **Problemas / pendiente:** el CEP no emitía nada por watermark bloqueado (particiones vacías al tener un solo host); resuelto con `table.exec.source.idle-timeout=5s`. El `cp` del jar a /opt/flink/lib es temporal (pendiente de automatizar en compose).
- **Siguiente paso:** persistir el conector vía compose; subconjunto OCSF + normalización (F1.2–F1.3).
- **Archivos tocados:** `infra/docker-compose.yml`, `infra/flink/lib/*.jar`, `BITACORA.md`.


### 2026-07-24 (2) — F1.3: entorno PyFlink + primer mapeador OCSF
- **Con qué/quién:** Claude (chat), paso a paso.
- **Objetivo:** dejar PyFlink operativo y empezar la normalización a OCSF.
- **Hecho:** persistido el jar del conector y el idle-timeout en compose. Verificados class_uid OCSF en schema.ocsf.io y definido subconjunto ampliado (~20 clases) en 3 oleadas. Creado `pipeline/normalize/ocsf_common.py` (esqueleto base, type_uid, extensión tfg, unmapped) y `sysmon.py` con map_sysmon_10 (Process Activity 1007). Test con eventos reales OK: rundll32→lsass, signal_suspicious_access=true, CallTrace con comsvcs.dll preservado.
- **Decisiones:** normalización en PyFlink (opción A). PyFlink no soporta Python 3.14 → entorno aparte `.venv-flink` con Python 3.12 (uv) + OpenJDK 17 en WSL. Señales de detección precalculadas en el mapeador (semilla de explicabilidad).
- **Problemas / pendiente:** cadena de incompatibilidades por versiones nuevas (3.14, uv PATH al activar venv, PyFlink 2.3→2.2.1, falta de java) — todas resueltas. Registro de Windows (Sysmon 12/13/14) pendiente de verificar en OCSF.
- **Siguiente paso:** completar mapeadores oleada 1 + despachador + job de normalización.
- **Archivos tocados:** `infra/docker-compose.yml`, `pipeline/jobs/smoke_pyflink.py`, `pipeline/normalize/{__init__,ocsf_common,sysmon,test_sysmon}.py`, `BITACORA.md`.


### 2026-07-24 (3) — F1.3: normalización OCSF al 100 % de cobertura
- **Con qué/quién:** Claude (chat), paso a paso.
- **Objetivo:** completar la oleada 1 de mapeadores y medir cobertura.
- **Hecho:** `sysmon.py` (1/3/5/7/10/11 + registro 12/13/14), `winsecurity.py` (4688/4689/handles 4656-4663-4658-4690/1102/5156/5158/4624/4625), `registry.py` (despachador) y `coverage.py` (métrica). Cobertura sobre el dataset LSASS: 40,2 % → 80,4 % → **100 %** (184/184, 0 DLQ), 12 tipos OCSF distintos. Verificada la cadena de señales: dump_module (Sysmon 7) → lsass_access (Sysmon 10 + Security 4656/4663) → dump_file (Sysmon 11) → log_cleared (Security 1102).
- **Decisiones:** el registro de Windows (Sysmon 12/13/14) no tiene clase en el OCSF base → se mapea a Process Activity conservando todo en `unmapped`, decisión documentada. Señales `tfg.signal_*` precalculadas en el mapeador. Hashes parseados al formato OCSF (para cruce con IOCs en F4).
- **Problemas / pendiente:** ninguno. Revisar si alguna extensión Windows de OCSF añade clase de registro.
- **Siguiente paso:** job PyFlink de normalización hacia `norm.events`.
- **Archivos tocados:** `pipeline/normalize/{sysmon,winsecurity,registry,coverage}.py`, `BITACORA.md`.

### 2026-07-24 (4) — F1.3: pipeline raw → norm en streaming
- **Con qué/quién:** Claude (chat), paso a paso.
- **Objetivo:** llevar la normalización al streaming real.
- **Hecho:** creados topics `norm.events` (6 part.) y `dlq.normalize`. Escrito `normalize_job.py` (consumidor/productor con DLQ, commit manual de offsets, idle-exit). Ejecutado sobre los 184 eventos: 100 % normalizados, 0 a DLQ — coincide con la medición en batch. Verificado en `norm.events` un evento OCSF completo (rundll32→lsass, 0x1fffff) con `dataset_id` propagado. Limpiados ficheros `:Zone.Identifier` de Windows y añadidos al .gitignore.
- **Decisiones:** la etapa de normalización se implementa como servicio Python con confluent-kafka (opción C), no en PyFlink. Motivo: la lógica de mapeo es idéntica y así avanzamos rápido; Flink entra en F2/F3 para Sigma y CEP, donde su estado y checkpointing sí son imprescindibles. Trade-off consciente: esta etapa no tiene exactly-once de Flink.
- **Problemas / pendiente:** dos entornos virtuales (.venv 3.14 con confluent-kafka / .venv-flink 3.12 con PyFlink) obligan a alternar; valorar unificar en .venv-flink.
- **Siguiente paso:** F1.4 ClickHouse + F1.5 observabilidad.
- **Archivos tocados:** `pipeline/jobs/normalize_job.py`, `.gitignore`, `Memoria/`, `BITACORA.md`.

### 2026-07-24 (5) — F1.4: ClickHouse y persistencia analítica
- **Con qué/quién:** Claude (chat), paso a paso.
- **Objetivo:** persistir los eventos normalizados para hunting y evaluación.
- **Hecho:** ClickHouse en compose con límite de memoria; tabla `tfg.events` con columnas dedicadas + señales + raw JSON. Sink Kafka→ClickHouse por lotes (184 insertados). Scripts de arranque/parada y alias `tfg`. README del repo reescrito. Verificada la kill chain con SQL: carga DLL → acceso LSASS (Sysmon 10 + Security 4656/4663 entrelazados) → volcado a disco → borrado de logs.
- **Decisiones:** esquema híbrido (columnas para lo consultado + `raw` completo). ORDER BY (device_hostname, time). Señales como columnas Bool para consultas triviales.
- **Problemas / pendiente:** (1) ClickHouse solo escuchaba en loopback interno → `<listen_host>0.0.0.0</listen_host>`. (2) clickhouse-connect exige `datetime`, no float, para DateTime64. (3) **BUG IMPORTANTE**: priorizar `UtcTime` desincronizaba Sysmon y Security 16 h, invirtiendo el orden del ataque; corregido usando `TimeCreated` como campo común. Reprocesado todo. Ambos hallazgos anotados en AnotacionesMemoria.md.
- **Siguiente paso:** F1.5 observabilidad o F2 (Sigma). Arrancar memoria en agosto.
- **Archivos tocados:** `infra/docker-compose.yml`, `infra/clickhouse/`, `pipeline/jobs/sink_clickhouse.py`, `pipeline/normalize/ocsf_common.py`, `scripts/`, `README.md`, `AnotacionesMemoria.md`, `BITACORA.md`.