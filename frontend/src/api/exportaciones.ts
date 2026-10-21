/**
 * Exportaciones MEDIDAS del 21-10-2026 (`eval/portal/`, copiadas a `src/api/datos/` por `npm run sincronizar-datos`):
 * las 741 alertas de APT29 day1, las 17 aristas de P2, las campañas de los oráculos de P1 y P2, las 47 técnicas
 * observadas en el corpus actual y el catálogo de ATT&CK Enterprise v19.
 *
 *   const alertas = await cargarAlertasDay1()   // AlertaDay1[], ordenadas por hora del evento
 *
 * Cada fichero se carga BAJO DEMANDA (import dinámico: va en su propio chunk y solo lo descarga la página que lo usa),
 * se valida línea a línea y se normaliza UNA vez (la promesa queda en caché del módulo). Las páginas no llaman a esto
 * directamente: lo usan los hooks de `src/api/*.ts`.
 *
 * Todo texto que viene de aquí (reglas, procesos, usuarios) es ENTRADA HOSTIL: se pinta siempre como texto.
 */
import type { HoraDataset, NivelRegla } from './simulado/corpus'

export interface AlertaDay1 {
  id: string
  eventHash: string
  hora: HoraDataset
  /** Milisegundos desde las 00:00 del día del dataset (para ordenar y agrupar). */
  ms: number
  regla: string
  nivel: NivelRegla
  tecnicas: string[]
  tacticas: string[]
  /** Host corto (SCRANTON); el FQDN completo va en `hostCompleto`. */
  host: string
  hostCompleto: string
  usuario: string
  proceso: string
  /** EventID del evento de origen (Sysmon 1–29; Security 4688…). */
  eventoOrigen: number
}

export interface AristaP2 {
  hora: HoraDataset
  ms: number
  host: string
  proceso: string
  usuario: string
  /** IPv4 legible (la exportación la da como IPv6 mapeada, `::ffff:10.0.1.4`). */
  ipOrigen: string
  ipDestino: string
  puerto: number
}

export interface CampanaP1Medida {
  dataset: string
  host: string
  hostCompleto: string
  /** Número de campaña dentro de su host (1, 2…). */
  campana: number
  /** Fecha y hora del evento (`YYYY-MM-DD HH:MM:SS.mmm`, UTC del dataset). */
  inicio: string
  fin: string
  duracionMin: number
  alertas: number
  eventosDistintos: number
  anclas: number
  /** Evidencia por etapa del oráculo (alertas de cada tipo, no transiciones). */
  evidencia: { lsass: number; herramienta: number; fichero: number; limpieza: number }
  confianza: number
}

export interface CampanaP2Medida {
  id: string
  dataset: string
  origen: string
  destino: string
  inicio: string
  fin: string
  duracionS: number
  usuarios: string[]
  aristas: number
  puertos: number[]
  procesosOrigen: string[]
  confirmadaPorAmbosExtremos: boolean
  alertas: number
  eventosDistintos: number
  evidencia: { ejecucionRemota: number; servicio: number; credenciales: number; total: number }
  reglasEvidencia: string[]
  confianza: number
}

export interface TecnicaObservada {
  id: string
  alertas: number
  reglas: number
  datasets: string[]
}

export interface TacticaAttack {
  id: string
  /** Nombre corto en minúsculas (credential-access): es como lo llevan las alertas. */
  shortname: string
  nombre: string
}

export interface TecnicaCatalogo {
  nombre: string
  tacticas: string[]
  subtecnica: boolean
  padre: string | null
}

export interface CatalogoAttack {
  procedencia: { fuente: string; version_attack: string; modificado: string; sha256_fuente: string; extraido: string; nota?: string }
  tacticas: TacticaAttack[]
  tecnicas: Record<string, TecnicaCatalogo>
}

/* --- Validación y normalización ------------------------------------------------------------------------------- */

const NIVELES: readonly NivelRegla[] = ['critical', 'high', 'medium', 'low', 'informational']

