/**
 * Estado del Copiloto compartido por el shell: si el panel está abierto, su ancho, la organización de la
 * conversación, la pregunta precargada («Preguntar al Copiloto sobre esto») y cuántos avisos hay por organización.
 * Ligero a propósito (lo carga la portada): el panel y su lógica se descargan solo al abrirlo.
 *
 * Abierto y ancho se recuerdan en `localStorage`; los avisos descartados, en `sessionStorage` por organización (no se
 * repiten en la sesión). Siempre con try/catch: si el navegador lo bloquea, se queda en memoria.
 */
import { createContext, useContext, type RefObject } from 'react'

import type { SeleccionContexto } from './nucleo'

export const ORGS_COPILOTO = ['dmevals', 'helios'] as const
export type OrgCopiloto = (typeof ORGS_COPILOTO)[number]
export const esOrgCopiloto = (v: unknown): v is OrgCopiloto => typeof v === 'string' && (ORGS_COPILOTO as readonly string[]).includes(v)

/** Ancho del panel: mínimo en píxeles y máximo como fracción de la ventana. */
export const ANCHO_PANEL = { minimo: 360, inicial: 400, fraccionMaxima: 0.45 } as const
/**
 * El panel EMPUJA el contenido solo si le deja al menos este ancho; si no, se superpone. Antes se decidía por el ancho
 * de la ventana (≥ 1280 px), y a 1440 px con la barra lateral abierta el contenido se quedaba en unos 800 px: las
 * tablas y los paneles de detalle, pensados para más, se cortaban (p. ej. la columna «Confianza» de /incidentes).
 */
export const CONTENIDO_MINIMO_EMPUJE = 1000

/** ¿Empuja el panel el contenido? Puro: ancho de la ventana, de la barra lateral y del propio panel, en px. */
export const empujaContenido = (anchoVentana: number, anchoBarraLateral: number, anchoPanel: number) =>
  anchoVentana - anchoBarraLateral - anchoPanel >= CONTENIDO_MINIMO_EMPUJE

export const CLAVE_ABIERTO = 'tfg-copiloto-abierto'
export const CLAVE_ANCHO = 'tfg-copiloto-ancho'

export interface PeticionCopiloto {
  /** Para distinguir dos peticiones iguales seguidas. */
  id: number
  pregunta: string
  seleccion?: SeleccionContexto
}

export interface ValorCopiloto {
  abierto: boolean
  ancho: number
  org: OrgCopiloto
  peticion: PeticionCopiloto | null
  avisos: Readonly<Record<string, number>>
  /** Señales débiles descartadas, por organización. */
  descartadas: Readonly<Record<string, readonly string[]>>
  descartar: (org: string, id: string) => void
  /** El botón de la barra superior: el foco vuelve a él al cerrar. */
  refBoton: RefObject<HTMLButtonElement | null>
  abrir: (opciones?: { pregunta?: string; seleccion?: SeleccionContexto; org?: OrgCopiloto }) => void
  cerrar: () => void
  alternar: () => void
  fijarAncho: (px: number) => void
  fijarOrg: (org: OrgCopiloto) => void
  limpiarPeticion: () => void
  fijarAvisos: (org: string, n: number) => void
}

export const ContextoCopiloto = createContext<ValorCopiloto | null>(null)

export const leerDescartadas = (org: string): string[] => {
  try {
    const v: unknown = JSON.parse(globalThis.sessionStorage?.getItem(`tfg:copiloto:descartadas:${org}`) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 100) : []
  } catch {
    return []
  }
}

export const leer = (clave: string): string | null => {
  try {
    return globalThis.localStorage?.getItem(clave) ?? null
  } catch {
    return null
  }
}
export const guardar = (clave: string, valor: string) => {
  try {
    globalThis.localStorage?.setItem(clave, valor)
  } catch {
    // sin almacenamiento: el estado sigue en memoria
  }
}

export const acotarAncho = (px: number, anchoVentana = globalThis.innerWidth || 1440) =>
  Math.round(Math.min(Math.max(ANCHO_PANEL.minimo, px), Math.max(ANCHO_PANEL.minimo, anchoVentana * ANCHO_PANEL.fraccionMaxima)))

export function useCopiloto(): ValorCopiloto {
  const valor = useContext(ContextoCopiloto)
  if (!valor) throw new Error('useCopiloto necesita <ProveedorEstadoCopiloto> (está en el shell).')
  return valor
}
