/**
 * Cartografía local y partículas SVG. Un único ciclo de animación mueve transform y opacity,
 * sin volver a renderizar React en cada fotograma. El reloj lo controla la reproducción.
 */
import { Maximize2, Minus, Plus } from 'lucide-react'
import { memo, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'

import { useMovimientoReducido } from '@/componentes/datos/useMovimientoReducido'
import { cn } from '@/lib/utils'

import { acotarVista, ALTO, ANCHO, CONTORNO, interpolarRuta, PAISES, proyeccion, RETICULA, rutaGeografica, VISTA_MUNDO } from './geografia'
import { COLOR_NIVEL, NIVELES, TEXTO_NIVEL, VUELO_MS, type AlertaMapa } from './modelo'

interface Props {
  alertas: AlertaMapa[]
  seleccion: AlertaMapa | null
  reloj: RefObject<number>
  enMarcha: boolean
  alSeleccionar: (alerta: AlertaMapa) => void
}

const FondoMundo = memo(function FondoMundo({ origen, destino }: { origen?: string; destino?: string }) {
  return (
    <g aria-hidden>
      <path d={CONTORNO} className="mapa-oceano" />
      <path d={RETICULA} className="mapa-reticula" />
      {PAISES.map((p, i) => <path key={p.codigo + i} d={p.trazo} className={cn('mapa-pais', (p.codigo === origen || p.codigo === destino) && 'mapa-pais-seleccionado')} />)}
    </g>
  )
})

export function LienzoMundial({ alertas, seleccion, reloj, enMarcha, alSeleccionar }: Props) {
  const identificador = useId().replaceAll(':', '')
  const reducido = useMovimientoReducido()
  const [vista, setVista] = useState(VISTA_MUNDO)
  const svg = useRef<SVGSVGElement>(null)
  const arrastre = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const particulas = useRef(new Map<string, SVGGElement>())
  const rutas = useMemo(() => alertas.map((a) => ({ alerta: a, trazo: rutaGeografica(a.desde, a.hasta), posicion: interpolarRuta(a.desde, a.hasta) })), [alertas])
  const lugares = useMemo(() => [...new Map([...alertas.flatMap((a) => [a.desde, a.hasta]), ...(seleccion ? [seleccion.desde, seleccion.hasta] : [])].map((u) => [u.id, u])).values()], [alertas, seleccion])

  useEffect(() => {
    let frame = 0
    const pintar = () => {
      for (const { alerta, posicion } of rutas) {
        const grupo = particulas.current.get(alerta.id)
        if (!grupo) continue
        const edad = reloj.current - alerta.instanteMs
        const avance = edad / VUELO_MS
        // La cola sigue el mismo arco: no se anima el trazado ni se altera el layout.
        for (let i = 0; i < 4; i++) {
          const circulo = grupo.children[i] as SVGCircleElement
          const p = posicion(avance - i * 0.035)
          circulo.setAttribute('transform', 'translate(' + p[0] + ' ' + p[1] + ')')
          circulo.setAttribute('opacity', reducido || avance < i * 0.035 || avance > 1 ? '0' : String(1 - i * 0.23))
        }
        const onda = grupo.children[4] as SVGCircleElement
        const destino = posicion(1)
        const llegada = (edad - VUELO_MS) / 1000
        onda.setAttribute('transform', 'translate(' + destino[0] + ' ' + destino[1] + ') scale(' + (1 + Math.max(0, llegada) * 2) + ')')
        onda.setAttribute('opacity', reducido || llegada < 0 || llegada > 1 ? '0' : String(1 - llegada))
      }
      if (enMarcha && !reducido) frame = requestAnimationFrame(pintar)
    }
    pintar()
    return () => cancelAnimationFrame(frame)
  }, [rutas, reloj, enMarcha, reducido])

  const zoom = (delta: number) => setVista((v) => acotarVista({ ...v, escala: v.escala + delta }))
  return (
    <div className="mapa-lienzo relative overflow-hidden" role="region" aria-label="Mapa de rutas geográficas">
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-lg border border-borde bg-superficie/95 p-1">
        <button type="button" className="mapa-icono" aria-label="Acercar el mapa" disabled={vista.escala >= 3} onClick={() => zoom(0.5)}><Plus className="size-4" aria-hidden /></button>
        <span className="w-9 text-center font-mono text-[11px] tabular-nums" aria-label="Zoom">{vista.escala.toFixed(1)}×</span>
        <button type="button" className="mapa-icono" aria-label="Alejar el mapa" disabled={vista.escala <= 1} onClick={() => zoom(-0.5)}><Minus className="size-4" aria-hidden /></button>
        <button type="button" className="mapa-icono border-l border-borde" aria-label="Ver todo el mundo" onClick={() => setVista(VISTA_MUNDO)}><Maximize2 className="size-3.5" aria-hidden /></button>
      </div>
      <svg
        ref={svg}
        viewBox={'0 0 ' + ANCHO + ' ' + ALTO}
        role="group"
        aria-label="Mapamundi con rutas de origen a destino"
        className={cn('mapa-svg w-full', vista.escala > 1 && 'cursor-grab active:cursor-grabbing')}
        style={{ touchAction: vista.escala > 1 ? 'none' : 'pan-y' }}
        onPointerDown={(e) => {
          if (vista.escala <= 1 || e.button !== 0 || (e.target as Element).closest('[role="button"]')) return
          arrastre.current = { px: e.clientX, py: e.clientY, x: vista.x, y: vista.y }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const a = arrastre.current
          if (!a || !svg.current) return
          const rect = svg.current.getBoundingClientRect()
          const factor = ANCHO / rect.width
          setVista((v) => acotarVista({ ...v, x: a.x + (e.clientX - a.px) * factor, y: a.y + (e.clientY - a.py) * factor }))
        }}
        onPointerUp={() => { arrastre.current = null }}
        onPointerCancel={() => { arrastre.current = null }}
      >
        <defs>
          <clipPath id={'limite-' + identificador}><rect width={ANCHO} height={ALTO} rx="8" /></clipPath>
          {NIVELES.map((n) => (
            <marker key={n} id={'flecha-' + identificador + n} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 Z" fill={COLOR_NIVEL[n]} />
            </marker>
          ))}
        </defs>
        <g clipPath={'url(#limite-' + identificador + ')'}>
          <g transform={'translate(' + (ANCHO / 2 + vista.x) + ' ' + (ALTO / 2 + vista.y) + ') scale(' + vista.escala + ') translate(-' + ANCHO / 2 + ' -' + ALTO / 2 + ')'}>
            <FondoMundo origen={seleccion?.desde.codigoPais} destino={seleccion?.hasta.codigoPais} />
            {rutas.map(({ alerta: a, trazo }) => {
              const elegida = seleccion?.id === a.id
              return (
                <g
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  aria-label={'Ver alerta de ' + a.desde.ciudad + ' a ' + a.hasta.ciudad + ', nivel ' + TEXTO_NIVEL[a.nivel].toLowerCase()}
                  aria-pressed={elegida}
                  className="mapa-ruta cursor-pointer outline-none"
                  onClick={() => alSeleccionar(a)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alSeleccionar(a) } }}
                  style={{ color: COLOR_NIVEL[a.nivel] }}
                >
                  <path d={trazo} fill="none" stroke="transparent" strokeWidth="14" className="mapa-zona-ruta" />
                  <path d={trazo} className="mapa-arco" strokeWidth={elegida ? 2.8 : 1.5} opacity={seleccion && !elegida ? 0.45 : 1} markerEnd={'url(#flecha-' + identificador + a.nivel + ')'} />
                  <g ref={(n) => { if (n) particulas.current.set(a.id, n); else particulas.current.delete(a.id) }} aria-hidden style={{ pointerEvents: 'none' }}>
                    {[3.2, 2.5, 1.8, 1.2].map((r, i) => <circle key={i} r={r} fill="currentColor" opacity="0" />)}
                    <circle r="5" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0" />
                  </g>
                </g>
              )
            })}
            {seleccion && !alertas.some((a) => a.id === seleccion.id) && <path d={rutaGeografica(seleccion.desde, seleccion.hasta)} className="mapa-arco" strokeWidth="2" strokeDasharray="5 4" style={{ color: COLOR_NIVEL[seleccion.nivel] }} aria-hidden />}
            <g aria-hidden pointerEvents="none">
              {lugares.map((u) => {
                const p = proyeccion(u.coordenadas)!
                const elegida = u.id === seleccion?.desde.id || u.id === seleccion?.hasta.id
                return (
                  <g key={u.id} transform={'translate(' + p[0] + ' ' + p[1] + ')'}>
                    <circle r={elegida ? 5 : 3} className={cn('mapa-ciudad', elegida && 'mapa-ciudad-seleccionada')} />
                    {(elegida || (!seleccion && (u.id === 'madrid' || u.id === 'singapur'))) && <text x="8" y={u.id === 'madrid' ? 16 : -8} className="mapa-etiqueta">{u.ciudad}</text>}
                  </g>
                )
              })}
            </g>
          </g>
        </g>
      </svg>
      <div className="absolute bottom-3 left-4 flex gap-4 text-[10px] text-texto-suave">
        <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer" className="hover:underline">Natural Earth · dominio público</a>
        <span className="hidden sm:inline">Proyección Natural Earth</span>
      </div>
      {reducido && <p className="absolute right-3 bottom-3 rounded bg-superficie/95 px-2 py-1 text-[10px] text-texto-suave">Movimiento reducido: rutas estáticas</p>}
    </div>
  )
}
