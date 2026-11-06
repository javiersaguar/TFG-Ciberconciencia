# ROADMAP — Plan de trabajo detallado

**Proyecto:** Plataforma de conciencia cibersituacional — detección de ataques multi-etapa, grafo de ataque razonado y priorización explicable
**Autor:** Javier Saguar Antona · Grado en Ingeniería y Sistemas de Datos, ETSIT-UPM
**Horizonte:** agosto 2026 → defensa junio 2027
**Última actualización:** 2026-11-06 · *(rev. 5 — F3 cerrada; F4 replanificada: ATT&CK como referencia común, OpenCTI frente a plan B y evaluación de ML-2 sobre el corpus)*

---

## 0. Cómo usar este documento

- Este archivo es el **plan**; `BITACORA.md` (repo `tfg-memoria`) es la **memoria** de lo que se hizo y por qué.
- Cada fase tiene: **objetivo · prerrequisitos · pasos · entregables · criterios de aceptación (DoD) · riesgos**.
- Si un paso se atasca más de ~2 sesiones, aplica el plan B de esa fase y sigue.
- Marca el progreso editando los `[ ]` → `[x]`.
- **Núcleo defendible:** F1–F3 + F5 + F7. Lo demás se recorta si el calendario aprieta.

### Convención de prioridad

| Marca | Significado |
|---|---|
| 🔴 **CRÍTICO** | Sin esto no hay TFG. |
| 🟠 **IMPORTANTE** | Sube mucho la calidad. Se hace salvo emergencia. |
| 🟢 **OPCIONAL** | Valor añadido. Se recorta y pasa a "trabajo futuro". |
| 🧠 **ML** | Componente de aprendizaje automático. |

---

## 1. Punto de partida (a 30-07-2026)

### Hecho ✅

- **F0 — Entorno:** WSL2 + Ubuntu (systemd), Docker Engine, VS Code. Repo en GitHub privado, hook de autoría. Repositorio separado `tfg-memoria` para documentación.
- **F1 — Completa:**
  - Redpanda + Console (perfil `core`).
  - Normalización OCSF: ~20 tipos de evento Windows. **100 %** sobre el dataset de referencia
    (184/184, 0 DLQ) y **99,4 %** sobre apt29 day1 (195.197 de 196.081, 0 DLQ); el 0,6 %
    restante es cola larga con rendimiento decreciente claro.
  - ClickHouse con esquema híbrido (columnas + `raw` JSON) y sink funcionando.
  - Observabilidad: Prometheus (5 targets) + Grafana con 3 dashboards aprovisionados.
  - Flink 2.2.1 operativo; prueba de humo de `MATCH_RECOGNIZE` superada
    (hizo falta `table.exec.source.idle-timeout=5s` para desbloquear el watermark).
- **F2 — Completa** (ver detalle y pendientes reubicados en la propia fase):
  - pySigma 1.4.0 + **pipeline propia `detection/pipelines/ocsf-tfg.yml`** (3 desviaciones corregidas).
  - Evaluador en memoria: 2.093 reglas, **optimización 73×** medida.
  - Job de streaming `norm.events → det.alerts` + sink a `tfg.alerts`.
  - **apt29 day1: 741 alertas / 195.197 eventos (0,39 %), 4 hosts, 33 técnicas, 0 a DLQ.**
  - **Línea base de reducción de alertas (agrupación ingenua): 741 → 87 (88,3 %).**
  - Matriz de cobertura ATT&CK: 300 técnicas potenciales, 34 observadas (11,3 % de activación).
  - ML-1: Isolation Forest sobre ventanas de host, **AUC-ROC 0,995**; control solo-volumen **0,941**.
    10 experimentos en MLflow.
  - Laboratorio de emulación propio (VirtualBox + Sysmon + Atomic Red Team): dataset etiquetado
    de 14.895 eventos (14.765 benignos / 130 maliciosos) sobre 4 técnicas.
- **Memoria:** proyecto LaTeX compilando (54 pág.), con estado del arte y desarrollo hasta F1 redactados.

### Lo que falta

| Fase | Nombre | Prioridad | Estimación |
|---|---|---|---|
| **F3** | **Pilar A** — detección multi-etapa (CEP) + **secuencias 🧠** — ✅ **cerrada el 06-11-2026** | 🔴 | 3–4 sem |
| **F4** | Plano CTI + **extracción de TTPs con NLP 🧠** — plan revisado el 06-11-2026 | 🟠 | 4–5 sem |
| **F5** | **Pilar B** — grafo razonado + **GNN neurosimbólico 🧠** | 🔴 | 4–5 sem |
| **F6** | **Pilar C** — priorización explicable + **scoring aprendido 🧠** | 🟠 | 2–3 sem |
| **F7** | Evaluación cuantitativa (incluye los modelos) | 🔴 | 2–3 sem |
| **F8** | Frontend SaaS | 🟢 | 3–4 sem |
| **FA** | Ampliación de la cobertura de detección (Linux, más ataques, datos propios) — **condicionada** | 🟢 | 2–4 sem |
| **F9** | Despliegue, memoria y defensa | 🔴 | 4 sem |

---

## 2. Estrategia de aprendizaje automático 🧠

> **Nota de revisión.** La versión anterior de este plan restringía el ML a inferencia sobre
> modelos preentrenados. Esa decisión se **revisa** por dos motivos: (i) el trabajo se
> presenta a un Grado en **Ingeniería y Sistemas de Datos**, y un componente de aprendizaje
> con entidad propia es coherente con la titulación; (ii) la línea de investigación de la
> tutora incluye NLP aplicado a informes de amenazas, con lo que el ML **acerca** el
> proyecto a su línea en lugar de alejarlo.

### 2.1 Principio rector

El ML se incorpora **allí donde aporta algo que las reglas y la lógica no pueden hacer**.
No se añaden modelos que dupliquen capacidades ya cubiertas: un clasificador que replique
lo que ya hace una regla Sigma sería peor que no ponerlo, porque añade opacidad sin ganar
detección.

### 2.2 Los cuatro componentes

| # | Componente | Fase | Qué aporta que no cubre lo simbólico | Prioridad |
|---|---|---|---|---|
| **ML-1** | Detección de anomalías sobre el flujo | F2/F3 | Las reglas detectan lo **conocido**; el modelo detecta lo **inusual sin regla escrita** | 🟠 |
| **ML-2** | Extracción de TTPs de informes (NLP) | F4 | Convierte texto narrativo en conocimiento estructurado; inabordable con reglas | 🟠 |
| **ML-3** | Aprendizaje sobre el grafo de ataque | F5 | Sugiere rutas **plausibles** que las reglas no derivan porque nadie las escribió | 🟠 |
| **ML-4** | Aprendizaje del modelo de puntuación | F6 | Sustituye pesos fijados a mano por pesos ajustados a datos | 🟢 |

### 2.3 El eje vertebrador: enfoque neurosimbólico

Los cuatro componentes no son añadidos sueltos: responden a una misma tesis, que es lo que
convierte el ML en una **aportación coherente** y no en un adorno.

> **Tesis.** El razonamiento simbólico (reglas Sigma, patrones CEP, reglas Datalog) aporta
> **precisión y explicabilidad**, pero solo cubre lo que alguien ha escrito explícitamente.
> El aprendizaje automático aporta **generalización**, pero es opaco. La combinación de
> ambos —**IA neurosimbólica**— permite que el sistema descubra lo que las reglas no
> capturan, manteniendo la capacidad de justificar sus conclusiones.

En la práctica, cada componente instancia esa tesis:

- **ML-1:** las reglas cubren técnicas documentadas; el detector de anomalías señala
  comportamiento raro sin regla asociada. La anomalía **no** genera alerta por sí sola:
  eleva la confianza de una campaña ya detectada o marca el evento para revisión.
- **ML-3:** Datalog deriva lo que es **posible** según las reglas de interacción; el modelo
  de grafo sugiere lo que es **probable** según la estructura observada. Toda ruta sugerida
  por el modelo se **verifica** después con el razonador antes de presentarse.
- **La explicabilidad se preserva** porque la capa simbólica siempre tiene la última
  palabra: el modelo propone, la lógica dispone y justifica.

### 2.4 Recursos de cómputo

Hardware disponible: **RTX 5070 Laptop (~8 GB VRAM)** + 64 GB RAM.

| Tarea | Viabilidad en local |
|---|---|
| Fine-tuning de modelos tipo BERT (~110M par.) | ✅ Horas |
| LoRA sobre modelos 7B cuantizados | ✅ Viable |
| GNN sobre grafos de la escala del proyecto | ✅ Trivial |
| Autoencoders / modelos secuenciales | ✅ Trivial |
| Isolation Forest y métodos clásicos | ✅ Trivial |
| Entrenar un LLM desde cero | ❌ No, ni es necesario |

**Planes B documentados** (no dependencias): Colab Pro puntual para un *fine-tune* mayor;
solicitud de acceso a GPU del departamento (se sabe de A4000 en algunos grupos). Ninguno es
necesario para el alcance planteado.

### 2.5 Regla de contención ⚠️

**El ML no puede canibalizar el núcleo.** Si en el punto de control de febrero el Pilar A o
el Pilar B no están cerrados, los componentes de ML se recortan por este orden:
**ML-4 → ML-1 → ML-3 → ML-2**. El último en caer es el de extracción de TTPs por su encaje
con la línea de la tutora.

---

## 3. Visión del producto

### 3.1 El TFG (núcleo académico)

Un pipeline de datos que:

1. **Ingiere** telemetría heterogénea de host y red en streaming.
2. **Normaliza** a esquema canónico (OCSF) con estado y *event time*.
3. **Detecta** técnicas individuales (Sigma) **y secuencias multi-etapa** (CEP), etiquetadas con ATT&CK.
4. **Complementa** la detección basada en reglas con **detección de anomalías 🧠**.
5. **Contextualiza** contra un grafo de CTI construido en parte con **extracción automática de TTPs 🧠**.
6. **Razona** sobre rutas de ataque (Datalog), **enriquecidas por aprendizaje sobre el grafo 🧠**.
7. **Prioriza** con puntuación descompuesta y explicable, **con pesos ajustados a datos 🧠**.
8. Se **evalúa** cuantitativamente, incluidos los componentes de aprendizaje.

### 3.2 La capa SaaS (F8) 🟢

Aplicación web multi-tenant: panel de situación, cola de incidentes priorizada, detalle con
desglose de la puntuación, explorador del grafo de ataque, matriz ATT&CK e informes.

### 3.3 Qué NO es

- ❌ No es un EDR: consume telemetría, no la genera en producción.
- ❌ No hace respuesta automática. Solo soporte a la decisión.
- ❌ No es un producto con SLA; es un prototipo de investigación.
- ❌ No pretende superar a un SIEM comercial en cobertura, sino demostrar una arquitectura concreta.

### 3.4 Líneas futuras del producto (fuera del alcance del TFG)

Ideas para un producto real, **no** trabajo del TFG. Se recogen para el capítulo de líneas
futuras de la memoria.

- **Más plataformas y fuentes** (04-11-2026). Fuera incluso de la fase FA; se citan como
  trabajo relacionado o futuro:
  - **macOS:** captura de evasión de Gatekeeper con osquery (`T1553.001`), como piloto
    pequeño una vez resuelto Linux;
  - **IoT:** IoT-23, flujos de Zeek etiquetados de botnets y tráfico benigno. Visibilidad
    solo de red;
  - **DARPA Transparent Computing:** grafos de **procedencia** (procesos, ficheros,
    conexiones). No es el grafo de ataque de F5, que es de alcanzabilidad estilo MulVAL, y
    exige un adaptador propio: como mucho, un fragmento.

  GoldenSAML (identidad híbrida: Windows, Azure AD y Microsoft 365) ya está en el clon de OTRF
  y en el conjunto de evaluación de F7.
- **Engaño (*deception*): señuelos gestionados por la organización** (idea de Javier,
  26-10-2026). Tiene más valor de lo que parece y encaja con la plataforma, pero conviene
  enfocarlo así:
  - **Empezar por *honeytokens*, no por *honeypots*.** Credenciales, cuentas, ficheros y
    entradas DNS falsas sembradas en la red **real**. Ningún usuario legítimo debería
    tocarlos, así que cualquier uso es una alerta con casi cero falsos positivos. Además
    encajan con P1: una credencial señuelo usada tras un volcado de LSASS es la prueba de que
    el robo de credenciales ha tenido éxito. Son baratos y no exponen nada.
  - **Honeypots de baja interacción** (servicios simulados, sin sistema real detrás) como
    segunda fase. Su telemetría entra en el mismo pipeline normalizada a OCSF, como una
    fuente más de alta señal.
  - **Lo que un honeypot NO dice.** Un señuelo expuesto a Internet atrae sobre todo a
    atacantes oportunistas y escáneres. Enseña qué técnicas circulan, no cómo atacarían
    **las instalaciones de esa organización**. Para eso la herramienta es el **análisis de
    rutas de ataque** que ya hace F5: Datalog sobre el grafo de activos, vulnerabilidades y
    conectividad, sin tocar nada real. Le complementa la **simulación de ataques controlada**
    (*Breach and Attack Simulation*).
  - **«Sin poner nada en riesgo» nunca es absoluto.** Un honeypot de alta interacción
    comprometido puede usarse para atacar a terceros. Exige aislamiento estricto de la red
    de producción, control del tráfico saliente y revisión legal: retención de datos de
    terceros y responsabilidad si el señuelo se usa contra otros.
  - Choca con §3.3 («no genera telemetría») solo en apariencia: sería un **módulo aparte**
    que alimenta la plataforma, no un cambio de su naturaleza.

