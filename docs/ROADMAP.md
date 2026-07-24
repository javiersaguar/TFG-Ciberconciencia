# ROADMAP — Plan de trabajo detallado

**Proyecto:** Plataforma de conciencia cibersituacional — detección de ataques multi-etapa, grafo de ataque razonado y priorización explicable
**Autor:** Javier Saguar · Grado en Ingeniería y Sistemas de Datos, ETSIT-UPM
**Horizonte:** agosto 2026 → defensa junio 2027
**Última actualización:** 2026-07-23

---

## 0. Cómo usar este documento

- Este archivo es el **plan**; `BITACORA.md` es la **memoria** (qué se hizo y por qué). No dupliques información: aquí va lo que *falta*, allí lo que *pasó*.
- Cada fase tiene: **objetivo · prerrequisitos · pasos numerados · entregables · criterios de aceptación (DoD) · riesgos · decisiones abiertas**.
- Los pasos están pensados para ejecutarse en orden. Si uno se atasca más de ~2 sesiones, aplica el *plan B* de esa fase y sigue: el enemigo del TFG es el bloqueo, no la imperfección.
- Marca el progreso editando los `[ ]` → `[x]` directamente en este archivo, y refleja el salto de fase en `BITACORA.md §4`.
- **Regla de oro:** el núcleo defendible son las fases **F1–F3 + F5 + F7**. Todo lo demás (F4 completo, F6, F8) es valor añadido que se recorta si el calendario aprieta.

### Convención de prioridad

| Marca | Significado |
|---|---|
| 🔴 **CRÍTICO** | Sin esto no hay TFG. Se hace sí o sí. |
| 🟠 **IMPORTANTE** | Sube mucho la nota / la calidad. Se hace salvo emergencia. |
| 🟢 **OPCIONAL** | Valor añadido. Se recorta sin dolor y pasa a "trabajo futuro". |

---

## 1. Punto de partida (estado a 23-07-2026)

### Hecho ✅
- **F0 — Entorno:** WSL2 + Ubuntu (systemd), `.wslconfig` (44 GB / 24 hilos / 8 GB swap), Docker Engine dentro de WSL (sin Docker Desktop), VS Code + WSL.
- **Repo:** `~/proyectos/tfg-ciberconciencia`, GitHub privado, estructura de carpetas, `.gitignore`, `BITACORA.md` + `AGENTS.md`, hook `.githooks/commit-msg` (guardián de autoría).
- **Bus de eventos:** Redpanda v25.2.1 + Console v3.1.0 vía `infra/docker-compose.yml`, perfil `core`. Clúster *healthy*, ciclo producir→consumir verificado.
- **Datos:** OTRF Security-Datasets clonado en `data/` (1.2 GB, git-ignored). Explorados `atomic/` (por táctica ATT&CK) y `compound/` (apt29 day1+day2, LSASS_campaign_01..07, Log4Shell, GoldenSAML, apt3).
- **Ingesta:** `pipeline/replay_dataset.py` operativo. 184 eventos del dataset `psh_lsass_memory_dump_comsvcs` (T1003.001 / TA0006) en el topic `raw.host.windows`, con clave = hostname, *event time* original preservado y cabeceras de trazabilidad (`dataset_id`).

### Lo que falta (resumen ejecutivo)

| Fase | Nombre | Prioridad | Estimación |
|---|---|---|---|
| **F1** | Procesado en streaming y normalización (Flink + OCSF + ClickHouse) | 🔴 | 4–5 sem |
| **F2** | Detección base con reglas Sigma | 🔴 | 2–3 sem |
| **F3** | **Pilar A** — detección multi-etapa (CEP) | 🔴 | 3–4 sem |
| **F4** | Plano CTI (OpenCTI + ATT&CK + extracción TTPs) | 🟠 | 3–4 sem |
| **F5** | **Pilar B** — grafo de ataque + razonamiento Datalog | 🔴 | 4–5 sem |
| **F6** | **Pilar C** — priorización explicable + API | 🟠 | 2–3 sem |
| **F7** | Evaluación cuantitativa | 🔴 | 2–3 sem |
| **F8** | **Frontend SaaS** | 🟢 | 3–4 sem |
| **F9** | Despliegue, memoria y defensa | 🔴 | 4 sem |

> Suma bruta ≈ 27–35 semanas. El curso da ~40 semanas, pero con **carga lectiva y Prácticas**. De ahí que F4, F6 y F8 sean recortables. Ver §5 (Calendario).

---

## 2. Visión del producto final

### 2.1 El TFG (núcleo académico)

Un **pipeline de datos** que:

1. **Ingiere** telemetría heterogénea de host y red en streaming.
2. **Normaliza** a un esquema canónico (OCSF) con estado y *event time*.
3. **Detecta** técnicas individuales (reglas Sigma) **y secuencias multi-etapa** (CEP), etiquetadas con MITRE ATT&CK.
4. **Contextualiza** cada detección contra un grafo de inteligencia de amenazas (STIX/ATT&CK).
5. **Razona** sobre el grafo de ataque para derivar **rutas factibles** hacia los activos críticos.
6. **Prioriza** cada incidente con una puntuación **descompuesta y explicable**.
7. Se **evalúa** cuantitativamente sobre datos etiquetados.

### 2.2 La capa SaaS (F8 — nuevo)

Una **aplicación web multi-tenant** que envuelve todo lo anterior y lo presenta como un producto:

- **Para el tribunal:** convierte un pipeline (difícil de "enseñar") en una demo visual e impactante en 5 minutos.
- **Para tu carrera / FORTIA:** el artefacto es directamente presentable a un cliente PYME como servicio de detección gestionada.
- **Nombre de trabajo:** *(pendiente — ver §4.F8, paso 0)*.

Funcionalidad objetivo:
- Panel de situación (alertas activas, campañas, salud del pipeline).
- Cola de incidentes priorizada, con el "**por qué**" de cada puntuación.
- Visualización interactiva del **grafo de ataque** y de la ruta hacia el activo crítico.
- Vista **ATT&CK Navigator** propia (mapa de calor de cobertura y de técnicas observadas).
- Inventario de activos y su criticidad.
- Panel de CTI (actores, campañas, IOCs relacionados).
- Multi-organización (aislamiento de datos por tenant) + informes exportables.

### 2.3 Qué NO es (delimitación explícita, va en la memoria)

- ❌ No es un EDR ni un agente de endpoint: **consume** telemetría, no la genera en producción.
- ❌ No hace respuesta automática (no aísla máquinas ni bloquea). Solo **soporte a la decisión**.
- ❌ No es un producto con SLA ni hardening de producción; es un **prototipo de investigación** con envoltorio de producto.
- ❌ No pretende superar a un SIEM comercial en cobertura, sino demostrar una **arquitectura de correlación + razonamiento** concreta.

---

## 3. Arquitectura objetivo

### 3.1 Diagrama de bloques

```
┌─ FUENTES ──────────────┐   ┌─ INGESTA ──────┐   ┌─ PROCESADO ─────────────────┐
│ OTRF datasets (replay) │   │                │   │  Apache Flink                │
│ CALDERA / Atomic RT    ├──►│   Redpanda     ├──►│  · normalización → OCSF      │
│ Sysmon / Security      │   │  raw.host.*    │   │  · enriquecimiento (async)   │
│ Zeek / Suricata        │   │  raw.net.*     │   │  · reglas Sigma  (F2)        │
└────────────────────────┘   └────────────────┘   │  · CEP multi-etapa (F3)      │
                                                   └───────┬──────────────┬───────┘
                                                           │              │
                                    norm.events ◄──────────┘              │
                                    det.alerts / det.campaigns ◄──────────┘
                                                           │
                    ┌──────────────────────────────────────┼───────────────────┐
                    ▼                                      ▼                   ▼
          ┌──────────────────┐              ┌────────────────────┐   ┌──────────────────┐
          │   ClickHouse     │              │  Neo4j (+ GDS)     │   │  Soufflé/MulVAL  │
          │  analítica,      │◄────────────►│  grafo de ataque   │◄─►│  razonamiento    │
          │  hunting, eval   │              │  activos+CTI+TTPs  │   │  rutas (Datalog) │
          └──────────────────┘              └─────────┬──────────┘   └──────────────────┘
                                                      ▲
                                          ┌───────────┴───────────┐
                                          │  OpenCTI (STIX 2.1)   │◄── ATT&CK, MISP,
                                          │  + TRAM (extracción)  │    abuse.ch, OTX
                                          └───────────────────────┘
                    ┌──────────────────────────────────────────────────────┐
                    │  SCORING (F6): riesgo explicable + rutas             │
                    └───────────────────────┬──────────────────────────────┘
                                            ▼
                    ┌──────────────────────────────────────────────────────┐
                    │  FastAPI  (REST + WebSocket)                         │
                    └───────────────────────┬──────────────────────────────┘
                                            ▼
                    ┌──────────────────────────────────────────────────────┐
                    │  FRONTEND SaaS (F8)  ·  React + TypeScript           │
                    └──────────────────────────────────────────────────────┘

TRANSVERSAL: Dagster (orquestación batch) · Prometheus/Grafana (observabilidad)
             MinIO (lago de objetos) · Docker Compose → minikube/kind
```

