/**
 * Las cifras **documentadas** del corpus reproducible de F3, en un solo sitio.
 *
 * Todo lo que el portal enseña como «documentado» sale de aquí, y cada cifra lleva la referencia de dónde está
 * escrita (entrada de `BITACORA.md` en `tfg-memoria`, `docs/scenarios/apt29-day1.md` o un fichero del repo). Así los
 * cuadros, la página de situación y el grafo no pueden contradecirse entre sí, y `corpus.test.ts` comprueba que las
 * sumas cuadran igual que se comprobaron en la bitácora (1.184 alertas = suma por dataset, 20.093 = suma de la DLQ…).
 *
 * No es un sustituto de la API: son las cifras del 15-09-2026. Cuando haya backend, estas mismas cifras deben salir
 * de ClickHouse, y este fichero pasa a ser el oráculo de la primera prueba de integración.
 */

export const REF = {
  identidad: 'BITÁCORA 08-09-2026',
  esquemaRed: 'BITÁCORA 08-09-2026 (2)',
  p2: 'BITÁCORA 11-09-2026',
  tiempo: 'BITÁCORA 11-09-2026 (2)',
  recarga: 'BITÁCORA 11-09-2026 (3)',
  alertas741: 'BITÁCORA 14-09-2026',
  p2Revalidado: 'BITÁCORA 14-09-2026 (2)',
  p1Revalidado: 'BITÁCORA 15-09-2026',
  ventanas: 'docs/scenarios/apt29-day1.md §4 (15-09-2026)',
  escenario: 'docs/scenarios/apt29-day1.md §1 y §3',
  topics: 'scripts/load_f3_corpus.sh + infra/flink/jobs/p1_05_emision.sql',
  flink: 'infra/docker-compose.yml',
  f2Apt29: 'BITÁCORA 27-07-2026 (F2: resultados de apt29 day1)',
  lineaBase: 'Memoria, desarrollo.tex (línea base de F2: regla + host + 10 min) · BITÁCORA 31-07-2026',
  etiquetas: 'BITÁCORA 11-09-2026 (punto ciego del etiquetado ATT&CK)',
  laboratorio: 'BITÁCORA 30-07-2026 (cierre del dataset)',
  alertasDay1: 'eval/portal/alertas-apt29-day1.jsonl (exportación del 21-10-2026)',
  aristasP2: 'eval/portal/aristas-p2.jsonl (exportación del 21-10-2026)',
  p1Campanas: 'eval/portal/p1-campanas.jsonl (vista tfg.p1_campanas, 21-10-2026)',
  p2Campanas: 'eval/portal/p2-campanas.jsonl (vista tfg.p2_campanas, 21-10-2026)',
  tecnicasActuales: 'eval/portal/tecnicas-observadas.jsonl (corpus actual, 21-10-2026)',
  catalogo: 'eval/portal/attack-catalogo-v19.json (MITRE ATT&CK Enterprise v19)',
  t1685: 'BITÁCORA 21-10-2026 (2): T1685 verificado en ATT&CK v19',
  evaluador: 'BITÁCORA 26-07-2026 · memoria, tabla de optimización',
  ml1: 'ml/anomaly/resultados.json · BITÁCORA 27-07-2026 (4)',
  mlflow: 'BITÁCORA 28-07-2026',
  cobertura: 'eval/attack-coverage/*.json · BITÁCORA 28-07-2026',
  p1Batch: 'BITÁCORA 31-07-2026',
  p1Flink: 'BITÁCORA 31-07-2026 (2)',
  reconciliacion: 'BITÁCORA 31-07-2026 (3)',
  escenarioActores: 'docs/scenarios/apt29-day1.md §1',
  escenarioLectura: 'docs/scenarios/apt29-day1.md §3',
  bloqueP1: 'docs/scenarios/apt29-day1.md §4 (bloque de P1, alerta a alerta)',
  p1Sql: 'detection/patterns/p1_credential_theft.sql',
  p2Sql: 'detection/patterns/p2_lateral_movement.sql',
} as const

