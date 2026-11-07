# Integración FA: cuaderno de trabajo

Fecha: **2026-11-07**. Rama `fa-datasets`, worktree
`/home/javier/proyectos/tfg-fa-datasets`, base `6981338`.

## Alcance y estado

Orden del encargo: T1 day2 → T2 Zeek → T3 COMISET. **T1 está parcial**:
extracción y normalización offline medidas; carga, detección Sigma, campañas y
evaluación P1/P2/P3 pendientes de completar por el coordinador. T2 y T3a tienen
adaptadores, tests y corpus de replay preparados y medidos offline; las cargas
y resultados de servicios los registra el coordinador.
No se amplió COMISET ni se recorrió el ZIP REAL.

**Autorización posterior de Javier (2026-11-07):** permite al coordinador usar
los comandos de servicios necesarios para completar F1–F3 con day2, Zeek y el
piloto COMISET. Sustituye la petición rutinaria comando a comando del encargo
original. El agente de adaptadores no ejecuta servicios para evitar carreras.
La ampliación v2 de REAL y LAB no están incluidas.

Se comparten únicamente `data/` y `.venv` mediante enlaces al repositorio
principal. Ambos enlaces están excluidos en `info/exclude`. No se ha cambiado
código existente, reglas, patrones, registro de normalizadores, ROADMAP, bitácora,
memoria, `cti/`, `ml/` ni frontend. No hay commits ni push.

Los scripts lectores nuevos se ejecutan con `python3 -I` desde el worktree. El
lector day2 antepone expresamente el código del worktree a `sys.path`, evitando
que el entorno compartido importe por accidente código del repositorio principal.
No se ejecutó código contenido en los datasets ni se instaló nada.

## T1: extracción y cobertura offline

Fuente: `data/Security-Datasets/datasets/compound/apt29/day2/apt29_evals_day2_manual.zip`.
Salida nueva: `data/samples/apt29/day2/apt29_evals_day2_manual_2020-05-02035409.json`.

| Medida | Resultado |
|---|---:|
| Bytes extraídos | 1.714.987.031 |
| Líneas físicas / registros JSON | 587.286 |
| Normalizados con los mapeadores vigentes | 585.479 |
| Rechazados, conservados en DLQ local con motivo y línea original | 1.807 |
| Cobertura global estructural | 99,6923 % |
| Errores JSON, tiempo ausente o identidad ausente | 0 |
| Identidades repetidas entre los normalizados | 0 |
| Duración primera pasada, incluida extracción | 67,752 s |
| Duración segunda verificación, reutilizando extracción validada | 60,605 s |

SHA-256 del ZIP, contrastado con el MANIFEST:
`377f8cba5db95a453a3ee8bd19f493efafc23724541482a4da99da28ee4665f9`.
SHA-256 del JSON extraído:
`fd4043c9ad2382f57da882476acb541332d2d19b60ad538572a8d4a070d59a89`.
La lectura del miembro ZIP hasta EOF valida su CRC. Se verifica tamaño y SHA-256
antes de reutilizar la extracción; nunca se sobrescribe un fichero existente.

Informes nuevos, con tabla completa por canal/EventID:

- `data/fa/20261107-day2-offline/coverage.json`: primera medida.
- `data/fa/20261107-day2-verified/coverage.json`: segunda medida, con controles de
  preservación de campos e identidad; referencia vigente.
- `dlq.normalize.jsonl` en ambos directorios: 1.807 líneas cada una, todos los
  rechazos son `UnmappedEvent` por combinación sin mapeador. La segunda DLQ ocupa
  3.599.185 bytes. No se publicaron en Kafka.
- `emulation-plan-day2.json` en ambos directorios: 24 filas técnicas de la hoja
  day2, obtenida siguiendo `workbook.xml` y sus relaciones; no se ejecutaron
  macros ni comandos del plan. Se excluye la columna de comandos del artefacto.

La cobertura es **normalización ejecutada offline y validación estructural**, no
una validación semántica exhaustiva de todos los campos OCSF ni una tasa de
detección. Al ser una cifra alta, se repitió la lectura y se verificó además:
264.122 `TargetObject`, 99.218 `SourceImage`, 99.218 `TargetImage`, 32.012
`ImageLoaded` y 581 `Image` se conservan en sus campos de destino; no hubo
discrepancias en los campos comprobados. Dos eventos de registro ya traen
`TargetObject` vacío: se anotan como limitación de origen. No se ha inferido que
los demás campos ni los PIDs estén semánticamente validados.