### 3.2 Inventario de servicios, perfiles y puertos

| Servicio | Perfil compose | Puerto host | RAM límite | Fase |
|---|---|---|---|---|
| Redpanda | `core` | 9092, 9644 | 2 GB | ✅ F0 |
| Redpanda Console | `core` | 8080 | 512 MB | ✅ F0 |
| Flink JobManager | `stream` | 8081 | 1.5 GB | F1 |
| Flink TaskManager | `stream` | — | 3 GB | F1 |
| ClickHouse | `store` | 8123, 9000 | 3 GB | F1 |
| Neo4j | `graph` | 7474, 7687 | 4 GB | F5 |
| OpenCTI + deps | `cti` | 8082 | 8–10 GB | F4 |
| Dagster | `orchestration` | 3000 | 1 GB | F4 |
| FastAPI | `api` | 8000 | 512 MB | F6 |
| Frontend (dev) | — (Vite local) | 5173 | — | F8 |
| Prometheus | `observability` | 9090 | 1 GB | F1 |
| Grafana | `observability` | 3001 | 512 MB | F1 |
| MinIO | `store` | 9001 | 512 MB | F4 |

> ⚠️ **Nunca levantes todos los perfiles a la vez.** Combinaciones típicas de trabajo:
> - Desarrollo de streaming: `core,stream,store`
> - Trabajo de grafo: `core,graph`
> - Trabajo de CTI: `cti,graph` (pesado, cierra lo demás)
> - Demo completa: todo excepto `cti` (o con OpenCTI ya poblado y luego apagado, sirviendo desde Neo4j)

### 3.3 Contrato de topics

| Topic | Particiones | Clave | Productor | Consumidor |
|---|---|---|---|---|
| `raw.host.windows` | 3 | `Hostname` | `replay_dataset.py` | Flink (normalizador) |
| `raw.net.zeek` | 3 | `id.orig_h` | `replay_dataset.py` | Flink (normalizador) |
| `norm.events` | 6 | `device.hostname` | Flink | Flink (Sigma/CEP), ClickHouse |
| `det.alerts` | 3 | `device.hostname` | Flink (Sigma) | Flink (CEP), scoring, ClickHouse |
| `det.campaigns` | 3 | `device.hostname` | Flink (CEP) | scoring, ClickHouse |
| `enr.incidents` | 3 | `incident_id` | scoring (F6) | API, ClickHouse |
| `dlq.*` | 1 | — | cualquiera | inspección manual |

**Reglas:**
- Prefijo por etapa: `raw.` → `norm.` → `det.` → `enr.`
- **Siempre** clave por host (o por incidente en `enr.`) para garantizar orden.
- Toda transformación con posibilidad de fallo escribe los rechazos en su `dlq.<origen>` (*dead letter queue*). Nunca descartes en silencio: los rechazos son un dato de calidad que va en la memoria.
- Formato de valor: **JSON UTF-8**. (Decisión: Avro/Protobuf daría eficiencia y esquema fuerte, pero añade Schema Registry y fricción; para el volumen de un TFG, JSON documentado es suficiente y mucho más depurable. Registrar esta decisión en la memoria como *trade-off* consciente.)

---

## 4. Fases detalladas

---

## F1 — Procesado en streaming y normalización 🔴

**Objetivo:** convertir el flujo crudo heterogéneo en un flujo canónico OCSF, consultable y observable.
**Estimación:** 4–5 semanas · **Prerrequisitos:** F0 + replay funcionando (✅)

### F1.1 — Levantar Flink

- [ ] **1.** Añadir a `infra/docker-compose.yml` los servicios `flink-jobmanager` y `flink-taskmanager` bajo el perfil `stream`.
  - Imagen: `flink:<versión>-scala_2.12-java17` (fijar versión exacta; **no** usar `latest`).
  - Variable `FLINK_PROPERTIES` con `jobmanager.rpc.address: flink-jobmanager`.
  - TaskManager: `taskmanager.numberOfTaskSlots: 4`, `taskmanager.memory.process.size: 3g`.
  - Montar un volumen `./flink/jobs:/opt/jobs` para pasar los scripts sin reconstruir imagen.
- [ ] **2.** Levantar con `docker compose --profile core --profile stream up -d` y comprobar la UI en `http://localhost:8081`.
- [ ] **3.** Verificar que el TaskManager aparece registrado y con los *slots* libres esperados.
- [ ] **4.** Ejecutar un job de ejemplo incluido en la imagen (WordCount) para validar que el clúster ejecuta.

**⚠️ Decisión crítica de esta fase — API de Flink**

Hay una bifurcación que condiciona F3, así que decídela **ahora** y déjala escrita en `BITACORA.md §2`:

| Opción | Ventaja | Inconveniente |
|---|---|---|
| **A. PyFlink (Table API + SQL)** | Python, que ya dominas; desarrollo rápido; `MATCH_RECOGNIZE` de SQL cubre el CEP | La **Pattern API de FlinkCEP no está expuesta en Python**; dependes de SQL para los patrones |
| **B. Java (DataStream + CEP Pattern API)** | Acceso completo a FlinkCEP (patrones con negación, condiciones iterativas ricas) | Java + Maven; curva y tiempo |
| **C. Híbrido** | Normalización y Sigma en PyFlink; job de CEP en Java | Dos toolchains que mantener |

> **Recomendación:** empezar por **A (PyFlink + SQL `MATCH_RECOGNIZE`)**. Es *row pattern recognition* estándar (SQL:2016), expresa secuencias con cuantificadores y ventanas (`WITHIN`), y es perfectamente defendible como CEP. Deja la puerta abierta a **C** si en F3 topas con un patrón que `MATCH_RECOGNIZE` no exprese bien.
> **Acción en F1:** valida con un patrón de juguete antes de comprometerte (paso F1.7).

- [ ] **5.** Instalar `apache-flink` en el venv (para desarrollo local y para lanzar jobs).
- [ ] **6.** Descargar el conector Kafka de Flink (JAR `flink-sql-connector-kafka-<ver>.jar`) y colocarlo en `flink/lib/`, montado en ambos contenedores.
- [ ] **7. Prueba de humo del CEP:** job mínimo en PyFlink que lea `raw.host.windows` con conector Kafka y ejecute un `MATCH_RECOGNIZE` trivial (p. ej. dos eventos consecutivos del mismo host). Objetivo: **confirmar que el camino A es viable antes de invertir semanas**. Si falla, cambia a C aquí y no en F3.

### F1.2 — Definir el esquema canónico (OCSF)

- [ ] **8.** Estudiar OCSF en `https://schema.ocsf.io` y **seleccionar el subconjunto** de clases que necesitas. Candidatas (verificar los `class_uid` exactos en el navegador de esquema, no de memoria):
  - *Process Activity* — creación/terminación/acceso a procesos (Sysmon 1/5/10, Security 4688/4689)
  - *File System Activity* — creación/escritura de ficheros (Sysmon 11)
  - *Registry Key/Value Activity* — (Sysmon 12/13/14)
  - *Network Activity* — (Sysmon 3, Security 5156/5158, Zeek conn)
  - *Authentication* — (Security 4624/4625/4648)
  - *DNS Activity* — (Sysmon 22, Zeek dns)
- [ ] **9.** Escribir `docs/schema-ocsf-subset.md`: para cada clase, los campos que vas a poblar y de dónde salen. **Este documento es un anexo de la memoria.**
- [ ] **10.** Definir los campos comunes obligatorios en todo evento normalizado:
  ```
  time (epoch ms)         · metadata.version · metadata.product.name
  class_uid / class_name  · activity_id      · severity_id
  device.hostname · device.type
  actor.user.name · actor.process.{name,pid,cmd_line}
  observables[]  (hashes, IPs, rutas, dominios)
  unmapped {}    (todo lo que no encaje — NUNCA perder datos)
  tfg.dataset_id · tfg.source_channel · tfg.source_event_id
  ```
  > El bloque `tfg.*` es tu extensión propia: mantiene la trazabilidad al dataset (verdad conocida) sin contaminar el estándar. Documéntalo como *extensión OCSF* en la memoria.
- [ ] **11.** Decidir la política de campos no mapeados: **conservarlos** bajo `unmapped`. Es lo que hacen las implementaciones serias y te salva cuando descubres que necesitabas un campo.

### F1.3 — Implementar la normalización

- [ ] **12.** Crear `pipeline/normalize/` con un módulo por familia de origen:
  - `sysmon.py` — mapeadores por EventID
  - `winsecurity.py` — mapeadores por EventID
  - `zeek.py` — mapeadores por tipo de log
  - `registry.py` — despachador: `(Channel, EventID) → función de mapeo`
- [ ] **13.** Implementar los mapeadores **prioritarios** (los que cubren tus datasets):
  - Sysmon: **1** (process create), **3** (network connect), **5** (process terminate), **7** (image load), **10** (process access ← *clave para T1003.001*), **11** (file create), **12/13** (registry), **22** (DNS)
  - Security: **4688/4689** (proceso), **4624/4625** (logon), **4656/4663/4658** (handle a objeto), **4672** (privilegios especiales), **5156/5158** (filtrado de red), **1102** (log borrado ← *defense evasion*)
