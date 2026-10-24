/**
 * Logotipo: hexágono biselado con un escudo en el centro, un pulso que lo atraviesa y seis nodos conectados.
 * Redibujado en SVG a partir de la imagen de la marca (`docs/marca/logo-original.png`) para que se vea nítido a
 * cualquier tamaño. Mismo dibujo que `public/favicon.svg`; aquí los colores salen de los tokens `--logo-*` para que
 * el marco se aclare en el tema oscuro.
 */
import { useId } from 'react'

import { cn } from '@/lib/utils'

const MARCO = [
  { d: 'M0 -47 40.7 -23.5 32.48 -18.75 0 -37.5Z', color: 'var(--logo-marco-sombra)' },
  { d: 'M40.7 -23.5 40.7 23.5 32.48 18.75 32.48 -18.75Z', color: 'var(--logo-marco-medio)' },
  { d: 'M40.7 23.5 0 47 0 37.5 32.48 18.75Z', color: 'var(--logo-marco-luz)' },
  { d: 'M0 47 -40.7 23.5 -32.48 18.75 0 37.5Z', color: 'var(--logo-marco-sombra)' },
  { d: 'M-40.7 23.5 -40.7 -23.5 -32.48 -18.75 -32.48 18.75Z', color: 'var(--logo-marco-medio)' },
  { d: 'M-40.7 -23.5 0 -47 0 -37.5 -32.48 -18.75Z', color: 'var(--logo-marco-luz)' },
]

const CONTORNO =
  'M-4.33 -44.5Q0 -47 4.33 -44.5L36.37 -26Q40.7 -23.5 40.7 -18.5L40.7 18.5Q40.7 23.5 36.37 26L4.33 44.5Q0 47 -4.33 44.5L-36.37 26Q-40.7 23.5 -40.7 18.5L-40.7 -18.5Q-40.7 -23.5 -36.37 -26Z'
const INTERIOR =
  'M-2.17 -36.25Q0 -37.5 2.17 -36.25L30.31 -20Q32.48 -18.75 32.48 -16.25L32.48 16.25Q32.48 18.75 30.31 20L2.17 36.25Q0 37.5 -2.17 36.25L-30.31 20Q-32.48 18.75 -32.48 16.25L-32.48 -16.25Q-32.48 -18.75 -30.31 -20Z'

const NODOS = [
  { x: 0, y: -29, color: 'var(--logo-cian)' },
  { x: 0, y: 29, color: 'var(--logo-cian)' },
  { x: 25.11, y: -14.5, color: 'var(--logo-nucleo)' },
  { x: -25.11, y: 14.5, color: 'var(--logo-nucleo)' },
  { x: -25.11, y: -14.5, color: 'var(--logo-gris)' },
  { x: 25.11, y: 14.5, color: 'var(--logo-gris)' },
]

export function Logo({ className }: { className?: string }) {
  const recorte = `logo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <svg viewBox="-50 -50 100 100" className={cn('size-9', className)} aria-hidden>
      <clipPath id={recorte}>
        <path d={CONTORNO} />
      </clipPath>
      <g clipPath={`url(#${recorte})`}>
        {MARCO.map((c) => (
          <path key={c.d} d={c.d} fill={c.color} />
        ))}
      </g>
      <path d={INTERIOR} fill="var(--logo-fondo)" />
      <g fill="none" strokeLinecap="round" strokeWidth={2}>
        <path
          stroke="var(--logo-nucleo)"
          d="M6.58 -25.2L18.53 -18.3M25.11 -6.9L25.11 6.9M18.53 18.3L6.58 25.2M-6.58 25.2L-18.53 18.3M-25.11 6.9L-25.11 -6.9M-18.53 -18.3L-6.58 -25.2M0 -23.2L0 -17.6M0 23.2L0 17.6"
        />
        <path stroke="var(--logo-gris)" d="M20.09 -11.6L15.07 -8.7M20.09 11.6L15.07 8.7M-20.09 11.6L-15.07 8.7M-20.09 -11.6L-15.07 -8.7" />
      </g>
      <path d="M0 -16.9 14.1 -9.8 14.1 7.8 0 17.2 -14.1 7.8 -14.1 -9.8Z" fill="var(--logo-nucleo)" />
      {NODOS.map((n) => (
        <circle key={`${n.x},${n.y}`} cx={n.x} cy={n.y} r={4.6} fill={n.color} />
      ))}
      <path
        d="M-25.11 1.2H-8.6L-6.9 3.8-1.3 -12.3 1.6 10.6 5.5 -3.8 7.6 1.2H25.11"
        fill="none"
        stroke="var(--logo-pulso)"
        strokeWidth={2.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