/** Recarga del corpus del 11-09 (verificada contra el origen) y detección del 14-09. */
export const CORPUS = {
  lineasConsumidas: 550_494,
  eventosNormalizados: 530_401,
  eventosDlq: 20_093,
  /** Todas las de la DLQ son `UnmappedEvent`: el normalizador no lanzó ni una excepción. */
  excepcionesNormalizador: 0,
  alertas: 1_184,
  /** Publicadas por las seis instancias; las 32 de más son republicaciones que absorbe `ReplacingMergeTree`. */
  alertasPublicadas: 1_216,
  campanasP1: 11,
  campanasP2: 1,
  /** 1 − campañas / alertas individuales, con alertas distintas (sin el doble conteo del 15-09). */
  ratioReduccion: 0.991,
  alertasAbsorbidas: 1_164,
  alertasContadasDosVeces: 22,
  /** Sobre el corpus anterior a la recarga (316 de 1.168). */
  alertasSinEtiquetaPct: 27.1,
} as const

export interface Dataset {
  id: string
  descripcion: string
  /** `null` cuando la bitácora da el total pero no el reparto por dataset. */
  eventos: number | null
  alertas: number
}

/**
 * Los nueve datasets. Las alertas por dataset son las de la tabla del 14-09. Los eventos de las campañas LSASS se
 * dan en la bitácora como lista (57.054 / 56.017 / … / 37.085) sin decir cuál es cuál: se dejan sin asignar en vez
 * de adivinar el orden. Su suma sí es conocida: 530.401 − 194.829 − 184 = 335.388.
 */
export const DATASETS: readonly Dataset[] = [
  { id: 'SDWIN-200501225525', descripcion: 'APT29 day1 (MITRE Evals)', eventos: 194_829, alertas: 741 },
  { id: 'LSASS_campaign_01', descripcion: 'Metasploit · logonpasswords', eventos: null, alertas: 134 },
  { id: 'LSASS_campaign_02', descripcion: 'Metasploit · procdump', eventos: null, alertas: 70 },
  { id: 'LSASS_campaign_03', descripcion: 'Metasploit · comsvcs', eventos: null, alertas: 82 },
  { id: 'LSASS_campaign_04', descripcion: 'Metasploit · Out-Minidump', eventos: null, alertas: 45 },
  { id: 'LSASS_campaign_05', descripcion: 'Metasploit · SharpDump', eventos: null, alertas: 46 },
  { id: 'LSASS_campaign_06', descripcion: 'Metasploit · Outflank-Dumpert', eventos: null, alertas: 21 },
  { id: 'LSASS_campaign_07', descripcion: 'Metasploit · nanodump', eventos: null, alertas: 35 },
  { id: 'SDWIN-201018195009', descripcion: 'Atómico de referencia (LSASS)', eventos: 184, alertas: 10 },
]

export const EVENTOS_LSASS_SIN_REPARTO = 335_388

/** APT29 day1: el dataset con la campaña real completa. */
export const DAY1 = {
  lineas: 196_081,
  eventos: 194_829,
  alertas: 741,
  /** 194.829 / 196.081 (el 0,6 % restante es cola larga de tipos sin mapear). */
  coberturaPct: 99.36,
  /** P1 en day1: SCRANTON ×2 y NASHUA. */
  campanasP1: 3,
  campanasP2: 1,
  /** Origen de la marca de tiempo tras la corrección del 11-09. */
  tiempoUtcTimePct: 73.4,
  tiempoEventTimePct: 26.6,
  conexionesSysmon3: 1_229,
  /** Campaña completa en SCRANTON y NASHUA: 02:56:14 † → 03:22:41,798 (escenario §4, 15-09; comprobado con la exportación del 21-10). */
  duracionS: 1_587,
  /** La regla que más dispara: una sola acción del atacante, un fichero por alerta (BITÁCORA 27-07; 292 en la exportación del 21-10). */
  reglaDominante: { titulo: 'Potential Binary Or Script Dropper Via PowerShell', alertas: 292 },
} as const