- [ ] **14.** Tests unitarios (`pytest`) por mapeador: evento de entrada real (extraído de tus datasets) → evento OCSF esperado. **Mínimo un test por EventID soportado.** Esto se cita en la memoria como validación de la normalización.
- [ ] **15.** Job PyFlink `pipeline/jobs/normalize_job.py`:
  - Fuente: Kafka `raw.host.windows` (+ `raw.net.zeek` cuando exista)
  - Asignación de *watermarks* sobre el timestamp del evento, con tolerancia de desorden (empezar con 30 s; ajustar tras medir)
  - Transformación con el despachador
  - Sumidero: Kafka `norm.events`
  - Rechazos → `dlq.normalize` con el motivo
- [ ] **16.** Ejecutar sobre el dataset LSASS y verificar: 184 eventos entran → *N* normalizados + *M* rechazados, con *N + M = 184*. **Cero pérdidas silenciosas.**
- [ ] **17.** Medir la **cobertura de normalización**: % de eventos que encuentran mapeador. Es una métrica que va en la memoria. Objetivo realista: >90 % en los datasets de trabajo.

### F1.4 — Persistencia analítica (ClickHouse)

- [ ] **18.** Añadir ClickHouse al compose (perfil `store`), con límite de memoria y volumen persistente.
- [ ] **19.** Diseñar el esquema de la tabla `events`:
  - Motor `MergeTree`
  - `PARTITION BY toYYYYMM(time)`
  - `ORDER BY (device_hostname, time)` ← optimiza las consultas por host y ventana temporal, que serán el 90 % de tus *queries*
  - Columnas explícitas para los campos comunes + una columna `JSON`/`String` para el resto
  - TTL opcional (no necesario en un TFG, pero mencionarlo demuestra criterio)
- [ ] **20.** Elegir el mecanismo de ingesta y **documentar el porqué**:
  - *Opción A:* motor `Kafka` nativo de ClickHouse + `MATERIALIZED VIEW` → menos piezas, muy elegante
  - *Opción B:* sumidero JDBC/HTTP desde Flink → control total del *back-pressure* y de la semántica
  > Recomendación: **A** para `norm.events` (simple y robusto), y valorar B si necesitas transformaciones en el camino.
- [ ] **21.** Crear tablas espejo para `det.alerts`, `det.campaigns` y `enr.incidents`.
- [ ] **22.** Escribir `eval/queries/` con las consultas de *hunting* que usarás una y otra vez (top procesos por host, accesos a LSASS, cadenas por usuario, etc.).
- [ ] **23.** Verificar de punta a punta: replay → normalización → ClickHouse, y que `SELECT count() FROM events` cuadra.

### F1.5 — Observabilidad

- [ ] **24.** Añadir Prometheus + Grafana al compose (perfil `observability`).
- [ ] **25.** Activar el *reporter* de métricas Prometheus en Flink (`FLINK_PROPERTIES`) y exponer el puerto.
- [ ] **26.** Configurar Prometheus para raspar Flink, Redpanda y ClickHouse.
- [ ] **27.** Construir el dashboard "**Salud del pipeline**": eventos/s por topic, *lag* de consumo, retraso de *watermark*, tasa de rechazos a DLQ, uso de memoria/CPU por servicio, duración de *checkpoints*.
- [ ] **28.** Activar *checkpointing* en Flink (intervalo 10–30 s, almacenamiento en volumen local) y **provocar un fallo a propósito** (matar el TaskManager) para demostrar la recuperación. **Esto es material de memoria de primer nivel:** pocos TFG demuestran tolerancia a fallos.

### 📦 Entregables F1
`infra/docker-compose.yml` ampliado · `pipeline/normalize/` con tests · `pipeline/jobs/normalize_job.py` · `docs/schema-ocsf-subset.md` · esquemas ClickHouse en `infra/clickhouse/` · dashboard Grafana exportado a `infra/grafana/`

### ✅ Criterios de aceptación (DoD)
1. Un replay completo llega a ClickHouse sin pérdidas (entradas = normalizados + DLQ).
2. Cobertura de normalización medida y documentada.
3. Los tests de mapeadores pasan en verde.
4. El dashboard muestra el pipeline en vivo durante un replay.
5. Recuperación ante fallo demostrada con *checkpointing*.
6. Prueba de humo de `MATCH_RECOGNIZE` superada (decisión de API cerrada).

### ⚠️ Riesgos
| Riesgo | Mitigación |
|---|---|
| Versiones incompatibles Flink ↔ conector Kafka | Fijar versiones exactas en el compose; consultar la matriz de compatibilidad oficial antes de elegir |
| PyFlink resulta limitado para el CEP | La prueba de humo (paso 7) lo detecta **pronto**; plan B = job de CEP en Java |
| OCSF es grande y te absorbe | Limitarse al subconjunto de §F1.2; es una decisión de alcance, no una carencia |
| Desorden temporal en los datasets | Medir el retraso real observado y ajustar el *watermark*; documentar el valor elegido |

---

## F2 — Detección base con reglas Sigma 🔴

**Objetivo:** detectar técnicas ATT&CK individuales sobre el flujo normalizado, generando alertas etiquetadas.
**Estimación:** 2–3 semanas · **Prerrequisitos:** F1

- [ ] **1.** Clonar `SigmaHQ/sigma` en `data/` (git-ignored) y explorar `rules/windows/`.
- [ ] **2.** Instalar `pysigma` + `sigma-cli` en el venv.
- [ ] **3.** **Seleccionar el conjunto de reglas de trabajo** (no intentes las miles que hay). Criterio: reglas cuyos `logsource`/`detection` casen con los EventID que ya normalizas y con las técnicas de tus datasets. Objetivo: **30–60 reglas** bien elegidas.
  - Obligatorias: T1003.001 (LSASS), T1059.001 (PowerShell), T1218.011 (rundll32), T1070.001 (borrado de logs), T1021.002 (SMB/admin shares), T1055 (inyección), T1547 (persistencia en arranque).
- [ ] **4.** Escribir `detection/sigma/selected.yml` con la lista curada y **por qué** cada regla (trazabilidad para la memoria).
- [ ] **5.** **Decidir la estrategia de evaluación de reglas** y documentarla:
  - *Vía batch/hunting:* convertir Sigma → SQL con un backend de pySigma y ejecutar contra ClickHouse. Rápido de montar, ideal para la **evaluación** de F7.
  - *Vía streaming:* parsear las reglas con pySigma y **evaluarlas en el job de Flink** sobre `norm.events` (recorrer la estructura `detection` y aplicarla al evento OCSF).
  > Recomendación: implementar **ambas**, pero en este orden — primero *batch* (te da resultados y confianza rápido), luego *streaming* (que es lo que exige la arquitectura). Y **compararlas**: que ambas den el mismo resultado sobre el mismo dataset es una validación cruzada excelente para la memoria.
- [ ] **6.** Construir el **traductor Sigma → predicado OCSF**: el punto delicado es que las reglas Sigma están escritas contra nombres de campo de Windows/Sysmon, y tú tienes OCSF. Necesitas una **tabla de equivalencia** (`Image` → `actor.process.name`, `TargetImage` → `process.name`, etc.).
  - Escribir esa tabla en `detection/field_mapping.yml`.
  - Es exactamente lo que hacen los *backends* de Sigma para cada SIEM: **estás construyendo tu propio backend**. Enmárcalo así en la memoria, que suena a lo que es: trabajo de ingeniería de detección serio.
- [ ] **7.** Implementar el job `pipeline/jobs/sigma_job.py`: `norm.events` → evaluación → `det.alerts`.
- [ ] **8.** Definir el **esquema de alerta**:
  ```
  alert_id · time · rule_id · rule_title · rule_level
  attack.technique_id · attack.tactic_id
  device.hostname · actor.user.name
  matched_event_ids[] · matched_fields{}
  tfg.dataset_id
  ```
  El campo `matched_fields` (qué condiciones concretas dispararon la regla) es la **semilla de la explicabilidad** de F6. Impleméntalo desde ya.
- [ ] **9.** **Validación:** replay del dataset LSASS → debe generarse al menos una alerta con `technique_id = T1003.001`. Si no, depura el mapeo de campos.
- [ ] **10.** Validar con **más datasets atómicos** de distintas tácticas (ejecución, descubrimiento, movimiento lateral, persistencia) — al menos uno por táctica.
- [ ] **11.** Medir y registrar: nº de alertas por dataset, técnicas detectadas vs. técnicas etiquetadas en los metadatos YAML. **Primer dato de precisión de tu sistema.**
- [ ] **12.** Generar una **matriz de cobertura ATT&CK** (formato ATT&CK Navigator) con las técnicas que tu sistema puede detectar. Es una figura excelente para la memoria y para el frontend (F8).

### 📦 Entregables F2
`detection/sigma/selected.yml` · `detection/field_mapping.yml` · `pipeline/jobs/sigma_job.py` · capa Sigma→SQL para ClickHouse · JSON de cobertura para Navigator · primeros resultados de detección

### ✅ DoD
1. ≥30 reglas cargadas y evaluándose en streaming.
2. El dataset LSASS genera alerta T1003.001 correctamente etiquetada.
3. Al menos 4 tácticas ATT&CK distintas validadas con datasets atómicos.
4. Las vías batch y streaming coinciden en resultados.
5. Matriz de cobertura generada.