---

## 4. Arquitectura objetivo

```
┌─ FUENTES ──────────┐  ┌─ INGESTA ──┐  ┌─ PROCESADO ────────────────────────┐
│ OTRF datasets      │  │            │  │ normalización → OCSF               │
│ CALDERA / Atomic   ├─►│  Redpanda  ├─►│ reglas Sigma            (F2)       │
│ Sysmon / Security  │  │  raw.*     │  │ 🧠 anomalías            (F2)       │
│ Zeek / Suricata    │  │            │  │ CEP multi-etapa         (F3)       │
└────────────────────┘  └────────────┘  └────┬─────────────────┬─────────────┘
                                  norm.events│   det.alerts    │det.campaigns
                    ┌────────────────────────┼─────────────────┼──────────────┐
                    ▼                        ▼                 ▼              │
          ┌──────────────────┐   ┌────────────────────┐  ┌──────────────────┐ │
          │   ClickHouse     │◄─►│  Neo4j (+ GDS)     │◄►│ Soufflé/Datalog  │ │
          │  analítica       │   │  grafo de ataque   │  │ rutas (posible)  │ │
          └──────────────────┘   │  🧠 GNN + link     │  └──────────────────┘ │
                                 │     prediction     │   ▲ verifica          │
                                 │     (plausible)    │───┘                   │
                                 └─────────┬──────────┘                       │
                                           ▲                                  │
                               ┌───────────┴───────────┐                      │
                               │  OpenCTI (STIX 2.1)   │◄── ATT&CK, feeds     │
                               │  🧠 extracción TTPs   │                      │
                               └───────────────────────┘                      │
                    ┌─────────────────────────────────────────────────────────┘
                    ▼
          ┌──────────────────────────────────────────┐
          │ SCORING (F6): riesgo explicable 🧠       │
          └──────────────────┬───────────────────────┘
                             ▼
                    FastAPI → Frontend (F8)

TRANSVERSAL: Dagster · Prometheus/Grafana · MinIO · MLflow 🧠 · Docker → K8s
```

### 4.1 Inventario de servicios

| Servicio | Perfil | Puerto | RAM | Fase |
|---|---|---|---|---|
| Redpanda | `core` | 9092, 9644 | 2 GB | ✅ |
| Redpanda Console | `core` | 8080 | 512 MB | ✅ |
| Flink JM + TM | `stream` | 8081 | 4.5 GB | ✅ |
| ClickHouse | `store` | 8123, 9000 | 3 GB | ✅ |
| Prometheus + Grafana | `observability` | 9090, 3001 | 1.5 GB | ✅ |
| Neo4j | `graph` | 7474, 7687 | 4 GB | F5 |
| OpenCTI + deps | `cti` | 8082 | 8–10 GB | F4 |
| **MLflow** 🧠 | `mlops` | 5000 | 512 MB | F2 |
| Dagster | `orchestration` | 3000 | 1 GB | F4 |
| FastAPI | `api` | 8000 | 512 MB | F6 |

### 4.2 Contrato de topics

| Topic | Part. | Clave | Contenido |
|---|:--:|---|---|
| `raw.host.windows` | 3 | hostname | Telemetría cruda de host |
| `raw.net.zeek` | 3 | IP origen | Telemetría cruda de red |
| `norm.events` | 6 | hostname | Eventos normalizados OCSF |
| `det.alerts` | 3 | hostname | Alertas de reglas Sigma |
| `det.anomalies` 🧠 | 3 | hostname | Puntuaciones de anomalía |
| `det.campaigns` | 3 | hostname | Campañas multi-etapa (CEP) |
| `enr.incidents` | 3 | id incidente | Incidentes priorizados |
| `dlq.*` | 1 | — | Rechazos con motivo |

---

## F2 — Detección con reglas + anomalías 🔴 ✅ CERRADA (30-07-2026)

**Prerrequisitos:** F1 ✅ · **Cierre:** 30-07-2026

> **Pendientes reubicados al cerrar la fase** (no bloquean F3, se documentan aquí para no perderlos):
> validación cruzada evaluador-vs-SQL → **F7**; autoencoder y modelo secuencial de ML-1 → **F3.3/F7**
> (🟢, solo si el calendario lo permite); publicación en `det.anomalies` → **F3.3**, que es donde
> se consume; ampliación de técnicas del laboratorio → sesiones sueltas, mecanismo ya barato de repetir.

### F2.1 — Cerrar la detección basada en reglas

- [x] Instalar pySigma, sigma-cli y backend ClickHouse.
- [x] Clonar el repositorio de reglas (3.142 reglas; ~2.300 aplicables).
- [x] Escribir la pipeline propia `detection/pipelines/ocsf-tfg.yml`.
- [x] Cargador (`detection/loader.py`) y evaluador en memoria (`detection/evaluator.py`).
- [x] Validación: 10 alertas correctas, 0 falsos positivos sobre el dataset de referencia.
- [x] Optimización medida: 73× (precompilación + enrutado por logsource).
- [x] **Job de streaming** `norm.events → det.alerts` (`pipeline/jobs/detect_job.py`).
- [x] Definir el **esquema de alerta**. ⚠️ **Esquema realmente emitido** (`build_alert()`),
  que es el que debe usar el CEP de F3 — ojo, difiere del borrador inicial de este roadmap:
  ```
  alert_id · time (epoch ms) · detected_at
  rule_id · rule_title · rule_level · rule_status
  attack.technique_ids[]   ← ARRAY, no escalar
  attack.tactic_ids[]      ← ARRAY y con NOMBRES ('execution', 'defense-evasion', …),
                              no identificadores TAxxxx
  device.hostname
  actor.user_name · actor.process_name        ← plano, no actor.user.name
  source_event{ class_uid, type_uid, type_name, channel, event_id }
  matched_fields{}        ← semilla de la explicabilidad
  tfg.dataset_id · tfg.detector
  ```
- [x] Sink de `det.alerts` a ClickHouse (`tfg.alerts`; técnicas y tácticas como `Array`,
  `matched_fields` serializado como `String` JSON).
- [x] **Cargar apt29 day1** y medir con volumen realista: 196.081 eventos, 99,4 % de cobertura,
  741 alertas, 0 a DLQ, 78 ev/s con 2.093 reglas (~163.000 evaluaciones/s).
- [x] Ampliar mapeadores según lo que revele la cobertura sobre el dataset grande
  (PowerShell 1009, Sysmon 2/8/9/18/23, Security 4672/4673/4703/4634/4627/4670/4945/5447/5154/5145).
- [x] **Matriz de cobertura ATT&CK** en formato Navigator (`detection/coverage_matrix.py`).
- [ ] ↪️ **F7** — Validación cruzada: comparar el evaluador en streaming con la vía SQL sobre ClickHouse.

### F2.2 🧠 — ML-1: detección de anomalías

- [x] **1. Definir el papel exacto.** La anomalía **no** genera alerta por sí sola. Sus dos
  usos son: (a) elevar la confianza de una campaña ya detectada por CEP; (b) marcar eventos
  para revisión cuando no hay regla que aplique. *Decisión de diseño documentada.*
- [x] **2. Ingeniería de características** sobre `norm.events` — 42 características,
  separadas en **26 absolutas** y **16 relativas** (proporciones independientes del volumen
  por construcción, para poder aislar el efecto del volumen):
  - Por evento: clase OCSF, proceso actor, proceso padre, longitud y entropía de la línea de comandos, ruta, usuario, hora del día.
  - Agregadas por host y ventana: nº de procesos únicos, tasa de creación, diversidad de rutas, conexiones salientes.
  - Codificación de categóricas de alta cardinalidad (hashing o *target encoding*).
- [x] **3. Línea base no supervisada:** Isolation Forest sobre **ventanas de host de 5 min**
  (nivel de agregación elegido por su encaje con el problema multi-etapa, no sobre eventos
  sueltos). **AUC-ROC 0,995** con características limpias.
- [ ] 🟢 ↪️ **F3.3/F7** — **4. Autoencoder** sobre el vector de características (error de
  reconstrucción como puntuación). No ejecutado: el Isolation Forest ya satura la métrica
  sobre estos datasets, así que la comparación solo tiene sentido con datos menos separables.
- [ ] 🟢 ↪️ **F3.3/F7** — **5. Modelo secuencial** (LSTM o Transformer pequeño) sobre
  secuencias por host. Es el que mejor encaja con lo multi-etapa; se reevalúa en F3.3.
- [x] **6. Entrenamiento solo sobre actividad benigna**, evaluando sobre las porciones con
  ataque, con apt29 day1 reservado para evaluación. Medido: **la pureza del entrenamiento es
  crítica** (mismas 16 características relativas: 0,867 con datos limpios vs 0,533 —azar— con
  datos contaminados).
- [x] **7. Registrar experimentos en MLflow**: 10 experimentos comparables; perfil `mlops`
  añadido al compose.
- [ ] ↪️ **F3.3** — **8. Publicar en `det.anomalies`** con la puntuación y las características
  que más contribuyen. Se traslada a F3.3, que es donde la puntuación se consume como factor
  de confianza de la campaña.
- [x] **9. Evaluar.** Hecho, con dos **controles** que son el resultado metodológico de la fase:
  control de volumen (solo `n_eventos`) **0,941** y solo-ratios **0,867** → volumen y perfil
  son complementarios, y el **control de volumen queda como línea base permanente para F7**.
  ⚠️ La separabilidad es en parte **artefacto de los datasets** (el ataque se ejecuta en
  ráfagas, sin actividad de fondo sostenida): las ventanas con ataque tienen 8× más eventos.
  Es lo que motiva el laboratorio propio de F2.3.

### F2.3 — Laboratorio de emulación propio (Atomic Red Team) 🧠

- [x] VM aislada de laboratorio (VirtualBox, Windows 11 Pro) con Sysmon (config SwiftOnSecurity) + Atomic Red Team.
- [x] Auditoría avanzada de creación de procesos + PowerShell Script Block Logging activados y verificados.
- [x] Mecanismo de captura por ventana temporal (`capture-manifest.ps1`) + etiquetado offline (`label_dataset.py`), sin depender de coincidencia de patrones en vivo.
- [x] Primera tanda capturada: T1547.001 (19/20 subtests), T1070 (2/2), T1055 (3 intentados, bloqueados por Defender), T1003.001 (comsvcs.dll OK; ProcDump con acceso a LSASS denegado).
- [x] Diagnosticada y corregida contaminación del dataset: ruido de PowerShell Module Logging (EventID 4103, ~59 % del total) y andamiaje del framework (`whoami.exe`/`HOSTNAME.EXE`, ~62 % de las muestras "maliciosas" a nivel de proceso).
- [x] Generar línea base de actividad benigna sostenida (`run-lab.ps1 -BenignMinutes 180`) y
  dataset final limpio: **14.895 eventos (14.765 benignos / 130 maliciosos)**, 4 técnicas
  (T1547.001=86 con 19 subtests y 48 líneas de comando distintas, T1003.001=26, T1055=10, T1070=8).
  Tercera fuente de contaminación detectada y filtrada (`svchost.exe` escribiendo
  `InventoryApplicationFile` durante las ventanas de ataque, 16 filas).
  Limitación conocida: pico de 5.528 eventos benignos por una instalación real de Windows Update.
- [ ] ⚠️ **Reproducibilidad — versionar el laboratorio.** Los scripts de `emulation/` en el repo
  son la versión **previa** a las tres correcciones de contaminación, y `run-lab.ps1` solo existe
  dentro de la VM (`C:\Lab`). Copiar desde la VM a `\\VBOXSVR\Shared` y de ahí a `emulation/`:
  `run-lab.ps1`, `export-events-clean.ps1` (sin 4103) y `label_dataset.py` (con los filtros de
  `whoami.exe`/`HOSTNAME.EXE` y `InventoryApplicationFile`).
- [ ] Ampliar cobertura: T1055 con variantes que no disparen Defender; T1003.001 con una variante que documente el bloqueo de LSA sin depender de herramientas de volcado reales. Capturar el EventID 1116 de Defender si se quiere señal explícita de "técnica prevenida por control".
- [ ] Integrar el dataset generado como conjunto adicional de evaluación de ML-1 (además de apt29/LSASS_campaign), aprovechando el volumen benigno sostenido para atacar el problema de "volumen como artefacto" detectado el 27-07. **Requiere ruta de normalización CSV → OCSF**, que hoy no existe.

### 📦 Entregables F2
`detection/{loader,evaluator}.py` · `detection/pipelines/ocsf-tfg.yml` · job de streaming ·
`ml/anomaly/` (features, entrenamiento, inferencia) · perfil `mlops` · matriz de cobertura ATT&CK

### ✅ DoD — cumplido
1. ✅ Job de streaming publicando en `det.alerts` con el esquema definido.
2. ✅ Resultados sobre apt29 day1 medidos y documentados (741 alertas / 195.197 eventos, 0 DLQ).
3. ✅ Detector de anomalías entrenado, evaluado y comparado con **dos** líneas base
   (control de volumen 0,941 y solo-ratios 0,867 frente a 0,995).
