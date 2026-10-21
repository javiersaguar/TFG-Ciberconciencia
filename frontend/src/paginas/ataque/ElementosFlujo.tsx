/**
 * Nodos y arista personalizados del explorador (React Flow). Memorizados y sin edición: el grafo representa
 * evidencia, no es un editor (`nodesConnectable={false}`, `nodesDraggable={false}` en la página). Las asas existen
 * solo para anclar las aristas; son invisibles e inertes.
 *
 * Todo texto que viene de la telemetría (procesos, reglas, cuentas) se pinta como TEXTO, nunca como HTML.
 */
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, Handle, Position, useStore, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react'
import { Cpu, Layers, Monitor, Server, Siren, UserRound, type LucideIcon } from 'lucide-react'
import { memo, type CSSProperties } from 'react'

import type { AristaAtaque, NodoAtaque, TipoNodoAtaque } from '@/api/ataque'
import { ChipNivel } from '@/componentes/datos/Chips'
import { cn } from '@/lib/utils'

import { MEDIDAS, type Asa as AsaCarril, type MarcaTiempo } from './carriles'
import { ESTILO_FUNDAMENTO } from './estilo'

export type DatosNodo = {
  nodo: NodoAtaque
  atenuado: boolean
  actual: boolean
  seleccionado: boolean
  pulso?: boolean
  /** Ancho de la caja (las bandas de campaña miden su ventana). */
  ancho?: number
  /** Solo carriles: asas a la hora de cada arista, rejilla de tiempo y si llevan las horas encima. */
  asas?: AsaCarril[]
  marcas?: MarcaTiempo[]
  conHoras?: boolean
}
export type NodoFlujo = Node<DatosNodo, TipoNodoAtaque>
export type DatosArista = { arista: AristaAtaque; atenuado: boolean; actual: boolean; dibujar?: boolean; mostrarEtiqueta?: boolean }
export type AristaFlujo = Edge<DatosArista, 'relacion'>

const ASA = '!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0 pointer-events-none'

function Asa({ tipo, posicion, id, estilo }: { tipo: 'source' | 'target'; posicion: Position; id: string; estilo?: CSSProperties }) {
  return <Handle type={tipo} position={posicion} id={id} isConnectable={false} className={ASA} style={estilo} />
}

/** Asas comunes de las tarjetas: entran por arriba, abajo e izquierda; salen por arriba y derecha. */
function AsasTarjeta() {
  return (
    <>
      <Asa tipo="target" posicion={Position.Top} id="t-arriba" />
      <Asa tipo="target" posicion={Position.Bottom} id="t-abajo" />
      <Asa tipo="target" posicion={Position.Left} id="t-izquierda" />
      <Asa tipo="source" posicion={Position.Top} id="s-arriba" />
      <Asa tipo="source" posicion={Position.Right} id="s-derecha" />
      <Asa tipo="source" posicion={Position.Bottom} id="s-abajo" />
    </>
  )
}

const ICONO: Record<TipoNodoAtaque, LucideIcon> = { host: Monitor, cuenta: UserRound, proceso: Cpu, alerta: Siren, campana: Layers }
const TEXTO_TIPO: Record<TipoNodoAtaque, string> = { host: 'Host', cuenta: 'Cuenta', proceso: 'Proceso', alerta: 'Alerta', campana: 'Campaña' }

/** Zoom a partir del cual las tarjetas enseñan su detalle (zoom semántico). */
export const ZOOM_DETALLE = 0.85

function NodoHostBase({ data }: NodeProps<NodoFlujo>) {
  const { nodo, atenuado, seleccionado, actual, asas = [], marcas = [], conHoras } = data
  const Icono = nodo.hosts[0] === 'NEWYORK' ? Server : Monitor
  const papel = nodo.detalle.hechos.find((h) => h.etiqueta === 'Papel')?.valor
  return (
    <div
      className={cn(
        'relative h-full w-full rounded-xl border bg-zona/60 transition-opacity duration-300 motion-reduce:transition-none',
        seleccionado ? 'border-2 border-acento' : actual ? 'border-2 border-fund-observado' : 'border-borde',
        atenuado && 'opacity-45',
      )}
    >
      {/* Rejilla de tiempo: una línea cada dos minutos; el primer carril lleva las horas encima. */}
      {marcas.map((m) => (
        <div key={m.ms} className="pointer-events-none absolute inset-y-0 border-l border-dashed border-borde/70" style={{ left: m.x }} aria-hidden>
          {conHoras && <span className="absolute -top-5 -translate-x-1/2 font-mono text-[11px] text-texto-suave tabular-nums">{m.texto}</span>}
        </div>
      ))}
      <div className="absolute inset-y-0 left-0 flex flex-col justify-center gap-0.5 border-r border-borde px-3" style={{ width: MEDIDAS.etiqueta }}>
        <span className="flex items-center gap-1.5">
          <Icono className="size-4 shrink-0 text-texto-suave" aria-hidden />
          <span className="font-mono text-[13px] font-semibold text-texto">{nodo.etiqueta}</span>
        </span>
        {nodo.subtitulo && <span className="font-mono text-[11.5px] text-texto-suave">{nodo.subtitulo}</span>}
        {papel && <span className="line-clamp-2 text-[11px] leading-tight text-texto-suave">{papel}</span>}
      </div>
      {asas.map((a) => (
        <Asa key={`${a.tipo}-${a.id}`} tipo={a.tipo} posicion={a.lado === 'arriba' ? Position.Top : Position.Bottom} id={a.id} estilo={{ left: a.x }} />
      ))}
    </div>
  )
}

