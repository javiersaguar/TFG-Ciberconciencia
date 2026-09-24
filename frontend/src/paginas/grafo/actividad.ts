/**
 * Qué tramos del grafo se iluminan mientras corre un replay, y qué pastilla lleva cada pieza. Lógica pura.
 *
 * Sin backend no hay actividad real que mirar, así que el grafo ofrece **simular** el replay de apt29 day1: el
 * progreso es inventado (una rampa lineal), pero los totales a los que llega son los medidos —196.081 líneas,
 * 194.829 eventos normalizados, 741 alertas, 3 campañas de P1 y 1 de P2—. Cuando haya API, `EstadoReplay` saldrá de
 * las métricas de Prometheus (offsets de cada topic) en vez de la rampa.
 *
 *   replay          Telemetría → Replay → Normalización
 *   normalización   Normalización → Detección, → ClickHouse (tfg.events), → DLQ
 *   detección       Detección → CEP, → ClickHouse (tfg.alerts)
 */
import { formatearEntero } from '@/componentes/datos/formato'
import { DAY1 } from '@/api/simulado/corpus'

import type { Tono } from './nodos'

export interface Flujo {
  desde: string
  hasta: string
}

export interface Realce {
  texto: string
  tono: Tono
}

export interface Flujos {
  /** Aristas activas por su clave `${desde}-${hasta}`. */
  aristas: Map<string, Flujo>
  /** Piezas que trabajan, con el texto de su pastilla. */
  nodos: Map<string, Realce>
}

export const claveArista = (desde: string, hasta: string) => `${desde}-${hasta}`

export const SIN_FLUJOS: Flujos = { aristas: new Map(), nodos: new Map() }

export interface EstadoReplay {
  /** 0 → 1. */
  progreso: number
  enMarcha: boolean
  lineas: number
  eventos: number
  dlq: number
  alertas: number
  campanasP1: number
  campanasP2: number
}

/**
 * Momento del replay (0–1) en que aparece cada campaña. Siguen el orden real de day1: SCRANTON arranca a las 02:56,
 * NASHUA a las 02:59, el salto lateral es a las 03:09 y la segunda de SCRANTON a las 03:10, sobre una campaña de
 * 26 min 27 s (escenario §4). Es una aproximación visual, no una medida.
 */
const APARICION_P1 = [0.15, 0.3, 0.55] as const
const APARICION_P2 = 0.52

export function estadoReplay(progreso: number, enMarcha = progreso > 0 && progreso < 1): EstadoReplay {
  const p = Math.min(1, Math.max(0, progreso))
  const lineas = Math.round(p * DAY1.lineas)
  const eventos = Math.round(p * DAY1.eventos)
  return {
    progreso: p,
    enMarcha,
    lineas,
    eventos,
    dlq: lineas - eventos,
    alertas: Math.round(p * DAY1.alertas),
    campanasP1: APARICION_P1.filter((umbral) => p >= umbral).length,
    campanasP2: p >= APARICION_P2 ? DAY1.campanasP2 : 0,
  }
}

export const REPLAY_PARADO: EstadoReplay = estadoReplay(0, false)

function activar(flujos: Flujos, tramos: readonly (readonly [string, string])[]): void {
  for (const [desde, hasta] of tramos) flujos.aristas.set(claveArista(desde, hasta), { desde, hasta })
}

export function flujosDe(replay: EstadoReplay): Flujos {
  if (!replay.enMarcha) return SIN_FLUJOS
  const flujos: Flujos = { aristas: new Map(), nodos: new Map() }
  activar(flujos, [
    ['fuentes', 'replay'],
    ['replay', 'normalizador'],
    ['normalizador', 'deteccion'],
    ['normalizador', 'clickhouse'],
    ['normalizador', 'dlq'],
    ['deteccion', 'clickhouse'],
    ['deteccion', 'cep'],
  ])
  const campanas = replay.campanasP1 + replay.campanasP2
  flujos.nodos.set('replay', { texto: `${formatearEntero(replay.lineas)} de ${formatearEntero(DAY1.lineas)} líneas`, tono: 'ambar' })
  flujos.nodos.set('normalizador', { texto: `${formatearEntero(replay.eventos)} eventos OCSF`, tono: 'azul' })
  flujos.nodos.set('dlq', { texto: `${formatearEntero(replay.dlq)} sin mapear`, tono: 'coral' })
  flujos.nodos.set('deteccion', { texto: `${formatearEntero(replay.alertas)} alertas`, tono: 'azul' })
  flujos.nodos.set('clickhouse', { texto: 'Escribiendo', tono: 'cian' })
  flujos.nodos.set('cep', { texto: campanas === 0 ? 'Esperando secuencias' : `${campanas} ${campanas === 1 ? 'campaña' : 'campañas'}`, tono: 'violeta' })
  return flujos
}

/** Frase de la barra de actividad. */
export function describirReplay(replay: EstadoReplay): string {
  if (replay.enMarcha) return `Replay de apt29 day1 al ${Math.round(replay.progreso * 100)} %`
  if (replay.progreso >= 1) {
    return `Replay terminado: ${formatearEntero(replay.eventos)} eventos, ${formatearEntero(replay.alertas)} alertas, ` +
      `${replay.campanasP1} campañas de P1 y ${replay.campanasP2} de P2`
  }
  return 'Sin procesos en marcha'
}
