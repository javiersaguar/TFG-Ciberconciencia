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
    const intervalo = setInterval(() => {
      setSimulaciones((todas) => {
        const siguientes = { ...todas }
        for (const [id, sim] of Object.entries(todas)) {
          if (!sim.enMarcha) continue
          const tiempo = Math.min(sim.limite, sim.tiempo + (PASO_RELOJ_MS / 1000) * sim.velocidad)
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
