/**
 * La organización como grafo: zonas de red en columnas, activos con su área de negocio y su estado, y encima el
 * ataque. Se lee de izquierda (Internet) a derecha (activos críticos), que es también el sentido en que avanza un
 * atacante.
 *
 *   gris fino            alcanzabilidad de red (lo que el atacante *podría* recorrer)
 *   rojo                 pasos que han ocurrido; el último fluye
 *   gris discontinuo ✕   pasos que la respuesta impidió
 *   ámbar discontinuo    ruta más probable hacia una joya de la corona (razonamiento, Pilar B)
 *
 * Mismo lienzo que el grafo del pipeline: se ajusta al hueco, y se acerca, aleja y mueve con la rueda, el panel
 * táctil, arrastrando o con los botones (`paginas/grafo/zoom.ts`).
 */
import {
  Archive, Bug, Crown, Database, Factory, Globe, KeyRound, Lock, Mail, Monitor, Server, ShieldCheck, Skull, TriangleAlert, Unplug,
  type LucideIcon,
} from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'

import { useMovimientoReducido } from '@/componentes/datos/useMovimientoReducido'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog'
import { cn } from '@/lib/utils'
import { ControlesZoom } from '@/paginas/grafo/ControlesZoom'
import { useZoomLienzo } from '@/paginas/grafo/zoom'

import { NOMBRE_TACTICA, porId, TARJETA, type Activo, type Organizacion, type TipoActivo } from './modelo'
import type { RutaProbable } from './razonamiento'
import type { EstadoActivo, Evaluacion } from './simulacion'

const ANCHO_ZONA = 236

const ICONO: Record<TipoActivo, LucideIcon> = {
  atacante: Skull,
  estacion: Monitor,
  servidor: Server,
  dc: KeyRound,
  datos: Database,
  backup: Archive,
  web: Globe,
  vpn: Lock,
  correo: Mail,
  ot: Factory,
}

/** Colores de las líneas: tokens, para que cambien con el tema (la de red cumple 3:1 sobre el lienzo en los dos). */
const COLOR = {
  red: 'var(--linea-red)',
  ataque: 'var(--sev-critica)',
  bloqueado: 'var(--linea-bloqueada)',
  ruta: 'var(--sev-media)',
} as const

type Punto = { x: number; y: number }

/** Punto del borde de la tarjeta de `a` en dirección a `b`, para que las líneas no entren en las tarjetas. */
function borde(a: Punto, b: Punto, margen = 4): Punto {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const escala = 1 / Math.max(Math.abs(dx) / (TARJETA.ancho / 2 + margen), Math.abs(dy) / (TARJETA.alto / 2 + margen), 1e-6)
  return { x: a.x + dx * escala, y: a.y + dy * escala }
}

/**
 * Trazo entre dos activos, con su punto medio (para etiquetas y marcas). Tres formas, para que ninguna línea
 * atraviese una tarjeta:
 *   - hacia el atacante (mando y control, exfiltración): un arco por encima del lienzo, «saliendo a Internet»;
 *   - dentro de una columna con activos en medio: una curva por el lateral derecho;
 *   - el resto: recta de borde a borde.
 * `desplazamiento` separa en paralelo el ataque y la ruta del enlace de red, para que no se tapen.
 */
function trazo(a: Activo, b: Activo, entre: readonly Activo[], desplazamiento = 0): { d: string; mx: number; my: number } {
  const medio = (p0: Punto, c1: Punto, c2: Punto, p1: Punto) => ({
    mx: (p0.x + 3 * c1.x + 3 * c2.x + p1.x) / 8,
    my: (p0.y + 3 * c1.y + 3 * c2.y + p1.y) / 8,
  })
  const curva = (p0: Punto, c1: Punto, c2: Punto, p1: Punto) => ({
    d: `M${p0.x},${p0.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p1.x},${p1.y}`,
    ...medio(p0, c1, c2, p1),
  })

  if (b.tipo === 'atacante') {
    const p0 = { x: a.x + desplazamiento, y: a.y - TARJETA.alto / 2 }
    const p1 = { x: b.x + desplazamiento, y: b.y - TARJETA.alto / 2 }
    return curva(p0, { x: p0.x, y: 12 }, { x: p1.x, y: 12 }, p1)
  }
  const mismaColumna = Math.abs(a.x - b.x) < 10
  const hayOtroEnMedio = entre.some((c) => c !== a && c !== b && Math.abs(c.x - a.x) < 10 && (c.y - a.y) * (c.y - b.y) < 0)
  if (mismaColumna && hayOtroEnMedio) {
    const p0 = { x: a.x + TARJETA.ancho / 2, y: a.y + desplazamiento }
    const p1 = { x: b.x + TARJETA.ancho / 2, y: b.y + desplazamiento }
    const hueco = 78 + desplazamiento
    return curva(p0, { x: p0.x + hueco, y: p0.y }, { x: p1.x + hueco, y: p1.y }, p1)
  }
  const p = borde(a, b)
  const q = borde(b, a)
  const largo = Math.hypot(q.x - p.x, q.y - p.y) || 1
  const nx = (-(q.y - p.y) / largo) * desplazamiento
  const ny = ((q.x - p.x) / largo) * desplazamiento
  return { d: `M${p.x + nx},${p.y + ny} L${q.x + nx},${q.y + ny}`, mx: (p.x + q.x) / 2 + nx, my: (p.y + q.y) / 2 + ny }
}

