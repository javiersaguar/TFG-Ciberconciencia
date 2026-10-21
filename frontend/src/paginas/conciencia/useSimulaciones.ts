/**
 * El reloj de las simulaciones, una por organización. Cada una avanza por su cuenta aunque no se esté mirando: se
 * puede lanzar un ataque en una, cambiar a otra y volver, como un analista que vigila varias organizaciones a la vez.
 * Y ahora también cambiar de PÁGINA y volver: el estado vive en `ProveedorSimulaciones` (shell), que es además lo que
 * lee el Copiloto para responder en tiempo real. Aquí solo se añade lo que sabe de los escenarios.
 *
 * Solo guarda tiempo, velocidad y acciones aplicadas; qué significa ese instante lo calcula `evaluar` (lógica pura).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PARADA, PASO_RELOJ_MS, useEstadoSimulaciones, type Simulacion } from './estadoSimulaciones'
import type { Efecto } from './modelo'
import { ORGANIZACIONES } from './organizaciones'
import { duracionEscenario } from './simulacion'

export { PASO_RELOJ_MS }
export type { Simulacion }

/** Segundos de margen tras el último paso antes de dar la simulación por terminada. */
const MARGEN_FINAL = 2

const limiteDe = (id: string) => {
  const org = ORGANIZACIONES.find((o) => o.id === id)
  return org ? duracionEscenario(org) + MARGEN_FINAL : PARADA.limite
}
const acotar = (id: string, tiempo: number) => Math.min(Math.max(0, tiempo), limiteDe(id))

/**
 * `inicial` permite abrir una organización en pausa en un segundo concreto (`?t=62` en la URL): útil para enseñar un
 * momento del ataque sin esperar a que llegue.
 */
export function useSimulaciones(inicial?: { org: string; tiempo: number }) {
  const { simulaciones: guardadas, cambiar: cambiarGuardada } = useEstadoSimulaciones()
  const [arranque] = useState(inicial)

  // Cada organización con su estado; la que no se ha tocado, parada en 0 (o en el ?t= de la URL).
  const simulaciones = useMemo<Record<string, Simulacion>>(
    () => Object.fromEntries(ORGANIZACIONES.map((o) => [o.id, guardadas[o.id] ?? { ...PARADA, limite: limiteDe(o.id), tiempo: arranque?.org === o.id ? acotar(o.id, arranque.tiempo) : 0 }])),
    [guardadas, arranque],
  )

  // El ?t= de la URL fija ese instante al abrir la página (en pausa), también en el estado compartido.
  useEffect(() => {
    if (arranque) cambiarGuardada(arranque.org, (s) => ({ ...s, tiempo: acotar(arranque.org, arranque.tiempo), enMarcha: false, limite: limiteDe(arranque.org) }))
  }, [arranque, cambiarGuardada])

  const cambiar = useCallback((id: string, cambio: (sim: Simulacion) => Simulacion) => cambiarGuardada(id, (s) => cambio({ ...s, limite: limiteDe(id) })), [cambiarGuardada])

  /** Lanza el ataque; si ya había terminado, empieza de cero. */
  const iniciar = useCallback((id: string) => cambiar(id, (s) => (s.tiempo >= s.limite ? { ...PARADA, limite: s.limite, velocidad: s.velocidad, enMarcha: true } : { ...s, enMarcha: true })), [cambiar])
  const pausar = useCallback((id: string) => cambiar(id, (s) => ({ ...s, enMarcha: false })), [cambiar])
  const reiniciar = useCallback((id: string) => cambiar(id, (s) => ({ ...PARADA, limite: s.limite, velocidad: s.velocidad })), [cambiar])
  const fijarVelocidad = useCallback((id: string, velocidad: Simulacion['velocidad']) => cambiar(id, (s) => ({ ...s, velocidad })), [cambiar])
  const aplicar = useCallback((id: string, accion: { clave: string; titulo: string; efecto: Efecto }) =>
    cambiar(id, (s) => (s.acciones.some((a) => a.clave === accion.clave) ? s : { ...s, acciones: [...s.acciones, { ...accion, t: s.tiempo }] })), [cambiar])

  return { simulaciones, iniciar, pausar, reiniciar, fijarVelocidad, aplicar }
}