4. ✅ Matriz de cobertura ATT&CK generada (300 potenciales / 34 observadas).
5. ✅ 10 experimentos registrados en MLflow y comparables.

### ⚠️ Riesgos
| Riesgo | Mitigación |
|---|---|
| El detector de anomalías genera demasiados falsos positivos | Es lo esperable; por eso **no** genera alerta directa. Reportar la tasa como resultado, no como fallo |
| La ingeniería de características consume mucho tiempo | Empezar con un conjunto pequeño y crecer; medir la aportación de cada bloque |
| Sobreajuste al único dataset | Entrenar en apt29 y evaluar en LSASS_campaign, y viceversa |

---

## F3 — Pilar A: detección multi-etapa (CEP) 🔴 ✅ CERRADA (06-11-2026)

**Estimación:** 3–4 semanas · **Prerrequisitos:** F1, F2 · **Cierre:** 06-11-2026

> **Pendientes reubicados al cerrar la fase** (no bloquean F4/F5; se dejan aquí para no perderlos):
> - **A F7:** latencia de detección, porque la reproducción va acelerada y no la representa; tasa de falsas
>   alarmas sobre tráfico **benigno**, porque las capturas atómicas son todas ataques; validación en apt29 day2.
> - **A la cadena continua (F7/F9):** tardíos a `dlq.late` y destino *upsert* para la emisión en streaming.
> - **A FA:** red con Zeek, P4 de exfiltración y P5 de ausencia como señal. **A F3.3/F7, si hay calendario:** las
>   anomalías secuenciales como refuerzo.
> - **Ajuste v2** de los patrones con lo aprendido en la revisión de falsos positivos (§F3.4). Se mide aparte y
>   se presenta como antes/después; las cifras v1 de abajo son las oficiales de la fase.

### F3.1 — Modelado de escenarios

- [x] day1 extraído, normalizado y detectado (F2).
- [ ] Extraer y cargar **day2** (`apt29_evals_day2_manual.zip`, 43 MB sin extraer;
  hosts NEWYORK, SCRANTON, UTICA-A/C/D/ONE-DRIVE).
- [x] **Inventario de materia prima antes de diseñar patrones** (paso 0 de la fase): qué
  `dataset_id` hay realmente en `tfg.alerts`, cuántas alertas por técnica ancla y qué claves
  trae de verdad `matched_fields`. En particular, **verificar si las 7 variantes de
  LSASS_campaign están ya normalizadas y detectadas** o solo lo están los atómicos: sin sus
  alertas no se puede validar P1.
- [ ] Normalizador de red (Zeek) + topic `raw.net.zeek`. **Aquí el pipeline pasa a multi-fuente.**
  ℹ️ Los logs de Zeek **ya vienen dados** en el dataset (`day1/zeek/combined_zeek.log` +
  por host, e igual en day2): no hace falta procesar los pcaps ni ejecutar Zeek.
- [ ] Estudiar los `emulationplans/` de apt29 y reconstruir la cadena real → verdad conocida de la secuencia.
  ℹ️ El plan viene como **un único `apt29.xlsx`**, no como YAML: hay que parsearlo (o cruzarlo
  con el plan público de MITRE Evals) para sacar la secuencia paso → hora → host.
- [x] `docs/scenarios/apt29-day1.md`: táctica → técnica → evidencia esperada → ventana temporal.
  **De aquí salen los `WITHIN` de los patrones**, medidos sobre la campaña real; no se fijan a ojo.
- [ ] Diseñar **3–5 patrones CEP** de valor general:
  - **P1** Robo de credenciales: proceso inusual → acceso a LSASS → volcado a disco → *(opc.)* borrado de log.
  - **P2** Movimiento lateral: logon remoto → creación de proceso/servicio → conexión saliente. **Cruza hosts.**
  - **P3** Descubrimiento y escalada: ráfaga de reconocimiento → privilegios especiales → persistencia.
  - **P4** Exfiltración: acceso masivo a ficheros → compresión → salida de gran volumen.
  - **P5** 🟢 Ausencia como señal (negación temporal).

### F3.2 — Implementación

- [x] Implementar con `MATCH_RECOGNIZE` (31-07-2026). **P1 funcionando en Flink**, con
  `PARTITION BY`, `MEASURES`, `PATTERN`, `DEFINE` y `AFTER MATCH`. `WITHIN` **no** se usa: la
  restricción temporal va en el `DEFINE` como hueco entre evidencias consecutivas, que es lo
  que reproduce el criterio del oráculo (`WITHIN` acota la duración *total* del match, no el hueco).
  ⚠️ **Limitaciones de Flink encontradas y documentadas** (`infra/flink/jobs/p1_0*.sql`):
  no admite subconsultas correlacionadas en `DEFINE`; no admite `COUNT(DISTINCT)` en `MEASURES`;
  `LAG` no acepta `TIMESTAMP_LTZ`; y **no admite cuantificadores voraces como último elemento
  del patrón**, lo que impide expresar una racha maximal abierta. Esto último es lo que obliga
  a la correlación en dos niveles, que deja de ser una opción de diseño para ser un requisito.
- [x] **Truco de validación:** `'scan.bounded.mode' = 'latest-offset'` + `runtime-mode = batch`
  convierte la fuente Kafka en acotada. Elimina de raíz el problema del watermark que no avanza
  sobre datos históricos y da salida final en vez de *changelog*. Imprescindible para iterar.
- [x] **Decisión cerrada el 26-10-2026, con el inventario de P3 delante: híbrido.** P1 y P2 viven de alertas (más
  aristas de red en P2). P3 necesita además los bloques de PowerShell de `tfg.events`: el descubrimiento del atacante en
  apt29 es ciego para Sigma. Texto original de la decisión:
- **Decisión abierta a cerrar en F3.1 — fuente de las etapas.** `det.alerts` es más semántico,
  pero **deja etapas ciegas**: si ninguna regla Sigma etiqueta la escritura del `.dmp` o la
  conexión saliente, esas etapas no existen como alerta y el patrón nunca completa. Opción
  propuesta: **híbrido**, alertas Sigma como **etapas ancla** + un flujo derivado de
  `norm.events` filtrado por las señales `tfg.signal_*` ya precalculadas en los mapeadores
  (`signal_lsass_access`, `signal_dump_file`, `signal_log_cleared`, `signal_remote_thread`…)
  para las etapas de refuerzo. Decidir **con el inventario de F3.1 en la mano**, no antes.
- [x] **Esquema de campaña común (26-10-2026)**: hallazgo **OCSF 1.5.0 «Detection Finding»** (clase 2004) con
  extensión `tfg.*`. Especificación en `docs/esquema-campana.md`.
  - **Etapas lógicas** en `tfg.stages[]`, cada una con su evidencia. Se ordenan por el segundo de su primera evidencia y,
    dentro del mismo segundo, por el orden lógico del patrón.
  - **Confianza descompuesta** en `tfg.confidence_factors`.
  - **Identidad común:** `md5(dataset|patrón|clave|inicio)`.
  - **Destino:** P1 y P2 emiten a `det.campaigns`, sin caducidad. `pipeline/jobs/sink_campaigns.py` valida cada
    documento, con 9 tests, y lo vuelca a `tfg.campaigns`.
  - **Resultado:** 12 campañas, 11 de P1 y 1 de P2. P1 coincide con el oráculo en campañas, evidencias, etapas y
    confianza.
- [x] **Correlación jerárquica en dos niveles**, ya implementada para P1 y **no por elegancia,
  sino porque Flink no puede expresar la racha maximal en un solo patrón**: nivel 1
  (`MATCH_RECOGNIZE`) reconoce la *transición* evidencia → acceso a credenciales; nivel 2
  (agregación por hueco) agrupa transiciones en campañas. La misma máquina servirá para el
  salto a multi-host de P2, sin re-particionar.
- [x] **P2 en `MATCH_RECOGNIZE` (26-10-2026)**, en cuatro pasos (`infra/flink/jobs/p2_0*.sql`,
  definiciones comunes en `p2_comun.sql`). Reproduce el oráculo **exacto**: misma campaña SCRANTON → NASHUA,
  mismo `campaign_id`, 17 aristas, 115 alertas absorbidas, 8 evidencias y confianza 1,0.
  - Necesita **dos fuentes**: conexiones de `norm.events` y evidencia de `det.alerts`.
  - El mapa IP → host y el controlador de dominio se derivan de los datos, en el propio job.
  - **Topic intermedio `det.p2_flujo`**, porque el patrón necesita un atributo de tiempo y las agregaciones lo pierden.
  - **Transición bidireccional** como P1. El orden conexión → ejecución **se mide**: 7 de 8 evidencias, retraso máximo de 1,0 s.
- [ ] Gestión de eventos tardíos (`allowedLateness`) → `dlq.late`. **Medido el 26-10** (`st_00_desorden.sql`):
  - en `det.alerts`, dentro de cada dataset, el peor retraso es de **293 s**. Con la marca de agua de 30 s se perderían 220
    alertas (18 %); con 5 min, ninguna. Es desorden de la detección en paralelo, **inflado** por reproducir el corpus muy
    por encima de la velocidad real;
  - mezclar datasets de años distintos en las mismas particiones da retrasos de años: es un efecto de la reproducción, no
    existe en producción.
  - **Pendiente:** dimensionar la marca de agua de la cadena continua y llevar los tardíos a `dlq.late`. La emisión de
    campañas en streaming necesitará un destino *upsert*, porque la ventana de sesión actualiza cada campaña.

### F3.3 🧠 — Anomalías secuenciales como refuerzo

- [ ] Integrar la puntuación de `det.anomalies` como **factor de confianza** de la campaña:
  una secuencia CEP acompañada de comportamiento anómalo es más creíble que una sin él.
- [ ] 🟢 Explorar la detección de **secuencias anómalas** que no encajan en ningún patrón
  escrito: candidatas a patrones nuevos. Es el complemento natural del CEP.

### F3.4 — Validación

- [x] **P1 contra los 7 LSASS_campaign → 7 de 7 (31-07-2026), en la versión batch.**
  Prueba de generalización superada. Clave: el ancla es la familia `T1003.*`; con la
  subtécnica `T1003.001` habrían sido 6 de 7 (falla Mimikatz `logonpasswords`, porque
  Meterpreter lo ejecuta dentro de su propio proceso y no hay acceso externo a `lsass.exe`).
  **Revalidado en streaming el 26-10-2026** (`infra/flink/jobs/st_0*.sql`): P1 da las mismas 11 campañas (52
  transiciones) y P2 su campaña de 17 aristas, idénticas a batch. Requisito descubierto: el flujo de entrada tiene que
  llegar **en orden de tiempo de evento**, o la marca de agua descarta la evidencia.
- [ ] P3/P4 contra apt29 day1/day2. *(P2 contra day1: hecho, en batch el 11-09 y en Flink el 26-10.)*
  - **P3, versión batch (26-10-2026)**, en `detection/patterns/p3_discovery_escalation.sql`. Saca **3 campañas**:
    - apt29 SCRANTON, con el orden del plan, escalada → descubrimiento → persistencia;
    - LSASS_01 y LSASS_03, por el `getsystem` de Meterpreter.
  - **Cómo está definido:**
    - etapas por técnica, no por táctica;
    - la escalada es el ancla;
    - descubrimiento híbrido;
    - una lista de exclusiones medida.
  - Sin campaña: LSASS_02/04-07 (reconocimiento sin escalada) y NEWYORK (monitorización).
  - **P3 en Flink (26-10-2026)**, en `infra/flink/jobs/p3_0*.sql` y `st_03_p3.sql`, en batch y en streaming. Respecto al oráculo:
    - la evidencia y las campañas son las mismas;
    - la confianza es la misma;
    - el orden del plan coincide en SCRANTON.
  - Emite 3 hallazgos OCSF, así que `tfg.campaigns` queda con P1 11, P2 1 y P3 3.
  - **Decisión pendiente:** la extensión de la campaña. Flink la acota a su evidencia y el oráculo absorbe ±10 min. En P3 eso
    cambia mucho el contexto contado (LSASS_01: 3 alertas de descubrimiento frente a 23). Hay que decidirlo antes de medir la
    reducción de alertas en F7.
  - **Pendiente:** validar en day2.
- [x] **Extensión de la campaña, decidida el 06-11-2026: solo su evidencia** (lo que emite Flink). Las alertas que
  ninguna campaña recoge siguen visibles para el analista y cuentan como «sueltas». Se informan dos cifras: reducción
  sobre la evidencia y reducción global.
- [x] **Ratio de reducción de alertas (06-11-2026)**, ejecución `f3f`: corpus de F3 más 101 capturas atómicas de host
  de OTRF (`pipeline/load_atomics.py`, `scripts/load_f3_corpus.sh --con-atomicos`). Consultas en
  `detection/evaluation/f3_cierre.sql`.

  | grupo   | alertas | en campaña | campañas | reducción s/ evidencia | reducción global |
  |---------|--------:|-----------:|---------:|-----------------------:|-----------------:|
  | corpus  |   1.184 |         88 |       15 |                  0,830 |            0,062 |
  | atómico |   1.556 |        302 |       40 |                  0,868 |            0,168 |
  | total   |   2.740 |        390 |       55 |              **0,859** |        **0,122** |

  - Por patrón, la reducción sobre la evidencia es de 0,874 en P1, 0,844 en P2 y 0,862 en P3, unas 7 alertas por
    campaña. La línea base B1 (solo Sigma) tiene reducción 0.
  - **Lectura:** el CEP comprime unas 7 a 1 lo que reconoce, pero solo reconoce el 14 % de las alertas.
  - El corpus da las **mismas 15 campañas** y las mismas 1.184 alertas que antes: cargar los atómicos no lo altera.
