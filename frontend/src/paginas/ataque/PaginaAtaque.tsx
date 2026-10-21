/**
 * Explorador del grafo de ataque (APT29 day1), con React Flow. Es la pieza visual principal del portal:
 *
 *   filtros     campaña, host, fundamento (observado / inferido / hipótesis) y tipo de relación
 *   lienzo      hosts con sus procesos y alertas, cuentas y campañas; zoom, desplazamiento y minimapa
 *   secuencia   el ataque en orden temporal, paso a paso, resaltando lo alcanzado
 *   detalle     evidencia, horas, técnicas, procedencia y confianza descompuesta del elemento elegido
 *   lista       los mismos elementos como botones: alternativa de teclado y lector de pantalla al lienzo
 *
 * React Flow solo se carga en esta ruta (carga diferida en `rutas.tsx`). No es un editor: nada se arrastra ni se
 * conecta. La atribución de React Flow queda visible (abajo a la izquierda).
 */
import '@xyflow/react/dist/style.css'

import { Background, ControlButton, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider, useReactFlow, useStore, MarkerType, type EdgeChange, type NodeChange, type NodeDimensionChange } from '@xyflow/react'
import { Check, ChevronLeft, ChevronRight, ListOrdered, Map as IconoMapa, Pause, Play, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import { esListaDeTextos, esObjeto, useEstadoSesion } from '@/componentes/datos/useEstadoSesion'
import { ComoLeer } from '@/componentes/shell'

import { useGrafoAtaque, type Fundamento, type GrafoAtaque, type TipoRelacion } from '@/api/ataque'
import { formatearHora } from '@/componentes/datos/hora'
import { useMovimientoReducido } from '@/componentes/datos/useMovimientoReducido'
import { EstadoError } from '@/componentes/shell'
import { useTema } from '@/componentes/tema/useTema'
import { Button } from '@/componentes/ui/button'
import { Skeleton } from '@/componentes/ui/skeleton'
import { cn } from '@/lib/utils'

import { absoluta, CARRILES, disponerEnCarriles, idCarril, type Disposicion } from './carriles'
import { AristaRelacion, NodoHost, NodoTarjeta, type AristaFlujo, type NodoFlujo, ZOOM_DETALLE } from './ElementosFlujo'
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
 * Encaje inicial con un zoom mínimo de LECTURA: si el grafo entero no cabe sin bajar de 0,6, se centra a 0,6 y el
 * resto se alcanza desplazando (con el minimapa para orientarse) o con «Encajar» de los controles, que sí lo mete todo.
 */
/** Al cargar y al redimensionar: TODO dentro, con margen (los controles, en horizontal arriba a la derecha, caben en él). */
const AJUSTE_TODO = { padding: 0.1, minZoom: 0.2, maxZoom: 1.1 }
/** En cada paso de la secuencia: el paso, de cerca, con el texto legible (≥ 11 px). */
const AJUSTE_PASO = { padding: 0.25, minZoom: 0.85, maxZoom: 1.15 }

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
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium transition-colors',
        activo ? 'border-acento bg-acento text-sobre-intenso' : 'border-borde-discontinuo border-dashed bg-superficie text-texto-suave line-through decoration-texto-suave/60 hover:text-texto',
        className,
      )}
    >
      {activo && <Check className="size-3" aria-hidden />}
      {children}
    </button>
  )
}

function MuestraTrazo({ fundamento }: { fundamento: Fundamento }) {
  const estilo = ESTILO_FUNDAMENTO[fundamento]
  return (
    <svg width="34" height="10" aria-hidden className="shrink-0">
      <line x1="2" y1="5" x2="32" y2="5" stroke={estilo.color} strokeWidth="2.4" strokeDasharray={estilo.trazo} strokeLinecap="round" />
    </svg>
  )
}

