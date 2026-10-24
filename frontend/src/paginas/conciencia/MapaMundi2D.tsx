/**
 * La Tierra en 2D: el mapa del mundo (proyección Natural Earth) con la sede y los sitios de fuera con los que el ataque
 * la conecta, y los pasos como arcos por el círculo máximo (la ruta más corta, que en un mapa plano se curva).
 *
 * Trazas vivas, como en la planta 2D: cada conexión se DIBUJA al llegar; mientras la simulación corre, por las ocurridas
 * fluye un trazo claro, una cabeza recorre la última y su sitio de fuera late. En pausa, quieto; con movimiento
 * reducido, sin animación.
 *
 * Mismo lienzo que la planta: se ajusta al hueco y se acerca, aleja y mueve con la rueda, arrastrando o con los botones.
 * Ubicaciones ILUSTRATIVAS (ver `modelo.ts` → `Geografia`); la lista de conexiones lo dice.
 */
import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo'
import { useLayoutEffect, useRef, useState } from 'react'

import { useMovimientoReducido } from '@/componentes/datos/useMovimientoReducido'
import { cn } from '@/lib/utils'
import { ControlesZoom } from '@/paginas/grafo/ControlesZoom'
import { useZoomLienzo } from '@/paginas/grafo/zoom'

import { conexiones, ladosDeEtiqueta, resumenMundo, sitiosDeFuera } from './globo'
import mapa from '@/componentes/tierra/mapamundi.json'
import type { Organizacion } from './modelo'
import { PanelConexiones } from './PanelConexiones'
import type { Evaluacion } from './simulacion'

const ANCHO = 1000
const ALTO = 520

const datos = mapa as { tierras: number[][][]; fronteras: number[][] }
const anillo = (plano: readonly number[]) => Array.from({ length: plano.length / 2 }, (_, i) => [plano[i * 2], plano[i * 2 + 1]])

/** El fondo del mapa (océano, retícula, tierras y fronteras): no cambia, se calcula una vez. */
const proyeccion = geoNaturalEarth1().fitExtent([[12, 12], [ANCHO - 12, ALTO - 12]], { type: 'Sphere' })
const camino = geoPath(proyeccion)
const FONDO = {
  esfera: camino({ type: 'Sphere' }) ?? '',
  reticula: camino(geoGraticule10()) ?? '',
  tierras: camino({ type: 'MultiPolygon', coordinates: datos.tierras.map((p) => p.map(anillo)) }) ?? '',
  fronteras: camino({ type: 'MultiLineString', coordinates: datos.fronteras.map(anillo) }) ?? '',
}

interface Props {
  org: Organizacion
  ev: Evaluacion
  enMarcha: boolean
}

