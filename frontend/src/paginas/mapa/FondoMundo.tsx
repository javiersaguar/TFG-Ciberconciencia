/**
 * El fondo de los mapas 2D del mundo del portal: océano, retícula y los 177 países de Natural Earth con sus contornos,
 * en la proyección de `geografia.ts`. Lo comparten el mapa mundial de alertas (`/mapa`) y la vista «Mundo» de
 * conciencia situacional, para que los dos mapas sean el mismo. Encima, cada página dibuja lo suyo.
 *
 * `origen` y `destino` (códigos ISO de tres letras) iluminan esos países, como la alerta elegida en `/mapa`.
 */
import { memo } from 'react'

import { cn } from '@/lib/utils'

import { CONTORNO, PAISES, RETICULA } from './geografia'
import './mapa.css'

export const FondoMundo = memo(function FondoMundo({ origen, destino }: { origen?: string; destino?: string }) {
  return (
    <g aria-hidden>
      <path d={CONTORNO} className="mapa-oceano" />
      <path d={RETICULA} className="mapa-reticula" />
      {PAISES.map((p, i) => <path key={p.codigo + i} d={p.trazo} className={cn('mapa-pais', (p.codigo === origen || p.codigo === destino) && 'mapa-pais-seleccionado')} />)}
    </g>
  )
})
