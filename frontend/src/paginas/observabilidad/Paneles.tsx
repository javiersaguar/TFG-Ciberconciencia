/**
 * Los paneles de un cuadro de Grafana dibujados con los componentes del portal. Los de PIDS (stat, serie, barras,
 * tarta) y tres más que usan los cuadros del TFG: tabla, indicador (gauge) y grafo de nodos (nodeGraph).
 *
 * Todos se mueven igual: los números recorren el camino hasta el valor nuevo, las áreas y el anillo se deslizan hacia
 * la forma nueva y las barras cambian de ancho con una transición. Con `prefers-reduced-motion`, sin movimiento.
 *
 * Cada tarjeta lleva un chip con la procedencia de su cifra —«documentado» (con la fuente en el tooltip) o
 * «ilustrativo»—, para que ninguna captura de pantalla haga pasar un dato inventado por uno medido.
 */
import { FlaskConical, Info, NotebookText } from 'lucide-react'
import { useId, type CSSProperties, type ReactNode } from 'react'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ReferenceArea, Tooltip, XAxis, YAxis } from 'recharts'

import type { NodoGrafo, PanelCuadro } from '@/api/observabilidad'
import { useMovimientoReducido } from '@/componentes/datos/useMovimientoReducido'
import { useNumeroAnimado, useValoresAnimados } from '@/componentes/datos/useNumeroAnimado'
import { COLOR_BORDE, colorSerie, ESTILO_TICK } from '@/componentes/graficos/comun'
import { ContenedorGrafico } from '@/componentes/graficos/ContenedorGrafico'
import { MiniSerie } from '@/componentes/graficos/MiniSerie'
import { TooltipGrafico } from '@/componentes/graficos/TooltipGrafico'
import { Tooltip as Ayuda, TooltipContent, TooltipTrigger } from '@/componentes/ui/tooltip'
import { cn } from '@/lib/utils'

import { aFilas, altoGrafica, color, colorPorUmbral, formatear } from './formatoUnidad'

const DURACION_MS = 700
const hora = (segundos: number) => new Date(segundos * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

function Procedencia({ panel }: { panel: PanelCuadro }) {
  if (!panel.procedencia) return null
  const documentada = panel.procedencia === 'documentada'
  // en paneles estrechos (4 columnas o menos) el chip se queda en su icono: el texto se recortaba («document…»)
  const compacta = panel.ancho <= 4
  const Icono = documentada ? NotebookText : FlaskConical
  return (
    <Ayuda>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-semibold',
            documentada ? 'bg-ok/12 text-ok' : 'bg-aviso/12 text-aviso',
          )}
        >
          <Icono className="size-3" aria-hidden />
          {compacta ? <span className="sr-only">{documentada ? 'documentado' : 'ilustrativo'}</span> : documentada ? 'documentado' : 'ilustrativo'}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {documentada ? `Cifra medida y escrita en: ${panel.fuente}` : 'Cifra inventada para dar forma al panel hasta conectar Prometheus o ClickHouse.'}
      </TooltipContent>
    </Ayuda>
  )
}

function Tarjeta({ panel, indice, children, className }: { panel: PanelCuadro; indice: number; children: ReactNode; className?: string }) {
  const estilo: CSSProperties = { animationDelay: `${Math.min(indice, 12) * 45}ms`, animationFillMode: 'both' }
  return (
    <section
      aria-label={panel.titulo}
      data-procedencia={panel.procedencia}
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-borde bg-superficie px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]',
        'animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none',
        className,
      )}
      style={estilo}
    >
      <header className="mb-1.5 flex shrink-0 items-start justify-between gap-2">
        <h3 className="min-w-0 text-[13px] leading-tight font-semibold text-texto">{panel.titulo}</h3>
        <span className="flex shrink-0 items-center gap-1.5">
          <Procedencia panel={panel} />
          {panel.descripcion && (
            <Ayuda>
              <TooltipTrigger asChild>
                <button type="button" className="rounded-full text-texto-suave hover:text-texto" aria-label={`Qué es «${panel.titulo}»`}>
                  <Info className="size-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{panel.descripcion}</TooltipContent>
            </Ayuda>
          )}
        </span>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden">{panel.error ? <SinDatos texto={panel.error} /> : children}</div>
    </section>
  )
}

function SinDatos({ texto = 'Sin datos en este periodo' }: { texto?: string }) {
  return <p className="flex h-full items-center justify-center text-xs text-texto-suave">{texto}</p>
}