/** Tipos de evento que caen a `dlq.normalize` (11-09): la lista de trabajo para ampliar el normalizador. */
export const DLQ_POR_TIPO: readonly { tipo: string; eventos: number }[] = [
  { tipo: 'PowerShell operacional', eventos: 10_285 },
  { tipo: 'Security 5379', eventos: 4_146 },
  { tipo: 'Sysmon 22 (consulta DNS)', eventos: 1_502 },
  { tipo: 'Application 1001', eventos: 897 },
  { tipo: 'Sysmon 28', eventos: 614 },
  { tipo: 'Sysmon 17', eventos: 426 },
  { tipo: 'Sysmon 26', eventos: 375 },
  { tipo: 'Resto de tipos', eventos: 1_848 },
]

/** Topics con sus particiones, tal como los crea el cargador del corpus (y `det.campaigns`, el job de emisión de P1). */
export const TOPICS: readonly { nombre: string; particiones: number; mensajes: number | null }[] = [
  { nombre: 'raw.host.windows', particiones: 3, mensajes: CORPUS.lineasConsumidas },
  { nombre: 'norm.events', particiones: 6, mensajes: CORPUS.eventosNormalizados },
  { nombre: 'det.alerts', particiones: 3, mensajes: CORPUS.alertasPublicadas },
  { nombre: 'det.campaigns', particiones: 3, mensajes: null },
  { nombre: 'dlq.normalize', particiones: 1, mensajes: CORPUS.eventosDlq },
  { nombre: 'dlq.detect', particiones: 1, mensajes: null },
]

/** Flink en el docker compose: un TaskManager con `taskmanager.numberOfTaskSlots: 4`. */
export const FLINK = { taskManagers: 1, slots: 4 } as const

/** Primera alerta por táctica y host en day1, con hora del evento (escenario §4). `†` = resolución de segundo. */
export const CRONOLOGIA_DAY1: readonly { tactica: string; host: string; alertas: number; primera: string; duracionMin: number }[] = [
  { tactica: 'execution', host: 'SCRANTON', alertas: 174, primera: '02:56:14 †', duracionMin: 25.2 },
  { tactica: 'persistence', host: 'SCRANTON', alertas: 322, primera: '02:57:18', duracionMin: 22.5 },
  { tactica: 'defense-impairment', host: 'SCRANTON', alertas: 175, primera: '02:57:18', duracionMin: 24.9 },
  { tactica: 'privilege-escalation', host: 'SCRANTON', alertas: 28, primera: '02:58:30', duracionMin: 22.5 },
  { tactica: 'stealth', host: 'SCRANTON', alertas: 22, primera: '02:58:44', duracionMin: 22.8 },
  { tactica: 'impact', host: 'NASHUA', alertas: 3, primera: '02:59:37', duracionMin: 16.7 },
  { tactica: 'credential-access', host: 'SCRANTON', alertas: 7, primera: '03:00:29', duracionMin: 18.8 },
  { tactica: 'resource-development', host: 'SCRANTON', alertas: 25, primera: '03:02:04', duracionMin: 12.6 },
  { tactica: 'exfiltration', host: 'SCRANTON', alertas: 10, primera: '03:08:50 †', duracionMin: 1.6 },
  { tactica: 'execution', host: 'NASHUA', alertas: 19, primera: '03:09:23 †', duracionMin: 13.3 },
  { tactica: 'lateral-movement', host: 'NASHUA', alertas: 4, primera: '03:09:23 †', duracionMin: 0.1 },
  { tactica: 'credential-access', host: 'NASHUA', alertas: 1, primera: '03:09:29', duracionMin: 0 },
  { tactica: 'defense-impairment', host: 'NASHUA', alertas: 76, primera: '03:09:29', duracionMin: 13 },
  { tactica: 'privilege-escalation', host: 'NASHUA', alertas: 5, primera: '03:14:17', duracionMin: 8.4 },
  { tactica: 'persistence', host: 'NASHUA', alertas: 4, primera: '03:14:17', duracionMin: 0 },
  { tactica: 'stealth', host: 'NASHUA', alertas: 2, primera: '03:14:19', duracionMin: 0 },
  { tactica: 'collection', host: 'NASHUA', alertas: 4, primera: '03:16:19 †', duracionMin: 0 },
  { tactica: 'resource-development', host: 'NASHUA', alertas: 9, primera: '03:16:52', duracionMin: 0.8 },
  { tactica: 'lateral-movement', host: 'SCRANTON', alertas: 2, primera: '03:19:14 †', duracionMin: 0 },
  { tactica: 'discovery', host: 'SCRANTON', alertas: 2, primera: '03:19:17 †', duracionMin: 0 },
  { tactica: 'command-and-control', host: 'SCRANTON', alertas: 2, primera: '03:21:29 †', duracionMin: 0 },
]

