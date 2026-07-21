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

## 4. Estado actual
- **Fase:** F0 — arranque del entorno (cerrando).
- **Hecho:** decisiones de diseño, anteproyecto, planning, estudios de recursos/infra. **Entorno base montado:** WSL2 + Ubuntu (systemd), `.wslconfig` (44GB/24/swap 8GB), Docker Engine dentro de WSL funcionando sin sudo (hello-world OK), VS Code conectado a WSL. Repo creado en `~/proyectos/tfg-ciberconciencia` con estructura + README + .gitignore + bitácora.
- **En curso:** primer commit de F0.
- **Siguiente:** esqueleto de `docker-compose` con perfiles + levantar Redpanda de prueba; contactar al tutor (agosto).

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