### ⚠️ Riesgos
- **El mapeo de campos es más trabajo del que parece.** Es la tarea infravalorada de esta fase. Reserva tiempo y hazlo dirigido por tests.
- Reglas con lógica compleja (agregaciones, correlación Sigma) pueden no ser traducibles: **decláralas fuera de alcance explícitamente** y quédate con las de coincidencia directa.

---

## F3 — Pilar A: detección multi-etapa (CEP) 🔴

**Objetivo:** detectar **secuencias** de la kill chain, no alertas sueltas. Es la primera contribución original del TFG.
**Estimación:** 3–4 semanas · **Prerrequisitos:** F1, F2

### F3.1 — Modelado de escenarios

- [ ] **1.** Preparar el dataset serio: extraer `compound/apt29/day1` y `day2` (367 MB descomprimidos) y hacer el replay a `raw.host.windows`.
- [ ] **2.** Extraer también la parte de red (`zeek/`, `pcaps/`) y crear el topic `raw.net.zeek` + su normalizador. **Aquí es donde tu pipeline pasa a ser multi-fuente**, que es un salto cualitativo importante.
- [ ] **3.** Estudiar el `emulationplans/` de apt29 (viene en el dataset) y **reconstruir la cadena de ataque** paso a paso: qué técnica, en qué orden, en qué host. Esto es tu **verdad conocida de la secuencia**.
- [ ] **4.** Escribir `docs/scenarios/apt29-day1.md`: la cadena de tácticas en tabla (táctica → técnica → evidencia esperada en los logs → ventana temporal aproximada).
- [ ] **5.** Diseñar **3–5 patrones CEP** de valor general (no sobreajustados a apt29):
  - **P1 — Robo de credenciales:** creación de proceso inusual → acceso a LSASS → creación de fichero (volcado) → *(opcional)* borrado de log. Ventana: minutos.
  - **P2 — Movimiento lateral:** logon remoto (4624 tipo 3) → creación de proceso remoto/servicio → conexión de red saliente desde el nuevo host. Ventana: minutos–horas. **Cruza hosts** (ojo al particionado: ver F3.2, paso 9).
  - **P3 — Descubrimiento y escalada:** ráfaga de comandos de reconocimiento → uso de privilegios especiales (4672) → persistencia. Ventana: minutos.
  - **P4 — Exfiltración:** acceso masivo a ficheros → compresión/archivado → conexión saliente de gran volumen a destino inusual.
  - **P5 — Ausencia como señal:** proceso crítico que deja de emitir eventos tras un acceso sospechoso (negación temporal). *Solo si la API elegida lo soporta con comodidad.*

### F3.2 — Implementación

- [ ] **6.** Implementar los patrones con `MATCH_RECOGNIZE` (o la Pattern API si elegiste Java):
  - `PARTITION BY device_hostname` (o por usuario, según el patrón)
  - `ORDER BY time`
  - `MEASURES` para extraer los datos de cada etapa detectada
  - `PATTERN` con cuantificadores (`A B+ C?`)
  - `DEFINE` con las condiciones de cada variable
  - `WITHIN` para la ventana temporal
- [ ] **7.** Trabajar sobre **`det.alerts`** además de `norm.events`: correlacionar alertas Sigma ya etiquetadas con ATT&CK es más semántico y limpio que correlacionar eventos crudos. *(Decisión de diseño: documentarla.)*
- [ ] **8.** Definir el **esquema de campaña** emitido a `det.campaigns`:
  ```
  campaign_id · first_seen · last_seen · duration
  pattern_id · pattern_name
  stages[] { order, tactic_id, technique_id, time, evidence_alert_ids[], device }
  devices[] · users[] · confidence
  tfg.dataset_id
  ```
- [ ] **9. Problema del movimiento lateral entre hosts.** Los patrones que cruzan máquinas chocan con el particionado por host. Opciones:
  - Re-particionar por *usuario* o por *sesión de logon* para esos patrones concretos.
  - Un segundo job que consuma `det.campaigns` y una campañas relacionadas por usuario/tiempo (correlación de segundo nivel).
  > Recomendación: la segunda. Es más limpia y da una jerarquía elegante: alerta → campaña local → **campaña multi-host**. Y "correlación jerárquica en dos niveles" queda muy bien en la memoria.
- [ ] **10.** Gestión de **eventos tardíos**: definir política (`allowedLateness`) y desviar los descartados a `dlq.late`. Medir cuántos hay: es un dato de calidad.

### F3.3 — Validación

- [ ] **11.** Validar cada patrón contra su dataset:
  - P1 → los `LSASS_campaign_01..07` (siete variantes: excelente prueba de **generalización**, no de memorización)
  - P2, P3 → apt29 day1/day2
  - P4 → apt29 day2 (contiene exfiltración)
- [ ] **12.** **Prueba de falsos positivos:** ejecutar los patrones contra la porción **benigna** de los datasets (recuerda: OTRF incluye eventos benignos concurrentes). Contar disparos espurios.
- [ ] **13.** Medir la **reducción de alertas**: nº de alertas Sigma individuales vs. nº de campañas emitidas. Ese ratio es **uno de los resultados estrella del TFG** (ataca directamente la fatiga de alertas del planteamiento).
- [ ] **14.** Medir **latencia de detección**: tiempo entre el último evento de la secuencia y la emisión de la campaña.

### 📦 Entregables F3
`pipeline/jobs/cep_job.py` (o módulo Java) · `detection/patterns/*.sql` · `docs/scenarios/*.md` · resultados de reducción de alertas y latencia

### ✅ DoD
1. ≥3 patrones implementados y disparando sobre datasets reales.
2. P1 detecta las 7 variantes de LSASS_campaign (generalización demostrada).
3. Al menos una campaña multi-etapa detectada en apt29.
4. Ratio de reducción de alertas medido.
5. Falsos positivos sobre tráfico benigno cuantificados.

### ⚠️ Riesgos
| Riesgo | Mitigación |
|---|---|
| Los patrones no disparan (condiciones demasiado estrictas) | Empezar **muy laxo** y endurecer; instrumentar cada etapa para ver dónde se rompe la cadena |
| Sobreajuste a apt29 | Validar con los LSASS_campaign, que son 7 variantes independientes |
| `MATCH_RECOGNIZE` se queda corto | Plan B ya identificado en F1: job de CEP en Java |
| El estado del CEP crece sin control | Ventanas acotadas (`WITHIN`) y vigilar el tamaño de estado en Grafana |

---

## F4 — Plano CTI 🟠

**Objetivo:** disponer de un grafo de inteligencia de amenazas (STIX/ATT&CK) que contextualice las detecciones.
**Estimación:** 3–4 semanas · **Prerrequisitos:** F1

> 🟠 **Nota de alcance:** OpenCTI es pesado (~8–10 GB de RAM con OpenSearch). Si el calendario aprieta, el **plan B ligero** (paso 12) da el 80 % del valor con el 20 % del esfuerzo. Decide pronto y sin culpa.

### F4.1 — OpenCTI

- [ ] **1.** Añadir el *stack* de OpenCTI al compose bajo el perfil `cti` (plataforma, workers, OpenSearch, Redis, RabbitMQ, MinIO). Fijar versiones.
- [ ] **2.** Ajustar memoria de OpenSearch (`-Xms2g -Xmx4g`) y limitar a **1–2 workers**.
- [ ] **3.** Levantarlo **solo** (cierra `stream` y `store` mientras) y verificar el acceso web.
- [ ] **4.** Activar el **conector de MITRE ATT&CK** → importa el framework completo al grafo.
- [ ] **5.** Activar 1–2 conectores de IOCs (abuse.ch / AlienVault OTX). Registrar cuántos objetos STIX entran.
- [ ] **6.** Explorar el modelo de datos por la API GraphQL: entiende `Intrusion-Set`, `Malware`, `Attack-Pattern`, `Indicator`, `Relationship`.

### F4.2 — Extracción de TTPs desde informes

- [ ] **7.** Instalar TRAM (o cargar su modelo SciBERT afinado directamente desde los notebooks).
- [ ] **8.** Reunir un corpus de prueba: 5–10 informes públicos de amenazas (incluye alguno de APT29 para cerrar el círculo con tus datos).
- [ ] **9.** Ejecutar la extracción: informe → frases → técnicas ATT&CK propuestas. **Solo inferencia**, sin entrenar.
- [ ] **10.** Evaluar la calidad sobre un subconjunto anotado a mano (o usando AnnoCTR si te encaja la licencia CC-BY-SA). Reportar precisión/recall aproximados.
- [ ] **11.** Convertir la salida a objetos STIX y cargarla en OpenCTI vía su API. **Cierra el ciclo:** informe en lenguaje natural → grafo consultable.
- [ ] **12.** 🅱️ **Plan B ligero (si OpenCTI resulta inviable):** saltarte OpenCTI y cargar **directamente en Neo4j** (F5) los objetos STIX de ATT&CK (JSON público de MITRE, `enterprise-attack.json`) más los IOCs de abuse.ch vía su API. Pierdes la plataforma de gestión, pero **conservas todo el valor analítico**, que es lo que tu TFG necesita. Documenta la decisión como *trade-off* de recursos.