/** Parte un `.jsonl` en objetos; una línea inválida es un error con su número (nunca se descarta en silencio). */
export function parsearJsonl(texto: string, nombre: string): Record<string, unknown>[] {
  return texto.split('\n').flatMap((linea, i) => {
    if (linea.trim() === '') return []
    let fila: unknown
    try {
      fila = JSON.parse(linea)
    } catch {
      throw new Error(`${nombre}: la línea ${i + 1} no es JSON válido`)
    }
    if (fila === null || typeof fila !== 'object' || Array.isArray(fila)) throw new Error(`${nombre}: la línea ${i + 1} no es un objeto`)
    return [fila as Record<string, unknown>]
  })
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
/** ClickHouse exporta los enteros de 64 bits como cadena ("134"): se aceptan los dos. */
const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : 0
}
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** `SCRANTON.dmevals.local` → `SCRANTON`. */
export const hostCorto = (fqdn: string): string => fqdn.split('.')[0].toUpperCase()
/** `::ffff:10.0.1.4` → `10.0.1.4` (IPv4 mapeada en IPv6); cualquier otra se deja tal cual. */
export const ipLegible = (ip: string): string => ip.replace(/^::ffff:/i, '')

/**
 * Hora del dataset con su resolución REAL. Los eventos de Sysmon (EventID < 1000) traen milisegundos; los de Security
 * y PowerShell (4688, 4103…) se reconstruyen con EventTime + desfase y solo tienen resolución de segundo (llegan con
 * `.000`): se marcan como reconstruidos (†) y se guardan sin milisegundos (BITÁCORA 15-09-2026; escenario §4).
 */
export function horaDeEvento(fecha: string, eventoOrigen: number | null): HoraDataset {
  const hora = fecha.slice(11)
  if (eventoOrigen !== null && eventoOrigen >= 1000) return { hora: hora.split('.')[0], resolucion: 'reconstruida' }
  return { hora, resolucion: hora.includes('.') ? 'ms' : 'segundo' }
}

export function msDelDia(fecha: string): number {
  const [hms, milis = '0'] = fecha.slice(11).split('.')
  const [h, m, s] = hms.split(':').map(Number)
  return ((h * 60 + m) * 60 + s) * 1000 + Number(milis.padEnd(3, '0'))
}

export function normalizarAlerta(f: Record<string, unknown>): AlertaDay1 {
  const fecha = texto(f.hora)
  const eventoOrigen = numero(f.src_event_id)
  const nivel = texto(f.rule_level) as NivelRegla
  const hostCompleto = texto(f.device_hostname)
  const hora = horaDeEvento(fecha, eventoOrigen)
  return {
    id: texto(f.alert_id),
    eventHash: texto(f.event_hash),
    hora,
    // las reconstruidas se ordenan por el inicio de su segundo, sin aparentar milisegundos
    ms: hora.resolucion === 'reconstruida' ? Math.floor(msDelDia(fecha) / 1000) * 1000 : msDelDia(fecha),
    regla: texto(f.rule_title),
    nivel: NIVELES.includes(nivel) ? nivel : 'informational',
    tecnicas: textos(f.technique_ids),
    tacticas: textos(f.tactic_ids),
    host: hostCorto(hostCompleto),
    hostCompleto,
    usuario: texto(f.actor_user_name),
    proceso: texto(f.actor_process_name),
    eventoOrigen,
  }
}

export function normalizarArista(f: Record<string, unknown>): AristaP2 {
  const fecha = texto(f.hora)
  return {
    hora: horaDeEvento(fecha, 3),
    ms: msDelDia(fecha),
    host: hostCorto(texto(f.device_hostname)),
    proceso: texto(f.actor_process_name),
    usuario: texto(f.actor_user_name),
    ipOrigen: ipLegible(texto(f.ip_origen)),
    ipDestino: ipLegible(texto(f.ip_destino)),
    puerto: numero(f.dst_port),
  }
}

export function normalizarCampanaP1(f: Record<string, unknown>): CampanaP1Medida {
  const hostCompleto = texto(f.host)
  return {
    dataset: texto(f.dataset),
    host: hostCorto(hostCompleto),
    hostCompleto,
    campana: numero(f.campana),
    inicio: texto(f.inicio),
    fin: texto(f.fin),
    duracionMin: numero(f.duracion_min),
    alertas: numero(f.alertas_absorbidas),
    eventosDistintos: numero(f.eventos_distintos),
    anclas: numero(f.anclas),
    evidencia: { lsass: numero(f.ev_acceso_lsass), herramienta: numero(f.ev_ejecucion_util), fichero: numero(f.ev_fichero), limpieza: numero(f.ev_limpieza) },
    // 0.8500000000000001 → 0,85: la vista suma pesos en coma flotante
    confianza: Math.round(numero(f.confianza) * 100) / 100,
  }
}

