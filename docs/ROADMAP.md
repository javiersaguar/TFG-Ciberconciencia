# ROADMAP — Plan de trabajo detallado

**Proyecto:** Plataforma de conciencia cibersituacional — detección de ataques multi-etapa, grafo de ataque razonado y priorización explicable
**Autor:** Javier Saguar Antona · Grado en Ingeniería y Sistemas de Datos, ETSIT-UPM
**Horizonte:** agosto 2026 → defensa junio 2027
**Última actualización:** 2026-07-30 · *(rev. 3 — F2 cerrada, laboratorio de emulación propio, arranque de F3)*

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
| **F3** | **Pilar A** — detección multi-etapa (CEP) + **secuencias 🧠** | 🔴 | 3–4 sem |
| **F4** | Plano CTI + **extracción de TTPs con NLP 🧠** | 🟠 | 3–4 sem |
| **F5** | **Pilar B** — grafo razonado + **GNN neurosimbólico 🧠** | 🔴 | 4–5 sem |
| **F6** | **Pilar C** — priorización explicable + **scoring aprendido 🧠** | 🟠 | 2–3 sem |
| **F7** | Evaluación cuantitativa (incluye los modelos) | 🔴 | 2–3 sem |
| **F8** | Frontend SaaS | 🟢 | 3–4 sem |
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

## F3 — Pilar A: detección multi-etapa (CEP) 🔴

**Estimación:** 3–4 semanas · **Prerrequisitos:** F1, F2

### F3.1 — Modelado de escenarios

- [x] day1 extraído, normalizado y detectado (F2).
- [ ] Extraer y cargar **day2** (`apt29_evals_day2_manual.zip`, 43 MB sin extraer;
  hosts NEWYORK, SCRANTON, UTICA-A/C/D/ONE-DRIVE).
- [ ] **Inventario de materia prima antes de diseñar patrones** (paso 0 de la fase): qué
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
- [ ] `docs/scenarios/apt29-day1.md`: táctica → técnica → evidencia esperada → ventana temporal.
  **De aquí salen los `WITHIN` de los patrones**, medidos sobre la campaña real; no se fijan a ojo.
- [ ] Diseñar **3–5 patrones CEP** de valor general:
  - **P1** Robo de credenciales: proceso inusual → acceso a LSASS → volcado a disco → *(opc.)* borrado de log.
  - **P2** Movimiento lateral: logon remoto → creación de proceso/servicio → conexión saliente. **Cruza hosts.**
  - **P3** Descubrimiento y escalada: ráfaga de reconocimiento → privilegios especiales → persistencia.
  - **P4** Exfiltración: acceso masivo a ficheros → compresión → salida de gran volumen.
  - **P5** 🟢 Ausencia como señal (negación temporal).

### F3.2 — Implementación

- [ ] Implementar con `MATCH_RECOGNIZE` (`PARTITION BY`, `MEASURES`, `PATTERN`, `DEFINE`, `WITHIN`).
- [ ] **Decisión abierta a cerrar en F3.1 — fuente de las etapas.** `det.alerts` es más semántico,
  pero **deja etapas ciegas**: si ninguna regla Sigma etiqueta la escritura del `.dmp` o la
  conexión saliente, esas etapas no existen como alerta y el patrón nunca completa. Opción
  propuesta: **híbrido**, alertas Sigma como **etapas ancla** + un flujo derivado de
  `norm.events` filtrado por las señales `tfg.signal_*` ya precalculadas en los mapeadores
  (`signal_lsass_access`, `signal_dump_file`, `signal_log_cleared`, `signal_remote_thread`…)
  para las etapas de refuerzo. Decidir **con el inventario de F3.1 en la mano**, no antes.
- [ ] **Esquema de campaña** en `det.campaigns`:
  ```
  campaign_id · first_seen · last_seen · duration · pattern_id
  stages[] { order, tactic_id, technique_id, time, evidence_alert_ids[], device }
  devices[] · users[] · confidence
  ```
- [ ] **Movimiento lateral entre hosts:** correlación jerárquica en dos niveles
  (alerta → campaña local → campaña multi-host), que evita re-particionar.