### 📦 Entregables F4
Perfil `cti` en el compose · `cti/connectors/` · `cti/extract/` (TRAM) · corpus + resultados de extracción · script de exportación STIX → Neo4j

### ✅ DoD
1. ATT&CK completo cargado y consultable.
2. ≥1 feed de IOCs sincronizado.
3. ≥5 informes procesados con técnicas extraídas y cargadas.
4. Exportación a Neo4j funcionando (es lo que consume F5).

---

## F5 — Pilar B: grafo de ataque y razonamiento 🔴

**Objetivo:** derivar **rutas de ataque factibles** hacia activos críticos, con trazabilidad lógica. Es la contribución más diferenciadora del TFG.
**Estimación:** 4–5 semanas · **Prerrequisitos:** F2 (alertas), F4 o su plan B

### F5.1 — Neo4j y modelo de datos

- [ ] **1.** Añadir Neo4j al compose (perfil `graph`) con el plugin **GDS** habilitado. Heap 2 GB + pagecache 1–2 GB.
- [ ] **2.** Diseñar el **modelo de grafo** y escribirlo en `graph/model.md`:
  ```
  NODOS
    (:Host {name, os, criticality, zone})
    (:User {name, domain, privileged})
    (:Service {name, port, version})
    (:Vulnerability {cve, cvss, epss, exploitable})
    (:Asset {name, type, business_value})     ← la "joya de la corona"
    (:Technique {attack_id, name, tactic})
    (:Actor {name, aliases})
    (:Campaign {name})
    (:Indicator {type, value})
    (:Alert {alert_id, time})
    (:AttackPath {path_id, score})

  RELACIONES
    (Host)-[:RUNS]->(Service)
    (Service)-[:HAS_VULN]->(Vulnerability)
    (Host)-[:CONNECTS_TO {protocol, port}]->(Host)
    (User)-[:CAN_ACCESS {level}]->(Host)
    (Host)-[:HOSTS]->(Asset)
    (Vulnerability)-[:ENABLES]->(Technique)
    (Technique)-[:PRECEDES]->(Technique)
    (Actor)-[:USES]->(Technique)
    (Alert)-[:OBSERVED_ON]->(Host)
    (Alert)-[:EVIDENCES]->(Technique)
    (AttackPath)-[:TRAVERSES {step}]->(Host)
    (AttackPath)-[:REACHES]->(Asset)
  ```
- [ ] **3.** Crear índices y restricciones de unicidad (`Host.name`, `Technique.attack_id`, `Vulnerability.cve`).
- [ ] **4.** **Poblar el inventario del laboratorio.** Necesitas una topología sobre la que razonar. Opciones:
  - Reconstruirla desde los propios datasets (los hosts que aparecen en apt29: `SCRANTON`, `NASHUA`, etc.) — **preferible**, porque es coherente con los datos.
  - Complementar con un escenario sintético documentado (DMZ / red interna / servidor de BD como activo crítico).
  - Escribir `graph/seed/lab_topology.cypher` con todo ello. **Documenta que es un entorno de laboratorio**, no inventes que es real.
- [ ] **5.** Cargar vulnerabilidades: seleccionar CVEs plausibles para los servicios del laboratorio desde NVD, con su CVSS y (si está disponible) **EPSS** como probabilidad de explotación.
- [ ] **6.** Cargar el subgrafo de ATT&CK y de CTI (salida de F4).
- [ ] **7.** Ingerir las alertas de `det.alerts` como nodos `(:Alert)` conectados a su host y a su técnica. **Este es el enganche entre el mundo streaming y el mundo grafo**: decide si en tiempo real (consumidor Kafka→Neo4j) o en micro-batch por Dagster. *Recomendación: micro-batch cada N minutos; suficiente y mucho más simple.*

### F5.2 — Analítica de grafos (GDS)

- [ ] **8.** Proyectar el grafo en GDS y calcular **centralidad** (Betweenness / PageRank) sobre los hosts → identifica los "puentes" de la red. Escribir el resultado como propiedad `criticality_centrality`.
- [ ] **9.** Detección de comunidades (Louvain) para segmentar la red y detectar cruces de segmento anómalos.
- [ ] **10.** **Camino más corto ponderado** (Dijkstra) desde un host comprometido hasta los activos críticos, con pesos = dificultad de explotación (derivada de CVSS/EPSS).
- [ ] **11.** 🟢 *Opcional:* embeddings de nodo (FastRP/Node2Vec) + **link prediction** para sugerir relaciones no observadas. Da un toque de investigación muy vistoso si sobra tiempo.

### F5.3 — Razonamiento Datalog

- [ ] **12.** Instalar **Soufflé** (contenedor propio o binario en el host).
- [ ] **13.** Estudiar el modelo de MulVAL: *facts* (configuración, vulnerabilidades, políticas de acceso) + **reglas de interacción** (cómo un atacante progresa) → derivación de los estados alcanzables.
- [ ] **14.** **Decisión importante:**
  - *Opción A:* usar MulVAL tal cual (requiere XSB Prolog) y consumir su grafo de salida.
  - *Opción B:* **reimplementar el subconjunto de reglas de interacción en Soufflé**, adaptado a tu modelo.
  > Recomendación: **B**. Es más trabajo, pero (i) evita pelearte con una toolchain antigua, (ii) te permite añadir reglas propias basadas en **evidencia observada** (que es tu aportación: MulVAL razona sobre configuración estática; tú además metes las alertas reales), y (iii) es mucho más defendible como contribución propia.
- [ ] **15.** Escribir `graph/datalog/facts.dl` (declaraciones) y `graph/datalog/rules.dl` con reglas del estilo:
  ```
  // El atacante puede ejecutar código en H si hay servicio vulnerable accesible
  execCode(Attacker, H, Priv) :- netAccess(Attacker, H, Proto, Port),
                                 runs(H, Svc, Port), hasVuln(Svc, V),
                                 vulnAllows(V, remoteExec, Priv).

  // Escalada local
  execCode(A, H, root) :- execCode(A, H, user), hasVuln(H, V), vulnAllows(V, privEsc, root).

  // Movimiento lateral por credenciales robadas
  execCode(A, H2, Priv) :- execCode(A, H1, root), credsOn(H1, U),
                           canAccess(U, H2, Priv), netAccess(H1, H2, _, _).

  // NUEVO (tu aportación): evidencia observada refuerza el paso
  observedStep(A, H, T) :- alertOn(H, T), techniqueEnables(T, _).
  ```
- [ ] **16.** Exportador `graph/export_facts.py`: Neo4j (Cypher) → ficheros de hechos `.facts` para Soufflé.
- [ ] **17.** Importador `graph/import_paths.py`: salida de Soufflé → nodos `(:AttackPath)` con sus `[:TRAVERSES]` de vuelta en Neo4j.
- [ ] **18.** **Trazabilidad de la derivación:** conserva *por qué* se derivó cada paso (qué regla y qué hechos). Sin esto no hay explicabilidad en F6. Soufflé permite emitir relaciones de procedencia; si se complica, guarda la regla aplicada como propiedad de la relación.
- [ ] **19.** Orquestar el ciclo completo con Dagster: *alertas nuevas → refrescar grafo → exportar hechos → ejecutar Soufflé → importar rutas*, como *assets* con dependencias.
- [ ] **20.** **Validación:** en un escenario donde apt29 compromete un host, comprobar que el razonador deriva una ruta hasta el activo crítico y que los pasos son **plausibles y explicables**.

### 📦 Entregables F5
Perfil `graph` · `graph/model.md` · `graph/seed/*.cypher` · `graph/gds/*.cypher` · `graph/datalog/{facts,rules}.dl` · exportador/importador · pipeline Dagster

### ✅ DoD
1. Grafo poblado con topología, vulnerabilidades, ATT&CK, CTI y alertas.
2. Métricas GDS calculadas y escritas al grafo.
3. Reglas Datalog derivando rutas de ataque no triviales (≥3 saltos).
4. Rutas escritas de vuelta en Neo4j y visualizables.
5. Cada paso de una ruta es explicable (regla + hechos que lo justifican).

### ⚠️ Riesgos
| Riesgo | Mitigación |
|---|---|
| Curva de Datalog | Empezar con 5 reglas que funcionen y crecer; no escribas 40 de golpe |
| Explosión combinatoria de rutas | Acotar profundidad; podar por umbral de puntuación; quedarte con el top-K |
| Falta de datos de topología reales | Escenario de laboratorio **documentado como tal**; es perfectamente válido y honesto |

---

## F6 — Pilar C: priorización explicable + API 🟠

**Objetivo:** convertir detecciones y rutas en una **cola de incidentes priorizada y justificada**, servida por API.
**Estimación:** 2–3 semanas · **Prerrequisitos:** F3, F5

### F6.1 — Modelo de puntuación

- [ ] **1.** Definir la fórmula, con **factores independientes y normalizados a [0,1]**:
  ```
  score = w1·confianza_deteccion      (nivel Sigma, nº de etapas de la campaña)
        + w2·severidad_tactica        (posición en la kill chain; exfiltración > reconocimiento)
        + w3·criticidad_activo        (valor de negocio + centralidad GDS)
        + w4·proximidad_ruta          (1 / saltos hasta el activo crítico)
        + w5·confianza_cti            (coincidencia con IOC/actor conocido)
        + w6·explotabilidad           (EPSS/CVSS de las vulns implicadas)
  ```
