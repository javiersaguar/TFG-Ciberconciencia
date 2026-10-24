/**
 * Lienzo del pipeline: fondo de puntos, tarjetas y curvas. Al pulsar una pieza se abre su ficha (qué es, qué hace,
 * cómo se conecta, dónde está en el repo). Se acerca, aleja y mueve con la rueda, el panel táctil, arrastrando o con
 * los botones de la esquina (`zoom.ts`), sin tocar el zoom del navegador. Mismo lienzo que el de PIDS.
 *
 * Las piezas planificadas (fases futuras) van en discontinua y atenuadas, con su fase en la pastilla, y sus tramos
 * en trazo discontinuo: el grafo enseña a la vez lo que hay y lo que falta.
 *
 * Con `flujos` (lo que está pasando ahora, `actividad.ts`), las aristas por las que circula el dato se iluminan: un
 * halo, un trazo discontinuo que avanza en el sentido del dato y dos puntos que recorren la curva (SMIL
 * `animateMotion`); las piezas que trabajan llevan un anillo que late y una pastilla con su estado. El resto se
 * atenúa. Con `prefers-reduced-motion` quedan el halo y las pastillas, sin movimiento.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { useMovimientoReducido } from '@/componentes/datos/useMovimientoReducido'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog'
import { cn } from '@/lib/utils'

import { claveArista, SIN_FLUJOS, type Flujos } from './actividad'
import { ControlesZoom } from './ControlesZoom'
import { ARISTAS, esTramoPlanificado, LIENZO, NODOS, TARJETA, TONOS, type Arista, type EstadoPieza, type Lado, type Nodo } from './nodos'
import { useZoomLienzo } from './zoom'

/** Segundos que tarda un punto en recorrer una arista activa. */
const DURACION_RECORRIDO_S = 2.2
/** Color de relleno de tarjetas y etiquetas: el de `--superficie`, nunca blanco. */
/** Color del plano de las tarjetas: un token, para que el halo y los rótulos sigan al tema. */
const SUPERFICIE = 'var(--superficie)'

const DIR: Record<Lado, { x: number; y: number }> = {
  derecha: { x: 1, y: 0 },
  izquierda: { x: -1, y: 0 },
  abajo: { x: 0, y: 1 },
  arriba: { x: 0, y: -1 },
}

const TEXTO_ESTADO: Record<EstadoPieza, string> = {
  operativa: 'Operativa',
  base: 'Base, sin conectar',
  planificada: 'Planificada',
}

function ancla(nodo: Nodo, lado: Lado, desplaza = 0) {
  const cx = nodo.x + TARJETA.ancho / 2
  const cy = nodo.y + TARJETA.alto / 2
  if (lado === 'derecha') return { x: nodo.x + TARJETA.ancho, y: cy + desplaza }
  if (lado === 'izquierda') return { x: nodo.x, y: cy + desplaza }
  if (lado === 'abajo') return { x: cx + desplaza, y: nodo.y + TARJETA.alto }
  return { x: cx + desplaza, y: nodo.y }
}

type Punto = { x: number; y: number }

function puntoCurva(p0: Punto, p1: Punto, p2: Punto, p3: Punto, t: number): Punto {
  const u = 1 - t
  return {
    x: u ** 3 * p0.x + 3 * u ** 2 * t * p1.x + 3 * u * t ** 2 * p2.x + t ** 3 * p3.x,
    y: u ** 3 * p0.y + 3 * u ** 2 * t * p1.y + 3 * u * t ** 2 * p2.y + t ** 3 * p3.y,
  }
}

function trazo(arista: Arista, porId: Map<string, Nodo>) {
  const origen = porId.get(arista.desde)!
  const destino = porId.get(arista.hasta)!
  const p0 = ancla(origen, arista.salida, arista.desplazaSalida ?? 0)
  const p3 = ancla(destino, arista.entrada, arista.desplazaEntrada ?? 0)
  const dist = Math.hypot(p3.x - p0.x, p3.y - p0.y)
  const fuerza = Math.max(36, dist * 0.42)
  const sale = DIR[arista.salida]
  const entra = DIR[arista.entrada]
  const p1 = { x: p0.x + sale.x * fuerza, y: p0.y + sale.y * fuerza }
  const p2 = { x: p3.x + entra.x * fuerza, y: p3.y + entra.y * fuerza }
  return {
    d: `M${p0.x},${p0.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`,
    medio: puntoCurva(p0, p1, p2, p3, arista.tEtiqueta ?? 0.5),
    color: TONOS[arista.tono].linea,
  }
}