- [x] **Falsos positivos (06-11-2026)**, juzgando cada campaña contra la verdad conocida de su dataset
  (`detection/evaluation/verdad_conocida.py` → `tfg.verdad_datasets`, con 110 datasets). La revisión manual de las
  22 candidatas está en `detection/evaluation/f3_revision_fp.md`:
  - 6 eran actividad de ataque real que el metadato no listaba, como Mimikatz ejecutándose;
  - 10 son ataques reales leídos con el patrón equivocado, como PsExec tomado por robo de credenciales;
  - 6 nacen de ruido del sistema operativo, sobre todo csrss/wininit abriendo lsass al arrancar y la regla
    *Uncommon Process Access Rights*;
  - además hay 1 campaña de ruido dentro de APT29 que la evaluación por dataset no ve.

  Cifras tras la revisión, en los atómicos:

  | patrón | precisión | exhaustividad | tasa de falsas alarmas |
  |--------|----------:|--------------:|-----------------------:|
  | P1     |      0,57 |          0,55 |                   0,11 |
  | P2     |      1,00 |          0,17 |                   0    |
  | P3     |      0,46 |          0,75 |                   0,08 |

  - Por campaña, la precisión es de **0,69** (17 falsas de 55) y las de ruido benigno son 7 de 55.
  - **P2** se pierde 24 capturas. En 18 de ellas las alertas caen en un solo equipo, y P2 necesita ver origen y
    destino: es un límite del conjunto de evaluación.
  - ⚠️ **Límite:** esto mide sobre todo confusión entre patrones sobre actividad maliciosa, no falsas alarmas sobre
    actividad limpia. Esa tasa va a F7.
- [ ] ↪️ **F7** — **Latencia de detección**: del último evento de la secuencia a la emisión. No se mide en F3 porque
  la reproducción va muy por encima de la velocidad real y la cifra no significaría nada.

### ✅ DoD — cumplido
1. ✅ ≥3 patrones disparando sobre datasets reales: P1, P2 y P3 en Flink, en batch y en streaming.
2. ✅ P1 detecta las 7 variantes de LSASS_campaign.
3. ✅ ≥1 campaña multi-etapa detectada en apt29: P2 SCRANTON → NASHUA y P3 en SCRANTON.
4. ✅ Ratio de reducción de alertas medido: 0,859 sobre la evidencia y 0,122 global.
5. ✅ Falsos positivos cuantificados: 22 candidatas revisadas a mano y precisión de 0,69 por campaña.

---

## F4 — Plano CTI + extracción de TTPs 🟠

**Estimación:** 4–5 semanas (una más que el plan original, por la comparativa de F4.2) ·
**Prerrequisitos:** F1 · **Plan revisado el 06-11-2026**

> **Qué cambió el 06-11-2026 y por qué.** La fase deja de ser un bloque aislado (una plataforma CTI
> de decorado más un modelo medido solo contra textos) y se conecta con el resto del proyecto
> **por el vocabulario común: los identificadores de ATT&CK**. Las alertas de Sigma, las campañas de
> F3 y lo que extraiga ML-2 hablan todos en técnicas `T1xxx`.
> 1. **ATT&CK oficial y versionado como referencia única** de todo el sistema. Resuelve de raíz los
>    identificadores obsoletos que en F3 obligaron a traducir a mano el plan de APT29.
> 2. **OpenCTI frente a la carga directa a Neo4j:** se hacen las dos y se comparan con criterios
>    fijados antes de medir. El plan B no compite con OpenCTI, es un subconjunto suyo: OpenCTI no
>    usa Neo4j (usa OpenSearch, Redis, RabbitMQ y MinIO) y el Pilar B lo necesita para la analítica
>    de grafos y el Datalog, así que el cargador STIX → Neo4j hace falta en ambos casos.
> 3. **La salida de ML-2 es un perfil de técnicas por informe y por actor**, en STIX y cargado en el
>    grafo, no solo una tabla de métricas. Lo consumen F5 (la siguiente etapa probable) y F6 (el
>    factor `w5·confianza_CTI`).
> 4. **Dos evaluaciones complementarias:** la intrínseca (F1 por técnica sobre AnnoCTR), que
>    demuestra que el modelo generaliza; y la extrínseca sobre el corpus del proyecto, que demuestra
>    que lo extraído sirve para algo.
>
> Recursos comprobados el 06-11: 44 GB de RAM para WSL, 24 núcleos y 731 GB libres. El stack actual
> usa unos 6 GB, así que OpenCTI (8–10 GB) cabe sin recortar nada. **Solo funciones de la edición
> Community** (Apache 2.0); las de IA de la edición Enterprise quedan fuera.

### F4.1 — Plan B: ATT&CK y CTI directo a Neo4j *(primero: desbloquea F5)*

- [x] **Neo4j en el compose** (perfil `graph`, con GDS), adelantado desde F5.1. Versión fijada.
  *(06-11-2026: `neo4j:5.26.31-community`, GDS 2.13.13 y APOC 5.26.31; `./scripts/up.sh graph`.)*
- [x] **ATT&CK Enterprise en STIX 2.1**, con la versión fijada y su suma registrada:
  - técnicas, subtécnicas, tácticas, grupos, software y mitigaciones;
  - relaciones `uses`, `subtechnique-of` y `mitigates`;
  - los objetos **revocados u obsoletos** se cargan con su sustituto (`revoked-by`), para traducir
    identificadores antiguos.
  - *(06-11-2026)* **v19.2** (agosto de 2026) en `data/cti/attack/enterprise-attack-19.2.json`,
    SHA-256 `dc1639caa5501d720e280cf1cbd8fbe009884a0c9b3e6e9ed9d0c25166c3d8f4`.
    - Se descartó la v20, publicada el día anterior con un parche el mismo día. Subir de versión es
      un paso aparte que se medirá.
    - En el grafo: 4.823 nodos y 22.352 relaciones, de ellas 1.090 técnica–táctica; 858 técnicas,
      149 de ellas revocadas.
    - APT29 (G0016) usa 66 técnicas vigentes.
- [x] **Cargador STIX → Neo4j** propio e idempotente (`cti/stix_loader/`). Lo usan los dos caminos de
  F4.2 y la salida de ML-2.
  - Identidad por el `id` STIX.
  - Recargar el mismo paquete no duplica.
  - Tests sobre un paquete pequeño.
  - *(06-11-2026)* 9 tests. Carga de ATT&CK en 4,7 s; recargarlo da los mismos totales. Ningún
    extremo de relación se queda sin su nodo.
- [x] **Un feed de IOCs: ThreatFox (abuse.ch)**, el 06-11-2026 (`cti/feeds/threatfox.py`, 6 tests).
  - **Acceso.** Las descargas públicas de abuse.ch devuelven 410: ahora piden una Auth-Key gratuita,
    que está en `.env` (ignorado por git). Los exports solo traen los últimos seis meses.
  - **Licencia.** Es uso gratuito «under the fair use principles», no CC0; el uso comercial puede
    requerir suscripción.
  - **Conversión.** ThreatFox no publica STIX: se convierte el CSV.
    - Cada IOC es un `indicator` con su patrón y cada familia un `malware`, enlazados con `indicates`.
    - Los identificadores son uuid5, así que recargar no duplica.
    - Se carga con el mismo cargador que ATT&CK.
  - **Resultado.** 135.737 IOCs (SHA-256 42.588, dominios 31.864, IP y puerto 28.949, URL 20.029,
    MD5 6.676, SHA-1 5.631) y 508 familias, sin descartes, cargados en 17 s.
  - **Enlace con ATT&CK** (`cti/feeds/threatfox_attack.cypher`): por nombre o alias, y solo si la
    coincidencia es única.
    - Enlaza 92 familias. Hay 4 ambiguas descartadas: Snake casaba también con Uroburos de Turla y
      DarkComet con PoisonIvy por el alias «Breut».
    - **El 25,6 % de los IOCs (34.684) llega a técnicas de ATT&CK** a través de su familia.
    - Lo que no se enlaza (ClearFake, «Unknown malware», Vidar, Mirai, AMOS…) **no está en el
      catálogo de software de ATT&CK**: el límite es el catálogo, no el cruce.
- [x] **Servicio de normalización de técnicas:** dado un identificador, devuelve el vigente y su
  táctica. Se aplica a:
  - las etiquetas de Sigma;
  - la verdad conocida de F3 (`verdad_conocida.py`, sustituyendo la lista manual de APT29);
  - la salida de ML-2.

  Se mide cuántas etiquetas de las alertas de F3 estaban obsoletas.
  - *(06-11-2026)* `cti/attack_ids.py`, con 10 tests y sin depender de Neo4j:
    - sigue las cadenas `revoked-by`;
    - marca las técnicas obsoletas sin sustituto;
    - sube de subtécnica a técnica padre;
    - traduce las etiquetas de Sigma.
  - **Medido contra la v19.2:**
    - las alertas y las campañas de F3 están **100 % vigentes** (104 y 39 identificadores);
    - en la verdad conocida, 2 técnicas están revocadas (`T1562.002` → `T1685.001` y `T1562.004` →
      `T1686`) y una es desconocida (`T0000`, que es un relleno de una ficha). Ninguna afecta a
      P1–P3;
    - en AnnoCTR, el 98,6 % de las menciones está vigente: `T1562` → `T1685` en 29 menciones, y 5
      identificadores son de ATT&CK **Mobile** (`T1631.001`…), que se excluyen.
    - **Lectura:** la deriva de versión es pequeña en estos datos. La traducción del plan de APT29
      (`T1086`, `T1088`…) ahora es automática.
  - **Pendiente:** sustituir la lista manual de `verdad_conocida.py` por este servicio.

### F4.2 — OpenCTI y comparativa con el plan B

- [x] **OpenCTI en el compose** (perfil `cti`), con OpenSearch limitado a 4 GB y 1–2 workers, y la
  versión fijada.
  - *(06-11-2026)* **7.261023.1, edición Community** (Apache 2.0), con Elasticsearch 8.19.21 de 4 GB y 2
    workers. Todas las dependencias tienen versión fija.
  - **Trampa:** las etiquetas `-lts` son la edición LTS de Filigran y piden una licencia propia
    (`LTS_REQUIRED_ACTIVATION`), así que no se usan.
  - Los secretos van en `infra/.env` (plantilla `infra/.env.example`, generador
    `scripts/gen_env_opencti.py`).
  - Solo se publica `localhost:8082`. MinIO no publica el 9000, que es de ClickHouse.
- [x] Conector de **MITRE ATT&CK** con **la misma versión** que F4.1 (`MITRE_ENTERPRISE_FILE_URL` a la
  v19.2; Mobile, ICS y CAPEC desactivados). **Pendiente:** el feed de abuse.ch, en una muestra de 10.000 IOCs.
- [x] **Exportar de OpenCTI a STIX y compararlo con el original.**
  - Exportador por la API (`toStix`): `cti/comparativa/opencti_export.py`. Comparador:
    `cti/comparativa/fidelidad.py`.
  - **Cambio respecto al plan:** se compara paquete contra paquete, no en una segunda base Neo4j.
    OpenCTI reescribe los ids STIX (uuid5 propio) y guarda los de MITRE en una extensión, así que
    cargarlo en el mismo grafo duplicaría cada objeto.
- [ ] **Comparativa con criterios fijados antes de medir:**

  | Criterio | Cómo se mide |
  |---|---|
  | Coste | RAM en reposo y en carga, disco, tiempo de arranque, número de servicios |
  | Ingesta | Tiempo hasta tener ATT&CK y el feed consultables en el grafo |
  | Fidelidad | Diferencia de objetos y relaciones que llegan a Neo4j por cada camino |
  | Valor añadido | Deduplicación, confianza y caducidad de indicadores, catálogo de conectores, interfaz para el analista |
  | Encaje con ML-2 | Si los perfiles extraídos entran como informes consultables y enlazados |

- [ ] **Conector de importación de documentos de OpenCTI como línea base adicional de ML-2.**
  Empareja nombres e identificadores de técnicas con un diccionario. **Comprobar al montarlo qué
  extrae realmente** antes de contarlo como línea base.
- **Medido el 06-11-2026 con ATT&CK v19.2:**

  | Criterio | Plan B | OpenCTI |
  |---|---|---|
  | Ingesta de ATT&CK | **4,7 s** | **32 min 10 s** (22.600 objetos, unos 12/s) |
  | Memoria con datos | Neo4j 3,6 GB, con ATT&CK y 136.000 IOCs | unos 7,4 GB (Elasticsearch 6,0) solo con ATT&CK |
  | Disco | 865 MB, con ATT&CK y ThreatFox | 270 MB, solo ATT&CK |
  | Servicios | 1 | 11 |

  **Fidelidad de OpenCTI:**
  - **Descarta las 149 técnicas revocadas y las 157 relaciones `revoked-by`**: sin ellas no se pueden
    traducir identificadores antiguos.
  - **Fusiona grupos y malware que comparten alias:** Ember Bear + Saint Bear, Lotus Blossom + Thrip,
    More_eggs + SpicyOmelette, TEXTMATE + POWERSOURCE.
  - **No importa las estrategias de detección ni las analíticas de ATT&CK v18+** (2.457 objetos y 697
    relaciones `detects`).
  - Pierde la versión y la marca de obsoleta de cada técnica.
  - Conserva `uses`, `mitigates` y `attributed-to` (19.931, todas), las tácticas y las plataformas.