export function normalizarCampanaP2(f: Record<string, unknown>): CampanaP2Medida {
  return {
    id: texto(f.campaign_id),
    dataset: texto(f.dataset),
    origen: hostCorto(texto(f.host_origen)),
    destino: hostCorto(texto(f.host_destino)),
    inicio: texto(f.first_seen),
    fin: texto(f.last_seen),
    duracionS: numero(f.duration_s),
    usuarios: textos(f.users),
    aristas: numero(f.aristas),
    puertos: Array.isArray(f.puertos) ? f.puertos.map(numero).sort((a, b) => a - b) : [],
    procesosOrigen: textos(f.procesos_origen),
    confirmadaPorAmbosExtremos: numero(f.arista_confirmada_por_ambos_extremos) === 1,
    alertas: numero(f.alertas_absorbidas),
    eventosDistintos: numero(f.eventos_distintos),
    evidencia: { ejecucionRemota: numero(f.ev_ejecucion_remota), servicio: numero(f.ev_servicio), credenciales: numero(f.ev_credenciales), total: numero(f.evidencia_p2) },
    reglasEvidencia: textos(f.reglas_evidencia),
    confianza: Math.round(numero(f.confidence) * 100) / 100,
  }
}

export function normalizarTecnica(f: Record<string, unknown>): TecnicaObservada {
  return { id: texto(f.technique_id), alertas: numero(f.alertas), reglas: numero(f.reglas), datasets: textos(f.datasets) }
}

/* --- Carga bajo demanda, una sola vez ---------------------------------------------------------------------------- */

function unaVez<T>(cargar: () => Promise<T>): () => Promise<T> {
  let promesa: Promise<T> | undefined
  return () => {
    promesa ??= cargar().catch((error) => {
      promesa = undefined // un fallo no se queda en caché: el reintento vuelve a cargar
      throw error
    })
    return promesa
  }
}

export const cargarAlertasDay1 = unaVez(async () => {
  const { default: crudo } = await import('./datos/alertas-apt29-day1.jsonl?raw')
  return parsearJsonl(crudo, 'alertas-apt29-day1.jsonl').map(normalizarAlerta).sort((a, b) => a.ms - b.ms)
})

export const cargarAristasP2 = unaVez(async () => {
  const { default: crudo } = await import('./datos/aristas-p2.jsonl?raw')
  return parsearJsonl(crudo, 'aristas-p2.jsonl').map(normalizarArista).sort((a, b) => a.ms - b.ms)
})

export const cargarCampanasP1 = unaVez(async () => {
  const { default: crudo } = await import('./datos/p1-campanas.jsonl?raw')
  return parsearJsonl(crudo, 'p1-campanas.jsonl').map(normalizarCampanaP1)
})

export const cargarCampanaP2 = unaVez(async () => {
  const { default: crudo } = await import('./datos/p2-campanas.jsonl?raw')
  const [primera] = parsearJsonl(crudo, 'p2-campanas.jsonl').map(normalizarCampanaP2)
  if (!primera) throw new Error('p2-campanas.jsonl: no trae ninguna campaña')
  return primera
})

export const cargarTecnicasObservadas = unaVez(async () => {
  const { default: crudo } = await import('./datos/tecnicas-observadas.jsonl?raw')
  return parsearJsonl(crudo, 'tecnicas-observadas.jsonl').map(normalizarTecnica)
})

export const cargarCatalogo = unaVez(async () => {
  const { default: catalogo } = await import('./datos/attack-catalogo-v19.json')
  return catalogo as unknown as CatalogoAttack
})

/** Fecha y hora completas de una campaña (`2020-05-02 02:56:14.000`) → `02:56:14`. */
export const horaCorta = (fecha: string): string => fecha.slice(11, 19)