function NodoTarjetaBase({ data, type }: NodeProps<NodoFlujo>) {
  const { nodo, atenuado, seleccionado, actual } = data
  const Icono = ICONO[type]
  const estilo = ESTILO_FUNDAMENTO[nodo.fundamento]
  const detallado = useStore((s) => s.transform[2] >= ZOOM_DETALLE)
  const marco = cn(
    'relative border bg-superficie shadow-tarjeta transition-opacity duration-300 motion-reduce:transition-none',
    seleccionado && 'ring-2 ring-acento ring-offset-2 ring-offset-lienzo',
    actual && !seleccionado && 'ring-2 ring-fund-hipotesis/70',
    atenuado && 'opacity-30',
  )
  if (type === 'campana') {
    // Banda de campaña: ocupa su ventana en el eje de tiempo.
    return (
      <div
        style={{ width: data.ancho ?? MEDIDAS.banda.minimo, height: MEDIDAS.banda.alto, borderColor: estilo.color }}
        title={nodo.subtitulo ? `${nodo.etiqueta} · ${nodo.subtitulo}` : nodo.etiqueta}
        className={cn(marco, 'flex items-center gap-1.5 rounded-lg border-2 border-dashed px-2')}
      >
        <Icono className={cn('size-3.5 shrink-0', estilo.claseTexto)} aria-hidden />
        {/* el nombre de la campaña no cede: solo se recorta si ni él cabe en la banda (y entonces queda el tooltip) */}
        <span className="max-w-full shrink-0 truncate text-[12px] font-semibold whitespace-nowrap text-texto">{nodo.etiqueta}</span>
        {detallado && nodo.subtitulo && <span className="min-w-0 truncate font-mono text-[11px] text-texto-suave">{nodo.subtitulo}</span>}
        {data.pulso && <span className="pulso-nodo" aria-hidden />}
        <AsasTarjeta />
      </div>
    )
  }
  const mono = type === 'proceso' || type === 'cuenta'
  return (
    <div style={{ width: data.ancho ?? MEDIDAS.tarjeta.ancho, height: MEDIDAS.tarjeta.alto }} className={cn(marco, 'rounded-xl border-borde-tarjeta px-2.5 py-1.5')}>
      <div className="flex items-center gap-1.5">
        <Icono className="size-3.5 shrink-0 text-texto-suave" aria-hidden />
        <span className="text-[11px] font-semibold text-texto-suave">{TEXTO_TIPO[type]}</span>
        {nodo.nivel && <ChipNivel nivel={nodo.nivel} className="ml-auto" />}
      </div>
      <p className={cn('truncate text-[12px] font-semibold text-texto', mono && 'font-mono')} title={nodo.etiqueta}>
        {nodo.etiqueta}
      </p>
      {detallado && nodo.subtitulo && <p className="truncate font-mono text-[11px] text-texto-suave">{nodo.subtitulo}</p>}
      {data.pulso && <span className="pulso-nodo" aria-hidden />}
      <AsasTarjeta />
    </div>
  )
}

export const NodoHost = memo(NodoHostBase)
export const NodoTarjeta = memo(NodoTarjetaBase)

function AristaRelacionBase({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, selected }: EdgeProps<AristaFlujo>) {
  if (!data) return null
  const { arista, atenuado, actual } = data
  const geometria = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }
  const [camino, x, y] = arista.escalon ? getSmoothStepPath({ ...geometria, borderRadius: 12, offset: 36 }) : getBezierPath(geometria)
  const estilo = ESTILO_FUNDAMENTO[arista.fundamento]
  const Icono = estilo.icono
  return (
    <>
      <BaseEdge
        id={id}
        path={camino}
        markerEnd={markerEnd}
        interactionWidth={18}
        style={{
          stroke: estilo.color,
          strokeWidth: selected || actual ? 3.2 : arista.fondo ? 1.4 : 2.1,
          strokeDasharray: estilo.trazo,
          strokeLinecap: 'round',
          opacity: atenuado ? 0.18 : 1,
          transition: 'opacity 300ms',
        }}
      />
      {/* En la reproducción, el tramo del paso actual se DIBUJA en el sentido del ataque (normalizado a longitud 1). */}
      {data.dibujar && <path d={camino} pathLength={1} className="trazo-avance" style={{ stroke: estilo.color }} aria-hidden />}
      {(selected || actual || data.mostrarEtiqueta) && (
      <EdgeLabelRenderer>
        <div
          className={cn(
            'nodrag nopan pointer-events-none absolute z-10 flex items-center gap-1 rounded-full border bg-superficie px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-texto shadow-sm',
            selected && 'ring-2 ring-acento',
          )}
          style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, borderColor: estilo.color, opacity: atenuado ? 0.25 : 1 }}
        >
          <Icono className="size-3 shrink-0" style={{ color: estilo.color }} aria-hidden />
          {arista.etiqueta}
        </div>
      </EdgeLabelRenderer>
      )}
    </>
  )
}

export const AristaRelacion = memo(AristaRelacionBase)
