/** Reloj local de la demo: pausa real, velocidad y suspensión al ocultar la pestaña. */
import { useEffect, useRef, useState } from 'react'

import { INICIO_MS } from './modelo'

export function useRelojMapa() {
  const [tiempo, setTiempo] = useState(INICIO_MS)
  const [enMarcha, setEnMarcha] = useState(true)
  const [velocidad, setVelocidad] = useState(1)
  const reloj = useRef(INICIO_MS)
  const [origen, setOrigen] = useState(() => Date.now() - INICIO_MS)

  useEffect(() => {
    if (!enMarcha) return
    let frame = 0
    let anterior: number | undefined
    let ultimoPintado = 0
    const avanzar = (ahora: number) => {
      if (anterior !== undefined && !document.hidden) reloj.current += Math.min(ahora - anterior, 250) * velocidad
      anterior = ahora
      if (ahora - ultimoPintado >= 200) {
        setTiempo(reloj.current)
        ultimoPintado = ahora
      }
      frame = requestAnimationFrame(avanzar)
    }
    const visibilidad = () => { anterior = undefined }
    document.addEventListener('visibilitychange', visibilidad)
    frame = requestAnimationFrame(avanzar)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', visibilidad)
    }
  }, [enMarcha, velocidad])

  const pausar = () => {
    setTiempo(reloj.current)
    setEnMarcha((actual) => !actual)
  }
  const reiniciar = () => {
    reloj.current = 0
    setOrigen(Date.now())
    setTiempo(0)
  }
  return { tiempo, reloj, origen, enMarcha, velocidad, setVelocidad, pausar, reiniciar }
}