/** P2, movimiento lateral: la campaña SCRANTON → NASHUA revalidada el 14-09. */
export const P2 = {
  origen: 'SCRANTON.dmevals.local',
  destino: 'NASHUA.dmevals.local',
  aristas: 17,
  primera: '03:09:23.801',
  ultima: '03:17:59.493',
  duracionS: 516,
  alertasAbsorbidas: 115,
  confianza: 1,
  /** Conexiones de administración remota en day1 tras excluir loopback; 17 de ellas son de ataque. */
  conexionesLaterales: 39,
  porPuerto: [
    { servicio: 'SMB', puerto: 445, conexiones: 8 },
    { servicio: 'RPC / DCOM', puerto: 135, conexiones: 5 },
    { servicio: 'WinRM', puerto: 5985, conexiones: 4 },
  ],
  /** Evidencia en el destino por clase. NO son disjuntas: 4 + 4 + 1 = 9 sobre 8 alertas distintas. */
  evidencia: [
    { clase: 'Ejecución remota', alertas: 4 },
    { clase: 'Servicio', alertas: 4 },
    { clase: 'Credenciales', alertas: 1 },
  ],
  procesos: ['powershell.exe', 'PsExec64.exe', 'System'],
  usuario: 'DMEVALS\\pbeesly',
} as const

/** Mapa IP → host derivado de las conexiones salientes (votos sin rivales tras corregir la regla, 11-09). */
export const MAPA_IP: readonly { host: string; ip: string; rol: string; votos: number }[] = [
  { host: 'NEWYORK', ip: '10.0.0.4', rol: 'Controlador de dominio', votos: 80 },
  { host: 'SCRANTON', ip: '10.0.1.4', rol: 'Origen del salto', votos: 126 },
  { host: 'NASHUA', ip: '10.0.1.6', rol: 'Destino del salto', votos: 408 },
  { host: 'UTICA', ip: '10.0.1.5', rol: 'Máquina del dominio, no es objetivo en day1', votos: 16 },
]

export interface Campana {
  id: string
  patron: 'P1' | 'P2'
  dataset: string
  hosts: string
  /** Hora del evento (UTC del dataset); `null` si no está documentada. */
  inicio: string | null
  fin: string | null
  alertas: number
  nota?: string
}

/**
 * Las doce campañas del oráculo en batch (11 de P1 + 1 de P2). Las alertas de NASHUA en P1 se derivan de la
 * bitácora del 15-09: day1 sumaba 743 = 512 + 116 + NASHUA, luego NASHUA = 115. Las LSASS y el atómico absorben todas
 * las alertas de su dataset: 1.164 − 721 (day1) = 443 = 433 (LSASS) + 10 (atómico). Sus horas no están documentadas.
 */
