/**
 * El reloj de las simulaciones, una por organización. Cada una avanza por su cuenta aunque no se esté mirando: se
 * puede lanzar un ataque en una, cambiar a otra y volver, como un analista que vigila varias organizaciones a la vez.
 *
 * Solo guarda tiempo, velocidad y acciones aplicadas; qué significa ese instante lo calcula `evaluar` (lógica pura).
 */
import { useCallback, useEffect, useState } from 'react'

import type { AccionAplicada, Efecto } from './modelo'
import { ORGANIZACIONES } from './organizaciones'
import { duracionEscenario } from './simulacion'

export const PASO_RELOJ_MS = 250
/** Segundos de margen tras el último paso antes de dar la simulación por terminada. */
const MARGEN_FINAL = 2

export interface Simulacion {
  tiempo: number
  enMarcha: boolean
  velocidad: 1 | 2 | 4
  acciones: AccionAplicada[]
}

const PARADA: Simulacion = { tiempo: 0, enMarcha: false, velocidad: 1, acciones: [] }

/**
 * `inicial` permite abrir una organización en pausa en un segundo concreto (`?t=62` en la URL): útil para enseñar un
 * momento del ataque sin esperar a que llegue.
 */
export function useSimulaciones(inicial?: { org: string; tiempo: number }) {
  const [simulaciones, setSimulaciones] = useState<Record<string, Simulacion>>(() =>
    Object.fromEntries(ORGANIZACIONES.map((o) => {
      const tiempo = inicial?.org === o.id ? Math.min(Math.max(0, inicial.tiempo), duracionEscenario(o) + MARGEN_FINAL) : 0
      return [o.id, { ...PARADA, tiempo }]
    })),
  )
  const hayEnMarcha = Object.values(simulaciones).some((s) => s.enMarcha)

  useEffect(() => {
    if (!hayEnMarcha) return
    const intervalo = setInterval(() => {
      setSimulaciones((todas) => {
        const siguientes = { ...todas }
        for (const org of ORGANIZACIONES) {
          const sim = todas[org.id]
          if (!sim?.enMarcha) continue
          const limite = duracionEscenario(org) + MARGEN_FINAL
          const tiempo = Math.min(limite, sim.tiempo + (PASO_RELOJ_MS / 1000) * sim.velocidad)
          siguientes[org.id] = { ...sim, tiempo, enMarcha: tiempo < limite }
        }
        return siguientes
      })
    }, PASO_RELOJ_MS)
    return () => clearInterval(intervalo)
  }, [hayEnMarcha])

  const cambiar = useCallback((id: string, cambio: (sim: Simulacion) => Simulacion) => {
    setSimulaciones((todas) => ({ ...todas, [id]: cambio(todas[id] ?? PARADA) }))
  }, [])

  /** Lanza el ataque; si ya había terminado, empieza de cero. */
  const iniciar = useCallback((id: string) => cambiar(id, (s) => {
    const org = ORGANIZACIONES.find((o) => o.id === id)
    const terminada = org && s.tiempo >= duracionEscenario(org) + MARGEN_FINAL
    return terminada ? { ...PARADA, velocidad: s.velocidad, enMarcha: true } : { ...s, enMarcha: true }
  }), [cambiar])
  const pausar = useCallback((id: string) => cambiar(id, (s) => ({ ...s, enMarcha: false })), [cambiar])
  const reiniciar = useCallback((id: string) => cambiar(id, (s) => ({ ...PARADA, velocidad: s.velocidad })), [cambiar])
  const fijarVelocidad = useCallback((id: string, velocidad: Simulacion['velocidad']) => cambiar(id, (s) => ({ ...s, velocidad })), [cambiar])
  const aplicar = useCallback((id: string, accion: { clave: string; titulo: string; efecto: Efecto }) =>
    cambiar(id, (s) => (s.acciones.some((a) => a.clave === accion.clave) ? s : { ...s, acciones: [...s.acciones, { ...accion, t: s.tiempo }] })), [cambiar])

  return { simulaciones, iniciar, pausar, reiniciar, fijarVelocidad, aplicar }
}
