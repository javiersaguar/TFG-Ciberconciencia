/**
 * El reloj del replay simulado: avanza el progreso de 0 a 1 en `DURACION_MS` y se detiene solo al llegar.
 * La lógica de qué significa cada instante está en `actividad.ts`; aquí solo se mide el tiempo.
 */
import { useCallback, useEffect, useState } from 'react'

import { estadoReplay, REPLAY_PARADO, type EstadoReplay } from './actividad'

export const DURACION_MS = 14_000
const PASO_MS = 200

export function useReplaySimulado() {
  const [inicio, setInicio] = useState<number | null>(null)
  const [estado, setEstado] = useState<EstadoReplay>(REPLAY_PARADO)

  useEffect(() => {
    if (inicio === null) return
    const intervalo = setInterval(() => {
      const progreso = (Date.now() - inicio) / DURACION_MS
      if (progreso >= 1) {
        setEstado(estadoReplay(1, false))
        setInicio(null)
      } else {
        setEstado(estadoReplay(progreso, true))
      }
    }, PASO_MS)
    return () => clearInterval(intervalo)
  }, [inicio])

  const iniciar = useCallback(() => {
    setEstado(estadoReplay(0, true))
    setInicio(Date.now())
  }, [])

  const detener = useCallback(() => {
    setInicio(null)
    setEstado(REPLAY_PARADO)
  }, [])

  return { estado, iniciar, detener }
}
