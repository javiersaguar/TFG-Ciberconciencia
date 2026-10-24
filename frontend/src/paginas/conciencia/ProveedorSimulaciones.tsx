/**
 * Proveedor del estado compartido de las simulaciones de la demo (ver `estadoSimulaciones.ts`): un solo reloj para
 * todo el portal. Vive en el shell.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { ContextoSimulaciones, PARADA, PASO_RELOJ_MS, type Simulacion } from './estadoSimulaciones'

export function ProveedorSimulaciones({ children }: { children: ReactNode }) {
  const [simulaciones, setSimulaciones] = useState<Record<string, Simulacion>>({})
  const hayEnMarcha = Object.values(simulaciones).some((s) => s.enMarcha)

  useEffect(() => {
    if (!hayEnMarcha) return
    // El reloj suma el tiempo REAL transcurrido, no un tic fijo: si la página va cargada (la maqueta 3D sin GPU, una
    // pestaña en segundo plano) los tics llegan tarde y, con un incremento fijo, la simulación se frenaba. El tope de 2 s
    // evita un salto de varios pasos de golpe al volver a una pestaña dormida.
    let anterior = Date.now()
    const intervalo = setInterval(() => {
      const ahora = Date.now()
      const segundos = Math.min(2, Math.max(0, (ahora - anterior) / 1000))
      anterior = ahora
      setSimulaciones((todas) => {
        const siguientes = { ...todas }
        for (const [id, sim] of Object.entries(todas)) {
          if (!sim.enMarcha) continue
          const tiempo = Math.min(sim.limite, sim.tiempo + segundos * sim.velocidad)
          siguientes[id] = { ...sim, tiempo, enMarcha: tiempo < sim.limite }
        }
        return siguientes
      })
    }, PASO_RELOJ_MS)
    return () => clearInterval(intervalo)
  }, [hayEnMarcha])

  const cambiar = useCallback((id: string, cambio: (sim: Simulacion) => Simulacion) => {
    setSimulaciones((todas) => ({ ...todas, [id]: cambio(todas[id] ?? PARADA) }))
  }, [])
  const valor = useMemo(() => ({ simulaciones, cambiar }), [simulaciones, cambiar])
  return <ContextoSimulaciones.Provider value={valor}>{children}</ContextoSimulaciones.Provider>
}
