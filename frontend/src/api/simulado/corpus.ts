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
  { host: 'UTICA', ip: '10.0.1.5', rol: '—', votos: 16 },
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
