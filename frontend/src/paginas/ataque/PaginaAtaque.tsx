/**
 * Explorador del grafo de ataque (APT29 day1), con React Flow. Es la pieza visual principal del portal:
 *
 *   filtros     campaña, host, fundamento (observado / inferido / hipótesis) y tipo de relación
 *   lienzo      hosts con sus procesos y alertas, cuentas y campañas; zoom, desplazamiento y minimapa
 *   secuencia   el ataque en orden temporal, paso a paso, resaltando lo alcanzado
 *   recorrido   los pasos del ataque numerados (el mismo número que en el lienzo), con reproducción
 *   detalle     panel sobre el lienzo, solo con algo elegido: evidencia, horas, técnicas, procedencia y confianza
 *   lista       los mismos elementos como botones: alternativa de teclado y lector de pantalla al lienzo
 *
 * React Flow solo se carga en esta ruta (carga diferida en `rutas.tsx`). No es un editor: nada se arrastra ni se
 * conecta. La atribución de React Flow queda visible (abajo a la izquierda).
 */
import '@xyflow/react/dist/style.css'

import { Background, ControlButton, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, useStore, MarkerType, type EdgeChange, type FitViewOptions, type NodeChange, type NodeDimensionChange } from '@xyflow/react'
import { ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Map as IconoMapa, Pause, Play, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import { esListaDeTextos, esObjeto, useEstadoSesion } from '@/componentes/datos/useEstadoSesion'
import { ComoLeer } from '@/componentes/shell'

import { useGrafoAtaque, type Fundamento, type GrafoAtaque, type TipoRelacion } from '@/api/ataque'
import { formatearHora, milisegundosDelDia } from '@/componentes/datos/hora'
import { useMovimientoReducido } from '@/componentes/datos/useMovimientoReducido'
import { EstadoError } from '@/componentes/shell'
import { useTema } from '@/componentes/tema/useTema'
import { Button } from '@/componentes/ui/button'
import { Skeleton } from '@/componentes/ui/skeleton'
import { cn } from '@/lib/utils'

import { absoluta, CARRILES, disponerEnCarriles, idCarril, type Disposicion } from './carriles'
import { AristaRelacion, InsigniasPaso, NodoHost, NodoTarjeta, type AristaFlujo, type NodoFlujo } from './ElementosFlujo'
import { ESTILO_FUNDAMENTO } from './estilo'
import {
  alternar,
  buscarElemento,
  DESCRIPCION_FUNDAMENTO,
  ETIQUETA_FUNDAMENTO,
  ETIQUETA_RELACION,
  FILTROS_INICIALES,
  filtrarGrafo,
  FUNDAMENTOS,
  leerCampana,
  leerSeleccion,
  numerarPasos,
  recorridoHasta,
  RELACIONES,
  type Filtros,
} from './logica'
import { PanelDetalle } from './PanelDetalle'
import { debeAnimar, useReproduccion } from './reproduccion'

const esFiltros = (v: unknown): v is Filtros =>
  esObjeto(v) && (v.campana === null || typeof v.campana === 'string') && esListaDeTextos(v.hosts) && esListaDeTextos(v.relaciones) && esListaDeTextos(v.fundamentos)

// Fuera del componente, como pide React Flow, para que no se recreen en cada render.
const TIPOS_NODO = { host: NodoHost, cuenta: NodoTarjeta, proceso: NodoTarjeta, alerta: NodoTarjeta, campana: NodoTarjeta }
const TIPOS_ARISTA = { relacion: AristaRelacion }
const HOSTS = ['SCRANTON', 'NASHUA', 'NEWYORK', 'UTICA'] as const
/**
 * Al cargar y al redimensionar: TODO dentro. Arriba deja sitio a los controles (en horizontal, arriba a la derecha) y
 * a la fila de horas de las columnas, que va por encima del primer carril; abajo, a la atribución de React Flow.
 */
const AJUSTE_TODO: FitViewOptions = { padding: { top: '74px', x: '18px', bottom: '26px' }, minZoom: 0.2, maxZoom: 1 }
/** En un paso, si el grafo entero no se lee: el paso y el anterior, de cerca, con el texto legible (≥ 11 px). */
const AJUSTE_PASO = { padding: 0.3, minZoom: 0.8, maxZoom: 1.05 }

const TEXTOS_ARIA = {
  'node.a11yDescription.default': 'Pulsa Enter o Espacio para ver el detalle. Escape quita la selección.',
  'node.a11yDescription.keyboardDisabled': 'Pulsa Enter o Espacio para ver el detalle.',
  'edge.a11yDescription.default': 'Pulsa Enter o Espacio para ver el detalle de la relación.',
  'controls.ariaLabel': 'Controles del grafo',
  'controls.zoomIn.ariaLabel': 'Acercar',
  'controls.zoomOut.ariaLabel': 'Alejar',
  'controls.fitView.ariaLabel': 'Encajar el grafo en la vista',
  'controls.interactive.ariaLabel': 'Bloquear o desbloquear la interacción',
  'minimap.ariaLabel': 'Minimapa del grafo',
}

function Conmutador({ activo, alPulsar, children, className }: { activo: boolean; alPulsar: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={alPulsar}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
        activo ? 'border-borde bg-superficie text-texto' : 'border-dashed border-borde-discontinuo bg-transparent text-texto-suave line-through decoration-texto-suave/60 hover:text-texto',
        className,
      )}
    >
      {children}
    </button>
  )
}