const ESTILO_ESTADO: Record<EstadoActivo | 'riesgo', { tarjeta: string; pastilla?: { texto: string; clase: string; icono: LucideIcon } }> = {
  normal: { tarjeta: 'border-borde-tarjeta bg-superficie' },
  riesgo: {
    tarjeta: 'border-dashed border-sev-media bg-estado-riesgo',
    pastilla: { texto: 'En riesgo', clase: 'bg-sev-media', icono: TriangleAlert },
  },
  comprometido: {
    tarjeta: 'border-2 border-sev-critica bg-estado-comprometido',
    pastilla: { texto: 'Comprometido', clase: 'bg-sev-critica', icono: Bug },
  },
  aislado: {
    tarjeta: 'border-2 border-acento bg-estado-aislado',
    pastilla: { texto: 'Aislado', clase: 'bg-acento', icono: Unplug },
  },
  protegido: {
    tarjeta: 'border-2 border-ok bg-estado-protegido',
    pastilla: { texto: 'Protegido', clase: 'bg-ok', icono: ShieldCheck },
  },
}

interface Props {
  org: Organizacion
  ev: Evaluacion
  ruta: RutaProbable | null
  riesgo: Set<string>
}

/** Ficha de un activo (la misma desde la vista 2D y desde la maqueta 3D). */
export function FichaActivo({ org, ev, activo, alCerrar }: { org: Organizacion; ev: Evaluacion; activo: Activo; alCerrar: () => void }) {
  const activos = porId(org.activos)
  const pasos = ev.pasos.filter((p) => p.paso.desde === activo.id || p.paso.hasta === activo.id)
  const vecinos = org.enlaces.filter((e) => e.desde === activo.id || e.hasta === activo.id)
  const Icono = ICONO[activo.tipo]
  const estado = ev.estado.get(activo.id) ?? 'normal'
  return (
    <Dialog open onOpenChange={(abierto) => !abierto && alCerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg text-primario">
            <Icono className="size-5 text-texto-suave" aria-hidden />
            {activo.nombre}
            {activo.joya && <span className="rounded-full bg-sev-media/15 px-2 py-0.5 text-[11px] font-semibold text-sev-media">Joya de la corona</span>}
          </DialogTitle>
          <DialogDescription>
            {activo.area} · {org.zonas.find((z) => z.id === activo.zona)?.titulo}
            {activo.ip && ` · ${activo.ip}`} · criticidad {activo.criticidad}/5 · estado: {estado}
          </DialogDescription>
        </DialogHeader>
        <section className="space-y-1.5">
          <h3 className="text-[13px] font-semibold text-acento">Lo que ha pasado aquí</h3>
          {pasos.length === 0 ? (
            <p className="text-texto-suave">Nada todavía.</p>
          ) : (
            <ul className="space-y-1.5">
              {pasos.map(({ paso, ocurrido, motivo }) => (
                <li key={paso.id} className={cn('rounded-lg px-2.5 py-1.5 text-[13px]', ocurrido ? 'bg-sev-critica/10' : 'bg-superficie-alterna')}>
                  <span className="font-medium text-texto">{paso.hora} · {paso.titulo}</span>
                  <span className="block text-xs text-texto-suave">
                    {NOMBRE_TACTICA[paso.tactica]} · {paso.tecnica}
                    {ocurrido ? '' : ` · impedido: ${motivo}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-1.5">
          <h3 className="text-[13px] font-semibold text-acento">Conexiones de red</h3>
          <ul className="flex flex-wrap gap-1.5">
            {vecinos.map((e) => (
              <li key={`${e.desde}-${e.hasta}`} className="rounded-full bg-superficie-alterna px-2 py-0.5 text-xs text-texto">
                {e.desde === activo.id ? `→ ${activos.get(e.hasta)?.nombre}` : `← ${activos.get(e.desde)?.nombre}`} · {e.servicio}
              </li>
            ))}
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  )
}

export function GrafoOrganizacion({ org, ev, ruta, riesgo }: Props) {
  const marco = useRef<HTMLDivElement>(null)
  const [ajuste, setAjuste] = useState(1)
  const [fichaId, setFichaId] = useState<string | null>(null)
  const reducido = useMovimientoReducido()
  const { vista, arrastrando, acercar, alejar } = useZoomLienzo(marco)
  const { ancho, alto } = org.lienzo
  const activos = porId(org.activos)
  const ultimo = ev.ocurridos.at(-1)
  const ficha = fichaId ? activos.get(fichaId) : undefined

  useLayoutEffect(() => {
    const el = marco.current
    if (!el) return
    const medir = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width < 40 || height < 40) return
      setAjuste(Math.max(0.3, Math.min((width - 24) / ancho, (height - 24) / alto, 1.1)))
    }
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [ancho, alto])

  const zonas = org.zonas.map((zona) => {
    const xs = org.activos.filter((a) => a.zona === zona.id).map((a) => a.x)
    return { ...zona, cx: xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0 }
  })
  const tramosRuta = ruta ? ruta.camino.slice(1).map((id, i) => [ruta.camino[i], id] as const) : []

  return (
    <div
      ref={marco}
      role="region"
      aria-label={`Grafo de ${org.nombre}`}
      className={cn('relative h-full w-full touch-none overflow-hidden rounded-2xl border border-borde bg-lienzo select-none', arrastrando ? 'cursor-grabbing' : 'cursor-grab')}
    >
      <div className="fondo-puntos absolute inset-0" aria-hidden />
      <div
        className="absolute top-1/2 left-1/2"
        style={{ width: ancho, height: alto, transform: `translate(calc(-50% + ${vista.x}px), calc(-50% + ${vista.y}px)) scale(${ajuste * vista.zoom})` }}
      >
        <svg className="pointer-events-none absolute inset-0 overflow-visible" width={ancho} height={alto} aria-hidden>
          <defs>
            {Object.entries(COLOR).map(([clave, color]) => (
              <marker key={clave} id={`flecha-${org.id}-${clave}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
                <path d="M0,1.2 L9,5 L0,8.8 z" fill={color} />
              </marker>
            ))}
          </defs>

          {zonas.map((zona) => (
            <g key={zona.id}>
              <rect x={zona.cx - ANCHO_ZONA / 2} y={8} width={ANCHO_ZONA} height={alto - 16} rx={18} fill="var(--zona)" fillOpacity={0.55} stroke="var(--borde)" strokeDasharray="4 6" />
              <text x={zona.cx} y={34} textAnchor="middle" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', fill: 'var(--texto-suave)' }}>
                {zona.titulo.toUpperCase()}
              </text>
            </g>
          ))}

          {org.enlaces.map((enlace) => {
            const a = activos.get(enlace.desde)!
            const b = activos.get(enlace.hasta)!
            const s = trazo(a, b, org.activos)
            return (
              <path key={`${enlace.desde}-${enlace.hasta}`} d={s.d} fill="none" stroke={COLOR.red} strokeWidth={1.3} strokeOpacity={0.55} markerEnd={`url(#flecha-${org.id}-red)`}>
                <title>{`${a.nombre} → ${b.nombre}: ${enlace.servicio}`}</title>
              </path>
            )
          })}

          {tramosRuta.map(([desde, hasta]) => {
            const s = trazo(activos.get(desde)!, activos.get(hasta)!, org.activos, -7)
            return (
              <path key={`ruta-${desde}-${hasta}`} data-ruta={`${desde}-${hasta}`} d={s.d} fill="none" stroke={COLOR.ruta} strokeWidth={2.5}
                    strokeDasharray="7 6" className={reducido ? undefined : 'arista-flujo'} markerEnd={`url(#flecha-${org.id}-ruta)`} />
            )
          })}

          {ev.pasos.filter(({ paso }) => paso.desde !== paso.hasta).map(({ paso, ocurrido }) => {
            const s = trazo(activos.get(paso.desde)!, activos.get(paso.hasta)!, org.activos, 7)
            const esUltimo = ocurrido && paso === ultimo
            return (
              <g key={paso.id} data-paso={paso.id} data-ocurrido={ocurrido ? 'true' : 'false'}>
                {esUltimo && <path d={s.d} fill="none" stroke={COLOR.ataque} strokeWidth={10} strokeOpacity={0.15} strokeLinecap="round" />}
                <path
                  d={s.d}
                  fill="none"
                  stroke={ocurrido ? COLOR.ataque : COLOR.bloqueado}
                  strokeWidth={ocurrido ? 2.8 : 2}
                  strokeDasharray={ocurrido ? (esUltimo ? '10 8' : undefined) : '4 5'}
                  className={esUltimo && !reducido ? 'arista-flujo' : undefined}
                  markerEnd={`url(#flecha-${org.id}-${ocurrido ? 'ataque' : 'bloqueado'})`}
                />
                {!ocurrido && (
                  <g transform={`translate(${s.mx} ${s.my})`}>
                    <circle r={9} fill="var(--superficie)" stroke={COLOR.bloqueado} />
                    <path d="M-3.5,-3.5 L3.5,3.5 M3.5,-3.5 L-3.5,3.5" stroke={COLOR.bloqueado} strokeWidth={2} strokeLinecap="round" />
                  </g>
                )}
              </g>
            )
          })}
        </svg>

        {org.activos.map((activo) => {
          const Icono = ICONO[activo.tipo]
          const estadoBase = ev.estado.get(activo.id) ?? 'normal'
          const estado = estadoBase === 'normal' && riesgo.has(activo.id) ? 'riesgo' : estadoBase
          const estilo = ESTILO_ESTADO[estado]
          const atacante = activo.tipo === 'atacante'
          const golpeado = ultimo && ultimo.hasta === activo.id && ultimo.compromete !== false
          const objetivoRuta = ruta?.joya === activo.id
          return (
            <button
              key={activo.id}
              type="button"
              onClick={() => setFichaId(activo.id)}
              data-activo={activo.id}
              data-estado={atacante ? 'atacante' : estado}
              aria-label={`${activo.nombre} · ${activo.area} · ${atacante ? 'atacante' : estado}${activo.joya ? ' · joya de la corona' : ''}`}
              className={cn(
                'absolute flex flex-col justify-center rounded-2xl border px-3 py-2 text-left shadow-[0_6px_16px_rgba(15,23,42,0.08)] transition-colors duration-500',
                'hover:shadow-[0_10px_24px_rgba(15,23,42,0.14)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
                atacante ? 'border-atacante-borde bg-atacante-fondo text-atacante-texto' : estilo.tarjeta,
                objetivoRuta && 'ring-2 ring-sev-media/70 ring-offset-2 ring-offset-lienzo',
              )}
              style={{ left: activo.x - TARJETA.ancho / 2, top: activo.y - TARJETA.alto / 2, width: TARJETA.ancho, height: TARJETA.alto }}
            >
              {golpeado && <span className="anillo-activo" style={{ borderColor: 'var(--sev-critica)' }} aria-hidden />}
              {!atacante && estilo.pastilla && (
                <span className={cn('absolute -top-2.5 right-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-sobre-intenso shadow-sm', estilo.pastilla.clase)}>
                  <estilo.pastilla.icono className="size-3" aria-hidden />
                  {estilo.pastilla.texto}
                </span>
              )}
              {activo.joya && (
                <span className="absolute -top-2.5 left-2 flex items-center gap-1 rounded-full bg-fam-ambar-fondo px-1.5 py-0.5 text-[10px] font-semibold text-fam-ambar-texto shadow-sm">
                  <Crown className="size-3" aria-hidden />
                  Joya
                </span>
              )}
              <span className="flex min-w-0 items-center gap-2">
                <Icono className={cn('size-4 shrink-0', atacante ? 'text-atacante-icono' : 'text-texto-suave')} aria-hidden />
                <span className={cn('truncate text-[13px] font-semibold', atacante ? 'text-atacante-texto' : 'text-texto')}>{activo.nombre}</span>
              </span>
              <span className={cn('mt-0.5 flex items-center justify-between gap-2 text-[11px]', atacante ? 'text-atacante-suave' : 'text-texto-suave')}>
                <span className="truncate">{atacante ? (activo.ip ?? 'Internet') : activo.area}</span>
                {!atacante && (
                  <span className="flex shrink-0 gap-0.5" aria-hidden title={`Criticidad ${activo.criticidad}/5`}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <span key={i} className={cn('size-1.5 rounded-full', i < activo.criticidad ? 'bg-texto-suave' : 'bg-separador')} />
                    ))}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <ControlesZoom zoom={vista.zoom} alAcercar={acercar} alAlejar={alejar} />
      <ul
        aria-label="Leyenda del grafo"
        className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-5rem)] flex-wrap gap-x-3 gap-y-1 rounded-xl border border-borde bg-superficie px-3 py-1.5 text-[11px] text-texto-suave"
      >
        {[
          { texto: 'Red', color: COLOR.red, trazo: undefined },
          { texto: 'Paso del ataque', color: COLOR.ataque, trazo: undefined },
          { texto: 'Paso impedido', color: COLOR.bloqueado, trazo: '4 3' },
          { texto: 'Ruta probable', color: COLOR.ruta, trazo: '5 3' },
        ].map((l) => (
          <li key={l.texto} className="flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden>
              <line x1="0" y1="3" x2="18" y2="3" stroke={l.color} strokeWidth="2.5" strokeDasharray={l.trazo} />
            </svg>
            {l.texto}
          </li>
        ))}
      </ul>

      {ficha && <FichaActivo org={org} ev={ev} activo={ficha} alCerrar={() => setFichaId(null)} />}
    </div>
  )
}