- [ ] Gestión de eventos tardíos (`allowedLateness`) → `dlq.late`, y medir cuántos hay.

### F3.3 🧠 — Anomalías secuenciales como refuerzo

- [ ] Integrar la puntuación de `det.anomalies` como **factor de confianza** de la campaña:
  una secuencia CEP acompañada de comportamiento anómalo es más creíble que una sin él.
- [ ] 🟢 Explorar la detección de **secuencias anómalas** que no encajan en ningún patrón
  escrito: candidatas a patrones nuevos. Es el complemento natural del CEP.

### F3.4 — Validación

- [ ] P1 contra los **7 LSASS_campaign** → prueba de **generalización**, no memorización.
- [ ] P2/P3/P4 contra apt29 day1/day2.
- [ ] **Falsos positivos** sobre la porción benigna.
- [ ] **Ratio de reducción de alertas** = 1 − (campañas / alertas individuales) ← *métrica estrella*.
- [ ] **Latencia de detección**: del último evento de la secuencia a la emisión.

### ✅ DoD
1. ≥3 patrones disparando sobre datasets reales.
2. P1 detecta las 7 variantes de LSASS_campaign.
3. ≥1 campaña multi-etapa detectada en apt29.
4. Ratio de reducción de alertas medido.
5. Falsos positivos cuantificados.

---

## F4 — Plano CTI + extracción de TTPs 🟠

**Estimación:** 3–4 semanas · **Prerrequisitos:** F1

> 🟠 OpenCTI es pesado (~8–10 GB). El **plan B ligero** (STIX/ATT&CK directo a Neo4j) da el
> 80 % del valor. **Pero ML-2 se hace en cualquiera de los dos casos**: es el componente con
> mejor encaje con la línea de la tutora.

### F4.1 — Plataforma CTI

- [ ] Stack OpenCTI en el compose (perfil `cti`), con OpenSearch limitado a 4 GB y 1–2 workers.
- [ ] Conector de **MITRE ATT&CK** → importa el framework al grafo.
- [ ] 1–2 conectores de IOCs (abuse.ch / OTX). Registrar volumen de objetos STIX.
- [ ] Explorar el modelo de datos por la API GraphQL.
- [ ] 🅱️ **Plan B:** cargar `enterprise-attack.json` de MITRE + IOCs de abuse.ch directamente en Neo4j.

### F4.2 🧠 — ML-2: extracción de TTPs de informes

**Este es el componente más alineado con la línea de investigación de la tutora (NER sobre
informes de amenazas, mapeo a ATT&CK). Merece tratamiento de primera.**

- [ ] **1. Corpus.** Reunir informes públicos de amenazas (≥15, incluyendo alguno de APT29
  para cerrar el círculo con los datos de F3). Valorar **AnnoCTR** (120 informes anotados,
  CC-BY-SA) como conjunto etiquetado de referencia.
- [ ] **2. Línea base:** TRAM / SciBERT preentrenado, **solo inferencia**. Medir precisión,
  exhaustividad y F1 sobre el corpus anotado. *Esta es la referencia contra la que comparar.*
- [ ] **3. Fine-tuning** de un modelo del dominio (**SecureBERT** o CyBERT) sobre el corpus
  anotado, para la tarea de clasificación multi-etiqueta frase → técnica ATT&CK.
  - Cabe holgadamente en la RTX 5070 (~110M parámetros).
  - Registrar en MLflow: hiperparámetros, curvas, métricas por técnica.
- [ ] **4. Comparativa rigurosa:** modelo base vs. afinado, por técnica y agregado. Analizar
  qué técnicas mejoran y cuáles no, y por qué (frecuencia en el corpus, ambigüedad léxica).
- [ ] **5.** 🟢 **NER de entidades de seguridad** (actores, malware, herramientas, IOCs) para
  enriquecer el grafo más allá de las técnicas.
- [ ] **6.** 🟢 **Aumento de datos con LLM** para las técnicas con pocos ejemplos
  (enfoque tipo SynthCTI), midiendo si mejora el desbalanceo.
- [ ] **7. Salida a STIX** y carga en el grafo. **Cierra el ciclo:** informe en lenguaje
  natural → conocimiento consultable.
