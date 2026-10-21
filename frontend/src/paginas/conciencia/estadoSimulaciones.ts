/**
 * El estado de las simulaciones de la demo, compartido por todo el portal: la página de conciencia situacional las
 * maneja y el Copiloto las lee para responder sobre «ahora» y avisar en tiempo real. Un solo reloj, aquí.
 *
 * Es ligero a propósito (vive en el shell, que carga la portada): no importa los escenarios. Cada simulación guarda su
 * propio `limite` (duración del escenario + margen), que fija quien la arranca.
 */
import { createContext, useContext } from 'react'

import type { AccionAplicada } from './modelo'

export const PASO_RELOJ_MS = 250

export interface Simulacion {
  tiempo: number
  enMarcha: boolean
  velocidad: 1 | 2 | 4
  acciones: AccionAplicada[]
  /** Segundo en que termina (escenario + margen). */
  limite: number
}

export const PARADA: Simulacion = { tiempo: 0, enMarcha: false, velocidad: 1, acciones: [], limite: Number.POSITIVE_INFINITY }

export interface ValorSimulaciones {
  simulaciones: Readonly<Record<string, Simulacion>>
  cambiar: (id: string, cambio: (sim: Simulacion) => Simulacion) => void
}

export const ContextoSimulaciones = createContext<ValorSimulaciones | null>(null)

export function useEstadoSimulaciones(): ValorSimulaciones {
  const valor = useContext(ContextoSimulaciones)
  if (!valor) throw new Error('useEstadoSimulaciones necesita <ProveedorSimulaciones> (está en el shell).')
  return valor
}