function MuestraTrazo({ fundamento }: { fundamento: Fundamento }) {
  const estilo = ESTILO_FUNDAMENTO[fundamento]
  return (
    <svg width="26" height="10" aria-hidden className="shrink-0">
      <line x1="2" y1="5" x2="24" y2="5" stroke={estilo.color} strokeWidth="2.4" strokeDasharray={estilo.trazo} strokeLinecap="round" />
    </svg>
  )
}

/** Tipos de relación en un desplegable: son seis y casi nunca se tocan, así que no merecen una fila de botones. */
function SelectorRelaciones({ activas, alCambiar }: { activas: TipoRelacion[]; alCambiar: (r: TipoRelacion) => void }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const cerrar = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false
    }
    document.addEventListener('pointerdown', cerrar)
    return () => document.removeEventListener('pointerdown', cerrar)
  }, [])
  return (
    <details ref={ref} className="relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md border border-borde px-2 py-1 text-xs font-medium text-texto hover:bg-superficie-alterna [&::-webkit-details-marker]:hidden">
        Relaciones
        <span className="text-texto-suave tabular-nums">
          {activas.length}/{RELACIONES.length}
        </span>
        <ChevronDown className="size-3.5 text-texto-suave" aria-hidden />
      </summary>
      <fieldset aria-label="Tipo de relación" className="absolute top-full left-0 z-30 mt-1 w-60 space-y-0.5 rounded-lg border border-borde bg-superficie p-2 shadow-lg">
        {RELACIONES.map((r) => (
          <label key={r} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-texto hover:bg-superficie-alterna">
            <input type="checkbox" checked={activas.includes(r)} onChange={() => alCambiar(r)} className="accent-acento" />
            {ETIQUETA_RELACION[r]}
          </label>
        ))}
      </fieldset>
    </details>
  )
}

/**
 * Nombres de los carriles, siempre legibles: con el grafo lejos (zoom bajo el de detalle) el nombre dentro del carril
 * se queda diminuto, y con el grafo cerca su columna puede quedar fuera de la vista. En los dos casos aparece una
 * etiqueta a tamaño fijo en la esquina del carril, pegada al borde del lienzo si el carril empieza fuera.
 */
function NombresCarril({ disposicion }: { disposicion: Disposicion }) {
  const [tx, ty, zoom] = useStore((s) => s.transform)
  const alto = useStore((s) => s.height)
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-hidden>
      {CARRILES.map((host) => {
        const caja = disposicion.cajas[idCarril(host)]
        if (!caja) return null
        const izquierda = caja.x * zoom + tx
        const arriba = caja.y * zoom + ty
        const abajo = arriba + caja.alto * zoom
        const legibleDentro = zoom >= ZOOM_NOMBRES && izquierda >= 0
        if (legibleDentro || abajo < 0 || arriba > alto) return null
        return (
          <span key={host} data-nombre-carril style={{ top: Math.max(4, arriba + 3), left: Math.max(6, izquierda + 4) }} className="absolute rounded-md border border-borde bg-superficie px-1.5 py-px font-mono text-[11.5px] font-semibold text-texto shadow-sm">
            {host}
          </span>
        )
      })}
    </div>
  )
}