- [ ] **2.** **Justificar los pesos.** No los inventes sin más: opciones defendibles — (a) igual peso como línea base, (b) AHP/Delphi documentado, (c) ajuste sobre datos de validación. *Recomendación: línea base igual + análisis de sensibilidad (paso 4). Sencillo y riguroso.*
- [ ] **3.** Implementar `scoring/score.py` devolviendo **siempre** la descomposición, nunca solo el número:
  ```json
  { "incident_id": "...", "score": 0.87, "level": "critical",
    "factors": [ {"name":"proximidad_ruta","value":0.9,"weight":0.2,"contribution":0.18,
                  "explanation":"a 1 salto del servidor de BD (activo crítico)"} ],
    "narrative": "Crítico: campaña de robo de credenciales (T1003.001) en WORKSTATION5, host central de la red, con ruta directa al servidor de BD." }
  ```
- [ ] **4.** **Análisis de sensibilidad:** variar los pesos ±30 % y medir cómo cambia el top-10. Si el ranking es estable, tu esquema es robusto — y eso es un resultado publicable en la memoria.
- [ ] **5.** Generar el `narrative` con plantillas deterministas. 🟢 *Opcional:* redacción con LLM (solo inferencia por API) para una prosa más natural, manteniendo **siempre** la descomposición numérica como fuente de verdad.

### F6.2 — API

- [ ] **6.** Crear `api/` con FastAPI y estructura por routers.
- [ ] **7.** Endpoints:
  ```
  GET  /health
  GET  /incidents            ?severity&from&to&host&page      → cola priorizada
  GET  /incidents/{id}                                         → detalle + factores + narrativa
  GET  /incidents/{id}/timeline                                → etapas de la campaña
  GET  /incidents/{id}/path                                    → ruta de ataque (nodos/aristas)
  GET  /assets                                                 → inventario + criticidad
  GET  /graph/subgraph       ?center&depth                     → subgrafo para visualizar
  GET  /attack/coverage                                        → matriz Navigator
  GET  /cti/actors /cti/indicators
  GET  /stats/overview                                         → KPIs del panel
  WS   /ws/alerts                                              → alertas en vivo
  ```
- [ ] **8.** Capa de acceso a datos: ClickHouse (incidentes/alertas) + Neo4j (grafo). Con caché sencilla para las consultas caras de grafo.
- [ ] **9.** WebSocket alimentado por un consumidor de `enr.incidents`.
- [ ] **10.** Modelos Pydantic para todas las respuestas → documentación OpenAPI automática (que además sirve de anexo de la memoria).
- [ ] **11.** Tests de API con `pytest` + `httpx`.

### 📦 Entregables F6
`scoring/` con tests · `api/` FastAPI · OpenAPI exportado · análisis de sensibilidad

### ✅ DoD
1. Todo incidente tiene puntuación **con** descomposición y narrativa.
2. API funcionando, documentada y con tests.
3. WebSocket empujando incidentes en vivo durante un replay.
4. Análisis de sensibilidad hecho.

---

## F7 — Evaluación cuantitativa 🔴

**Objetivo:** demostrar con números que el sistema funciona. **Sin esto no hay TFG defendible.**
**Estimación:** 2–3 semanas · **Prerrequisitos:** F3 (mínimo), idealmente F5–F6

- [ ] **1.** Escribir `docs/evaluation-protocol.md` **antes** de ejecutar nada: qué se mide, sobre qué datos, con qué línea base. (Definir el protocolo después de ver resultados es un sesgo clásico; evítalo y dilo en la memoria.)
- [ ] **2.** Consolidar la **verdad conocida**: tabla dataset → técnicas etiquetadas (de los YAML de `_metadata`) → hosts y ventana temporal.
- [ ] **3.** Definir el conjunto de evaluación: LSASS_campaign_01..07, apt29 day1/day2, Log4Shell, GoldenSAML + ≥10 atómicos de distintas tácticas.
- [ ] **4.** **Métricas de detección:**
  - Precisión, *recall*, F1 por técnica y agregado
  - Tasa de falsos positivos sobre la porción benigna
  - Cobertura ATT&CK (técnicas detectables / técnicas presentes)
- [ ] **5.** **Métricas de correlación multi-etapa:**
  - Campañas correctamente reconstruidas / campañas reales
  - Completitud de etapas (etapas detectadas / etapas reales de la cadena)
  - **Ratio de reducción de alertas** = 1 − (campañas / alertas individuales) ← *métrica estrella*
- [ ] **6.** **Métricas de priorización:**
  - ¿Aparece el incidente real en el **top-K**? (precision@K, MRR)
  - Correlación entre tu puntuación y la gravedad real anotada
- [ ] **7.** **Métricas de razonamiento:**
  - ¿La ruta derivada coincide con la ruta real del plan de emulación?
  - Precisión de la ruta top-1
- [ ] **8.** **Métricas de rendimiento:**
  - Throughput (ev/s) en normalización, Sigma y CEP
  - Latencia p50/p95/p99 de extremo a extremo
  - Uso de recursos por componente
  - Comportamiento bajo carga (replay acelerado ×10, ×100)
- [ ] **9.** **Líneas base para comparar** (esencial: sin comparación, tus números no significan nada):
  - *Baseline 1:* solo reglas Sigma sin correlación → demuestra el valor del CEP
  - *Baseline 2:* priorización solo por severidad Sigma → demuestra el valor del scoring contextual
  - *Baseline 3:* 🟢 si hay tiempo, mismas reglas en un SIEM abierto (p. ej. Wazuh) → comparación externa
- [ ] **10.** Automatizar todo en `eval/run_evaluation.py`: un comando → todas las métricas → CSV + gráficas.
- [ ] **11.** Ejecutar cada experimento **≥3 veces** y reportar media y desviación (las métricas de rendimiento varían).
- [ ] **12.** Generar las figuras en `eval/figures/` listas para la memoria.
- [ ] **13.** Escribir `docs/results.md` con el análisis: qué funciona, qué no, y **por qué**. Los fallos analizados con honestidad valen más que los éxitos sin explicar.

### 📦 Entregables F7
`docs/evaluation-protocol.md` · `eval/run_evaluation.py` · `eval/results/*.csv` · `eval/figures/` · `docs/results.md`

### ✅ DoD
1. Protocolo escrito **antes** de los experimentos.
2. Todas las familias de métricas calculadas.
3. Comparación contra ≥2 líneas base.
4. Resultados reproducibles con un comando.
5. Figuras listas para la memoria.

---

## F8 — Frontend SaaS 🟢

**Objetivo:** envolver la plataforma en una aplicación web multi-tenant que se pueda presentar como producto.
**Estimación:** 3–4 semanas · **Prerrequisitos:** F6 (la API)

> 🟢 **Aviso de alcance honesto:** esta fase **no es necesaria para aprobar bien**, y consume tiempo que compite con la memoria en la peor época del curso. Por eso está al final y por eso se divide en un **MVF (mínimo viable) de ~1 semana** y un **completo**. Si en abril vas justo, haz el MVF y punto: tres pantallas buenas impresionan más que diez a medias.

### F8.0 — Definición de producto

- [ ] **1.** Elegir **nombre y marca**. Ideas: *Kairos* (el momento oportuno), *Argos* (el de los cien ojos — ojo, el grupo RSTI ya usa ARGOS, mejor evitar), *Sentinel Graph*, *Atlas*, *Trazo*, *Vigía*. Elige uno corto y pronunciable.
- [ ] **2.** Definir 2–3 *personas*: analista de SOC, responsable de TI de PYME, CISO. Cada pantalla debe servir a una de ellas.
- [ ] **3.** Escribir `docs/product-brief.md`: propuesta de valor en una frase, funcionalidades, y qué queda fuera.

### F8.1 — Stack y andamiaje

- [ ] **4.** Stack recomendado (justificar la elección en la memoria):
  - **React 18 + TypeScript + Vite** — estándar, rápido, tipado
  - **Tailwind CSS + shadcn/ui** — componentes accesibles y aspecto profesional sin diseñar de cero
  - **TanStack Query** — gestión de estado de servidor, caché y refresco
  - **React Router**
  - **Recharts** — series temporales y KPIs
  - **Cytoscape.js** (o `react-force-graph`) — **visualización del grafo de ataque**. *Cytoscape tiene mejores algoritmos de layout para grafos dirigidos con etiquetas; force-graph es más vistoso en movimiento. Prueba ambos con tus datos reales antes de decidir.*
  - **Zustand** — estado de UI (filtros, tema)
- [ ] **5.** Crear `frontend/` con Vite, configurar proxy a la API y variables de entorno.
- [ ] **6.** Definir el **sistema de diseño**: paleta (oscuro por defecto, que es lo esperado en un SOC), escala tipográfica, códigos de severidad (crítico/alto/medio/bajo), espaciado. Sin esto, la app parecerá un prototipo.
- [ ] **7.** Layout base: barra lateral, cabecera con selector de organización, área de contenido, panel de notificaciones en vivo.