- [ ] **Pendiente (próxima sesión):** el valor añadido con una muestra de 10.000 IOCs de ThreatFox, y el
  encaje con ML-2 pasando 2–3 informes de Microsoft por el conector de documentos (que es a la vez la
  LB-a).
- [ ] **Decisión documentada** con la tabla en la mano. Fija qué entra en el despliegue completo y
  qué en el mínimo (F9).

### F4.3 🧠 — ML-2: extracción de TTPs de informes

**Este es el componente más alineado con la línea de investigación de la tutora (NER sobre
informes de amenazas, mapeo a ATT&CK). Merece tratamiento de primera.**

- [x] **1. Corpus** (los datos ya están en disco desde el 05-11-2026):
  - **AnnoCTR** (ZIP oficial de 93,2 MB, commit `d510b69`).
    - **Primero, inspeccionarlo:** qué capas trae, si las técnicas se anotan por frase o por
      mención, y qué son `train_ext` y las particiones.
    - Trae 400 nombres de informe distintos en `all/text` y otros 190 solapados en `text`: **no
      son 590 documentos independientes**.
    - Las particiones de entrenamiento y evaluación se hacen **por informe**, nunca por frase.
    - **Inspeccionado el 06-11-2026** (solo lectura, sin extraer ni ejecutar nada del ZIP):
      - De los 400 informes, **solo 120 están anotados**: 70 de entrenamiento, 16 de desarrollo y
        34 de prueba. Los 280 restantes (`ext`) son texto sin anotar, útiles a lo sumo para adaptar el
        modelo al dominio.
      - **La anotación es por mención:** un fragmento de texto enlazado a una entidad de ATT&CK
        (`linking_mitre_only`, formato KILT, con su frase y su contexto). Tipos: técnica, táctica,
        malware, grupo y herramienta.
      - **3.375 menciones de técnica, 145 técnicas distintas, casi todas de nivel padre** (solo 14
        subtécnicas). Para comparar con Sigma y con F3 hay que llevar todo a la técnica padre.
      - **Dos tercios de las menciones son implícitas** (`CI`, 2.290, describen la técnica sin
        nombrarla) y un tercio explícitas (`CE`, 1.085). El diccionario de LB-a solo puede acertar
        las explícitas: se medirá por separado.
      - **Distribución muy sesgada:** T1566, T1059 y T1486 suman el 37 %. Hay 80 técnicas con ≥5
        menciones y 33 con ≥20.
      - **Hay negativos:** `ner_json` trae todas las frases (7.570 en entrenamiento) con etiquetas
        BIO, así que las frases sin técnica se pueden usar como ejemplos negativos.
      - **APT29 aparece en 9 informes anotados** (6 de entrenamiento, 2 de desarrollo, 1 de prueba;
        varios sobre SolarWinds). Es una fuga leve hacia la evaluación extrínseca: se declara y se
        mide también sin esos informes.
      - **Tarea propuesta:** clasificación multietiqueta **frase → técnica padre**, limitada a las
        técnicas con ejemplos suficientes y con una clase «ninguna». Se evalúa **por mención o frase y
        por informe** (conjunto de técnicas del informe); la segunda es la que encaja con los perfiles
        del paso 5.
  - **15 informes públicos de Microsoft** en HTML, varios de APT29, sin anotación de referencia.
    Pendiente:
    - limpiar el HTML;
    - controlar el solapamiento con AnnoCTR y el sesgo de un único editor;
    - tener en cuenta que las menciones a IDs de ATT&CK no son una etiqueta por fragmento.
- [x] **0. Conjunto de datos (07-11-2026)** con `cti/extract/annoctr.py`, que lee el ZIP sin extraerlo.
  Salida en `data/ml2/annoctr/`.
  - **Construcción:** cada mención marcada en una frase se empareja con su enlace a ATT&CK del mismo
    informe. Casan 3.374 de 3.375 menciones.
  - **Normalización** a la técnica padre de v19.2: 30 identificadores revocados traducidos y 18 de
    Mobile o desconocidos descartados.
  - **Particiones publicadas, por informe:**

    | Partición | Informes | Frases | Con técnica |
    |---|---:|---:|---:|
    | Entrenamiento | 70 | 7.570 | 1.499 |
    | Desarrollo | 16 | 1.550 | 335 |
    | Prueba | 34 | 3.059 | 754 |

  - **Espacio de etiquetas:** 59 técnicas con al menos 5 frases de entrenamiento, que cubren el 85 % de
    las menciones de prueba.
  - **Métricas comunes** (`cti/extract/metricas.py`), en tres niveles: por frase (micro y macro), por
    mención (explícita frente a implícita) y por informe.
- [ ] **2. Líneas base, solo inferencia:**
  - **LB-a:** emparejamiento por diccionario (el conector de OpenCTI de F4.2 o un equivalente propio
    sobre los nombres y alias de ATT&CK);
    - *(07-11-2026, hecha)* `cti/extract/diccionario.py`: 1.581 términos de ATT&CK v19.2, entre ellos
      nombres antiguos de técnicas revocadas.
    - **Poda decidida solo con desarrollo:** quita 9 términos genéricos de subtécnica («Malware»,
      «At», «Server», «DNS», «Tool»…).
    - **Resultado en prueba con el diccionario podado:**
      - por frase: P=0,72, R=0,21, F1=0,33;
      - por informe: P=0,81, R=0,35, F1=0,49;
      - **exhaustividad por mención: explícitas 0,35, implícitas 0,15.**
    - Sin poda, el F1 por frase cae a 0,21.
  - **LB-b:** TRAM o SciBERT preentrenado.
- [ ] **3. Fine-tuning** de un modelo del dominio (**SecureBERT** o CyBERT) para la clasificación
  multietiqueta frase → técnica ATT&CK.
  - *(07-11-2026, script listo, sin ejecutar)* `cti/extract/entrenar.py`.
    - **Cambio de modelo:** se usa **SecureBERT 2.0** (`cisco-ai/SecureBERT2.0-base`, Apache 2.0)
      frente a **ModernBERT-base**, que es su modelo de partida. Así la única diferencia es el
      preentrenamiento en ciberseguridad.
    - El SecureBERT original solo publica pesos en pickle (`pytorch_model.bin`), que pueden ejecutar
      código al cargarse: no se usa. Solo se cargan pesos en safetensors y con revisión fijada.
    - **Protocolo:** la época y el umbral se eligen en desarrollo; prueba se evalúa una sola vez; varias
      semillas; registro en MLflow.
    - **Entorno:** `.venv-ml` con Python 3.12, torch 2.11.0+cu128 y `ml/requirements-ml2.txt`.
    - **Bloqueo:** la GPU no responde dentro de WSL (`nvidia-smi`: «Failed to initialize NVML»).
  - Cabe holgadamente en la RTX 5070 (~110M parámetros).
  - Se registra en MLflow: hiperparámetros, curvas y métricas por técnica.
- [ ] **4. Evaluación intrínseca:** precisión, exhaustividad y F1 por técnica y agregadas, en AnnoCTR,
  comparando LB-a, LB-b y el modelo afinado. Analizar qué técnicas mejoran, cuáles no y por qué
  (frecuencia en el corpus, ambigüedad léxica).
- [ ] **5. Perfil por informe y por actor.**
  - Se agregan las técnicas extraídas de cada informe con su confianza, y por actor si el informe
    lo nombra.
  - Salida en STIX: `report` → `attack-pattern` e `intrusion-set` → `uses` → `attack-pattern`, con
    `confidence`.
  - Se carga con el cargador de F4.1, y en OpenCTI si sigue en el despliegue.
- [ ] **6. Evaluación extrínseca sobre el corpus del proyecto** (no requiere anotar nada):
  - **6a. Perfil de APT29 frente a ATT&CK.** Qué parte de la lista revisada de técnicas de G0016
    recupera el perfil extraído de los informes de APT29, comparando las líneas base con el afinado.
  - **6b. Perfil frente a lo detectado.** Cuántas técnicas de las alertas y campañas de APT29 (día 1,
    y día 2 cuando se cargue) aparecen en el perfil extraído, y cuáles de las detectadas no
    menciona ningún informe.
  - **6c. Parecido entre campaña y actor.** Ordenar los grupos de ATT&CK por parecido de técnicas
    con las campañas de APT29: ¿sale G0016 arriba?
    - Se usan **todos los grupos como candidatos**; con uno solo, cualquier perfil «gana».
    - Se presenta como parecido a un perfil conocido, **no como atribución**.
  - ⚠️ **Circularidad, a declarar en la memoria:** la lista de ATT&CK para APT29 y el plan de
    emulación de MITRE salen en parte de esos mismos informes públicos. Coincidir con ellos es
    esperable y **no prueba que el modelo generalice**; eso lo prueba la evaluación intrínseca.
- [ ] **7. Análisis de errores:** casos en que el modelo falla y por qué. Vale tanto como los aciertos.
- [ ] **8.** 🟢 **Etiquetar las reglas Sigma sin técnica.** Ataca el punto ciego de F3: el 27,1 % de las
  alertas no lleva técnica y el CEP no las ve.
  - Se clasifica el título y la descripción de cada regla.
  - Se evalúa con las reglas que **sí** tienen etiqueta, ocultándosela al modelo.
  - Se reejecuta F3 para ver qué campañas aparecen, y si alguna es falsa.
  - Las técnicas propuestas entran con menos confianza o revisadas, nunca como verdad.
  - Es el experimento con más riesgo: una descripción de regla no se parece a un informe.
- [ ] **9.** 🟢 **NER de entidades de seguridad** (actores, malware, herramientas, IOCs) para enriquecer
  el grafo más allá de las técnicas.
- [ ] **10.** 🟢 **Aumento de datos con LLM** para las técnicas con pocos ejemplos (enfoque tipo
  SynthCTI), midiendo si mejora el desbalanceo.

### 📦 Entregables F4
- Perfiles `graph` y `cti`.
- `cti/stix_loader/`, con sus tests.
- Servicio de normalización de técnicas.
- Comparativa entre OpenCTI y el plan B, con su decisión.
- `cti/extract/`: corpus, entrenamiento, evaluación intrínseca y extrínseca.
- Perfiles STIX cargados en el grafo.
- Experimentos en MLflow.

### ✅ DoD
1. ATT&CK completo, versionado y consultable en Neo4j. Técnicas obsoletas resueltas a su sustituto.
2. ≥1 feed de IOCs sincronizado.
3. **Comparativa entre OpenCTI y el plan B** medida con los criterios fijados y decisión documentada.
4. **Modelo afinado, evaluado y comparado con las dos líneas base**, con métricas por técnica.
5. ≥10 informes procesados y sus perfiles cargados en el grafo.
6. **Evaluación sobre el corpus:** cobertura del perfil de APT29 frente a ATT&CK y frente a lo detectado
   (6a y 6b).
7. Análisis de errores documentado.

### ⚠️ Riesgos
| Riesgo | Mitigación |
|---|---|
| La comparativa se alarga y se come la extracción | Tiempo acotado a una semana. Si OpenCTI no levanta estable en 2 días, la comparativa se cierra con lo medido y se documenta |
| AnnoCTR no anota técnicas por frase | Inspeccionarlo lo primero y reformular la tarea (por mención o por párrafo) antes de entrenar |
| La evaluación extrínseca sale buena «por construcción» | Declarar la circularidad. La prueba de generalización es la intrínseca, separada por informe |
| Pocos ejemplos para muchas técnicas | Informar por frecuencia, agregar a nivel de técnica padre si hace falta y, opcionalmente, aumento de datos (paso 10) |

---

## F5 — Pilar B: grafo razonado + aprendizaje 🔴

**Estimación:** 4–5 semanas · **Prerrequisitos:** F2, F4 (o su plan B)

### F5.1 — Neo4j y modelo de datos

- [ ] Neo4j en el compose (perfil `graph`) con GDS. Heap 2 GB + pagecache 1–2 GB. *(Adelantado a F4.1 el 06-11-2026.)*
- [ ] **Modelo de grafo** en `graph/model.md`:
  ```
  NODOS: Host, User, Service, Vulnerability, Asset, Technique, Actor,
         Campaign, Indicator, Alert, AttackPath
  RELACIONES: RUNS, HAS_VULN, CONNECTS_TO, CAN_ACCESS, HOSTS, ENABLES,
              PRECEDES, USES, OBSERVED_ON, EVIDENCES, TRAVERSES, REACHES
  ```
- [ ] Índices y restricciones de unicidad.
- [ ] **Poblar el inventario del laboratorio** desde los propios datasets (hosts de apt29)
  + escenario sintético documentado (DMZ / interna / activo crítico).