export default function MapaMundi2D({ org, ev, enMarcha }: Props) {
  const marco = useRef<HTMLDivElement>(null)
  const [ajuste, setAjuste] = useState(1)
  const reducido = useMovimientoReducido()
  const { vista, arrastrando, acercar, alejar } = useZoomLienzo(marco)
  const vivo = enMarcha && !reducido
  const cs = conexiones(org, ev)
  const sitios = sitiosDeFuera(cs)
  const geo = org.geografia
  const ultimo = cs.find((c) => c.ultimo)
  // a qué lado de su punto va cada etiqueta (la sede primero), para que las cercanas no se pisen
  const lados = ladosDeEtiqueta(geo ? [geo.sede, ...sitios] : sitios)
  const desfase = geo ? 1 : 0

  useLayoutEffect(() => {
    const el = marco.current
    if (!el) return
    const medir = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width < 40 || height < 40) return
      setAjuste(Math.max(0.3, Math.min((width - 16) / ANCHO, (height - 16) / ALTO, 1.6)))
    }
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const arcos = cs.map((c) => ({ c, d: camino({ type: 'LineString', coordinates: [[c.desde.lon, c.desde.lat], [c.hasta.lon, c.hasta.lat]] }) ?? '' }))
  const punto = (lon: number, lat: number) => proyeccion([lon, lat]) ?? [0, 0]
  const id = (nombre: string) => `${nombre}-mapa-${org.id}`

  return (
    <div
      ref={marco}
      role="region"
      aria-label={`Mapa del mundo de ${org.nombre}`}
      className={cn('relative h-full w-full touch-none overflow-hidden rounded-lg border border-borde bg-lienzo select-none', arrastrando ? 'cursor-grabbing' : 'cursor-grab')}
    >
      <div className="absolute top-1/2 left-1/2" style={{ width: ANCHO, height: ALTO, transform: `translate(calc(-50% + ${vista.x}px), calc(-50% + ${vista.y}px)) scale(${ajuste * vista.zoom})` }}>
        <svg role="img" aria-label={resumenMundo(org, cs)} className="absolute inset-0 overflow-visible" width={ANCHO} height={ALTO}>
          <defs>
            {(['ataque', 'bloqueado'] as const).map((clave) => (
              <marker key={clave} id={id(`flecha-${clave}`)} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,1.2 L9,5 L0,8.8 z" fill={clave === 'ataque' ? 'var(--sev-critica)' : 'var(--linea-bloqueada)'} />
              </marker>
            ))}
          </defs>
          <path d={FONDO.esfera} fill="var(--globo-oceano)" />
          <path d={FONDO.reticula} fill="none" stroke="var(--globo-reticula)" strokeWidth={0.6} />
          <path d={FONDO.tierras} fill="var(--globo-tierra)" stroke="var(--globo-costa)" strokeWidth={0.7} strokeLinejoin="round" />
          <path d={FONDO.fronteras} fill="none" stroke="var(--globo-frontera)" strokeWidth={0.5} />
          <path d={FONDO.esfera} fill="none" stroke="var(--globo-costa)" strokeWidth={1.2} />

          {arcos.map(({ c, d }) => (
            <g key={c.id} data-conexion={c.paso.id} data-ocurrido={c.ocurrido ? 'true' : 'false'}>
              {c.ultimo && <path d={d} fill="none" stroke="var(--sev-critica)" strokeWidth={9} strokeOpacity={0.14} strokeLinecap="round" />}
              <path
                d={d}
                pathLength={c.ocurrido ? 1 : undefined}
                fill="none"
                stroke={c.ocurrido ? 'var(--sev-critica)' : 'var(--linea-bloqueada)'}
                strokeWidth={c.ultimo ? 2.8 : 2}
                strokeDasharray={c.ocurrido ? undefined : '4 4'}
                strokeLinecap="round"
                className={c.ocurrido && !reducido ? 'trazo-dibuja' : undefined}
                markerEnd={`url(#${id(`flecha-${c.ocurrido ? 'ataque' : 'bloqueado'}`)})`}
              />
              {c.ocurrido && vivo && <path d={d} fill="none" stroke="var(--superficie)" strokeWidth={c.ultimo ? 1.4 : 1} strokeLinecap="round" className={c.ultimo ? 'trazo-flujo-rapido' : 'trazo-flujo'} />}
              {c.ultimo && vivo && (
                <path d="M-5,-4 L5,0 L-5,4 z" fill="var(--sev-critica)">
                  <animateMotion dur="1.6s" repeatCount="indefinite" rotate="auto" path={d} />
                </path>
              )}
            </g>
          ))}

          {sitios.map((s, i) => {
            const [x, y] = punto(s.lon, s.lat)
            const izquierda = lados[i + desfase] === 'izquierda'
            const late = vivo && !!ultimo && ultimo.fuera.lat === s.lat && ultimo.fuera.lon === s.lon
            return (
              <g key={`${s.lat},${s.lon}`} transform={`translate(${x} ${y})`}>
                <title>{s.papeles.join(' · ')}</title>
                {late && (
                  <circle r={4} fill="none" stroke="var(--sev-critica)" strokeWidth={1.5}>
                    <animate attributeName="r" values="4;16" dur="1.6s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0" dur="1.6s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle r={5} fill="var(--sev-critica)" stroke="var(--superficie)" strokeWidth={1.5} />
                <text x={izquierda ? -9 : 9} y={5} textAnchor={izquierda ? 'end' : 'start'} style={{ fontSize: 14, fontWeight: 600, fill: 'var(--sev-critica)', paintOrder: 'stroke', stroke: 'var(--superficie)', strokeWidth: 3 }}>
                  {s.nombre} ({s.pais})
                </text>
              </g>
            )
          })}
          {geo && (() => {
            const [x, y] = punto(geo.sede.lon, geo.sede.lat)
            const late = vivo && !!ultimo && ultimo.sentido === 'entrada'
            return (
              <g transform={`translate(${x} ${y})`}>
                {late && (
                  <circle r={5} fill="none" stroke="var(--acento)" strokeWidth={1.5}>
                    <animate attributeName="r" values="5;18" dur="1.6s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0" dur="1.6s" repeatCount="indefinite" />
                  </circle>
                )}
                <rect x={-6} y={-6} width={12} height={12} rx={2} fill="var(--acento)" stroke="var(--superficie)" strokeWidth={1.5} />
                <text x={lados[0] === 'izquierda' ? -10 : 10} y={5} textAnchor={lados[0] === 'izquierda' ? 'end' : 'start'} style={{ fontSize: 14, fontWeight: 600, fill: 'var(--acento)', paintOrder: 'stroke', stroke: 'var(--superficie)', strokeWidth: 3 }}>
                  Sede · {geo.sede.nombre}
                </text>
              </g>
            )
          })()}
        </svg>
      </div>

      <ControlesZoom zoom={vista.zoom} alAcercar={acercar} alAlejar={alejar} />
      <PanelConexiones org={org} conexiones={cs} className="absolute bottom-3 left-3 z-10 w-[min(24rem,calc(100%-1.5rem))]" />
    </div>
  )
}