### F8.2 — Multi-tenancy y autenticación

- [ ] **8.** Modelo de tenant: añadir `tenant_id` a los eventos, alertas, incidentes y activos. Propagarlo desde la ingesta (el `replay_dataset.py` recibe un `--tenant`).
- [ ] **9.** Aislamiento: filtrado obligatorio por `tenant_id` **en la capa de datos**, no en el frontend. Nunca confíes en el cliente.
- [ ] **10.** Autenticación: JWT en FastAPI con roles (`admin`, `analyst`, `viewer`).
  > *Keycloak sería lo "de verdad", pero es otro servicio pesado. Para un TFG, JWT propio bien hecho es suficiente y lo justificas como decisión de alcance.*
- [ ] **11.** Sembrar 2–3 organizaciones de demostración con datos distintos (p. ej. "Cliente A — sector industrial", "Cliente B — despacho profesional"). **Esto es lo que hace que parezca un SaaS de verdad.**

### F8.3 — Pantallas

**MVF (mínimo viable — haz esto primero):**

- [ ] **12. Panel de situación.** KPIs (incidentes abiertos por severidad, campañas activas, hosts afectados, MTTD), serie temporal de alertas, top hosts en riesgo, actividad reciente.
- [ ] **13. Cola de incidentes.** Tabla ordenada por puntuación, con filtros (severidad, técnica, host, fechas) y badges de ATT&CK.
- [ ] **14. Detalle de incidente.** La pantalla estrella. Tres bloques:
  - **Línea de tiempo de la campaña** — las etapas en orden, con su técnica y evidencia.
  - **Desglose de la puntuación** — barras con la contribución de cada factor + la narrativa. *Aquí se ve la explicabilidad, que es el corazón del proyecto.*
  - **Ruta de ataque** — minigrafo desde el host comprometido hasta el activo crítico.

**Completo (si hay tiempo):**

- [ ] **15. Explorador del grafo de ataque.** Vista interactiva a pantalla completa: zoom, expandir nodos, filtrar por tipo, resaltar rutas, panel lateral con las propiedades del nodo seleccionado.
- [ ] **16. Matriz ATT&CK.** Mapa de calor de tácticas × técnicas: cobertura de detección y técnicas realmente observadas. Muy visual y muy "producto".
- [ ] **17. Inventario de activos.** Hosts, criticidad, vulnerabilidades, exposición y "rutas que llegan hasta aquí".
- [ ] **18. Panel de CTI.** Actores, campañas e indicadores relacionados con lo detectado.
- [ ] **19. Informes.** Generar un PDF ejecutivo del periodo (aprovecha tu experiencia con LaTeX o usa una plantilla HTML→PDF).
- [ ] **20. Ajustes.** Gestión de organización, usuarios, umbrales de severidad y pesos del scoring (¡que el usuario los toque y vea cómo cambia el ranking es una demo espectacular!).
- [ ] **21. Alertas en vivo.** Conectar el WebSocket: durante un replay, ver los incidentes aparecer solos. **Efecto "wow" garantizado en la defensa.**

### F8.4 — Acabado

- [ ] **22.** Estados de carga (*skeletons*), estados vacíos y manejo de errores. Es lo que separa "prototipo" de "producto".
- [ ] **23.** Responsive razonable (al menos que no se rompa en portátil pequeño y proyector).
- [ ] **24.** Accesibilidad básica: contraste, foco visible, navegación por teclado.
- [ ] **25.** **Modo demo:** un botón que lanza un replay y hace que todo cobre vida. Imprescindible para la defensa: no dependas de teclear comandos delante del tribunal.
- [ ] **26.** Dockerizar el frontend (build + Nginx) y añadirlo al compose.
- [ ] **27.** Grabar un **vídeo de 3–5 minutos** de la demo. Es tu seguro contra el fallo técnico el día de la defensa. **Hazlo sí o sí.**

### 📦 Entregables F8
`frontend/` completo · `docs/product-brief.md` · datos de demo multi-tenant · Dockerfile + servicio en compose · vídeo de demostración

### ✅ DoD (MVF)
1. Panel, cola de incidentes y detalle funcionando contra la API real.
2. Multi-tenant con ≥2 organizaciones y aislamiento verificado.
3. Autenticación con roles.
4. Modo demo operativo.
5. Vídeo grabado.

### ⚠️ Riesgos
| Riesgo | Mitigación |
|---|---|
| **El frontend se come el tiempo de la memoria** | MVF primero; fecha límite dura: si el 1 de mayo no está el MVF, se congela y a escribir |
| Perfeccionismo visual | Usar shadcn/ui y no diseñar componentes desde cero |
| La visualización del grafo va lenta con muchos nodos | Limitar a subgrafos (profundidad ≤3), paginar, usar canvas en vez de SVG |

---

## F9 — Despliegue, memoria y defensa 🔴

**Objetivo:** cerrar el trabajo: reproducible, documentado y bien defendido.
**Estimación:** 4 semanas (más la escritura continua desde F1)

### F9.1 — Despliegue

- [ ] **1.** Instalar minikube (o kind) y verificar que arranca con recursos suficientes.
- [ ] **2.** Escribir los manifiestos en `infra/k8s/`: Deployments, Services, ConfigMaps, Secrets, PVCs. *Alternativa más elegante: un chart de Helm con `values.yaml` por entorno.*
- [ ] **3.** Desplegar el núcleo (Redpanda, Flink, ClickHouse, Neo4j, API, frontend). OpenCTI puede quedarse fuera por peso — justifícalo.
- [ ] **4.** Verificar el sistema completo funcionando en K8s.
- [ ] **5.** 🟢 Si hay créditos: desplegar en la nube (Azure for Students / GitHub Student Pack) y capturar evidencias. Apagar después.
- [ ] **6.** Documentar en `docs/deployment.md` el arranque desde cero: **de repo clonado a sistema funcionando**. Un lector debe poder reproducirlo.
- [ ] **7.** Script `make demo` (o `scripts/demo.sh`) que levante todo y lance el replay.

### F9.2 — La memoria

> **Escríbela desde F1, no al final.** Al cerrar cada fase, redacta su capítulo mientras lo tienes fresco.

Estructura propuesta (ajústala a la normativa de la ETSIT):

| Cap. | Contenido | Se escribe en |
|---|---|---|
| 0 | Resumen / Abstract (ES + EN) | Al final |
| 1 | **Introducción** — motivación, problema (fatiga de alertas, ataques multi-etapa), objetivos, estructura | Sep 2026 (borrador) |
| 2 | **Estado del arte** — SIEM/SOC, MITRE ATT&CK, CEP, grafos de ataque y MulVAL, CTI y STIX, conciencia cibersituacional, trabajos relacionados y hueco que llenas | **Ago–Sep 2026** ← aprovecha el verano |
| 3 | **Análisis y requisitos** — funcionales, no funcionales, casos de uso, restricciones | Oct 2026 |
| 4 | **Diseño de la arquitectura** — visión, planos, decisiones y *trade-offs* (¡las de `BITACORA.md §2`!) | Nov–Dic 2026 |
| 5 | **Implementación I: ingesta y normalización** (F1–F2) | Dic 2026 |
| 6 | **Implementación II: detección multi-etapa** (F3) | Feb 2027 |
| 7 | **Implementación III: CTI y grafo razonado** (F4–F5) | Mar 2027 |
| 8 | **Implementación IV: priorización y plataforma** (F6, F8) | Abr 2027 |
| 9 | **Evaluación** — protocolo, experimentos, resultados, discusión (F7) | Abr–May 2027 |
| 10 | **Conclusiones y trabajo futuro** | May 2027 |
| — | Bibliografía, anexos (esquema OCSF, reglas, API, manual) | Continuo |

- [ ] **8.** Montar el proyecto LaTeX desde el principio (con la plantilla oficial de la ETSIT si existe) y **versionarlo en el repo** (`docs/memoria/`).
- [ ] **9.** Gestión bibliográfica con BibTeX desde el día uno. Cada paper que leas, a la `.bib` **en el momento**.
- [ ] **10.** Aspectos **éticos y legales** (¡aprovecha la asignatura *Marco ético y legal*!): RGPD y datos de telemetría, licencias de los datasets (OTRF MIT/GPL, AnnoCTR CC-BY-SA), uso responsable de herramientas ofensivas, y el hecho de que toda la emulación se hizo en laboratorio aislado.
- [ ] **11.** Revisión completa: coherencia de figuras y tablas, numeración, referencias cruzadas, ortografía.
- [ ] **12.** Entregar al tutor **≥3 semanas** antes del depósito para su revisión. No negociable.

### F9.3 — Defensa

- [ ] **13.** Presentación de 15–20 min: problema (2) → estado del arte y hueco (3) → arquitectura (4) → contribuciones/pilares (5) → **demo en vídeo** (3) → resultados (3) → conclusiones (1).
- [ ] **14.** Ensayar en voz alta ≥3 veces, cronometrando.
- [ ] **15.** Preparar respuestas a las preguntas probables:
  - ¿Por qué Datalog y no un motor de reglas al uso?
  - ¿Cómo evitas el sobreajuste a los datasets?
  - ¿Qué pasa con el rendimiento a escala real?
  - ¿Por qué descartaste RDF/SPARQL frente a property graph?
  - ¿Cómo validas la corrección de las rutas derivadas?
  - ¿Qué aporta esto frente a un SIEM comercial?
  - Limitaciones y qué harías con más tiempo.