- [ ] Cargar vulnerabilidades (CVE + CVSS + EPSS) plausibles para los servicios.
- [ ] Cargar el subgrafo de ATT&CK y CTI (salida de F4), con los **perfiles de actor de ML-2** (F4.3 paso 5),
  que son la base de la predicción de la siguiente etapa probable.
- [ ] Ingerir `det.alerts` como nodos `(:Alert)` en micro-batch vía Dagster.

### F5.2 — Analítica de grafos (GDS)

- [ ] **Centralidad** (Betweenness / PageRank) → identifica puntos de paso críticos.
- [ ] **Comunidades** (Louvain) → segmentación efectiva de la red.
- [ ] **Caminos mínimos ponderados** (Dijkstra) con pesos derivados de CVSS/EPSS.

### F5.3 — Razonamiento Datalog (lo simbólico)

- [ ] Instalar **Soufflé**.
- [ ] Estudiar el modelo MulVAL: facts + reglas de interacción → estados alcanzables.
- [ ] **Reimplementar el subconjunto de reglas en Soufflé** (opción B), adaptado al modelo
  propio. Permite añadir reglas basadas en **evidencia observada**, que es la aportación
  frente a MulVAL clásico (que razona solo sobre configuración estática).
- [ ] `graph/datalog/{facts,rules}.dl` con reglas de ejecución remota, escalada local,
  movimiento lateral por credenciales y refuerzo por evidencia observada.
- [ ] Exportador Neo4j → `.facts` e importador de rutas derivadas → `(:AttackPath)`.
- [ ] **Trazabilidad de la derivación**: conservar qué regla y qué hechos justifican cada paso.
- [ ] Orquestar el ciclo con Dagster.

### F5.4 🧠 — ML-3: aprendizaje sobre el grafo (lo neurosimbólico)

**Este es el componente de mayor valor diferencial del trabajo.**

- [ ] **1. Proyección y embeddings.** Generar representaciones vectoriales de los nodos con
  **FastRP** o **Node2Vec** (disponibles en GDS), o una **GNN** (GraphSAGE / GAT con PyTorch
  Geometric) si se quiere control total.
- [ ] **2. Predicción de enlaces.** Entrenar un modelo que prediga aristas ausentes:
  - Relaciones de acceso no declaradas en el inventario pero plausibles por la estructura.
  - Técnicas que un actor podría usar aunque no se le hayan observado.
  - Rutas de progresión que las reglas de interacción no contemplan.
- [ ] **3. Protocolo de evaluación correcto:** ocultar un porcentaje de aristas conocidas,
  entrenar sin ellas y medir si el modelo las recupera (AUC, precision@K). Es el estándar
  en predicción de enlaces.
- [ ] **4. 🔑 El bucle neurosimbólico.** Esta es la pieza clave:
  ```
  Datalog deriva rutas POSIBLES  ──►  el modelo puntúa cuáles son PLAUSIBLES
        ▲                                          │
        └──── verifica las sugerencias del modelo ◄─┘
  ```
  Las aristas sugeridas por el modelo se **reinyectan como hechos candidatos** al razonador,
  que deriva las rutas resultantes. **Toda ruta sugerida se verifica simbólicamente antes
  de presentarse**: el modelo propone, la lógica dispone y justifica. Así se gana
  generalización sin perder explicabilidad.
- [ ] **5. Evaluación del bucle:** ¿descubre rutas que solo con reglas no aparecían?
  ¿son plausibles al inspeccionarlas? ¿cuántas son espurias?
- [ ] **6.** 🟢 **Clasificación de nodos**: predecir la criticidad de un activo a partir de su
  posición en el grafo, y comparar con la criticidad declarada.

### 📦 Entregables F5
Perfil `graph` · `graph/model.md` · `graph/seed/*.cypher` · `graph/datalog/*.dl` ·
`ml/graph/` (embeddings, link prediction, bucle neurosimbólico) · pipeline Dagster

### ✅ DoD
1. Grafo poblado con topología, vulnerabilidades, ATT&CK, CTI y alertas.
2. Métricas GDS calculadas.
3. Reglas Datalog derivando rutas no triviales (≥3 saltos), explicables paso a paso.
4. **Modelo de grafo entrenado y evaluado** con protocolo de ocultación de aristas.
5. **Bucle neurosimbólico funcionando**: sugerencias del modelo verificadas por el razonador.

### ⚠️ Riesgos
| Riesgo | Mitigación |
|---|---|
| Grafo demasiado pequeño para entrenar | Ampliar el escenario sintético; usar embeddings estructurales (FastRP), que necesitan menos datos |
| El modelo sugiere aristas absurdas | Por eso se **verifican** con el razonador antes de presentarse |
| Curva de Datalog | Empezar con 5 reglas y crecer |
| Explosión combinatoria de rutas | Acotar profundidad, podar por umbral, quedarse con el top-K |

---

## F6 — Pilar C: priorización explicable 🟠

**Estimación:** 2–3 semanas · **Prerrequisitos:** F3, F5

### F6.1 — Modelo de puntuación

- [ ] **Fórmula** con factores independientes normalizados a [0,1]:
  ```
  score = w1·confianza_detección    (nivel Sigma, etapas de la campaña)
        + w2·severidad_táctica      (posición en la kill chain)
        + w3·criticidad_activo      (valor de negocio + centralidad GDS)
        + w4·proximidad_ruta        (1 / saltos hasta el activo crítico)
        + w5·confianza_CTI          (coincidencia con IOC/actor conocido; perfiles de F4.3)
        + w6·explotabilidad         (EPSS/CVSS)
        + w7·anomalía 🧠            (puntuación del detector de F2)
  ```
- [ ] Implementar `scoring/score.py` devolviendo **siempre** la descomposición y una narrativa legible.
- [ ] **Análisis de sensibilidad:** variar pesos ±30 % y medir estabilidad del top-10.

### F6.2 🧠 — ML-4: aprender los pesos

- [ ] **1. Línea base:** pesos iguales + análisis de sensibilidad. *Referencia de comparación.*
- [ ] **2. Etiquetado:** construir un conjunto de incidentes con gravedad anotada, derivada de
  la verdad conocida de los datasets (etapa alcanzada, criticidad del activo implicado).
- [ ] **3. Modelo interpretable:** regresión logística o *gradient boosting* con pocas
  características. **No** usar modelos opacos: rompería el requisito de explicabilidad.
- [ ] **4. Atribución:** SHAP sobre el modelo para mantener la descomposición por factores.
  La explicación sigue existiendo, pero ahora los pesos están justificados por datos.
- [ ] **5. Comparar:** pesos iguales vs. pesos aprendidos, midiendo si el incidente real
  aparece antes en el ranking (precision@K, MRR).
- [ ] **6. Riesgo a documentar:** con pocos incidentes etiquetados hay riesgo de sobreajuste.
  Si el conjunto resulta insuficiente, **reportarlo como tal** y quedarse con los pesos fijos
  justificados. Un resultado negativo bien argumentado es un resultado válido.

### F6.3 — API

- [ ] `api/` con FastAPI: `/incidents`, `/incidents/{id}`, `/incidents/{id}/path`,
  `/graph/subgraph`, `/attack/coverage`, `/stats/overview`, `WS /ws/alerts`.
- [ ] Modelos Pydantic → OpenAPI automático. Tests con pytest + httpx.

### ✅ DoD
1. Todo incidente con puntuación, descomposición y narrativa.
2. Análisis de sensibilidad hecho.
3. Comparación pesos fijos vs. aprendidos, con conclusión argumentada.
4. API funcionando, documentada y con tests.

---

## F7 — Evaluación cuantitativa 🔴

**Estimación:** 2–3 semanas · **Prerrequisitos:** F3 mínimo, idealmente F5–F6

- [ ] **1.** Escribir `docs/evaluation-protocol.md` **antes** de ejecutar experimentos.
- [ ] **2.** Consolidar la verdad conocida (metadatos YAML de los datasets).
- [ ] **3.** Conjunto de evaluación: LSASS_campaign_01..07, apt29 day1/day2, Log4Shell,
  GoldenSAML + ≥10 atómicos de distintas tácticas.

### Métricas clásicas

- [ ] **Detección:** precisión, recall y F1 por técnica y agregado; falsos positivos sobre
  la porción benigna; cobertura ATT&CK.
- [ ] **Correlación multi-etapa:** campañas correctamente reconstruidas; completitud de
  etapas; **ratio de reducción de alertas**.
- [ ] **Priorización:** precision@K, MRR; correlación puntuación ↔ gravedad real.
- [ ] **Razonamiento:** ¿coincide la ruta derivada con la del plan de emulación?
- [ ] **Rendimiento:** throughput por etapa, latencia p50/p95/p99, recursos, carga ×10 y ×100.

### 🧠 Métricas de los componentes de aprendizaje

- [ ] **ML-1 anomalías:** AUC-ROC y AUC-PR; ¿detecta lo que las reglas ven? ¿algo que no ven?
  tasa de falsos positivos; comparación Isolation Forest vs. autoencoder vs. secuencial.
- [ ] **ML-2 extracción:** precisión/recall/F1 por técnica, líneas base (diccionario y preentrenado) frente
  al afinado; matriz de confusión entre técnicas; análisis de errores; evaluación sobre el corpus
  (cobertura del perfil de APT29 frente a ATT&CK y frente a lo detectado; parecido campaña–actor).
- [ ] **ML-3 grafo:** AUC y precision@K en predicción de enlaces; nº de rutas nuevas
  descubiertas y proporción verificada como plausible por el razonador.
- [ ] **ML-4 scoring:** mejora en el ranking frente a pesos fijos; estabilidad; análisis SHAP.
- [ ] **Coste computacional del ML:** tiempo de entrenamiento, memoria, latencia de inferencia.
  Relevante para argumentar viabilidad operativa.

### Líneas base (esencial)

- [ ] **B1:** solo reglas Sigma, sin correlación → demuestra el valor del CEP.
- [ ] **B2:** solo reglas, sin anomalías → demuestra el valor de ML-1.
- [ ] **B3:** priorización por severidad de la regla → demuestra el valor del scoring contextual.
- [ ] **B4:** razonamiento sin el modelo de grafo → demuestra el valor de ML-3.
- [ ] **B5:** 🟢 mismas reglas en un SIEM abierto (Wazuh) → comparación externa.

- [ ] Automatizar todo en `eval/run_evaluation.py` (un comando → métricas + gráficas).
- [ ] ≥3 repeticiones por experimento; reportar media y desviación.
- [ ] `docs/results.md` con el análisis, **incluidos los fallos y su explicación**.

### ✅ DoD
1. Protocolo escrito antes de los experimentos.
2. Todas las familias de métricas calculadas, incluidas las de ML.
3. Comparación contra ≥4 líneas base.
4. Resultados reproducibles con un comando.
5. Figuras listas para la memoria.

---

## F8 — Frontend SaaS 🟢

**Estimación:** 3–4 semanas · **Prerrequisitos:** F6

> 🟢 **No es necesaria para aprobar bien.** Cae en la peor época del curso. Por eso se divide
> en **MVF (~1 semana)** y completo, con fecha límite dura: **si el 1 de mayo no está el MVF,
> se congela**.

- [ ] **F8.0** Nombre y marca · 2–3 *personas* · `docs/product-brief.md`.
  ↪️ *24-10-2026:* logotipo definitivo de Javier, redibujado en SVG (`frontend/src/componentes/shell/Logo.tsx` y
  `frontend/public/favicon.svg`). El nombre «Ciberconciencia» sigue provisional; faltan las *personas* y el brief.
- [ ] **F8.1** React 18 + TypeScript + Vite · Tailwind + shadcn/ui · TanStack Query ·
  Recharts · Cytoscape.js (grafo) · Zustand. Sistema de diseño (tema oscuro, códigos de severidad).
  ↪️ **Base hecha (23-09-2026), con el stack del portal de PIDS:** React 19 + Vite 8 + Tailwind 4 +
  shadcn/ui + TanStack Query + Recharts; el grafo del pipeline en SVG propio. Cytoscape.js se aplaza
  al grafo de ataque (F5, cientos de nodos) y Zustand no hace falta aún. En vez del tema oscuro, una
  **paleta gris de baja luminancia** (sin superficies blancas, pensada para turnos largos en un SOC)
  con escala de severidad propia. Sin backend: datos simulados con la procedencia de cada cifra
  marcada. Detalle en `frontend/README.md`.
- [ ] **F8.2** Multi-tenancy (`tenant_id` filtrado **en la capa de datos**) + JWT con roles.
  Sembrar 2–3 organizaciones de demostración.
- [ ] **F8.3 MVF:** Panel de situación · Cola de incidentes · **Detalle de incidente**
  (línea de tiempo + desglose de puntuación + ruta de ataque).