/** Texto de ficha con `código` entre comillas invertidas. */
function ConCodigo({ texto }: { texto: string }) {
  const partes = texto.split('`')
  return (
    <>
      {partes.map((parte, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded bg-superficie-hundida px-1 py-px text-[12.5px]">{parte}</code>
        ) : (
          <span key={i}>{parte}</span>
        ),
      )}
    </>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-[13px] font-semibold text-acento">{titulo}</h3>
      {children}
    </div>
  )
}

function Parrafos({ parrafos }: { parrafos: string[] }) {
  return parrafos.map((parrafo) => (
    <p key={parrafo} className="leading-relaxed text-texto">
      <ConCodigo texto={parrafo} />
    </p>
  ))
}

function Ficha({ nodo, alCerrar }: { nodo: Nodo; alCerrar: () => void }) {
  const tono = TONOS[nodo.tono]
  const Icono = nodo.icono
  return (
    <Dialog open onOpenChange={(abierto) => !abierto && alCerrar()}>
      <DialogContent showCloseButton={false} className="max-h-[85vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <div className={cn('relative sticky top-0 z-10 flex items-start gap-3 px-5 pt-5 pr-20 pb-4', tono.fondo)}>
          <DialogClose className="absolute top-3 right-3 rounded-lg px-2 py-1 text-xs font-medium text-texto-suave hover:bg-superficie/70 hover:text-texto">
            Cerrar
          </DialogClose>
          <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl bg-superficie shadow-sm', tono.texto)} aria-hidden>
            <Icono className="size-5" />
          </span>
          <DialogHeader className="gap-1">
            <DialogTitle className="text-lg text-primario">{nodo.nombre ?? nodo.titulo}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-2">
              {nodo.tecnologia}
              <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold', tono.pastilla)}>{nodo.datos}</span>
              <span
                className={cn(
                  'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  nodo.estado === 'operativa' ? 'bg-ok/15 text-ok' : nodo.estado === 'base' ? 'bg-acento/15 text-acento' : 'bg-superficie-hundida text-texto-suave',
                )}
              >
                {TEXTO_ESTADO[nodo.estado]} · {nodo.fase}
              </span>
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-4 px-5 py-4">
          <Bloque titulo="Qué es"><Parrafos parrafos={nodo.queEs} /></Bloque>
          <Bloque titulo="Qué hace"><Parrafos parrafos={nodo.queHace} /></Bloque>
          <Bloque titulo="Cómo se conecta aquí"><Parrafos parrafos={nodo.comoConecta} /></Bloque>
          {nodo.ficheros && (
            <Bloque titulo="En el repositorio">
              <ul className="flex flex-wrap gap-1.5">
                {nodo.ficheros.map((fichero) => (
                  <li key={fichero}>
                    <code className="rounded bg-superficie-hundida px-1.5 py-0.5 text-[12.5px]">{fichero}</code>
                  </li>
                ))}
              </ul>
            </Bloque>
          )}
        </div>
        {nodo.enlace && (
          <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
            <a
              href={nodo.enlace.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-acento-suave px-3 py-1.5 text-xs font-semibold text-acento hover:bg-acento/20"
            >
              {nodo.enlace.texto}
            </a>
            <span className="text-xs text-texto-suave">Solo con el perfil de docker compose levantado en este equipo.</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Los dos puntos que recorren una arista activa, desfasados media vuelta (el `begin` negativo arranca en marcha). */
function Puntos({ d, color }: { d: string; color: string }) {
  return (
    <>
      {[0, 1].map((indice) => (
        <circle key={indice} r={4.5} fill={color} stroke={SUPERFICIE} strokeWidth={1.5} className="punto-flujo">
          <animateMotion dur={`${DURACION_RECORRIDO_S}s`} repeatCount="indefinite" begin={`${(-indice * DURACION_RECORRIDO_S) / 2}s`} path={d} />
        </circle>
      ))}
    </>
  )
}

function Leyenda() {
  const tramos: { texto: string; color: string; discontinua?: boolean }[] = [
    { texto: 'Topic de Redpanda', color: TONOS.verde.linea },
    { texto: 'Escritura en ClickHouse', color: TONOS.cian.linea },
    { texto: 'DLQ', color: TONOS.coral.linea },
    { texto: 'Métricas', color: TONOS.pizarra.linea },
    { texto: 'Fase futura', color: TONOS.violeta.linea, discontinua: true },
  ]
  return (
    <ul
      aria-label="Leyenda del grafo"
      className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-5rem)] flex-wrap gap-x-3 gap-y-1 rounded-xl border border-borde bg-superficie px-3 py-1.5 text-[11px] text-texto-suave"
    >
      {tramos.map((tramo) => (
        <li key={tramo.texto} className="flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line x1="0" y1="3" x2="18" y2="3" stroke={tramo.color} strokeWidth="2.5" strokeDasharray={tramo.discontinua ? '4 3' : undefined} />
          </svg>
          {tramo.texto}
        </li>
      ))}
    </ul>
  )
}

export function Lienzo({ flujos = SIN_FLUJOS }: { flujos?: Flujos }) {
  const marco = useRef<HTMLDivElement>(null)
  const [ajuste, setAjuste] = useState(1)
  const [activoId, setActivoId] = useState<string | null>(null)
  const reducido = useMovimientoReducido()
  const { vista, arrastrando, acercar, alejar } = useZoomLienzo(marco)
  const porId = new Map(NODOS.map((nodo) => [nodo.id, nodo]))
  const curvas = ARISTAS.map((arista) => ({ arista, planificada: esTramoPlanificado(arista, porId), ...trazo(arista, porId) }))
  const activo = NODOS.find((nodo) => nodo.id === activoId) ?? null
  const hayFlujos = flujos.aristas.size > 0

  useLayoutEffect(() => {
    const el = marco.current
    if (!el) return
    const medir = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width < 40 || height < 40) return
      const siguiente = Math.min((width - 28) / LIENZO.ancho, (height - 28) / LIENZO.alto)
      setAjuste(Math.max(0.35, Math.min(siguiente, 1.05)))
    }
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={marco}
      className={cn('relative h-full w-full touch-none overflow-hidden rounded-2xl border border-borde select-none', arrastrando ? 'cursor-grabbing' : 'cursor-grab', flujos.aristas.size === 0 && flujos.nodos.size === 0 && 'lienzo-quieto')}
      role="region"
      aria-label="Grafo del pipeline"
    >
      <div className="fondo-marea absolute inset-0" aria-hidden />
      <div className="fondo-puntos absolute inset-0" aria-hidden />
      <div className="orbita orbita-azul" aria-hidden />
      <div className="orbita orbita-verde" aria-hidden />
      <div className="orbita orbita-cielo" aria-hidden />

      <div
        className="absolute top-1/2 left-1/2"
        style={{ width: LIENZO.ancho, height: LIENZO.alto, transform: `translate(calc(-50% + ${vista.x}px), calc(-50% + ${vista.y}px)) scale(${ajuste * vista.zoom})` }}
      >
        <svg className="pointer-events-none absolute inset-0 overflow-visible" width={LIENZO.ancho} height={LIENZO.alto} aria-hidden>
          <defs>
            {(Object.keys(TONOS) as (keyof typeof TONOS)[]).map((tono) => (
              <marker key={tono} id={`punta-${tono}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,1.2 L9,5 L0,8.8 z" fill={TONOS[tono].linea} />
              </marker>
            ))}
          </defs>
          {curvas.map(({ arista, planificada, d, medio, color }) => {
            const clave = claveArista(arista.desde, arista.hasta)
            const ancho = arista.etiqueta.length * 6.3 + 18
            const flujo = flujos.aristas.get(clave)
            const opacidad = hayFlujos && !flujo ? 0.35 : planificada ? 0.7 : 1
            return (
              <g
                key={clave}
                data-arista={clave}
                data-activa={flujo ? 'true' : undefined}
                data-planificada={planificada ? 'true' : undefined}
                className="transition-opacity duration-500"
                style={{ opacity: opacidad }}
              >
                {flujo && <path d={d} fill="none" stroke={color} strokeWidth={11} strokeOpacity={0.18} strokeLinecap="round" />}
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={flujo ? 2.5 : 2}
                  strokeDasharray={planificada ? '6 6' : undefined}
                  markerEnd={`url(#punta-${arista.tono})`}
                />
                {flujo && <path d={d} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" className="arista-flujo" />}
                {flujo && !reducido && <Puntos d={d} color={color} />}
                <rect x={medio.x - ancho / 2} y={medio.y - 11} width={ancho} height={22} rx={11} fill={SUPERFICIE} stroke={color} strokeOpacity={0.5} />
                <text x={medio.x} y={medio.y + 4} textAnchor="middle" fill={color} style={{ fontSize: 11, fontWeight: 600 }}>
                  {arista.etiqueta}
                </text>
              </g>
            )
          })}
        </svg>

        {NODOS.map((nodo) => {
          const tono = TONOS[nodo.tono]
          const Icono = nodo.icono
          const seleccionado = nodo.id === activoId
          const realce = flujos.nodos.get(nodo.id)
          const colorRealce = realce ? TONOS[realce.tono].linea : tono.linea
          const planificada = nodo.estado === 'planificada'
          return (
            <button
              key={nodo.id}
              type="button"
              onClick={() => setActivoId(nodo.id)}
              data-activo={realce ? 'true' : undefined}
              data-estado={nodo.estado}
              aria-label={`${nodo.nombre ?? nodo.titulo} · ${TEXTO_ESTADO[nodo.estado]} (${nodo.fase})`}
              className={cn(
                'absolute flex flex-col rounded-2xl border px-3.5 py-3 text-left shadow-[0_6px_18px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.11)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
                planificada ? 'border-dashed border-borde-discontinuo bg-lateral' : 'border-borde-tarjeta bg-superficie',
                hayFlujos && !realce && !seleccionado && 'opacity-65',
                !hayFlujos && planificada && !seleccionado && 'opacity-80',
              )}
              style={{
                left: nodo.x,
                top: nodo.y,
                width: TARJETA.ancho,
                height: TARJETA.alto,
                boxShadow: seleccionado || realce ? `0 0 0 2px ${SUPERFICIE}, 0 0 0 4px ${seleccionado ? tono.linea : colorRealce}` : undefined,
              }}
            >
              {realce && (
                <>
                  <span className="anillo-activo" style={{ borderColor: colorRealce }} aria-hidden />
                  {/* Pastilla de su familia (fondo claro + texto oscuro, o al revés en oscuro): con texto claro sobre el color
                      de la línea no llegaba a 4,5:1. El borde mantiene el color del tramo. */}
                  <span
                    className={cn('absolute -top-2.5 right-3 max-w-[88%] truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-sm', TONOS[realce.tono].pastilla)}
                    style={{ borderColor: colorRealce }}
                  >
                    {realce.texto}
                  </span>
                </>
              )}
              <span className="flex min-w-0 items-start gap-2.5">
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', tono.fondo, tono.texto)} aria-hidden>
                  <Icono className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] leading-tight font-semibold text-texto">{nodo.titulo}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-texto-suave">{nodo.subtitulo}</span>
                </span>
              </span>
              <span className="mt-auto flex items-center justify-between gap-2 border-t border-dashed border-separador pt-1.5">
                <span className="truncate text-[11px] text-texto-suave/90">{nodo.tecnologia}</span>
                {planificada ? (
                  <span className="shrink-0 rounded-full bg-superficie-hundida px-2 py-0.5 text-[10px] font-semibold text-texto-suave">{nodo.fase}</span>
                ) : (
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', tono.pastilla)}>{nodo.datos}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <ControlesZoom zoom={vista.zoom} alAcercar={acercar} alAlejar={alejar} />
      <Leyenda />

      {activo && <Ficha nodo={activo} alCerrar={() => setActivoId(null)} />}
    </div>
  )
}