export const CAMPANAS: readonly Campana[] = [
  { id: 'p1-scranton-1', patron: 'P1', dataset: 'SDWIN-200501225525', hosts: 'SCRANTON', inicio: '02:56:14', fin: '03:14:42', alertas: 512, nota: 'Se solapa con la segunda: 22 alertas en ambas' },
  { id: 'p1-nashua', patron: 'P1', dataset: 'SDWIN-200501225525', hosts: 'NASHUA', inicio: '02:59:37', fin: null, alertas: 115, nota: 'Arranca con 3 alertas de impact aún sin explicar' },
  { id: 'p1-scranton-2', patron: 'P1', dataset: 'SDWIN-200501225525', hosts: 'SCRANTON', inicio: '03:10:22', fin: '03:22:12', alertas: 116 },
  { id: 'p2-scranton-nashua', patron: 'P2', dataset: 'SDWIN-200501225525', hosts: 'SCRANTON → NASHUA', inicio: '03:09:23', fin: '03:17:59', alertas: 115, nota: '17 aristas, confianza 1,0' },
  ...DATASETS.filter((d) => d.id.startsWith('LSASS') || d.id === 'SDWIN-201018195009').map((d) => ({
    id: `p1-${d.id.toLowerCase()}`,
    patron: 'P1' as const,
    dataset: d.id,
    hosts: '—',
    inicio: null,
    fin: null,
    alertas: d.alertas,
    nota: d.descripcion,
  })),
]

/* ---------------------------------------------------------------------------------------------------------------
 * Añadido el 21-10-2026 para el explorador del grafo de ataque, la línea temporal y los incidentes. Mismo criterio:
 * solo lo que está escrito, con su referencia. Lo que no está documentado se deja fuera (o a `null`) en vez de
 * deducirlo.
 * ------------------------------------------------------------------------------------------------------------- */

/**
 * Resolución de una hora del dataset (UTC, 2020-05-02):
 *   - `ms`: hora del evento con milisegundos (Sysmon);
 *   - `segundo`: el documento la da al segundo aunque el evento tuviera milisegundos (tabla del escenario §4);
 *   - `reconstruida`: la marcada con † en el escenario: hora reconstruida con `EventTime` + desfase, con resolución
 *     de segundo de verdad (eventos de Security y PowerShell). No se puede ordenar con precisión dentro del segundo.
 */
export type Resolucion = 'ms' | 'segundo' | 'reconstruida'

export interface HoraDataset {
  /** `HH:MM:SS` o `HH:MM:SS.mmm`, UTC del dataset. */
  hora: string
  resolucion: Resolucion
}

export type NivelRegla = 'critical' | 'high' | 'medium' | 'low' | 'informational'

export interface AlertaDocumentada {
  id: string
  hora: HoraDataset
  regla: string
  nivel: NivelRegla
  /** Técnicas tal como las etiqueta la regla (`technique_ids[]` del esquema de alerta). */
  tecnicas: string[]
  host: string
  /** Alertas distintas en esa misma línea (dos eventos en el mismo milisegundo cuentan 2). */
  veces: number
  /** Campaña P1 en la que es evidencia, si lo es. */
  campana?: string
  nota?: string
  fuente: string
}

/**
 * El bloque de P1 de apt29 day1, alerta a alerta, con la hora del evento (escenario §4, recalculado el 15-09).
 * Los títulos de regla van como los escribe la bitácora (el escenario los abrevia en su tabla).
 */