// --- stat -------------------------------------------------------------------------------------------------------

function ValorStat({ panel, valor, grande }: { panel: PanelCuadro; valor: number | null; grande: boolean }) {
  const animado = useNumeroAnimado(valor)
  const tono = colorPorUmbral(panel, valor) ?? 'var(--primario)'
  // mientras recorre el camino el número no es entero; se redondea para que un recuento no enseñe decimales
  const mostrado = animado != null && valor != null && Number.isInteger(valor) ? Math.round(animado) : animado
  const texto = formatear(mostrado, panel.unidad)
  const largo = texto.length > 8
  return (
    <span
      className={cn('shrink-0 font-semibold tracking-tight whitespace-nowrap tabular-nums', grande ? (largo ? 'text-[1.4rem] leading-none' : 'text-[1.65rem] leading-none') : 'text-sm leading-none')}
      style={{ color: tono }}
    >
      {texto}
    </span>
  )
}

export function PanelStat({ panel, indice }: { panel: PanelCuadro; indice: number }) {
  const valores = panel.valores ?? []
  const principal = valores[0]?.valor ?? null
  const tono = colorPorUmbral(panel, principal) ?? 'var(--acento)'
  return (
    <Tarjeta panel={panel} indice={indice}>
      {valores.length === 0 ? (
        <SinDatos />
      ) : valores.length === 1 ? (
        <div className="flex h-full items-end justify-between gap-3 overflow-hidden">
          <ValorStat panel={panel} valor={principal} grande />
          {/* tendencia solo en paneles ilustrativos, y dicho: una cifra documentada no tiene serie medida detrás */}
          {panel.procedencia === 'ilustrativa' && panel.chispa && panel.chispa.length > 1 && (
            <span className="flex min-w-0 shrink flex-col items-end">
              <MiniSerie valores={panel.chispa} color={tono} className="h-8 w-24 min-w-0" />
              <span className="text-[10px] text-texto-suave">tendencia ilustrativa</span>
            </span>
          )}
        </div>
      ) : (
        <ul className="flex h-full min-h-0 flex-col justify-start gap-1 overflow-y-auto">
          {valores.map((v, i) => (
            <li key={`${v.nombre}-${i}`} className="flex min-w-0 items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-xs text-texto-suave">{v.nombre}</span>
              <ValorStat panel={panel} valor={v.valor} grande={false} />
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  )
}

// --- serie temporal ----------------------------------------------------------------------------------------------

export function PanelSerie({ panel, indice }: { panel: PanelCuadro; indice: number }) {
  const reducido = useMovimientoReducido()
  const id = useId().replace(/:/g, '')
  const series = (panel.series ?? []).filter((s) => s.puntos.some(([, v]) => v != null))
  const filas = aFilas(series)
  const conLeyenda = series.length > 1
  const altura = altoGrafica(panel.alto, conLeyenda)
  return (
    <Tarjeta panel={panel} indice={indice}>
      {series.length === 0 ? (
        <SinDatos />
      ) : (
        <div className="flex h-full flex-col">
          {conLeyenda && (
            <ul className="mb-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-texto-suave">
              {series.map((s, i) => (
                <li key={s.nombre} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: colorSerie(i) }} aria-hidden />
                  {s.nombre}
                </li>
              ))}
            </ul>
          )}
          <figure role="img" aria-label={panel.titulo} className="min-h-0 flex-1">
            <ContenedorGrafico altura={altura}>
              {({ ancho }) => (
                <AreaChart width={ancho} height={altura} data={filas} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                  <defs>
                    {series.map((s, i) => (
                      <linearGradient key={s.nombre} id={`${id}-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colorSerie(i)} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={colorSerie(i)} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid stroke={COLOR_BORDE} strokeDasharray="3 3" vertical={false} />
                  {/* bandas de umbral, solo si el panel de Grafana define pasos (hoy ninguna serie lo hace: no se inventan) */}
                  {panel.umbrales.length > 1 &&
                    panel.umbrales.slice(1).map((u, i) => (
                      <ReferenceArea key={`${u.color}-${u.desde}`} y1={u.desde ?? undefined} y2={panel.umbrales[i + 2]?.desde ?? undefined} fill={color(u.color)} fillOpacity={0.08} stroke="none" ifOverflow="extendDomain" />
                    ))}
                  <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={hora} tick={ESTILO_TICK}
                         axisLine={false} tickLine={false} minTickGap={48} />
                  <YAxis tickFormatter={(v: number) => formatear(v, panel.unidad, true)} tick={ESTILO_TICK} axisLine={false}
                         tickLine={false} width={68} />
                  <Tooltip
                    cursor={{ stroke: COLOR_BORDE }}
                    content={<TooltipGrafico formatearValor={(v) => formatear(v, panel.unidad)} formatearEtiqueta={(t) => hora(Number(t))} />}
                  />
                  {series.map((s, i) => (
                    <Area
                      key={s.nombre}
                      type="monotone"
                      dataKey={s.nombre}
                      name={s.nombre}
                      stroke={colorSerie(i)}
                      strokeWidth={2}
                      fill={`url(#${id}-${i})`}
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls
                      isAnimationActive={!reducido}
                      animationDuration={DURACION_MS}
                      animationEasing="ease-out"
                    />
                  ))}
                </AreaChart>
              )}
            </ContenedorGrafico>
          </figure>
        </div>
      )}
    </Tarjeta>
  )
}

// --- barras ------------------------------------------------------------------------------------------------------

export function PanelBarras({ panel, indice }: { panel: PanelCuadro; indice: number }) {
  const valores = [...(panel.valores ?? [])].filter((v) => v.valor != null).sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
  const animados = useValoresAnimados(valores.map((v) => v.valor ?? 0))
  const maximo = Math.max(...valores.map((v) => v.valor ?? 0), 0) || 1
  return (
    <Tarjeta panel={panel} indice={indice}>
      {valores.length === 0 ? (
        <SinDatos />
      ) : (
        <ul className="@container grid h-full content-start gap-2 overflow-y-auto pr-1">
          {valores.map((v, i) => {
            const tono = colorPorUmbral(panel, v.valor) ?? colorSerie(i)
            const mostrado = Math.round(animados[i] ?? v.valor ?? 0)
            const fraccion = Math.max(0.015, (v.valor ?? 0) / maximo)
            return (
              <li key={`${v.nombre}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 text-xs @sm:grid-cols-[minmax(0,11rem)_1fr_auto]">
                <span className="truncate text-texto-suave" title={v.nombre}>{v.nombre}</span>
                <span className="order-last col-span-2 h-2.5 overflow-hidden rounded-full bg-superficie-hundida @sm:order-none @sm:col-span-1">
                  <span
                    className="block h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                    style={{ width: `${fraccion * 100}%`, backgroundColor: tono }}
                  />
                </span>
                <span className="min-w-14 text-right font-medium text-texto tabular-nums">{formatear(mostrado, panel.unidad)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Tarjeta>
  )
}

// --- tarta -------------------------------------------------------------------------------------------------------

export function PanelTarta({ panel, indice }: { panel: PanelCuadro; indice: number }) {
  const reducido = useMovimientoReducido()
  const valores = (panel.valores ?? []).filter((v) => (v.valor ?? 0) > 0).sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
  const total = valores.reduce((suma, v) => suma + (v.valor ?? 0), 0)
  const lado = Math.min(altoGrafica(panel.alto, false), 168)
  return (
    <Tarjeta panel={panel} indice={indice}>
      {valores.length === 0 ? (
        <SinDatos />
      ) : (
        <div className="grid h-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
          <PieChart width={lado} height={lado}>
            <Pie data={valores} dataKey="valor" nameKey="nombre" innerRadius="58%" outerRadius="88%" paddingAngle={2}
                 stroke="none" isAnimationActive={!reducido} animationDuration={DURACION_MS} animationEasing="ease-out">
              {valores.map((v, i) => <Cell key={`${v.nombre}-${i}`} fill={colorSerie(i)} />)}
            </Pie>
            <Tooltip content={<TooltipGrafico formatearValor={(v) => formatear(v, panel.unidad)} />} />
          </PieChart>
          <ul className="grid gap-1.5 text-xs">
            {valores.map((v, i) => (
              <li key={`${v.nombre}-${i}`} className="grid gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5 text-texto-suave">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorSerie(i) }} aria-hidden />
                  <span className="truncate" title={v.nombre}>{v.nombre}</span>
                </span>
                <span className="pl-3.5 font-medium whitespace-nowrap text-texto tabular-nums">
                  {formatear(v.valor, panel.unidad)}
                  {panel.unidad !== 'percent' && <span className="text-texto-suave"> · {Math.round(((v.valor ?? 0) / total) * 100)} %</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tarjeta>
  )
}

// --- tabla -------------------------------------------------------------------------------------------------------

export function PanelTabla({ panel, indice }: { panel: PanelCuadro; indice: number }) {
  const tabla = panel.tabla
  return (
    <Tarjeta panel={panel} indice={indice}>
      {!tabla || tabla.filas.length === 0 ? (
        <SinDatos />
      ) : (
        <div className="h-full overflow-auto rounded-lg border border-borde/70">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-superficie-alterna">
              <tr>
                {tabla.columnas.map((columna) => (
                  <th key={columna.clave} scope="col" className={cn('px-2 py-1.5 font-semibold whitespace-nowrap text-texto-suave', columna.unidad ? 'text-right' : 'text-left')}>
                    {columna.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabla.filas.map((fila, i) => (
                <tr key={i} className="border-t border-borde/60 odd:bg-superficie even:bg-superficie-alterna/50">
                  {tabla.columnas.map((columna) => {
                    const valor = fila[columna.clave]
                    return (
                      <td key={columna.clave} className={cn('px-2 py-1.5', columna.unidad ? 'text-right whitespace-nowrap text-texto' : 'text-texto [overflow-wrap:anywhere]')}>
                        {columna.unidad && typeof valor === 'number' ? formatear(valor, columna.unidad) : valor ?? '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  )
}

// --- indicador (gauge) -------------------------------------------------------------------------------------------

/** Arco de 240° (de −210° a 30°) sobre un círculo de radio `r` centrado en (60, 60). */
function arco(fraccion: number, r = 46): string {
  const inicio = (-210 * Math.PI) / 180
  const fin = inicio + (240 * Math.PI * Math.min(1, Math.max(0, fraccion))) / 180
  const punto = (angulo: number) => `${60 + r * Math.cos(angulo)},${60 + r * Math.sin(angulo)}`
  const grande = fin - inicio > Math.PI ? 1 : 0
  return `M${punto(inicio)} A${r},${r} 0 ${grande} 1 ${punto(fin)}`
}

export function PanelIndicador({ panel, indice }: { panel: PanelCuadro; indice: number }) {
  const valor = panel.valores?.[0]?.valor ?? null
  const animado = useNumeroAnimado(valor)
  const maximo = panel.unidad === 'percent' ? 100 : Math.max(valor ?? 0, 1)
  const tono = colorPorUmbral(panel, valor) ?? 'var(--acento)'
  return (
    <Tarjeta panel={panel} indice={indice}>
      {valor == null ? (
        <SinDatos />
      ) : (
        <figure role="img" aria-label={`${panel.titulo}: ${formatear(valor, panel.unidad)}`} className="flex h-full items-center justify-center">
          <svg viewBox="0 0 120 104" className="h-full max-h-56 w-full">
            <path d={arco(1)} fill="none" stroke="var(--superficie-hundida)" strokeWidth={10} strokeLinecap="round" />
            <path d={arco((animado ?? 0) / maximo)} fill="none" stroke={tono} strokeWidth={10} strokeLinecap="round" />
            <text x="60" y="64" textAnchor="middle" className="tabular-nums" style={{ fontSize: 17, fontWeight: 600, fill: tono }}>
              {formatear(animado, panel.unidad)}
            </text>
          </svg>
        </figure>
      )}
    </Tarjeta>
  )
}

// --- grafo de nodos ----------------------------------------------------------------------------------------------

const ANCHO_GRAFO = 800
const ALTO_GRAFO = 300
const NODO = { ancho: 150, alto: 50 }

/** Posición (centro) de cada nodo según su papel: origen a la izquierda, destino a la derecha, DC abajo. */
function situar(nodos: readonly NodoGrafo[]): Map<string, { x: number; y: number }> {
  const posiciones = new Map<string, { x: number; y: number }>()
  const otros = nodos.filter((n) => n.rol === 'otro')
  for (const nodo of nodos) {
    if (nodo.rol === 'origen') posiciones.set(nodo.id, { x: 150, y: 80 })
    else if (nodo.rol === 'destino') posiciones.set(nodo.id, { x: 650, y: 80 })
    else if (nodo.rol === 'dc') posiciones.set(nodo.id, { x: 440, y: 235 })
    else posiciones.set(nodo.id, { x: 120 + otros.indexOf(nodo) * 560, y: 235 })
  }
  return posiciones
}

/** Punto del borde del rectángulo de un nodo en la dirección de otro, para que la flecha no entre en la tarjeta. */
function borde(centro: { x: number; y: number }, hacia: { x: number; y: number }) {
  const dx = hacia.x - centro.x
  const dy = hacia.y - centro.y
  const escala = 1 / Math.max(Math.abs(dx) / (NODO.ancho / 2 + 6), Math.abs(dy) / (NODO.alto / 2 + 6), 1e-6)
  return { x: centro.x + dx * escala, y: centro.y + dy * escala }
}

const ESTILO_ROL: Record<NodoGrafo['rol'], { borde: string; texto: string }> = {
  origen: { borde: 'var(--sev-alta)', texto: 'var(--sev-alta)' },
  destino: { borde: 'var(--sev-critica)', texto: 'var(--sev-critica)' },
  dc: { borde: 'var(--acento)', texto: 'var(--acento)' },
  otro: { borde: 'var(--borde)', texto: 'var(--texto-suave)' },
}

function DibujoGrafo({ titulo, nodos, aristas }: { titulo: string } & NonNullable<PanelCuadro['grafo']>) {
  const id = useId().replace(/:/g, '')
  const pos = situar(nodos)
  return (
    <figure role="img" aria-label={titulo} className="flex h-full items-center justify-center">
      <svg viewBox={`0 0 ${ANCHO_GRAFO} ${ALTO_GRAFO}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id={`${id}-ataque`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,1.2 L9,5 L0,8.8 z" fill="var(--sev-alta)" />
          </marker>
          <marker id={`${id}-contexto`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,1.2 L9,5 L0,8.8 z" fill="var(--texto-suave)" />
          </marker>
        </defs>
        {aristas.map((arista) => {
          const a = pos.get(arista.desde)
          const b = pos.get(arista.hasta)
          if (!a || !b) return null
          const p = borde(a, b)
          const q = borde(b, a)
          const ataque = arista.tipo === 'ataque'
          const medio = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
          const ancho = arista.etiqueta.length * 6.4 + 18
          return (
            <g key={`${arista.desde}-${arista.hasta}`} data-tipo={arista.tipo}>
              <line
                x1={p.x} y1={p.y} x2={q.x} y2={q.y}
                stroke={ataque ? 'var(--sev-alta)' : 'var(--texto-suave)'}
                strokeWidth={ataque ? 3 : 1.5}
                strokeDasharray={ataque ? undefined : '5 5'}
                strokeOpacity={ataque ? 1 : 0.7}
                markerEnd={`url(#${id}-${arista.tipo})`}
              />
              <rect x={medio.x - ancho / 2} y={medio.y - 11} width={ancho} height={22} rx={11}
                    fill="var(--superficie)" stroke={ataque ? 'var(--sev-alta)' : 'var(--borde)'} />
              <text x={medio.x} y={medio.y + 4} textAnchor="middle"
                    style={{ fontSize: 11, fontWeight: 600, fill: ataque ? 'var(--sev-alta)' : 'var(--texto-suave)' }}>
                {arista.etiqueta}
              </text>
            </g>
          )
        })}
        {nodos.map((nodo) => {
          const c = pos.get(nodo.id)!
          const estilo = ESTILO_ROL[nodo.rol]
          return (
            <g key={nodo.id} data-rol={nodo.rol}>
              <rect x={c.x - NODO.ancho / 2} y={c.y - NODO.alto / 2} width={NODO.ancho} height={NODO.alto} rx={12}
                    fill="var(--superficie-alterna)" stroke={estilo.borde} strokeWidth={nodo.rol === 'otro' ? 1 : 2} />
              <text x={c.x} y={c.y - 3} textAnchor="middle" style={{ fontSize: 13, fontWeight: 600, fill: estilo.texto }}>
                {nodo.titulo}
              </text>
              {nodo.subtitulo && (
                <text x={c.x} y={c.y + 14} textAnchor="middle" style={{ fontSize: 10.5, fill: 'var(--texto-suave)' }}>
                  {nodo.subtitulo}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

export function PanelGrafo({ panel, indice }: { panel: PanelCuadro; indice: number }) {
  const grafo = panel.grafo
  return (
    <Tarjeta panel={panel} indice={indice}>
      {!grafo || grafo.nodos.length === 0 ? <SinDatos /> : <DibujoGrafo titulo={panel.titulo} {...grafo} />}
    </Tarjeta>
  )
}