| Host real del JSON | Registros |
|---|---:|
| UTICA.dmevals.local | 480.297 |
| SCRANTON.dmevals.local | 66.419 |
| NASHUA.dmevals.local | 11.363 |
| NEWYORK.dmevals.local | 29.207 |

Estos son los nombres observados en Windows. No se han supuesto equivalencias
con los nombres de fichero de las capturas Zeek; se resolverán en T2.

### Tiempo

En los 587.286 eventos, la diferencia redondeada entre `@timestamp` y
`EventReceivedTime` es **+14.400.000 ms (+4 h)**. Se mantiene la cadena temporal
existente: `UtcTime` en 407.263 registros y `EventTime+tz` en 180.023. No se fuerza
una zona horaria supuesta sobre `EventTime` ni se cambia `ocsf_common.py`.

Rango de evento UTC: **2020-05-02 07:50:47.031–08:29:22.020**. En los 407.263
eventos comparables con `UtcTime`, 399.427 quedan a ≤1 s de `EventTime+tz` y
402.388 a ≤5 s; máximo absoluto 36.796 ms. Se documenta como diferencia de relojes
de evento/escritura, no como latencia de detección.

El orden del fichero retrocede en tiempo dentro de cada host: UTICA 65.746,
SCRANTON 1.415, NASHUA 157 y NEWYORK 8.966 retrocesos consecutivos. No se interpreta
el orden físico como orden de evento ni como reproducción apta para medir
latencia; la evaluación CEP debe conservar su ordenación por event-time. No se
ha reconciliado todavía el reloj de Zeek con este rango.

### Verdad conocida

El plan day2 confirma robo de credenciales (14.B, 16.D), elevación y persistencia
(14.A, 15.A) con descubrimiento, y movimiento lateral por WinRM a NEWYORK (16.C)
y SCRANTON (20.B). Esto permite proponer `p1_esperado=1`, `p2_esperado=1` y
`p3_esperado=1` como expectativas de **escenario**, sin prometer un número de
campañas ni una observabilidad completa.