export const BLOQUE_P1: readonly AlertaDocumentada[] = [
  {
    id: 'al-0300-drop',
    hora: { hora: '03:00:29.705', resolucion: 'ms' },
    regla: 'Cred Dump Tools Dropped Files',
    nivel: 'high',
    tecnicas: ['T1003.001', 'T1003.002', 'T1003.003', 'T1003.004', 'T1003.005'],
    host: 'SCRANTON',
    veces: 1,
    campana: 'p1-scranton-1',
    nota: 'Herramienta de volcado escrita a disco: el mejor precursor de P1 (el escenario abrevia sus técnicas como «T1003.001-005»).',
    fuente: REF.bloqueP1,
  },
  {
    id: 'al-0300-drop-2',
    hora: { hora: '03:00:31.064', resolucion: 'ms' },
    regla: 'Cred Dump Tools Dropped Files',
    nivel: 'high',
    tecnicas: ['T1003.001', 'T1003.002', 'T1003.003', 'T1003.004', 'T1003.005'],
    host: 'SCRANTON',
    veces: 1,
    campana: 'p1-scranton-1',
    fuente: REF.bloqueP1,
  },
  {
    id: 'al-0305-lsass',
    hora: { hora: '03:05:16.654', resolucion: 'ms' },
    regla: 'Potential Credential Dumping Activity Via LSASS',
    nivel: 'medium',
    tecnicas: ['T1003.001'],
    host: 'SCRANTON',
    veces: 1,
    campana: 'p1-scranton-1',
    nota: 'Acceso a LSASS: 4 min 47 s después del primer volcado de la herramienta (el núcleo de P1 en apt29).',
    fuente: REF.bloqueP1,
  },
  {
    id: 'al-0309-remota',
    hora: { hora: '03:09:29.430', resolucion: 'ms' },
    regla: 'Remote LSASS Process Access Through Windows Remote Management',
    nivel: 'high',
    tecnicas: ['T1003.001', 'T1059.001', 'T1021.006'],
    host: 'NASHUA',
    veces: 1,
    campana: 'p1-nashua',
    nota: 'wsmprovhost.exe → lsass.exe. Es evidencia de P1 en NASHUA y de P2 a la vez: la costura entre los dos patrones. Lleva T1003.001 y T1021.006, así que en P2 cuenta como credenciales y como ejecución remota.',
    fuente: `${REF.bloqueP1} · ${REF.p2} · ${REF.alertasDay1}`,
  },
  {
    id: 'al-0319-lsass',
    hora: { hora: '03:19:09.803', resolucion: 'ms' },
    regla: 'Potential Credential Dumping Activity Via LSASS',
    nivel: 'medium',
    tecnicas: ['T1003.001'],
    host: 'SCRANTON',
    veces: 2,
    campana: 'p1-scranton-2',
    nota: 'Dos alertas distintas en el mismo milisegundo: dos accesos a LSASS que antes normalizaban idénticos (reaparecieron al pasar de 738 a 741 alertas). Abre la segunda campaña P1 de SCRANTON, 13 min 53 s después del primer acceso.',
    fuente: `${REF.bloqueP1} · ${REF.p1Revalidado}`,
  },
  {
    id: 'al-0319-netsh',
    hora: { hora: '03:19:17', resolucion: 'reconstruida' },
    regla: 'New Network Trace Capture Started Via Netsh.EXE',
    nivel: 'medium',
    tecnicas: ['T1040'],
    host: 'SCRANTON',
    veces: 1,
    nota: 'Sale en la consulta del bloque de P1 porque incluye T1040, pero no es evidencia de P1 (que se ancla en T1003.* y refuerza con T1070.*).',
    fuente: REF.bloqueP1,
  },
  {
    id: 'al-0319-netsh-2',
    hora: { hora: '03:19:17.154', resolucion: 'ms' },
    regla: 'New Network Trace Capture Started Via Netsh.EXE',
    nivel: 'medium',
    tecnicas: ['T1040'],
    host: 'SCRANTON',
    veces: 1,
    fuente: REF.bloqueP1,
  },
]

/** Alertas de day1 por host, medidas en F2 (27-07). El total (741) es el mismo tras la recarga del 14-09. */
export const ALERTAS_POR_HOST_DAY1: Readonly<Record<string, number>> = { SCRANTON: 606, NASHUA: 117, NEWYORK: 16, UTICA: 2 }

/** Papel de cada máquina y cuenta según el plan de emulación y el escenario. */
export const ACTORES_DAY1 = {
  hosts: [
    { host: 'SCRANTON', fqdn: 'SCRANTON.dmevals.local', papel: 'Víctima inicial · origen del salto' },
    { host: 'NASHUA', fqdn: 'NASHUA.dmevals.local', papel: 'Víctima secundaria · destino del salto' },
    { host: 'NEWYORK', fqdn: 'NEWYORK.dmevals.local', papel: 'Controlador de dominio (identificado por comportamiento: recibe LDAP y Kerberos de SCRANTON, NASHUA y UTICA)' },
    { host: 'UTICA', fqdn: 'UTICA.dmevals.local', papel: 'Máquina del dominio; no es objetivo en day1 (2 alertas)' },
  ],
  cuentas: [
    { cuenta: 'DMEVALS\\pbeesly', papel: 'Usuaria legítima. Sysmon EID 3 la atribuye a la conexión WinRM del salto a NASHUA.' },
    { cuenta: 'admin', papel: 'Cuenta con la que opera el atacante tras la escalada (plan de emulación, paso 1.B en adelante).' },
  ],
  fuente: `${REF.escenarioActores} · ${REF.escenarioLectura}`,
} as const