- [ ] **8. Análisis de errores:** casos en que el modelo falla y por qué. Vale tanto como los aciertos.

### 📦 Entregables F4
Perfil `cti` · `cti/extract/` (corpus, entrenamiento, evaluación) · comparativa base vs.
afinado · exportador STIX → Neo4j · experimentos en MLflow

### ✅ DoD
1. ATT&CK completo cargado y consultable.
2. ≥1 feed de IOCs sincronizado.
3. **Modelo afinado, evaluado y comparado con la línea base**, con métricas por técnica.
4. ≥10 informes procesados y sus técnicas cargadas en el grafo.
5. Análisis de errores documentado.

---

## F5 — Pilar B: grafo razonado + aprendizaje 🔴

**Estimación:** 4–5 semanas · **Prerrequisitos:** F2, F4 (o su plan B)

### F5.1 — Neo4j y modelo de datos

- [ ] Neo4j en el compose (perfil `graph`) con GDS. Heap 2 GB + pagecache 1–2 GB.
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
- [ ] Cargar el subgrafo de ATT&CK y CTI (salida de F4).
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
        + w5·confianza_CTI          (coincidencia con IOC/actor conocido)
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
- [ ] **ML-2 extracción:** precisión/recall/F1 por técnica, base vs. afinado; matriz de
  confusión entre técnicas; análisis de errores.
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
- [ ] **F8.1** React 18 + TypeScript + Vite · Tailwind + shadcn/ui · TanStack Query ·
  Recharts · Cytoscape.js (grafo) · Zustand. Sistema de diseño (tema oscuro, códigos de severidad).
- [ ] **F8.2** Multi-tenancy (`tenant_id` filtrado **en la capa de datos**) + JWT con roles.
  Sembrar 2–3 organizaciones de demostración.
- [ ] **F8.3 MVF:** Panel de situación · Cola de incidentes · **Detalle de incidente**
  (línea de tiempo + desglose de puntuación + ruta de ataque).
- [ ] **F8.3 Completo:** Explorador del grafo · Matriz ATT&CK · Inventario de activos ·
  Panel CTI · Informes PDF · Ajustes (¡tocar los pesos y ver cambiar el ranking!) ·
  Alertas en vivo por WebSocket.
- [ ] **F8.4** Estados de carga y vacíos · responsive · accesibilidad básica ·
  **modo demo** (un botón lanza el replay) · Dockerizar · **grabar vídeo de 3–5 min**.

---

## F9 — Despliegue, memoria y defensa 🔴

**Estimación:** 4 semanas (más la escritura continua desde F1)

### F9.1 Despliegue
- [ ] minikube/kind + manifiestos en `infra/k8s/` (o chart de Helm).
- [ ] Desplegar el núcleo; justificar qué queda fuera (OpenCTI por peso).
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
| R3 | OpenCTI inviable por recursos | Media | 🟠 | Plan B: STIX/ATT&CK directo a Neo4j |
| R4 | Datalog más difícil de lo previsto | Media | 🟠 | Empezar con 5 reglas; si se atasca, MulVAL tal cual |
| R5 | El frontend devora el tiempo de memoria | **Alta** | 🟠 | MVF con fecha límite dura |
| R6 | Los patrones CEP no generalizan | Media | 🟠 | Validar con las 7 variantes LSASS |
| R8 | Pérdida de trabajo | Baja | 🔴 | `save.sh` cada sesión, dos repos |
| R9 | Alcance demasiado ambicioso | **Alta** | 🟠 | Prioridades explícitas; recortar por el final |
| **R11** | 🧠 **El ML canibaliza el núcleo** | **Alta** | 🔴 | **Regla de contención §2.5**: orden de recorte definido de antemano |
| **R12** | 🧠 Datos insuficientes para entrenar | Media | 🟠 | Modelos pequeños; transferencia desde preentrenados; **reportar el resultado negativo si ocurre** |
| **R13** | 🧠 Los modelos rompen la explicabilidad | Media | 🟠 | Modelos interpretables + SHAP; **la capa simbólica siempre verifica y justifica** |

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