Se generó una **propuesta de verdad parcial** para los 24 pasos, con 40 técnicas
activas comprobadas contra `data/cti/attack/enterprise-attack-19.2.json` y revisión
del [escenario 2 oficial de ATT&CK Evaluations](https://attackevals.github.io/ael/enterprise/apt29/emulation_plan/scenario_2/).
La fila propuesta está en `data/fa/20261107-day2-plan/verdad-day2-propuesta.csv`;
`truth-proposal.json` conserva hashes de XLSX/STIX, traducciones, decisiones y
limitaciones. **No se ha añadido aún al CSV existente ni cargado en ClickHouse.**

Correcciones con significado, no por similitud del número histórico:

- 13.B: el contexto de dominio corresponde a T1016, no a seguridad de software.
- 16.D: T1103 del XLSX es AppInit DLLs, ajeno al dump descrito; el procedimiento
  oficial sustenta T1003.001.
- T1043 está obsoleta: HTTPS en 443 no demuestra un puerto no estándar T1571.
- 20.B distingue generación de Golden Ticket y uso del ticket; no se introduce
  Kerberoasting. La cuenta se conserva como local según el comando sin `/domain`.
- La copia a OneDrive se representa como exfiltración; no implica por sí sola C2.

La hoja no proporciona marcas temporales por paso: se reconstruirán con
evidencia. Las expectativas son por escenario, no por cantidad de campañas ni
por éxito de cada comando. En concreto, **P2 excluye controladores de dominio**:
el salto planificado a NEWYORK puede no detectarse por diseño; el salto final a
SCRANTON es otra oportunidad, pendiente de comprobar. No se modifica el patrón
para forzar un resultado positivo.

## Protección de F3 y primer bloqueo

`detection/evaluation/fa_snapshot.py` prepara la foto de las filas `FINAL` de
`events`, `alerts`, `campaigns` y `verdad_datasets`, por IDs F3 congelados del CSV.
Guarda conteos, hashes SHA-256 globales y por dataset, SQL original, fecha UTC y
los seis resultados de `f3_cierre.sql`. Rechaza fotos incompletas o una verdad
que no cubra exactamente ese universo. Usa HTTP local con `readonly=1`, límite
de consulta 90 s y límite exterior de proceso 540 s.

**Matiz necesario:** `f3_cierre.sql` agrega todas las tablas. Añadir FA puede
cambiar su total global legítimamente. Se conserva ese resultado literal y se
calcula además la misma evaluación restringida a los IDs F3 congelados mediante
CTE, sin modificar el SQL original. La comparación exige iguales tanto las
filas protegidas como los resultados restringidos; el cambio del total ampliado
se informa aparte.

Javier aprobó exclusivamente este primer comando de lectura:

```bash
cd ~/proyectos/tfg-fa-datasets
timeout 540s python3 -I detection/evaluation/fa_snapshot.py capture --output data/fa/foto-f3-antes.json
```

El primer intento del coordinador falló con conexión rechazada en
127.0.0.1:8123. Tras autorización separada, comprobó que el contenedor
`clickhouse` estaba `Exited (255)` desde hacía unas 20 horas. Javier autorizó
después `docker start clickhouse` y repetir la captura: el contenedor arrancó y
la repetición **terminó correctamente**, sin cargar datasets.

Foto inicial: `data/fa/foto-f3-antes.json`, 92.369 bytes, fecha UTC
`2026-11-07T13:08:47.689931+00:00`.

| Universo congelado | Filas |
|---|---:|
| Dataset IDs F3 | 110 |
| Eventos | 530.401 |
| Alertas | 2.740 |
| Campañas | 55 |
| Verdad conocida | 110 |

Las seis consultas originales devolvieron 2, 3, 6, 22, 35 y 0 filas,
respectivamente; la comprobación de datasets sin verdad está vacía. **Hay foto
inicial válida; todavía no hay comparación antes/después**, porque no se ha
cargado ningún dataset FA. No se presenta la foto inicial como prueba de
invariancia tras una carga.

La inspección de estado posterior, también aprobada y realizada por el
coordinador, encontró Redpanda, JobManager y TaskManager de Flink parados desde
hacía unas 21 horas. No se arrancaron. El siguiente comando de servicio que
necesita aprobación separada es `docker start redpanda`; arrancarlo tampoco
autorizaría crear topics ni cargar datos automáticamente.

## Plan de carga pendiente de aprobación

`scripts/load_fa_corpus.sh --plan` **solo imprime comandos**, no los ejecuta.
Rechaza opciones de ejecución; no invoca Docker ni Python al generar el plan.
Propone topics/grupos exclusivos de la pasada `fa-day2-20261107`:

`raw.fa.<run>.host.windows` → `norm.fa.<run>.events` →
`det.fa.<run>.alerts`, con dos DLQ propias. El script imprime explícitamente
los **nueve comandos de creación**: esos cinco topics y los cuatro de CEP
(campañas y tres intermedios); no depende de la autocreación del broker.

Los jobs actuales ya admiten topics por parámetro. El plan nunca usa
`load_f3_corpus.sh`, nunca borra topics y sus sinks solo leen los topics FA.
No propone fusiones forzadas, DDL de tablas, borrados ni recargas de F3.
Cada ejecución de servicio necesitará aprobación individual. No se deben
repetir replay ni reutilizar grupos inadvertidamente.

Antes de ejecutarlo faltan: aprobación de la verdad day2 propuesta, auditoría
de consumidores activos y de los errores de entrega, y validación de los SQL
derivados en Flink. La primera versión del script **solo imprime el tramo
replay/normalización/detección/sinks y sus controles**. El CEP se propone aparte
en `data/fa/20261107-day2-plan/COMMANDS.md`; no se ejecutó ningún SQL. No se deben
lanzar los SQL originales contra los topics globales porque reprocesarían F3.

### CEP derivado sin cambiar los patrones

`fa_plan_day2.py` generó nueve SQL nuevos bajo `data/fa/20261107-day2-plan/sql/`:
los tres ficheros comunes y los dos pasos de flujo/emisión de cada patrón. Solo
se sustituyen propiedades `topic` y `properties.group.id`; se verifica que
revertirlas restaura exactamente el SQL original. Se eliminan comentarios de
línea completa para que no aparezcan ejemplos originales de borrado de topics.
`MANIFEST.json` conserva SHA-256 de cada fuente y salida, y cada sustitución.

Todos leen `norm.fa.fa-day2-20261107.events` o
`det.fa.fa-day2-20261107.alerts`, usan sus tres intermedios
`det.fa.fa-day2-20261107.p1_flujo`/`p2_flujo`/`p3_flujo` y emiten a
`det.fa.fa-day2-20261107.campaigns`. Habrá que crear estos cuatro topics
adicionales con tres particiones y retención ilimitada: sus comandos están
incluidos en `load_fa_corpus.sh --plan` y requieren aprobación individual.
No se creó ninguno. La copia a `/tmp/fa-day2-20261107` del contenedor y las seis
invocaciones de SQL Client están propuestas en `COMMANDS.md`, enlazado desde el
script de plan. Cada SQL Client lleva `timeout 540s`; si vence, habrá que revisar
si quedó un job de Flink activo antes de reintentar. No se asume que matar el
cliente cancele automáticamente un trabajo remoto.

Tras la emisión se usará `sink_campaigns --topic det.fa.fa-day2-20261107.campaigns`
con grupo propio, únicamente tras revisar resultados y aprobar su comando. Las
fuentes Kafka son acotadas en batch, igual que las originales; no equivale a
validación de latencia ni de tardíos en producción. No se ha cambiado la lógica
ni la semántica de evidencia/campaña v1, y la compatibilidad sintáctica real con
Flink sigue pendiente.

El normalizador existente particiona por identidad, cambio documentado en su
código; no se ha alterado esa decisión. El replay crudo conserva clave por host.
La compatibilidad con clave por host para la futura fuente Zeek se resolverá
en T2 sin tocar el comportamiento previo.

## Validación y ficheros nuevos

- Lectura íntegra del dataset y repetición verificada: 587.286 = 585.479 + 1.807;
  suma de los recuentos por canal/EventID igual al total.
- `python3 -I detection/evaluation/test_fa_snapshot.py`: **4 pruebas, todas pasan**;
  cubren las seis consultas restringidas, aliases con `FINAL`, cambio protegido
  que detiene la comparación y rechazo de fotos incompletas.
- `bash -n scripts/load_fa_corpus.sh` y generación `--plan`: correctos, sin
  conexiones con servicios.
- `python3 -I detection/evaluation/test_fa_plan_day2.py`: **4 pruebas, todas pasan**;
  verifican reversibilidad semántica de nueve SQL, aislamiento de todos los
  conectores/rechazo de topics imprevistos, verdad contra pasos XLSX/STIX activo
  y límites de tiempo de las seis invocaciones CEP propuestas.
- No se han ejecutado pruebas de integración, Sigma, Flink ni ClickHouse con day2.

Ficheros nuevos de código/documentación (todos en el worktree):

- `detection/evaluation/fa_prepare_day2.py`.
- `detection/evaluation/fa_snapshot.py`.
- `detection/evaluation/test_fa_snapshot.py`.
- `detection/evaluation/fa_plan_day2.py`.
- `detection/evaluation/test_fa_plan_day2.py`.
- `scripts/load_fa_corpus.sh`.
- `docs/encargos/notas-datasets-fa.md`.

Para repetir solo la inspección en otro directorio nuevo, sin extraer de nuevo:

```bash
timeout 540s python3 -I detection/evaluation/fa_prepare_day2.py --inspect-existing --output data/fa/day2-otra-verificacion
```

## T2: Zeek conn/DNS de ambos días, preparación offline

Fuentes elegidas: únicamente los `.log` de `individual_zeek_logs` que terminan
en `_conn` y `_dns`. No se mezcla `combined_zeek.log`. La deduplicación compara
JSON íntegro canónico; preservaría todas las referencias de registros idénticos.
Se midieron **cero duplicados exactos** entre los individuales seleccionados.

| Dataset | conn | dns | Total / normalizados offline | DLQ |
|---|---:|---:|---:|---:|
| ZEEK-APT29-DAY1 | 613 | 53 | 666 / 666 | 0 |
| ZEEK-APT29-DAY2 | 1.172 | 250 | 1.422 / 1.422 | 0 |

Replays ordenados por `ts` bajo `data/fa/20261107-zeek-ready/`, con hashes de
entrada/salida, cobertura y rangos en `MANIFEST.json`:

- `ZEEK-APT29-DAY1.jsonl`: 528.792 bytes; SHA-256
  `378c7dd106095c43194ccbe17aec4b8b7cd50c3230764c49d224ff32e46c681e`.
- `ZEEK-APT29-DAY2.jsonl`: 1.119.995 bytes; SHA-256
  `f9247e743091ba13c296511a3f0dd59a361badf67fa117c83a82686aaab3aeff`.

Los objetos llevan `_tfg_input_format=zeek`, `Hostname` como **etiqueta de
captura**, referencias de archivo/línea y registro original. Esa etiqueta no
acredita el hostname del endpoint ni la ubicación geográfica. Las IP origen y
destino se conservan aparte. El `@system` original sigue en `unmapped.zeek`.

Nuevo `pipeline/normalize/zeek.py`: `conn` → 4001 y `dns` → 4003. Un informe conn
es **Traffic (actividad 6)**; no finge un Open al primer paquete. DNS con
respuesta también es Traffic; sin respuesta, Query. Se contrastaron estas
actividades con los esquemas oficiales OCSF 1.5.0 de
[Network Activity](https://raw.githubusercontent.com/ocsf/ocsf-schema/v1.5.0/events/network/network_activity.json)
y [DNS Activity](https://raw.githubusercontent.com/ocsf/ocsf-schema/v1.5.0/events/network/dns_activity.json).
`traffic.bytes_missed` está definido en
[Network Traffic](https://raw.githubusercontent.com/ocsf/ocsf-schema/v1.5.0/objects/network_traffic.json).
No se inventa el tipo individual de respuestas DNS que mezclan CNAME/A; Zeek
no lo proporciona por cada respuesta en estos JSON. Todo el registro de origen,
incluyendo campos nuevos, se conserva en `unmapped`.

### Relojes y límites del cruce P2

Rangos de los individuales seleccionados:

- Day1: **2020-04-30 00:06:38.899–00:45:00.760 UTC**.
- Day2: **2020-05-01 07:02:02.186–07:34:21.415 UTC**.

No son simultáneos con los rangos Windows. No se aplicó un desplazamiento
arbitrario ni se presentaron coincidencias de IP/topología como confirmación
temporal de una arista P2. El coordinador comprobó que cambiar a conn/DNS de
`combined_zeek.log` no resuelve esa diferencia. El análisis final del cruce
host–red se realiza aparte, distinguiendo topología, calendario y observabilidad.

Primer intento de preparación: falló al convertir la ruta de salida a relativa
porque `resolve()` seguía el enlace `data/` al repositorio principal. Se corrigió
por `absolute()`, se repitió con éxito en `20261107-zeek-ready` y se eliminaron
explícitamente los tres ficheros parciales propios del intento fallido. No se
tocó ninguna fuente original.

## T3a: adaptador y preparación del piloto COMISET

Nuevo `pipeline/normalize/comiset.py`: adapta `_source` a las claves que esperan
los mapeadores Windows existentes, sin duplicarlos ni modificarlos. Incluye
`process_path`, `target_process_path`, PIDs, padre, usuario y reconstrucción de
hashes; conserva claves canónicas ya presentes. Usa `event_original_time` con
zona explícita, convertido a `TimeCreated` UTC, no el tiempo de procesamiento
del colector. Conserva `_id`, `_index`, fuente íntegra, host original, ordinal
original y partición/línea del piloto en `unmapped`.

El nuevo `fa_registry.py` despacha por `_tfg_input_format`; la ruta sin formato
nuevo sigue usando el registro Windows intacto. Los replays usan como host el
identificador seudonimizado de carpeta; no se unen los dos días/hosts en una
campaña.

| Dataset | Entrada | Normalizado offline | DLQ |
|---|---:|---:|---:|
| COMISET-REAL-v1-host-cc0b85ecf680 | 99.749 | 99.749 | 0 |
| COMISET-REAL-v1-host-c836c0609374 | 251 | 0 | 251 |

Los 251 rechazos son exclusivamente TaskScheduler, WMI y CodeIntegrity, todos
sin mapeador y con su motivo conservado. El replay **incluye también los 251**
para que la DLQ de la ejecución real contabilice el mismo universo. La cobertura
de pares soportados es 99.749/99.749 = 100 %; no implica cobertura del segundo
host. La global es 99,749 %. No hubo identidades repetidas ni diferencias de
tiempo en la preparación medida.

`data/fa/20261107-comiset-v1-ready/` contiene `MANIFEST.json`, DLQ local y:

- `COMISET-REAL-v1-host-cc0b85ecf680.jsonl`: 485.504.444 bytes; SHA-256
  `eeccdc431cb5e66ff171bbcdb57158f0b2d5f4de3280ec4fb0232a78ede1aca5`.
- `COMISET-REAL-v1-host-c836c0609374.jsonl`: 614.860 bytes; SHA-256
  `a4271e910c7ac5dd477508c52c091bf1320e648d5b4dc2b16249e72f17ef3933`.

Ordenación SQLite con caché de 16 MiB y almacenamiento temporal en disco; la
base temporal se elimina al terminar. Duración medida: **29,594 s**. Se
mantienen índices de referencias e identidades del piloto; no se ha medido pico
RSS ni se afirma que el proceso entero use solo 16 MiB. No se toca el ZIP REAL.

### Auditoría de campos para evitar falsas tasas de falsas alarmas

`fa_audit_comiset.py` inspecciona los `event.get(...)` de los mapeadores reales
para los EventID presentes: **44 pares EventID/campo**. Se releen los 100.000
registros y se comprueban esos 44 pares también en sus destinos OCSF, incluyendo
PIDs, usuario, hashes y firma: **cero discrepancias y cero campos nativos
alterados**. Informe vigente:
`data/fa/20261107-comiset-v1-audit-complete/REPORT.json`.

Las ausencias ya vienen de origen: `Details` en 25 Sysmon 12, y `NewName` en
25 Sysmon 12 y 17 Sysmon 13; corresponden a creación/valor de clave y no a
renombrado. SourceImage/TargetImage/PIDs de los 99.358 Sysmon 10 se rellenan
desde aliases estructurados; GrantedAccess/CallTrace y TargetObject/TargetFilename/
ImageLoaded estaban en claves nativas y se preservan. No se ejecuta ni se
interpreta como código `event_original_message`.

La auditoría prueba preservación de lo usado por estos mapeadores, no una
validación exhaustiva de OCSF ni de ausencia de ataques. REAL es actividad
considerada normal por el editor; las alertas/campañas serán **candidatas a
falsas alarmas** hasta revisión. El piloto no representa horas completas:

- host-cc0b85ecf680: 2022-06-27 06:52:32.850–06:58:45.844 UTC,
  **372,994 s (0,103609444 h)**.
- host-c836c0609374: 2022-07-01 05:46:10.020–05:52:40.479 UTC,
  **390,459 s (0,108460833 h)**, sin canales normalizados: no se atribuye un
  resultado de detección benigno satisfactorio a ese host.

Tasas por host-hora deben explicitar ese denominador observado y su sesgo; no
se divide por dos horas ni por un intervalo que una los dos días. La medición
Sigma/CEP real y las comparaciones F3 corresponden al coordinador.

### Pruebas y reproducción de T2/T3a

`python3 -I pipeline/normalize/test_fa_adapters.py`: **8 pruebas, todas pasan**.
Cubren conn/DNS, tiempos/identidad, IP/puerto/tipo inválidos, aliases COMISET,
zona explícita, hashes/firma, conservación de fuente, rechazo explicado y
regresión de la ruta Windows original. Preparación y auditoría reproducibles
en directorios **nuevos**:

```bash
timeout 540s python3 -I detection/evaluation/fa_prepare_sources.py zeek --output data/fa/zeek-otra-preparacion
timeout 540s python3 -I detection/evaluation/fa_prepare_sources.py comiset --output data/fa/comiset-otra-preparacion
timeout 540s python3 -I detection/evaluation/fa_audit_comiset.py --output data/fa/comiset-otra-auditoria
```

Código nuevo de esta ampliación: `pipeline/normalize/{zeek.py,comiset.py,
fa_registry.py,test_fa_adapters.py}` y
`detection/evaluation/{fa_prepare_sources.py,fa_audit_comiset.py}`. No se escribió
un job de servicios paralelo: `fa_job.py` y la carga los lleva el coordinador.

## Propuesta para ROADMAP y bitácora

**2026-11-07 — FA.2, preparación offline de APT29 day2 (avance parcial).**
Se creó worktree aislado `fa-datasets` con datos y entorno compartidos mediante
enlaces ignorados. Se extrajo y verificó el JSON Windows de day2: 1.714.987.031
bytes, 587.286 registros. Los normalizadores actuales procesan offline 585.479
(99,6923 % de cobertura estructural); 1.807 rechazos sin mapeador quedan
conservados con motivo. Se verificaron identidad, selección temporal y campos
representativos, y se documentaron los cuatro hosts y el desorden temporal del
origen. Se leyó el plan day2 como XML, sin ejecutar macros, y se propuso verdad
parcial con 40 técnicas activas y expectativas P1/P2/P3 sustentadas en el plan.
Se prepararon controles de invariancia F3 y plan de carga con topics aislados,
sin modificar patrones, reglas ni normalizadores existentes. La captura inicial
falló por estar ClickHouse parado; tras autorización de Javier, se arrancó ese
contenedor y se obtuvo foto válida de 110 datasets, 530.401 eventos, 2.740 alertas
y 55 campañas. Se derivaron nueve SQL CEP cambiando solo topics y grupos; las
pruebas offline pasan, pero no se ejecutaron en Flink. No se cargaron datasets,
no hay comparación antes/después y no se cierra FA.2. Quedan aprobación de
verdad/carga, detección, campañas y evaluación P1/P2/P3.

**Ampliación de la preparación — FA.1 y FA.3:** se añadieron mapeador Zeek y
adaptador COMISET separados, con ruta Windows previa intacta y ocho pruebas de
regresión satisfactorias. Se prepararon 2.088 eventos conn/DNS de los dos días
sin mezclar combined/individuales y 100.000 registros del piloto COMISET,
ordenados por tiempo y con procedencia. Zeek normaliza offline todos; COMISET
normaliza 99.749 y conserva 251 rechazos de canales no soportados. Se auditaron
44 pares EventID/campo del piloto sin pérdidas de valores comprobados. Las
cargas, Sigma/CEP y la comparación F3 de cada conjunto las completa el
coordinador; estos resultados offline no cierran esas tareas. La diferencia
entre relojes de red y host impide afirmar confirmación temporal de P2 sin una
reconciliación sustentada. No se amplió REAL ni se usó LAB.

## Resultados de las cargas (cierre del encargo)

*Escrito por el agente coordinador el 2026-11-07, tras quedarse sin uso el agente de FA. Cifras
verificadas de nuevo en ClickHouse y Redpanda.*

Con la autorización de Javier para completar F1–F3, las tres cargas se hicieron con
`scripts/load_fa_corpus.sh --execute`. Cada una tiene sus propios topics y grupos y deja una
comprobación de invariancia de F3 antes y después. **En las tres, `f3_unchanged: true` y sin
diferencias.** Solo cambia el total global, que es lo esperado al añadir datasets.

| Dataset | Eventos | DLQ | Alertas | Campañas |
|---|---:|---:|---:|---:|
| SDWIN-200502035409 (APT29 day2) | 585.479 | 1.807 | 290 | 5 (P1 3, P2 1, P3 1) |
| ZEEK-APT29-DAY1 / DAY2 | 666 / 1.422 | 0 | 0 | 0 |
| COMISET-REAL-v1-host-cc0b85ecf680 | 99.749 | 0 | 3 | 0 |
| COMISET-REAL-v1-host-c836c0609374 | 0 | 251 | 0 | 0 |

- **Day2, reconciliación:** 297 publicaciones de alertas, que se quedan en 290 distintas. Las 7 republicaciones están identificadas y deduplicadas por identidad.
- **Verdad conocida:** las 5 filas nuevas se añadieron a `verdad_datasets.csv` sin tocar las 110 originales (SHA de las originales en `data/fa/truth-csv-append.json`) y se cargaron en ClickHouse. La de day2 es **parcial** (40 técnicas, del plan y del escenario 2 revisado). **Javier aún tiene que revisarla.**
- **COMISET:** el job de normalización falló al cerrar, al confirmar offsets de particiones vacías, después de publicar los 100.000 registros (99.749 + 251; el retardo de consumo es 0). Se corrigió solo para FA en `pipeline/normalize/fa_consumer.py`, con test. El job de F3 no cambia.

### Day2: campañas frente a la verdad

| Campaña | Evidencia | Lectura |
|---|---|---|
| P1 UTICA 07:59 (conf. 0,50) | Ejecución de Mimikatz (Security 4688 + Sysmon 1, misma ejecución) | Verdadera (14.B) |
| P1 NEWYORK 08:04 (0,75) | Mimikatz + acceso a LSASS desde `m.exe` | Verdadera (16.D) |
| P1 UTICA 08:12 (0,65) | `wininit.exe` y `csrss.exe` acceden a LSASS | **Falsa**: el ruido ya identificado en la revisión de F3 |
| P2 UTICA → SCRANTON 08:18–08:21 (0,75) | WinRM + ejecución remota | Verdadera (20.B) |
| P3 UTICA 07:56 (0,65) | Elusión de UAC (T1548.002) | Verdadera (14.A) |

- **Precisión por campaña en day2: 4/5 = 0,80.** Los tres patrones esperados aparecen.
- El salto planificado a NEWYORK (16.C) no se detecta **por diseño**: en day2, NEWYORK es el controlador de dominio (10.0.0.4) y P2 los excluye. No se cambió el patrón.
- Las cifras oficiales de F3 (55 campañas, precisión 0,69) no cambian: day2 se informa aparte, como validación.

### Zeek: cruce con P2

`detection/evaluation/fa_cross_zeek_p2.py` (solo lectura, sin desplazar relojes; salida en `data/fa/20261107-ZEEK-P2-CROSS.json`):

| | Aristas P2 | Coinciden en topología (IP y puerto destino) | Coinciden en 4 valores, sin mirar la hora | Con apoyo temporal |
|---|---:|---:|---:|---:|
| Day1 | 17 | 17 | 0 | 0 |
| Day2 | 8 | 8 | 0 | 0 |

- Los registros de Zeek son unas **51 h (day1) y 25 h (day2) anteriores** al rango de Windows, y no coincide ni un solo puerto de origen. **Los logs de Zeek de OTRF corresponden a otra ejecución de la emulación**, no a la capturada en los logs de host.
- Sirven para la topología, no para confirmar aristas. No se forzó ningún desplazamiento.
- Zeek tiene 0 alertas **por construcción**: el despliegue de Sigma solo carga categorías de Windows. No es un resultado de detección.

### COMISET: falsas alarmas en el piloto

- El host con canales soportados cubre solo **6 min 13 s** de actividad normal, no una hora.
- **3 alertas, todas candidatas a falsa alarma:** «Removal Of SD Value to Hide Schedule Task» (2) y «Removal Of Index Value to Hide Schedule Task» (1), sin ninguna campaña. Sobre ese denominador son unas 29 alertas por host-hora, pero **con una muestra de 6 minutos de un solo host la tasa no es representativa**. Hace falta la v2.
- El segundo host solo trae canales sin mapeador: no cuenta como resultado de detección.

### Limitación del evaluador Sigma encontrada

`test_fa_runtime.py` deja como fallo esperado (`expectedFailure`) una limitación del evaluador
vigente: una búsqueda por palabra clave combinada con un campo no se evalúa como subcadena, lo que
afecta, por ejemplo, a `win_wmi_persistence.yml`. No se cambió ni el evaluador ni la regla; queda
como mejora para el ajuste v2.

### Pendiente

- Javier: revisar la verdad de day2 y la clasificación de las campañas.
- COMISET v2 (1–2 M registros, estratificada) y LAB, con aprobación.
- Ajuste v2 de F3: filtro de `wininit`/`csrss` en P1, evaluador de palabras clave.
- Igualar la clave de partición de FA con la de F3 si se van a comparar latencias o el orden de llegada. Para las campañas no afecta, porque los temas intermedios se reordenan por tiempo de evento.