/**
 * P2 con la hora del EVENTO (corregida el 11-09). El escenario §3 da otras horas para el mismo salto, pero son las
 * de recogida, anteriores a la corrección: no se usan.
 */
export const P2_DETALLE = {
  conexionWinrm: { hora: { hora: '03:09:23.801', resolucion: 'ms' as const }, proceso: 'powershell.exe', usuario: 'DMEVALS\\pbeesly', puerto: 5985, confirmadaPorAmbosExtremos: true, fuente: REF.tiempo },
  wsmprovhost: { hora: { hora: '03:09:23.885', resolucion: 'ms' as const }, regla: 'Remote PowerShell Session Host Process (WinRM)', nivel: 'medium' as const, tecnicas: ['T1059.001', 'T1021.006'], nota: '84 ms después de la conexión que lo provoca (antes de corregir la hora aparecía 3 s ANTES, lo cual es imposible).', fuente: `${REF.tiempo} · ${REF.alertasDay1}` },
  ultimaArista: { hora: { hora: '03:17:59.493', resolucion: 'ms' as const }, fuente: REF.p2Revalidado },
  /** Proceso que abre las conexiones de cada puerto. Las horas una a una de las 17 aristas no están documentadas. */
  procesoPorPuerto: [
    { puerto: 5985, servicio: 'WinRM', proceso: 'powershell.exe', fuente: `${REF.tiempo} · ${REF.esquemaRed}` },
    { puerto: 135, servicio: 'RPC / DCOM', proceso: 'PsExec64.exe', fuente: `${REF.p2Sql} (filtro de puertos: «observado: PsExec64.exe»)` },
    { puerto: 445, servicio: 'SMB', proceso: 'System', fuente: `${REF.p2Sql} («System abre las conexiones 445 del propio SMB del kernel»)` },
  ],
  /** Confianza descompuesta de P2 (pesos de la vista). En apt29 day1 se cumplen los seis factores: confianza 1,0. */
  confianza: [
    { factor: 'Arista dirigida en un puerto de movimiento lateral hacia un host que no es el DC', peso: 0.3 },
    { factor: 'Arista vista desde los dos extremos (Initiated=true y false)', peso: 0.15 },
    { factor: 'La abre un proceso que no es de sistema (powershell.exe, PsExec64.exe)', peso: 0.1 },
    { factor: 'Ejecución remota en el destino (T1021.*): 4 alertas', peso: 0.2 },
    { factor: 'Servicio en el destino (T1569.002): 4 alertas', peso: 0.15 },
    { factor: 'Credenciales en el destino (T1003.*): 1 alerta, la costura con P1', peso: 0.1 },
  ],
  fuenteConfianza: `${REF.p2Sql} · ${REF.p2}`,
} as const

/** Pesos de la confianza descompuesta de P1 (oráculo en batch y emisión de Flink usan los mismos). */
export const P1_CONFIANZA = {
  base: { factor: 'Ancla (T1003.*) y contexto', peso: 0.4 },
  etapas: [
    { factor: 'Acceso a LSASS (Process Activity: Open)', peso: 0.25 },
    { factor: 'Herramienta o volcado en disco (File System Activity)', peso: 0.2 },
    { factor: 'Ejecución de la herramienta (Process Activity: Launch)', peso: 0.1 },
    { factor: 'Limpieza de rastro (T1070.*)', peso: 0.15 },
  ],
  fuente: `${REF.p1Sql} · infra/flink/jobs/p1_05_emision.sql`,
} as const

/* La confianza de cada campaña ya no se copia aquí a mano: sale de `eval/portal/p1-campanas.jsonl` y
 * `p2-campanas.jsonl` (exportaciones del 21-10-2026), a través de `src/api/exportaciones.ts`. */