- [ ] **F8.3 Completo:** Explorador del grafo · Matriz ATT&CK · Inventario de activos ·
  Panel CTI · Informes PDF · Ajustes (¡tocar los pesos y ver cambiar el ranking!) ·
  Alertas en vivo por WebSocket.
  ➕ *Hecho el 24-10-2026:* **maqueta 3D de la organización** en la demo de conciencia situacional (three.js + React Three
  Fiber, carga diferida): zonas como plataformas escalonadas, ataque en arcos, ruta probable; la vista 2D sigue por
  defecto. Y el **explorador del grafo** pasa a columnas por momento con pasos numerados y un recorrido paso a paso.
  Segunda vuelta el mismo día: un modelo por tipo de activo (puesto, rack, controlador, base de datos, cintas, web,
  VPN, correo, OT), salas más espaciadas, cámara que **sigue el ataque** o **vista general que gira**, y panel
  **«Por qué»** al pinchar un activo (qué lo alcanzó, qué lo detectó, qué lo amenaza).
  Tercera vuelta: las trazas del ataque en 2D se animan mientras avanza la simulación, y se añade el **mundo** (de
  dónde viene y adónde va el ataque) en **mapa 2D y globo 3D**, con ubicaciones ilustrativas.
  ➕ *Idea anotada el 21-10-2026, hecha como demo ilustrativa el 24-10:* **mapa mundial** del origen y el destino del
  ataque (mapa 2D y globo 3D en `/conciencia`). Para que sea real y en tiempo real requiere IP públicas (el corpus solo
  tiene direcciones privadas de laboratorio), GeoIP local en el servidor y el WebSocket de F6.3. Detalle en
  `frontend/docs/plan-mejora.md` §8.
  ➕ *Idea anotada el 21-10-2026:* **mapa mundial en tiempo real** del origen y el destino de las alertas. Requiere IP
  públicas (el corpus actual solo tiene direcciones privadas de laboratorio), GeoIP local en el servidor y el WebSocket
  de F6.3; sin eso, solo ilustrativo. Detalle en `frontend/docs/plan-mejora.md` §8.
  ↪️ **Boceto ilustrativo construido (21-10-2026)** en `/mapa`: rutas animadas de Helios con pausa, filtros,
  zoom y detalle, cartografía local y procedencia explícita. La conexión a datos reales sigue pendiente.
- [ ] **F8.4** Estados de carga y vacíos · responsive · accesibilidad básica ·
  **modo demo** (un botón lanza el replay) · Dockerizar · **grabar vídeo de 3–5 min**.

---

## FA — Ampliación de la cobertura de detección 🟢 (condicionada)

> **Propuesta de Javier (26-10-2026).** Cuando el núcleo esté asentado, extender la detección a
> más tipos de ataque y a fuentes que no sean Windows (Linux, red), y generar datos propios
> con simulaciones si los públicos no bastan.
>
> **Condición de entrada:** el punto de control del **28-02-2027** cumplido (F3 cerrada y F5
> simbólico, el núcleo defendible) **o** ir claramente adelantado al calendario. Es lo
> primero que se recorta si aprieta el tiempo (R9, R14): se planifica ahora para que, si
> llega, no improvise el diseño.
>
> **Valor para la memoria:** demuestra que la arquitectura **generaliza**. Una fuente nueva
> solo exige un mapeador a OCSF, reglas Sigma de su plataforma y, si acaso, un patrón: el bus,
> la detección, el CEP, el grafo y la priorización no cambian. Es el argumento a favor de
> haber elegido OCSF como esquema canónico.

Orden por coste/beneficio (de menos a más esfuerzo). Revisado el 04-11-2026 con la
propuesta de datasets y de DoS/DDoS. Los conjuntos externos se descargan con el inventario de
`data/external/MANIFEST.md` (procedencia, licencia, tamaño y SHA-256) y **se verifican antes de
usarse**: canales, cómo se etiquetaron y si encajan con el normalizador.

> **Datos disponibles a 05-11-2026** (detalle, sumas y licencias en `data/external/MANIFEST.md`;
> resumen del otro agente en `data/external/RESUMEN_PARA_BITACORA_ROADMAP.md`). Que estén en
> disco **no cierra ninguna fase**: ninguno está normalizado ni integrado.
> - **FA.3 COMISET:**
>   - LAB (4,91 GB) en disco;
>   - **REAL descargado entero** (31,7 GB, MD5 correcto; su JSON ocupa 934,5 GB y no se extrajo);
>   - piloto: 100.000 registros de dos hosts, una hora cada uno, en `comiset/real-sample-v1/`.
>
>   Es un prefijo, no una muestra representativa: el 99 % son Sysmon 10. Además, el JSON trae un
>   envoltorio de Elasticsearch que el normalizador no entiende todavía.
> - **FA.4:** CAM-LDS v2 (escenarios 1 y 3), AttackMate, Splunk cron, AIT Alert Data Set y **AIT
>   LDS v2** (`russellmitchell.zip`, 7,13 GB, sin extraer). Las etiquetas de AIT salen de reglas,
>   no son verdad independiente.
> - **FA.5:**
>   - **en disco:**
>     - **Orion 2026, CSV de flujos (06-11-2026, conjunto principal de FA.5).**
>       - ZIP oficial de 2,98 GB; el SHA-256 del editor coincide.
>       - Cinco días en CSV comprimido con zstd (unos 11 GB descomprimido): 25,6 millones de flujos
>         etiquetados, 95 columnas.
>       - Se lee en streaming sin extraer. El PCAP no se ha adquirido.
>     - BOUN DDoS, SDN TCP-SYN, AdDDoSDN y DDoS con tráfico de fondo de 100 IP;
>     - **CICIDS2017 corregido** (revisión DistriNet/CNS2022). Su DDoS va tras NAT, así que no
>       prueba orígenes distintos ni indisponibilidad;
>     - **CSE-CIC-IDS2018, día 20:** solo Benign y LOIC-HTTP. Sus horas no llevan AM/PM, así
>       que **no sirve como verdad temporal ni para medir latencia**;
>   - **bloqueado:** CICDDoS2019.
> - **FA.6:** Splunk dcrypt (T1486) y shadowcopy (T1490), señales sueltas. Sus capturas son de años y
>   hosts distintos: no se pueden unir como una campaña.

> **Tramo mínimo realista** (las prácticas van de febrero a mayo): FA.1, FA.2, una muestra de
> FA.3 y el escenario 1 de CAM-LDS de FA.4 como prueba de generalización de P3. El resto queda
> como trabajo futuro en la memoria si no da tiempo.

- [ ] **FA.0 Prerrequisito: versionar el laboratorio.** Los guiones corregidos
  (`run-lab.ps1`, `export-events-clean.ps1`, `label_dataset.py` con los tres filtros de
  contaminación) solo existen dentro de la VM. Copiarlos a `emulation/` antes de ampliar el
  laboratorio.
- [ ] **FA.1 Red con Zeek** (ya pendiente en F3.1). `conn.log` y `dns.log` de APT29 vienen
  en JSON en el clon de OTRF, para los dos días: mapeador a OCSF (Network Activity, DNS) y
  topic `raw.net.zeek`. **Primer uso: cruzar la conexión de Zeek con la arista de host que ya
  usa P2.** Primer paso multi-fuente real, sin datos nuevos.
- [ ] **FA.2 apt29 day2** (ya pendiente en F3.1): más ataque y más tráfico benigno sobre la
  misma infraestructura. No pide mapeadores nuevos; útil para los falsos positivos.
- [ ] **FA.3 Validación externa en Windows: COMISET** (Universidad Pontificia Comillas,
  CC BY 4.0). Un laboratorio con ataques etiquetados ATT&CK (~4,9 GB) y una red universitaria
  con actividad normal (~31,7 GB). Prueba el pipeline actual **sin mapeadores nuevos** con datos
  de fuera y da fondo benigno para medir falsas alarmas. Usar una **muestra acotada**.
- [ ] **FA.4 Linux.**
  - **Mapeadores** a OCSF para `auditd` (agrupando antes los registros `SYSCALL`/`PATH`/…
    de un mismo evento), **Sysmon for Linux** y `journald` (sshd, sudo).
  - **Reglas Sigma** de la categoría `linux` en la misma pipeline pySigma.
  - **Patrones.** P3 tal cual: su ancla incluye `T1548`, y el abuso de sudo es `T1548.003`.
    Si reconoce una campaña Linux sin tocar el patrón, es la prueba de que los patrones por
    técnica generalizan entre sistemas. Variante Linux de P1 (`/etc/shadow`, no LSASS).
  - **Datos, por orden:**
    1. **CAM-LDS v2** (Austrian Institute of Technology, CC BY 4.0): auditoría,
       autenticación, syslog, flujos y manifiesto de pasos con tiempos y técnicas.
       `scenario_1_sudo_sshkey` (explotación web → sudo → clave SSH) para desarrollar y
       `scenario_3_ssh_apt` **reservado** para evaluar sin reajustar reglas. No simula
       usuarios normales: sirve para reconstruir etapas, no para falsos positivos.
    2. **Pruebas pequeñas por técnica:** Splunk Attack Data (auditd de T1053.003, edición de
       cron) para verificar mapeo y regla; AttackMate Evaluation Data (escalada y movimiento
       lateral por SSH generados con AttackMate, CALDERA y Atomic Red Team) para comprobar si
       se detecta el comportamiento cuando cambia la herramienta.
    3. **Log4Shell** del clon de OTRF (Auditd/AUOMS en JSON de syslog, más PCAP) como prueba
       de formato. Está además en el conjunto de evaluación de F7.
    4. **Fondo benigno: AIT Log Data Set v2** (`russellmitchell`, ~7,1 GB; extraer solo los
       canales necesarios). Licencia **CC BY-NC-SA 4.0**: válida para el TFG, pero «NC» choca
       con un producto y «SA» obliga a publicar derivados con la misma licencia. Sus etiquetas
       por línea salen de reglas: contrastar las etapas decisivas con el plan. Incluye una
       exfiltración por DNS (P4). El **AIT Alert Data Set** derivado permite probar el
       correlador directamente con alertas, como experimento aparte de Sigma.
- [ ] **FA.5 Disponibilidad: DoS y DDoS (piloto).** Hoy ninguna alerta del corpus es de
  `T1498`/`T1499`. No es un patrón de secuencia como P1-P3, sino un **detector por ventanas**,
  y amplía la cobertura al impacto sobre la disponibilidad.
  - **Casos:**
    - inundación de red (`T1498`): paquetes o bytes sostenidos hacia un destino, protocolo
      dominante, conexiones TCP sin completar, número de orígenes y peso de cada uno;
    - agotamiento de un servicio web (`T1499.002`): peticiones o conexiones concurrentes
      anómalas junto a latencia, errores o *timeouts*, más una **sonda** independiente que
      compruebe si un usuario normal aún accede.
  - **En el pipeline:** Flink SQL agrupa por destino, servicio y protocolo en ventanas cortas
    de tiempo de evento (10 s de partida) y compara con la línea base del servicio. Varias
    ventanas seguidas con el mismo problema emiten **un hallazgo OCSF por episodio**,
    reutilizando el esquema común de campaña. El hallazgo separa:
    - el patrón de tráfico;
    - si parece concentrado o distribuido;
    - si el impacto se **observó** o quedó **sin confirmar**.

    Muchas IP hacia un destino son una pista, no una prueba: puede ser un pico legítimo, y
    las IP pueden ser *proxies*, reflectores o falsificadas. Umbrales explicables, no un
    modelo opaco.
  - **Tiempo real:** `conn.log` de Zeek llega al cerrar la conexión o al vencer su
    *timeout*. Vale como evidencia y para la reproducción, pero para alertar durante la
    inundación hacen falta contadores periódicos del sensor (y, en HTTP, registros del proxy
    y la sonda). Medir el retraso desde el inicio del episodio. Ojo con la reproducción
    acelerada, que distorsiona las ventanas (ya visto en F3).
  - **Datos:**
    - **Orion 2026** (CC BY 4.0; citar doi:10.1109/ACCESS.2026.3738009). **Descargado el
      06-11-2026** (CSV de flujos, verificado; detalle en `data/external/MANIFEST.md`).
      - **Estructura:**
        - un CSV por día, con 95 columnas de flujo: 5-tupla, paquetes y bytes por sentido,
          tiempos entre llegadas, banderas TCP y etiquetas `str_label`/`bin_label`;
        - días 1–2 benignos; día 3 DoS 1→1 (10.0.0.4); día 4 DDoS N→1 (10.0.0.4–7); día 5
          DDoS N→N;
        - **8 ataques por día** (PSH, UDP, ICMP, SYN, URG, RST, ACK, FIN) de **30 minutos cada 3
          horas**, contra 10.0.0.1:80, 10.0.0.2:8080 y 10.0.0.3:9090 (UDP).
      - **Recuentos verificados:** los del README coinciden flujo a flujo
        (`data/external/orion-2026/RECUENTO.json`).
      - **Hallazgo: en el CSV, todo el ataque de los días 4 y 5 sale de 10.0.0.4.** El README dice
        10.0.0.[4-7], pero las otras tres máquinas solo generan tráfico benigno.
        - Por número de orígenes, el DDoS N→1 parece un DoS 1→1. El rasgo «concentrado frente a
          distribuido» **no se puede validar con Orion**: se valida con el laboratorio o con
          CICDDoS2019.
        - Falta confirmar en el artículo si es suplantación de IP o un artefacto de la captura.
      - **Trampa:** los ataques ICMP son solo 15–45 *flujos* con millones de paquetes. Un umbral
        por número de flujos no los ve; las señales tienen que ser paquetes y bytes por ventana.
      - **Reparto propuesto, fijado antes de mirar resultados:**
        - **calibrar** los umbrales con el día 2 (benigno) y el día 3 (DoS 1→1);
        - **evaluar** con los días 4 y 5 completos (DDoS), sin retocar umbrales;
        - medir **falsas alarmas** en el día 1 (benigno), que no se usa para calibrar.
      - **Ingesta:**
        - un normalizador de flujos a OCSF *Network Activity* (4001) en un topic nuevo
          `raw.net.flows`;
        - reproducción por la hora de inicio del flujo.

        El CSV da el flujo ya cerrado: la latencia medida será optimista frente a un sensor real,
        y se declara.
      - **Pendiente:** confirmar en el artículo la zona horaria de `timestamp` y la unidad de
        `flw_duration`.
    - **CICDDoS2019:** una variante de reflexión o amplificación. Reconstruir las señales por
      ventana desde los paquetes: usar el total de un flujo antes de que termine falsearía la
      latencia.
    - **Laboratorio:** servicio HTTP aislado y carga acotada con k6, en cuatro pasadas
      (normal, pico legítimo, sobrecarga desde uno, sobrecarga desde varios con volumen total
      parecido). Guardar tráfico, métricas del servicio y marcas de inicio, degradación y
      recuperación. **Solo contra el servicio propio del laboratorio aislado.**
  - **Criterio de éxito:**
    - detectar el episodio **mientras ocurre**;
    - explicar qué servicio se degradó;
    - medir cuántas veces se confunde un pico legítimo con un ataque.

    En el portal: conexiones que convergen en un servicio, con la gráfica de tráfico y
    disponibilidad.