- [ ] **16.** Plan B técnico: **todo grabado en vídeo** + capturas en las diapositivas. Nunca dependas de que la demo arranque en directo.

---

## 5. Calendario integrado con el curso

### Carga académica

**1.º cuatrimestre (sep 2026 – ene 2027):** Inglés · Gestión de proyectos · Proyectos de ingeniería de datos y sistemas · Ciberseguridad y protección de datos · Marco ético y legal · HCoV
**2.º cuatrimestre (feb – jun 2027):** TSDE · TIG · **Prácticas** · TFG

### Plan mes a mes

| Periodo | Disponibilidad | Foco TFG | Notas |
|---|---|---|---|
| **Ago 2026 (2.ª mitad)** | 🟢 Alta | **F1.1–F1.3** + estado del arte (cap. 2) | ⚠️ **Escribir al tutor ya.** Ventana de oro: sin clases |
| **Sep 2026** | 🟢 Media-alta | Cerrar **F1** | Empiezan las clases; cap. 1 y 2 en borrador |
| **Oct 2026** | 🟡 Media | **F2** completo | *Gestión de proyectos* → usa el TFG como caso; cap. 3 |
| **Nov 2026** | 🟡 Media | **F3** (Pilar A) | La fase más valiosa; cap. 4 |
| **Dic 2026** | 🟠 Media-baja | Cerrar F3 · empezar **F4** | Navidad: descanso + cap. 5 |
| **Ene 2027** | 🔴 Baja | **PAUSA** (exámenes) | Prioridad: aprobar. Vas por delante |
| **Feb 2027** | 🟡 Media | **F5** (Pilar B) — empujón fuerte | Antes de que arranquen las Prácticas |
| **Mar 2027** | 🔴 Baja | Cerrar F5 · **F6** | Prácticas + TSDE + TIG; sprints cortos |
| **Abr 2027** | 🔴 Baja | **F7** (evaluación) · **F8 MVF** | Escribir caps. 6–8 en paralelo |
| **May 2027** | 🟡 Media | Cerrar F7/F8 · **F9** despliegue · memoria | Memoria al tutor a mediados de mayo |
| **Jun 2027** | 🟡 Media | Depósito + **defensa** | Buffer de 3 semanas |

### Puntos de control (si fallas uno, activa el plan B)

| Fecha | Hito | Si no está… |
|---|---|---|
| **15 sep 2026** | Tutor confirmado + F1 en marcha | 🚨 Escribir a más profesores del grupo, ya |
| **30 nov 2026** | F2 completo, F3 en marcha | Recortar F4 al plan B ligero |
| **28 feb 2027** | **F3 + F5 funcionando = núcleo defendible** | 🚨 Punto de no retorno: congelar alcance y ir a evaluación + memoria |
| **30 abr 2027** | F7 con resultados + 60 % de memoria | Cancelar F8 sin dudarlo |
| **15 may 2027** | Memoria completa al tutor | Pedir cita urgente y priorizar redacción |

> ⚠️ **Confirma cuanto antes la fecha oficial de depósito** de la convocatoria de junio 2027: suele ser varias semanas antes de la defensa y condiciona todo el tramo final.

---

## 6. Convenciones técnicas

### Git
- `main` siempre estable · ramas `feat/f3-cep`, `fix/...`, `docs/...`
- Commits en formato *conventional*: `feat(pipeline): ...`, `fix(graph): ...`, `docs(memoria): ...`
- **Autoría:** solo Javier Saguar. Ningún agente de IA como autor/co-autor (ver `BITACORA.md §3` y el hook `.githooks/commit-msg`). Tras clonar en otra máquina: `git config core.hooksPath .githooks`.

### Código
- Python: `ruff` (lint + formato), *type hints*, `pytest`. Estructura por módulos, nada de scripts gigantes.
- Configuración por **variables de entorno** con `.env.example` versionado (el `.env` real, nunca).
- Sin secretos en el repo. Jamás.
- Todo script con `--help` y argumentos, nada de rutas escritas a fuego.

### Datos
- `data/` git-ignored siempre.
- Datasets grandes/"fríos" → disco externo.
- `docker system prune` periódico + compactar el VHDX de WSL de vez en cuando.

### Documentación
- `BITACORA.md` — memoria de sesiones (y `AGENTS.md` sincronizado).
- `ROADMAP.md` — este archivo, el plan.
- `docs/` — documentos técnicos y la memoria.
- Toda decisión de arquitectura relevante → una entrada en `BITACORA.md §2` con su porqué. **Ese registro es literalmente el capítulo 4 de la memoria.**

---

## 7. Riesgos globales y planes B

| # | Riesgo | Probabilidad | Impacto | Mitigación / Plan B |
|---|---|---|---|---|
| R1 | No conseguir tutor a tiempo | Media | 🔴 Crítico | Escribir en **agosto**, a varios profesores; llevar el anteproyecto hecho |
| R2 | Las Prácticas absorben marzo–mayo | **Alta** | 🔴 Crítico | Núcleo cerrado en febrero; primavera solo evaluación y escritura |
| R3 | OpenCTI inviable por recursos | Media | 🟠 Medio | Plan B ligero: STIX/ATT&CK directo a Neo4j |
| R4 | Datalog más difícil de lo previsto | Media | 🟠 Medio | Empezar con 5 reglas; si se atasca, usar MulVAL tal cual |
| R5 | El frontend devora el tiempo de la memoria | **Alta** | 🟠 Medio | MVF con fecha límite dura (1 mayo); es 🟢 opcional por diseño |
| R6 | Los patrones CEP no generalizan | Media | 🟠 Medio | Validar con las 7 variantes de LSASS_campaign |
| R7 | Rotura de versiones (Ubuntu/Python muy nuevos) | Media | 🟡 Bajo | Fijar versiones en el compose; ya resuelto con Docker→`noble` |
| R8 | Pérdida de datos/trabajo | Baja | 🔴 Crítico | Push a GitHub **cada sesión**; la memoria también versionada |
| R9 | Alcance demasiado ambicioso | **Alta** | 🟠 Medio | Prioridades 🔴🟠🟢 explícitas; recortar por el final |
| R10 | Bloqueo técnico prolongado | Media | 🟠 Medio | Regla de las 2 sesiones: si te atascas, plan B y sigue |

---

## 8. Checklists rápidas

### Al empezar cada sesión
- [ ] `git pull` (por si trabajaste en otro sitio)
- [ ] Levantar los perfiles necesarios (solo esos)
- [ ] Leer `BITACORA.md §4` para recordar dónde estabas
- [ ] Fijar **un** objetivo concreto para la sesión

### Al terminar cada sesión
- [ ] Anotar la entrada en el diario de `BITACORA.md`
- [ ] Actualizar `§4 Estado actual` si cambió la fase
- [ ] `cp BITACORA.md AGENTS.md`
- [ ] `git add -A` → revisar `git status` (¿se cuela algo de `data/`?)
- [ ] Commit + push
- [ ] Marcar los `[x]` que correspondan en este ROADMAP
- [ ] Bajar los servicios pesados si no vas a seguir

### Antes de cerrar cada fase
- [ ] Todos los criterios de DoD cumplidos
- [ ] Tests en verde
- [ ] Capítulo de la memoria redactado (aunque sea en borrador)
- [ ] Figuras y capturas guardadas en `eval/figures/` o `docs/img/`
- [ ] Reunión con el tutor para validar antes de seguir

---

## 9. Referencias clave

**Marcos y estándares**
- MITRE ATT&CK — https://attack.mitre.org
- MITRE ATLAS (IA adversaria) — https://atlas.mitre.org
- OCSF — https://schema.ocsf.io
- STIX 2.1 — OASIS
- Sigma — https://github.com/SigmaHQ/sigma

**Grafos de ataque y razonamiento**
- Ou, Govindavajhala, Appel. *MulVAL: A Logic-based Network Security Analyzer*. USENIX Security 2005.
- Soufflé (Datalog) — https://souffle-lang.github.io
- Neo4j GDS — https://neo4j.com/docs/graph-data-science

**Streaming y CEP**
- Apache Flink — https://flink.apache.org
- FlinkCEP — https://nightlies.apache.org/flink/flink-docs-stable/docs/libs/cep/
- SQL `MATCH_RECOGNIZE` — docs de Flink Table API

**CTI**
- OpenCTI — https://github.com/OpenCTI-Platform/opencti
- TRAM — https://github.com/center-for-threat-informed-defense/tram
- MISP — https://www.misp-project.org

**Datos**
- OTRF Security-Datasets — https://github.com/OTRF/Security-Datasets
- Atomic Red Team — https://github.com/redcanaryco/atomic-red-team
- CALDERA — https://github.com/mitre/caldera

**Contexto de amenazas**
- ENISA Threat Landscape 2025

---

*Fin del roadmap. Mantenlo vivo: si una decisión cambia, actualiza este archivo y refléjalo en `BITACORA.md §2`.*