/** Leyenda en una línea, fuera del lienzo: trazo, icono y nombre; lo que significa cada uno, plegado. */
function Leyenda() {
  const [abierta, setAbierta] = useState(false)
  return (
    <section aria-label="Leyenda: fundamento de cada relación" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-borde bg-superficie px-3 py-1.5 text-[11px]">
      {FUNDAMENTOS.map((f) => {
        const Icono = ESTILO_FUNDAMENTO[f].icono
        return (
          <span key={f} className="flex items-center gap-1.5">
            <MuestraTrazo fundamento={f} />
            <span className={cn('inline-flex items-center gap-1 font-semibold', ESTILO_FUNDAMENTO[f].claseTexto)}>
              <Icono className="size-3" aria-hidden />
              {ETIQUETA_FUNDAMENTO[f]}
            </span>
            {abierta && <span className="text-texto-suave">{DESCRIPCION_FUNDAMENTO[f]}</span>}
          </span>
        )
      })}
      <button type="button" aria-expanded={abierta} onClick={() => setAbierta((v) => !v)} className="ml-auto font-medium text-acento hover:underline">
        {abierta ? 'Ocultar qué significa' : 'Qué significa cada trazo'}
      </button>
    </section>
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
        const legibleDentro = zoom >= ZOOM_DETALLE && izquierda >= 0
        if (legibleDentro || abajo < 0 || arriba > alto) return null
        return (
          <span key={host} data-nombre-carril style={{ top: Math.max(4, arriba + 3), left: Math.max(6, izquierda + 4) }} className="absolute rounded-md border border-borde bg-superficie/90 px-1.5 py-px font-mono text-[11.5px] font-semibold text-texto shadow-sm">
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

function Explorador({ grafo }: { grafo: GrafoAtaque }) {
  const [parametros, setParametros] = useSearchParams()
  const seleccion = leerSeleccion(parametros.get('sel'), grafo)
  // Los filtros sobreviven a ir y volver; un ?campana= en la URL manda (y guarda aparte).
  const campanaUrl = leerCampana(parametros.get('campana'), grafo)
  const [filtros, setFiltros] = useEstadoSesion<Filtros>(campanaUrl ? `ataque:filtros:${campanaUrl}` : 'ataque:filtros', () => ({ ...FILTROS_INICIALES, campana: campanaUrl }), esFiltros)
  const reproduccion = useReproduccion(grafo.hitos.length)
  const disposicion = useMemo(() => disponerEnCarriles(grafo.nodos, grafo.aristas), [grafo])
  const [bajoRaton, setBajoRaton] = useState<string | null>(null)
  const [minimapa, setMinimapa] = useState(false)
  const paso = reproduccion.paso
  // Nodos controlados: React Flow mide cada nodo y avisa con cambios `dimensions`; hay que devolverle esas medidas
  // (`measured`) o el minimapa y el encaje no saben cuánto ocupa cada uno.
  const [medidas, setMedidas] = useState<Record<string, { width: number; height: number }>>({})
  const { tema } = useTema()
  const reducido = useMovimientoReducido()
  const { fitView } = useReactFlow()

  const visibles = useMemo(() => filtrarGrafo(grafo, filtros), [grafo, filtros])
  const recorrido = useMemo(() => (paso == null ? null : recorridoHasta(grafo, paso)), [grafo, paso])
  const hito = paso == null ? null : grafo.hitos[paso]
  const idsVisibles = useMemo(() => new Set(visibles.nodos.map((n) => n.id)), [visibles])
  // Qué se encuadra: el paso de la secuencia que se está viendo o, si no, el momento clave del ataque.
  const foco = useMemo(() => {
    const candidatos = hito ? hito.nodos.filter((id) => idsVisibles.has(id) && !id.startsWith('host-')) : []
    return (candidatos.length ? candidatos : [...idsVisibles]).map((id) => ({ id }))
  }, [hito, idsVisibles])
  const focoActual = useRef(foco)
  const pasoActual = useRef(!!hito)
  useEffect(() => {
    focoActual.current = foco
    pasoActual.current = !!hito
  }, [foco, hito])

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
          return {
            id: n.id,
            type: n.tipo,
            position: { x: caja.x, y: caja.y },
            parentId: conPadre ? padre : undefined,
            extent: conPadre ? ('parent' as const) : undefined,
            ...(n.tipo === 'host' ? { style: { width: caja.ancho, height: caja.alto } } : {}),
            selected: n.id === seleccion,
            measured: medidas[n.id],
            ariaLabel: `${n.tipo === 'campana' ? 'Campaña' : n.tipo} ${n.etiqueta}${n.subtitulo ? `, ${n.subtitulo}` : ''}. ${ETIQUETA_FUNDAMENTO[n.fundamento]}.`,
            data: {
              nodo: n,
              seleccionado: n.id === seleccion,
              actual: !!hito?.nodos.includes(n.id),
              pulso: debeAnimar(!!hito?.nodos.includes(n.id), reducido),
              ancho: n.tipo === 'campana' ? caja.ancho : undefined,
              asas: disposicion.asas[n.id],
              marcas: n.tipo === 'host' ? disposicion.marcas : undefined,
              conHoras: n.id === 'host-scranton',
              atenuado: !!recorrido && n.tipo !== 'host' && !recorrido.nodos.has(n.id),
            },
          }
        }),
    [visibles.nodos, seleccion, hito, recorrido, medidas, reducido, disposicion, idsVisibles],
  )

  const aristas = useMemo<AristaFlujo[]>(
    () =>
      visibles.aristas.map((a) => ({
        id: a.id,
        type: 'relacion' as const,
        source: a.origen,
        target: a.destino,
        sourceHandle: a.asaOrigen,
        targetHandle: a.asaDestino,
        selected: a.id === seleccion,
        markerEnd: { type: MarkerType.ArrowClosed, color: ESTILO_FUNDAMENTO[a.fundamento].color, width: 16, height: 16 },
        ariaLabel: `${ETIQUETA_RELACION[a.relacion]}: ${a.etiqueta}. ${ETIQUETA_FUNDAMENTO[a.fundamento]}.`,
        data: { arista: a, actual: !!hito?.aristas.includes(a.id), dibujar: debeAnimar(!!hito?.aristas.includes(a.id), reducido), atenuado: !!recorrido && !recorrido.aristas.has(a.id), mostrarEtiqueta: a.id === bajoRaton },
      })),
    [visibles.aristas, seleccion, hito, recorrido, reducido, bajoRaton],
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

  // Reencuadra al cambiar los filtros y al redimensionar la ventana (recomendación de la skill de React Flow).
  useEffect(() => {
    const id = requestAnimationFrame(() => void fitView({ ...(hito ? AJUSTE_PASO : AJUSTE_TODO), nodes: foco, duration: reducido ? 0 : 400 }))
    return () => cancelAnimationFrame(id)
  }, [foco, hito, fitView, reducido])
  useEffect(() => {
    let id = 0
    const alRedimensionar = () => {
      cancelAnimationFrame(id)
      id = requestAnimationFrame(() => void fitView({ ...(pasoActual.current ? AJUSTE_PASO : AJUSTE_TODO), nodes: focoActual.current }))
    }
    window.addEventListener('resize', alRedimensionar)
    return () => {
      window.removeEventListener('resize', alRedimensionar)
      cancelAnimationFrame(id)
    }
  }, [fitView])

  const elemento = buscarElemento(grafo, seleccion)
  const campanas = grafo.nodos.filter((n) => n.tipo === 'campana')
  const cambiarFiltros = (cambio: Partial<Filtros>) => setFiltros((f) => ({ ...f, ...cambio }))

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto xl:overflow-hidden">
      <header className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <div className="mr-auto min-w-0">
          <h1 className="text-xl">Grafo de ataque · APT29 day1</h1>
          <p className="text-xs text-texto-suave">Quién atacó a quién en APT29 day1, con cada relación fundamentada.</p>
          <ComoLeer className="mt-0.5">
            <p>Un carril por host y el tiempo de izquierda a derecha (UTC del dataset, 2-5-2020). Cada relación dice su fundamento: observado (telemetría), inferido (correlación del sistema) o hipótesis; ninguna está inventada.</p>
            <p>«Reproducir ataque» recorre la secuencia paso a paso. Acerca el zoom para ver más detalle y pasa el ratón por una relación para leer su etiqueta.</p>
          </ComoLeer>
        </div>
      </header>

      <div role="group" aria-label="Filtros del grafo" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-borde bg-superficie px-3 py-2">
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
          <span className="text-xs text-texto-suave">Hosts</span>
          {HOSTS.map((h) => (
            <Conmutador key={h} activo={filtros.hosts.length === 0 || filtros.hosts.includes(h)} alPulsar={() => cambiarFiltros({ hosts: alternar(filtros.hosts.length === 0 ? [...HOSTS] : filtros.hosts, h) })}>
              <span className="font-mono">{h}</span>
            </Conmutador>
          ))}
        </span>
        <span role="group" aria-label="Fundamento" className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-texto-suave">Fundamento</span>
          {FUNDAMENTOS.map((f) => {
            const Icono = ESTILO_FUNDAMENTO[f].icono
            return (
              <Conmutador key={f} activo={filtros.fundamentos.includes(f)} alPulsar={() => cambiarFiltros({ fundamentos: alternar(filtros.fundamentos, f) })}>
                <Icono className="size-3" aria-hidden />
                {ETIQUETA_FUNDAMENTO[f]}
              </Conmutador>
            )
          })}
        </span>
        <span role="group" aria-label="Tipo de relación" className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-texto-suave">Relación</span>
          {RELACIONES.map((r: TipoRelacion) => (
            <Conmutador key={r} activo={filtros.relaciones.includes(r)} alPulsar={() => cambiarFiltros({ relaciones: alternar(filtros.relaciones, r) })}>
              {ETIQUETA_RELACION[r]}
            </Conmutador>
          ))}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setFiltros(FILTROS_INICIALES)}>
          <RotateCcw aria-hidden />
          Restablecer
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-h-[34rem] flex-col gap-2 xl:min-h-0">
          <Leyenda />
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-borde">
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
              <Controls showInteractive={false} orientation="horizontal" position="top-right" fitViewOptions={AJUSTE_TODO}>
                <ControlButton onClick={() => setMinimapa((v) => !v)} aria-pressed={minimapa} aria-label={minimapa ? 'Ocultar el minimapa' : 'Mostrar el minimapa'} title={minimapa ? 'Ocultar el minimapa' : 'Mostrar el minimapa'}>
                  <IconoMapa aria-hidden />
                </ControlButton>
              </Controls>
              {hito && paso != null && (
                <Panel position="top-center" className="pointer-events-none rounded-lg border border-borde bg-superficie px-2.5 py-1 text-xs shadow-sm">
                  <span className="font-mono font-semibold text-texto tabular-nums">{formatearHora(hito.hora)}</span>
                  <span className="text-texto-suave"> · paso {paso + 1} de {grafo.hitos.length}</span>
                </Panel>
              )}
              {minimapa && <MiniMap pannable zoomable position="bottom-right" style={{ width: 168, height: 92 }} nodeColor={colorMinimapa} nodeStrokeWidth={2} ariaLabel="Minimapa del grafo" />}
            </ReactFlow>
          </div>

          <div role="group" aria-label="Secuencia del ataque" className="flex flex-wrap items-center gap-2 rounded-2xl border border-borde bg-superficie px-3 py-2">
            <ListOrdered className="size-4 text-texto-suave" aria-hidden />
            <span className="text-xs font-semibold text-texto">Secuencia temporal</span>
            <Button size="sm" onClick={() => reproduccion.accion({ tipo: reproduccion.enMarcha ? 'pausar' : 'reproducir' })}>
              {reproduccion.enMarcha ? <Pause aria-hidden /> : <Play aria-hidden />}
              {reproduccion.enMarcha ? 'Pausar' : 'Reproducir ataque'}
            </Button>
            <Button size="sm" variant="outline" disabled={paso === 0} onClick={() => reproduccion.accion({ tipo: 'anterior' })}>
              <ChevronLeft aria-hidden />
              Anterior
            </Button>
            <Button size="sm" variant="outline" disabled={paso === grafo.hitos.length - 1} onClick={() => reproduccion.accion({ tipo: 'siguiente' })}>
              Siguiente
              <ChevronRight aria-hidden />
            </Button>
            <span role="radiogroup" aria-label="Velocidad de reproducción" className="flex rounded-lg bg-superficie-alterna p-0.5">
              {([1, 2, 4] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={reproduccion.velocidad === v} onClick={() => reproduccion.accion({ tipo: 'velocidad', velocidad: v })} className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', reproduccion.velocidad === v ? 'bg-superficie text-acento shadow-sm' : 'text-texto-suave')}>
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
            <p role="status" aria-live="polite" className="min-w-[18rem] flex-1 text-xs text-texto">
              {hito ? (
                <>
                  <span className="font-semibold">
                    Paso {paso! + 1} de {grafo.hitos.length} · <span className="font-mono tabular-nums">{formatearHora(hito.hora)}</span>
                  </span>{' '}
                  — {hito.titulo}
                </>
              ) : (
                <span className="text-texto-suave">Recorre el ataque en orden: lo aún no alcanzado se atenúa.</span>
              )}
            </p>
          </div>
        </div>

        <aside aria-label="Detalle y elementos" className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <PanelDetalle grafo={grafo} elemento={elemento} />
          <details className="rounded-xl border border-borde bg-superficie p-3" open>
            <summary className="cursor-pointer text-xs font-semibold text-texto">
              Elementos visibles · {visibles.nodos.length} nodos, {visibles.aristas.length} relaciones
            </summary>
            <ul aria-label="Nodos" className="mt-2 space-y-0.5">
              {visibles.nodos.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => seleccionar(n.id)} aria-current={n.id === seleccion ? 'true' : undefined} className={cn('w-full truncate rounded-md px-1.5 py-0.5 text-left text-xs hover:bg-superficie-alterna', n.id === seleccion ? 'bg-acento-suave text-acento' : 'text-texto')}>
                    {n.etiqueta}
                    <span className="text-texto-suave"> · {n.tipo === 'campana' ? 'campaña' : n.tipo}</span>
                  </button>
                </li>
              ))}
            </ul>
            <ul aria-label="Relaciones" className="mt-2 space-y-0.5 border-t border-borde pt-2">
              {visibles.aristas.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => seleccionar(a.id)} aria-current={a.id === seleccion ? 'true' : undefined} className={cn('w-full truncate rounded-md px-1.5 py-0.5 text-left text-xs hover:bg-superficie-alterna', a.id === seleccion ? 'bg-acento-suave text-acento' : 'text-texto')}>
                    {a.etiqueta}
                    <span className={cn('font-medium', ESTILO_FUNDAMENTO[a.fundamento].claseTexto)}> · {ETIQUETA_FUNDAMENTO[a.fundamento].toLowerCase()}</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </aside>
      </div>
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