- [ ] **FA.6 Más familias de ataque** sobre las fuentes que ya hay: impacto/ransomware
  (T1486, T1490 — borrado de instantáneas), exfiltración (P4), persistencia (T1547, ya hay
  capturas en `emulation/`).
- [ ] **FA.7 Datos propios en el laboratorio aislado.** Solo si los públicos no bastan.
  - **Entorno:** VM Ubuntu con `auditd` (procesos y ficheros), sshd y sudo vía `journald`, y
    Zeek (conexiones y DNS). Una segunda VM cuando toque el salto entre equipos.
  - **Generación:** Atomic Red Team para etapas sueltas y un guion **versionado** que las
    encadene; CALDERA cuando compense automatizar variantes.
  - **Controles negativos**, lo más valioso:
    - un administrador legítimo usando SSH, sudo y cron en mantenimiento;
    - un intento bloqueado y una cadena incompleta;
    - para P4, una copia de seguridad legítima frente a una exfiltración ficticia a un
      receptor interno.
  - **Verdad conocida por paso**, no por ventana temporal: host, sesión, usuario, proceso,
    hora UTC, técnica y resultado. Así un evento legítimo simultáneo no hereda la etiqueta
    de ataque (las tres contaminaciones de F2 vinieron de etiquetar por ventana).
  - **Evaluación con el pipeline real:** Redpanda → OCSF → Sigma → Flink, reglas filtradas
    por plataforma y fuente, y una captura completa reservada. Medir etapas recuperadas,
    campañas correctas, falsos positivos por host y hora, latencia y eventos tardíos. Los
    eventos OCSF fabricados a mano quedan solo para pruebas de duplicados, desorden y
    reinicios.

### ✅ DoD
1. ≥1 fuente no-Windows normalizada a OCSF **sin tocar** el bus, la detección ni el CEP.
2. ≥1 patrón nuevo validado contra verdad conocida (dataset público o simulación propia), con
   una captura reservada que no se usó para ajustar.
3. Falsos positivos medidos sobre la porción benigna de la fuente nueva.
4. Si se hace FA.5: episodio detectado durante el ataque, retraso medido y tasa de picos
   legítimos confundidos con ataque.

---

## F9 — Despliegue, memoria y defensa 🔴

**Estimación:** 4 semanas (más la escritura continua desde F1)

### F9.1 Despliegue
- [ ] minikube/kind + manifiestos en `infra/k8s/` (o chart de Helm).
- [ ] Desplegar el núcleo; justificar qué queda fuera con la comparativa de F4.2 (OpenCTI frente al plan B).
- [ ] `docs/deployment.md`: de repo clonado a sistema funcionando.
- [ ] `make demo` que levante todo y lance el replay.

### F9.2 La memoria

> **Se escribe desde F1**, capítulo a capítulo al cerrar cada fase.

| Cap. | Contenido | Cuándo |
|---|---|---|
| 1 | Introducción | ✅ borrador |
| 2 | **Estado del arte** (+ ML aplicado a seguridad y enfoques neurosimbólicos) | ✅ borrador · ampliar en agosto |
| 3 | Análisis y requisitos | Oct 2026 |
| 4 | Diseño de la arquitectura | ✅ borrador |
| 5 | Implementación I: ingesta y normalización | ✅ escrito |
| 6 | Implementación II: detección (reglas + **anomalías** + CEP) | Feb 2027 |
| 7 | Implementación III: CTI (+ **extracción con NLP**) y grafo (+ **GNN**) | Mar 2027 |
| 8 | Implementación IV: priorización y plataforma | Abr 2027 |
| 9 | Evaluación (clásica + **de los modelos**) | Abr–May 2027 |
| 10 | Conclusiones y trabajo futuro | May 2027 |

- [ ] Bibliografía en BibTeX **desde el día uno**.
- [ ] Aspectos éticos y legales (aprovechar *Marco ético y legal*): RGPD, licencias, uso
  responsable, **y sesgo de los modelos de aprendizaje**.
- [ ] Entregar al tutor **≥3 semanas** antes del depósito.

### F9.3 Defensa
- [ ] Presentación 15–20 min: problema (2) → estado del arte (3) → arquitectura (4) →
  contribuciones (5) → **demo en vídeo** (3) → resultados (3) → conclusiones (1).
- [ ] Ensayar ≥3 veces cronometrando.
- [ ] Preparar respuestas: ¿por qué Datalog y no un motor de reglas? ¿cómo evitas el
  sobreajuste? ¿**por qué combinar símbolo y aprendizaje en vez de solo uno**? ¿cómo
  mantienes la explicabilidad con modelos de por medio? ¿qué aporta frente a un SIEM comercial?
- [ ] **Todo grabado en vídeo** + capturas en las diapositivas.

---

## 5. Calendario integrado con el curso

**1.º cuatri (sep–ene):** Inglés · Gestión de proyectos · Proyectos de ing. de datos ·
Ciberseguridad y protección de datos · Marco ético y legal · HCoV
**2.º cuatri (feb–jun):** TSDE · TIG · **Prácticas** · TFG

| Periodo | Disponibilidad | Foco |
|---|---|---|
| **Ago 2026** | 🟢 Alta | Cerrar F2 (job + apt29) · estado del arte · ⚠️ **escribir al tutor** |
| **Sep 2026** | 🟢 Media-alta | **ML-1 anomalías** · caps. 1–2 |
| **Oct 2026** | 🟡 Media | **F3 Pilar A** · cap. 3 |
| **Nov 2026** | 🟡 Media | Cerrar F3 · **F4 + ML-2 extracción** · cap. 4 |
| **Dic 2026** | 🟠 Media-baja | Cerrar F4 · Navidad: descanso + caps. 5–6 |
| **Ene 2027** | 🔴 Baja | **PAUSA** (exámenes) |
| **Feb 2027** | 🟡 Media | **F5 Pilar B + ML-3** — empujón fuerte |
| **Mar 2027** | 🔴 Baja | Cerrar F5 · F6 (+ML-4 si da tiempo) · Prácticas |
| **Abr 2027** | 🔴 Baja | **F7 evaluación** · F8 MVF · caps. 6–8 |
| **May 2027** | 🟡 Media | Cerrar F7/F8 · F9 despliegue · memoria al tutor |
| **Jun 2027** | 🟡 Media | Depósito + **defensa** |

### Puntos de control

| Fecha | Hito | Si no está… |
|---|---|---|
| **15 sep 2026** | Tutor confirmado · F2 cerrada con apt29 | 🚨 Escribir a más profesores |
| **30 nov 2026** | F3 funcionando · ML-1 evaluado | Recortar F4 al plan B |
| **28 feb 2027** | **F3 + F5 simbólico = núcleo defendible** | 🚨 Punto de no retorno: congelar alcance, recortar ML por el orden de §2.5 |
| **30 abr 2027** | F7 con resultados · 60 % de memoria | Cancelar F8 |
| **15 may 2027** | Memoria completa al tutor | Cita urgente y priorizar redacción |

---

## 6. Convenciones técnicas

### Git
- Dos repositorios: `tfg-ciberconciencia` (código) y `tfg-memoria` (memoria y bitácora).
- `./scripts/save.sh "mensaje"` guarda y sube ambos.
- Commits *conventional*: `feat(ambito): ...`
- **Autoría:** solo Javier Saguar. Ningún agente de IA como autor/co-autor (hook `.githooks/commit-msg`).

### Código
- Python: `ruff`, type hints, `pytest`. Configuración por variables de entorno.
- Sin secretos en el repo. Todo script con `--help`.

### 🧠 Experimentos de ML
- **Todo entrenamiento se registra en MLflow**: parámetros, métricas, artefactos, semilla.
- **Semillas fijadas** para reproducibilidad; reportar media y desviación de ≥3 ejecuciones.
- Separación estricta train/test **por dataset**, no por evento: evaluar en datasets distintos
  de los de entrenamiento para medir generalización real.
- Los modelos entrenados no se versionan en git (van a MinIO o al registro de MLflow).

### Datos
- `data/` git-ignored. Datasets fríos en disco externo. `docker system prune` periódico.

---

## 7. Riesgos globales

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | No conseguir tutor a tiempo | Media | 🔴 | Escribir en agosto, a varios profesores |
| R2 | Las Prácticas absorben marzo–mayo | **Alta** | 🔴 | Núcleo cerrado en febrero |
| R3 | OpenCTI inviable por recursos | Baja | 🟠 | Recursos comprobados el 06-11-2026 (44 GB de RAM). El plan B se construye primero y es el respaldo: STIX/ATT&CK directo a Neo4j |
| R4 | Datalog más difícil de lo previsto | Media | 🟠 | Empezar con 5 reglas; si se atasca, MulVAL tal cual |
| R5 | El frontend devora el tiempo de memoria | **Alta** | 🟠 | MVF con fecha límite dura |
| R6 | Los patrones CEP no generalizan | Media | 🟠 | Validar con las 7 variantes LSASS |
| R8 | Pérdida de trabajo | Baja | 🔴 | `save.sh` cada sesión, dos repos |
| R9 | Alcance demasiado ambicioso | **Alta** | 🟠 | Prioridades explícitas; recortar por el final |
| **R11** | 🧠 **El ML canibaliza el núcleo** | **Alta** | 🔴 | **Regla de contención §2.5**: orden de recorte definido de antemano |
| **R12** | 🧠 Datos insuficientes para entrenar | Media | 🟠 | Modelos pequeños; transferencia desde preentrenados; **reportar el resultado negativo si ocurre** |
| **R13** | 🧠 Los modelos rompen la explicabilidad | Media | 🟠 | Modelos interpretables + SHAP; **la capa simbólica siempre verifica y justifica** |
| **R14** | La ampliación (FA) o las ideas de producto desplazan el núcleo | Media | 🔴 | FA solo tras el punto de control del 28-02-2027; las ideas de producto quedan en §3.4 como líneas futuras, sin desarrollo |

---

## 8. Checklists

### Al empezar sesión
- [ ] `./scripts/up.sh all` · leer `BITACORA.md §4` · fijar **un** objetivo

### Al terminar sesión
- [ ] Entrada en el diario de `BITACORA.md` · actualizar §4
- [ ] `./scripts/save.sh "mensaje código" "mensaje memoria"`
- [ ] Marcar los `[x]` de este roadmap
- [ ] Bajar servicios pesados

### Antes de cerrar fase
- [ ] DoD cumplido · tests en verde · capítulo redactado · figuras guardadas
- [ ] 🧠 Experimentos registrados en MLflow y reproducibles
- [ ] Reunión con el tutor

---

## 9. Referencias clave

**Marcos y estándares**
MITRE ATT&CK · MITRE ATLAS · OCSF (schema.ocsf.io) · STIX 2.1 (OASIS) · Sigma (SigmaHQ)

**Grafos de ataque y razonamiento**
Ou, Govindavajhala, Appel. *MulVAL: A Logic-based Network Security Analyzer*. USENIX 2005 ·
Soufflé (souffle-lang.github.io) · Neo4j GDS

**Streaming y CEP**
Apache Flink · FlinkCEP · SQL `MATCH_RECOGNIZE` (SQL:2016)

**CTI y NLP** 🧠
OpenCTI · TRAM (Center for Threat-Informed Defense) · SecureBERT · AnnoCTR (arXiv:2404.07765) ·
CyNER (arXiv:2204.05754) · SynthCTI

**Aprendizaje sobre grafos** 🧠
Neo4j GDS (FastRP, Node2Vec) · PyTorch Geometric · literatura de *link prediction* y GNN
aplicados a seguridad · **IA neurosimbólica** (referencias a completar en la revisión de agosto)

**Datos**
OTRF Security-Datasets · Atomic Red Team · CALDERA

**Contexto**
ENISA Threat Landscape 2025

---

*Mantén este archivo vivo: si una decisión cambia, actualízalo y refléjalo en `BITACORA.md §2`.*