/** Color de cada nodo en el minimapa (por tipo; las campañas con el color de lo inferido). */
function colorMinimapa(nodo: { type?: string }): string {
  if (nodo.type === 'campana') return 'var(--fund-inferido)'
  if (nodo.type === 'host') return 'var(--zona)'
  return 'var(--fund-observado)'
}

const dosCifras = (n: number) => String(n).padStart(2, '0')
/** Por debajo de este zoom el nombre del host dentro de su carril ya no se lee y se repite fuera, a tamaño fijo. */
const ZOOM_NOMBRES = 0.5

/**
 * El recorrido del ataque: los pasos en orden, con su número (el mismo que llevan en el lienzo) y su hora, y los
 * controles de reproducción. Es la forma de seguir el camino sin perderse: el lienzo no se mueve mientras quepa
 * entero y legible, y aquí se lee qué pasa en cada paso.
 */
function Recorrido({ grafo, reproduccion }: { grafo: GrafoAtaque; reproduccion: ReturnType<typeof useReproduccion> }) {
  const { paso } = reproduccion
  const hito = paso == null ? null : grafo.hitos[paso]
  const total = grafo.hitos.length
  return (
    <section role="group" aria-label="Secuencia del ataque" className="space-y-2 rounded-lg border border-borde bg-superficie px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => reproduccion.accion({ tipo: reproduccion.enMarcha ? 'pausar' : 'reproducir' })}>
          {reproduccion.enMarcha ? <Pause aria-hidden /> : <Play aria-hidden />}
          {reproduccion.enMarcha ? 'Pausar' : 'Reproducir ataque'}
        </Button>
        <Button size="sm" variant="outline" disabled={paso === 0} onClick={() => reproduccion.accion({ tipo: 'anterior' })}>
          <ChevronLeft aria-hidden />
          Anterior
        </Button>
        <Button size="sm" variant="outline" disabled={paso === total - 1} onClick={() => reproduccion.accion({ tipo: 'siguiente' })}>
          Siguiente
          <ChevronRight aria-hidden />
        </Button>
        <span role="radiogroup" aria-label="Velocidad de reproducción" className="flex rounded-md bg-superficie-alterna p-0.5">
          {([1, 2, 4] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={reproduccion.velocidad === v} onClick={() => reproduccion.accion({ tipo: 'velocidad', velocidad: v })} className={cn('rounded px-2 py-0.5 text-xs font-semibold', reproduccion.velocidad === v ? 'bg-superficie text-acento shadow-sm' : 'text-texto-suave')}>
              ×{v}
            </button>
          ))}
        </span>
        {paso != null && (
          <Button size="sm" variant="ghost" onClick={() => reproduccion.accion({ tipo: 'verTodo' })}>
            <X aria-hidden />
            Ver todo
          </Button>
        )}
        <p role="status" aria-live="polite" className="min-w-[16rem] flex-1 text-[13px] text-texto">
          {hito ? (
            <>
              <span className="font-semibold">
                Paso {paso! + 1} de {total} · <span className="font-mono tabular-nums">{formatearHora(hito.hora)}</span>
              </span>{' '}
              — {hito.titulo}
            </>
          ) : (
            <span className="text-texto-suave">Los números del grafo son el orden del ataque. Elige un paso o reprodúcelo.</span>
          )}
        </p>
      </div>
      <ol aria-label="Pasos del ataque" className="flex flex-wrap gap-y-1">
        {grafo.hitos.map((h, i) => {
          const estado = paso == null ? 'neutro' : i < paso ? 'hecho' : i === paso ? 'actual' : 'futuro'
          const ms = milisegundosDelDia(h.hora)
          return (
            <li key={h.id} className="flex shrink-0 items-center">
              {i > 0 && <span className={cn('mx-0.5 h-px w-2.5', paso != null && i <= paso ? 'bg-primario' : 'bg-borde')} aria-hidden />}
              <button
                type="button"
                title={h.titulo}
                aria-label={`Paso ${i + 1}, ${formatearHora(h.hora)}: ${h.titulo}`}
                aria-current={i === paso ? 'step' : undefined}
                onClick={() => reproduccion.accion({ tipo: 'ir', paso: i })}
                className={cn('flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-superficie-alterna', i === paso && 'bg-acento-suave')}
              >
                <InsigniasPaso pasos={[{ numero: i + 1, estado }]} />
                <span className={cn('font-mono text-[11.5px] tabular-nums', estado === 'futuro' ? 'text-texto-suave' : 'text-texto')}>
                  {dosCifras(Math.floor(ms / 3_600_000))}:{dosCifras(Math.floor(ms / 60_000) % 60)}:{dosCifras(Math.floor(ms / 1000) % 60)}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** Por debajo de este zoom el grafo entero ya no se lee bien: la reproducción acerca la cámara a cada paso. */
const ZOOM_LEGIBLE = 0.7
/** Ancho del panel de detalle superpuesto al lienzo (px), para que lo elegido no quede debajo. */
const ANCHO_DETALLE = 352

function Explorador({ grafo }: { grafo: GrafoAtaque }) {
  const [parametros, setParametros] = useSearchParams()
  const seleccion = leerSeleccion(parametros.get('sel'), grafo)
  // Los filtros sobreviven a ir y volver; un ?campana= en la URL manda (y guarda aparte).
  const campanaUrl = leerCampana(parametros.get('campana'), grafo)
  const [filtros, setFiltros] = useEstadoSesion<Filtros>(campanaUrl ? `ataque:filtros:${campanaUrl}` : 'ataque:filtros:v2', () => ({ ...FILTROS_INICIALES, campana: campanaUrl }), esFiltros)
  const reproduccion = useReproduccion(grafo.hitos.length)
  const disposicion = useMemo(() => disponerEnCarriles(grafo.nodos, grafo.aristas), [grafo])
  const pasosPorNodo = useMemo(() => numerarPasos(grafo), [grafo])
  const [bajoRaton, setBajoRaton] = useState<string | null>(null)
  const [minimapa, setMinimapa] = useState(false)
  const [significados, setSignificados] = useState(false)
  const paso = reproduccion.paso
  // Nodos controlados: React Flow mide cada nodo y avisa con cambios `dimensions`; hay que devolverle esas medidas
  // (`measured`) o el minimapa y el encaje no saben cuánto ocupa cada uno.
  const [medidas, setMedidas] = useState<Record<string, { width: number; height: number }>>({})
  const { tema } = useTema()
  const reducido = useMovimientoReducido()
  const { fitView, getViewport, setViewport, getInternalNode } = useReactFlow()
  const lienzo = useRef<HTMLDivElement>(null)

  const visibles = useMemo(() => filtrarGrafo(grafo, filtros), [grafo, filtros])
  const recorrido = useMemo(() => (paso == null ? null : recorridoHasta(grafo, paso)), [grafo, paso])
  const hito = paso == null ? null : grafo.hitos[paso]
  const idsVisibles = useMemo(() => new Set(visibles.nodos.map((n) => n.id)), [visibles])
  const focoTodo = useMemo(() => [...idsVisibles].map((id) => ({ id })), [idsVisibles])
  // En un paso, se encuadra el paso y el anterior: así se ve de dónde viene el atacante, no solo dónde está.
  const focoPaso = useMemo(() => {
    if (paso == null) return []
    const ids = [...grafo.hitos[paso].nodos, ...(paso > 0 ? grafo.hitos[paso - 1].nodos : [])].filter((id) => idsVisibles.has(id) && !id.startsWith('host-'))
    return [...new Set(ids)].map((id) => ({ id }))
  }, [grafo, paso, idsVisibles])
  const zoomTodo = useRef(1)
  const estadoCamara = useRef({ focoTodo, focoPaso, enPaso: paso != null })
  useEffect(() => {
    estadoCamara.current = { focoTodo, focoPaso, enPaso: paso != null }
  }, [focoTodo, focoPaso, paso])

  const seleccionar = useCallback(
    (id: string | null) =>
      setParametros(
        (previos) => {
          const nuevos = new URLSearchParams(previos)
          if (id) nuevos.set('sel', id)
          else nuevos.delete('sel')
          return nuevos
        },
        { replace: true },
      ),
    [setParametros],
  )

  const nodos = useMemo<NodoFlujo[]>(
    () =>
      // Los hosts primero: React Flow exige que un nodo padre vaya antes que sus hijos.
      [...visibles.nodos]
        .sort((a, b) => Number(b.tipo === 'host') - Number(a.tipo === 'host'))
        .map((n) => {
          // Dentro de su carril si el carril se ve; si un filtro lo oculta, en su posición absoluta.
          const padre = disposicion.padres[n.id]
          const conPadre = !!padre && idsVisibles.has(padre)
          const caja = disposicion.cajas[n.id] ? (conPadre ? disposicion.cajas[n.id] : absoluta(n.id, disposicion)) : { x: 0, y: 0, ancho: 0, alto: 0 }
          const pasos = (pasosPorNodo[n.id] ?? []).map((numero) => ({
            numero,
            estado: paso == null ? ('neutro' as const) : numero - 1 < paso ? ('hecho' as const) : numero - 1 === paso ? ('actual' as const) : ('futuro' as const),
          }))
          return {
            id: n.id,
            type: n.tipo,
            position: { x: caja.x, y: caja.y },
            parentId: conPadre ? padre : undefined,
            extent: conPadre ? ('parent' as const) : undefined,
            ...(n.tipo === 'host' ? { style: { width: caja.ancho, height: caja.alto } } : {}),
            selected: n.id === seleccion,
            measured: medidas[n.id],
            ariaLabel: `${n.tipo === 'campana' ? 'Campaña' : n.tipo} ${n.etiqueta}${n.subtitulo ? `, ${n.subtitulo}` : ''}. ${ETIQUETA_FUNDAMENTO[n.fundamento]}.${pasos.length ? ` Paso ${pasos.map((x) => x.numero).join(' y ')} del ataque.` : ''}`,
            data: {
              nodo: n,
              seleccionado: n.id === seleccion,
              actual: !!hito?.nodos.includes(n.id),
              pulso: debeAnimar(!!hito?.nodos.includes(n.id), reducido),
              ancho: n.tipo === 'campana' ? caja.ancho : undefined,
              asas: disposicion.asas[n.id],
              columnas: n.tipo === 'host' ? disposicion.columnas : undefined,
              saltos: n.tipo === 'host' ? disposicion.saltos : undefined,
              conHoras: n.id === 'host-scranton',
              atenuado: !!recorrido && n.tipo !== 'host' && !recorrido.nodos.has(n.id),
              pasos,
            },
          }
        }),
    [visibles.nodos, seleccion, hito, recorrido, medidas, reducido, disposicion, idsVisibles, pasosPorNodo, paso],
  )

  const aristas = useMemo<AristaFlujo[]>(
    () =>
      visibles.aristas.map((a) => ({
        id: a.id,
        type: 'relacion' as const,
        source: a.origen,
        target: a.destino,
        sourceHandle: disposicion.asasArista[a.id]?.origen ?? a.asaOrigen,
        targetHandle: disposicion.asasArista[a.id]?.destino ?? a.asaDestino,
        selected: a.id === seleccion,
        markerEnd: { type: MarkerType.ArrowClosed, color: ESTILO_FUNDAMENTO[a.fundamento].color, width: 16, height: 16 },
        ariaLabel: `${ETIQUETA_RELACION[a.relacion]}: ${a.etiqueta}. ${ETIQUETA_FUNDAMENTO[a.fundamento]}.`,
        data: { arista: a, actual: !!hito?.aristas.includes(a.id), dibujar: debeAnimar(!!hito?.aristas.includes(a.id), reducido), atenuado: !!recorrido && !recorrido.aristas.has(a.id), mostrarEtiqueta: a.id === bajoRaton },
      })),
    [visibles.aristas, seleccion, hito, recorrido, reducido, bajoRaton, disposicion],
  )

  // Selección por ratón o por teclado (Enter / Espacio sobre un nodo o arista con foco): React Flow la emite como cambio.
  const alCambiarNodos = useCallback((cambios: NodeChange<NodoFlujo>[]) => {
    const elegido = cambios.find((c) => c.type === 'select' && c.selected)
    if (elegido && 'id' in elegido) seleccionar(elegido.id)
    const dimensiones = cambios.filter((c): c is NodeDimensionChange => c.type === 'dimensions' && !!c.dimensions)
    if (dimensiones.length > 0) {
      setMedidas((previas) => {
        const nuevas = { ...previas }
        for (const c of dimensiones) nuevas[c.id] = c.dimensions!
        return nuevas
      })
    }
  }, [seleccionar])
  const alCambiarAristas = useCallback((cambios: EdgeChange<AristaFlujo>[]) => {
    const elegido = cambios.find((c) => c.type === 'select' && c.selected)
    if (elegido && 'id' in elegido) seleccionar(elegido.id)
  }, [seleccionar])

  // Lo elegido no debe quedar debajo del panel de detalle: si cae ahí, el lienzo se desplaza lo justo.
  const seleccionActual = useRef(seleccion)
  useEffect(() => {
    seleccionActual.current = seleccion
  }, [seleccion])
  const asegurarVisible = useCallback(
    (duracion: number) => {
      const id = seleccionActual.current
      const nodo = id ? getInternalNode(id) : undefined
      if (!nodo || nodo.type === 'host' || !lienzo.current) return
      const { x, y, zoom } = getViewport()
      const derecha = (nodo.internals.positionAbsolute.x + (nodo.measured.width ?? 0)) * zoom + x
      const limite = lienzo.current.clientWidth - ANCHO_DETALLE - 24
      if (derecha > limite) void setViewport({ x: x - (derecha - limite), y, zoom }, { duration: duracion })
    },
    [getInternalNode, getViewport, setViewport],
  )

  // Cámara. Sin paso: todo el grafo, y se apunta a qué zoom queda. En un paso: si el grafo entero se lee, la cámara NO
  // se mueve (seguir el camino es más fácil con el lienzo quieto); si no, encuadra el paso y el anterior.
  const encuadrar = useCallback(
    (duracion: number) => {
      const { focoTodo: todo, focoPaso: delPaso, enPaso } = estadoCamara.current
      if (enPaso && zoomTodo.current >= ZOOM_LEGIBLE) return
      if (enPaso && delPaso.length) {
        void fitView({ ...AJUSTE_PASO, nodes: delPaso, duration: duracion })
        return
      }
      void fitView({ ...AJUSTE_TODO, nodes: todo, duration: duracion }).then(() => {
        zoomTodo.current = getViewport().zoom
        asegurarVisible(0)
      })
    },
    [fitView, getViewport, asegurarVisible],
  )
  useEffect(() => {
    const id = requestAnimationFrame(() => encuadrar(reducido ? 0 : 450))
    return () => cancelAnimationFrame(id)
  }, [focoTodo, focoPaso, encuadrar, reducido])
  useEffect(() => {
    let id = 0
    const alRedimensionar = () => {
      cancelAnimationFrame(id)
      id = requestAnimationFrame(() => {
        zoomTodo.current = 1
        encuadrar(0)
      })
    }
    window.addEventListener('resize', alRedimensionar)
    return () => {
      window.removeEventListener('resize', alRedimensionar)
      cancelAnimationFrame(id)
    }
  }, [encuadrar])
  useEffect(() => {
    const id = requestAnimationFrame(() => asegurarVisible(reducido ? 0 : 300))
    return () => cancelAnimationFrame(id)
  }, [seleccion, asegurarVisible, reducido])

  const elemento = buscarElemento(grafo, seleccion)
  const campanas = grafo.nodos.filter((n) => n.tipo === 'campana')
  const cambiarFiltros = (cambio: Partial<Filtros>) => setFiltros((f) => ({ ...f, ...cambio }))
  // «Restablecer» solo aparece cuando hay algo que restablecer.
  const sinCambios = JSON.stringify({ ...filtros, relaciones: [...filtros.relaciones].sort(), fundamentos: [...filtros.fundamentos].sort() }) === JSON.stringify({ ...FILTROS_INICIALES, relaciones: [...FILTROS_INICIALES.relaciones].sort(), fundamentos: [...FILTROS_INICIALES.fundamentos].sort() })

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      <header className="min-w-0">
        <h1 className="text-xl">Grafo de ataque · APT29 day1</h1>
        <p className="text-xs text-texto-suave">Quién atacó a quién, en orden y con el fundamento de cada relación.</p>
        <ComoLeer className="mt-0.5">
          <p>Un carril por host. De izquierda a derecha, el orden del ataque: cada columna es un momento con evidencia, con su hora (UTC del dataset, 2-5-2020) encima, y entre columnas se indica el tiempo que pasa. Los números son los pasos de la secuencia.</p>
          <p>Cada relación dice su fundamento: observado (telemetría), inferido (correlación del sistema) o hipótesis; ninguna está inventada. El tráfico de dominio de fondo está oculto: actívalo en «Relaciones».</p>
        </ComoLeer>
      </header>

      <div role="group" aria-label="Filtros del grafo" className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className="flex items-center gap-1.5 text-xs text-texto-suave">
            Campaña
            <select
              value={filtros.campana ?? ''}
              onChange={(e) => cambiarFiltros({ campana: e.target.value || null })}
              className="rounded-md border border-borde bg-superficie px-1.5 py-1 text-xs text-texto"
            >
              <option value="">Todas</option>
              {campanas.map((c) => (
                <option key={c.id} value={c.id.replace(/^camp-/, '')}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <span role="group" aria-label="Hosts" className="flex flex-wrap items-center gap-1">
            {HOSTS.map((h) => (
              <Conmutador key={h} activo={filtros.hosts.length === 0 || filtros.hosts.includes(h)} alPulsar={() => cambiarFiltros({ hosts: alternar(filtros.hosts.length === 0 ? [...HOSTS] : filtros.hosts, h) })}>
                <span className="font-mono">{h}</span>
              </Conmutador>
            ))}
          </span>
          <section aria-label="Leyenda: fundamento de cada relación" className="flex flex-wrap items-center gap-1">
            <span role="group" aria-label="Fundamento" className="flex flex-wrap items-center gap-1">
              {FUNDAMENTOS.map((f) => {
                const Icono = ESTILO_FUNDAMENTO[f].icono
                return (
                  <Conmutador key={f} activo={filtros.fundamentos.includes(f)} alPulsar={() => cambiarFiltros({ fundamentos: alternar(filtros.fundamentos, f) })}>
                    <MuestraTrazo fundamento={f} />
                    <Icono className={cn('size-3', ESTILO_FUNDAMENTO[f].claseTexto)} aria-hidden />
                    {ETIQUETA_FUNDAMENTO[f]}
                  </Conmutador>
                )
              })}
            </span>
            <button type="button" aria-expanded={significados} aria-controls="significado-fundamentos" onClick={() => setSignificados((v) => !v)} title="Qué significa cada trazo" className="flex size-7 items-center justify-center rounded-md text-texto-suave hover:bg-superficie-alterna hover:text-texto aria-expanded:bg-acento-suave aria-expanded:text-acento">
              <CircleHelp className="size-4" aria-hidden />
              <span className="sr-only">Qué significa cada trazo</span>
            </button>
            {significados && (
              <ul id="significado-fundamentos" className="w-full space-y-0.5 pt-1 text-[11.5px] text-texto-suave">
                {FUNDAMENTOS.map((f) => (
                  <li key={f}>
                    <span className={cn('font-semibold', ESTILO_FUNDAMENTO[f].claseTexto)}>{ETIQUETA_FUNDAMENTO[f]}:</span> {DESCRIPCION_FUNDAMENTO[f]}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <SelectorRelaciones activas={filtros.relaciones} alCambiar={(r) => cambiarFiltros({ relaciones: alternar(filtros.relaciones, r) })} />
          {!sinCambios && (
            <Button size="sm" variant="ghost" onClick={() => setFiltros(FILTROS_INICIALES)}>
              <RotateCcw aria-hidden />
              Restablecer
            </Button>
          )}
        </div>
      </div>

      <div ref={lienzo} className="relative min-h-[28rem] flex-1 overflow-hidden rounded-lg border border-borde">
        <ReactFlow
          nodes={nodos}
          edges={aristas}
          nodeTypes={TIPOS_NODO}
          edgeTypes={TIPOS_ARISTA}
          onNodesChange={alCambiarNodos}
          onEdgesChange={alCambiarAristas}
          onPaneClick={() => seleccionar(null)}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          fitView
          fitViewOptions={AJUSTE_TODO}
          minZoom={0.2}
          maxZoom={2}
          colorMode={tema === 'oscuro' ? 'dark' : 'light'}
          attributionPosition="bottom-left"
          onEdgeMouseEnter={(_, arista) => setBajoRaton(arista.id)}
          onEdgeMouseLeave={() => setBajoRaton(null)}
          ariaLabelConfig={TEXTOS_ARIA}
          aria-label="Lienzo del grafo de ataque"
        >
          <Background gap={22} size={1.1} />
          <NombresCarril disposicion={disposicion} />
          <Controls showInteractive={false} orientation="horizontal" position="top-right" fitViewOptions={AJUSTE_TODO} style={elemento ? { right: ANCHO_DETALLE + 12 } : undefined}>
            <ControlButton onClick={() => setMinimapa((v) => !v)} aria-pressed={minimapa} aria-label={minimapa ? 'Ocultar el minimapa' : 'Mostrar el minimapa'} title={minimapa ? 'Ocultar el minimapa' : 'Mostrar el minimapa'}>
              <IconoMapa aria-hidden />
            </ControlButton>
          </Controls>
          {minimapa && <MiniMap pannable zoomable position="bottom-right" style={{ width: 168, height: 92, ...(elemento ? { right: ANCHO_DETALLE + 12 } : {}) }} nodeColor={colorMinimapa} nodeStrokeWidth={2} ariaLabel="Minimapa del grafo" />}
        </ReactFlow>
        {elemento && (
          <aside aria-label="Detalle del elemento elegido" className="absolute top-2 right-2 z-10 flex max-h-[calc(100%-1rem)] flex-col overflow-hidden rounded-lg border border-borde bg-superficie shadow-lg" style={{ width: ANCHO_DETALLE }}>
            <button type="button" onClick={() => seleccionar(null)} className="absolute top-2 right-2 z-10 flex size-7 items-center justify-center rounded-md text-texto-suave hover:bg-superficie-alterna hover:text-texto" title="Cerrar el detalle">
              <X className="size-4" aria-hidden />
              <span className="sr-only">Cerrar el detalle</span>
            </button>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <PanelDetalle grafo={grafo} elemento={elemento} />
            </div>
          </aside>
        )}
      </div>

      <Recorrido grafo={grafo} reproduccion={reproduccion} />

      <details className="rounded-lg border border-borde bg-superficie px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-texto">
          Lista de elementos · {visibles.nodos.length} nodos, {visibles.aristas.length} relaciones
        </summary>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <ul aria-label="Nodos" className="space-y-0.5">
            {visibles.nodos.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => seleccionar(n.id)} aria-current={n.id === seleccion ? 'true' : undefined} className={cn('w-full truncate rounded-md px-1.5 py-0.5 text-left text-xs hover:bg-superficie-alterna', n.id === seleccion ? 'bg-acento-suave text-acento' : 'text-texto')}>
                  {n.etiqueta}
                  <span className="text-texto-suave"> · {n.tipo === 'campana' ? 'campaña' : n.tipo}</span>
                </button>
              </li>
            ))}
          </ul>
          <ul aria-label="Relaciones" className="space-y-0.5">
            {visibles.aristas.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => seleccionar(a.id)} aria-current={a.id === seleccion ? 'true' : undefined} className={cn('w-full truncate rounded-md px-1.5 py-0.5 text-left text-xs hover:bg-superficie-alterna', a.id === seleccion ? 'bg-acento-suave text-acento' : 'text-texto')}>
                  {a.etiqueta}
                  <span className={cn('font-medium', ESTILO_FUNDAMENTO[a.fundamento].claseTexto)}> · {ETIQUETA_FUNDAMENTO[a.fundamento].toLowerCase()}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  )
}

export default function PaginaAtaque() {
  const consulta = useGrafoAtaque()
  if (consulta.isError) return <EstadoError error={consulta.error} alReintentar={() => void consulta.refetch()} reintentando={consulta.isFetching} />
  if (!consulta.data) {
    return (
      <div role="status" aria-label="Cargando el grafo de ataque" className="grid h-full gap-3">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-full rounded-2xl" />
      </div>
    )
  }
  return (
    <ReactFlowProvider>
      <Explorador grafo={consulta.data} />
    </ReactFlowProvider>
  )
}
