/**
 * Línea temporal de APT29 day1 con los datos reales: eje de 02:56 a 03:24, un carril por host, las 741 alertas como
 * marcas coloreadas por nivel, las campañas como bandas y el salto de P2 como 17 conectores entre SCRANTON y NASHUA.
 * Arrastrando sobre el gráfico se elige un rango (o con los atajos, accesibles con teclado); la lista de debajo,
 * en filas compactas, sigue al rango y a los filtros. La resolución se explica una vez en la leyenda.
 */
import { ArrowRight, Check, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent as EventoPuntero } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useLineaTemporal } from '@/api/cronologia'
import type { AlertaDay1, AristaP2 } from '@/api/exportaciones'
import type { Incidente } from '@/api/incidentes'
import type { NivelRegla } from '@/api/tipos'
import { ChipNivel, ChipProcedencia } from '@/componentes/datos/Chips'
import { formatearEntero } from '@/componentes/datos/formato'
import { formatearHora } from '@/componentes/datos/hora'
import { esListaDeTextos, useEstadoSesion } from '@/componentes/datos/useEstadoSesion'
import { EncabezadoPagina, EstadoError } from '@/componentes/shell'
import { Button } from '@/componentes/ui/button'
import { Skeleton } from '@/componentes/ui/skeleton'
import { cn } from '@/lib/utils'

import { campanasDe, DIA, enlaceGrafo, escala, filtrarAlertas, HOSTS, idSeleccion, leerRango, marcas, PRESETS, rangoDeArrastre, resolverSeleccion, textoDeMs, type Rango, type Seleccion } from './linea'

const NIVELES: { valor: NivelRegla; texto: string; trazo: string }[] = [
  { valor: 'high', texto: 'Alto', trazo: 'var(--sev-alta)' },
  { valor: 'medium', texto: 'Medio', trazo: 'var(--sev-media)' },
  { valor: 'low', texto: 'Bajo', trazo: 'var(--sev-baja)' },
  { valor: 'informational', texto: 'Informativo', trazo: 'var(--sev-info)' },
]
const TRAZO = Object.fromEntries(NIVELES.map((n) => [n.valor, n.trazo])) as Record<NivelRegla, string>
const ETIQUETAS = 96
const CARRIL = 46
const EJE = 22
const PAGINA = 200

function Conmutador({ activo, alPulsar, children }: { activo: boolean; alPulsar: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={alPulsar}
      className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium', activo ? 'border-acento bg-acento text-sobre-intenso' : 'border-dashed border-borde-discontinuo text-texto-suave line-through')}
    >
      {activo && <Check className="size-3" aria-hidden />}
      {children}
    </button>
  )
}

const alternar = <T,>(lista: readonly T[], v: T): T[] => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v])
const msHora = (hora: string) => {
  const [hms, milis = '0'] = hora.split('.')
  const [h, m, s] = hms.split(':').map(Number)
  return ((h * 60 + m) * 60 + s) * 1000 + Number(milis.padEnd(3, '0'))
}

function Carriles({ rango, alertas, aristas, campanas, seleccion, alElegir, alCambiarRango }: {
  rango: Rango
  alertas: AlertaDay1[]
  aristas: readonly AristaP2[]
  campanas: readonly Incidente[]
  seleccion?: Seleccion
  alElegir: (s: Seleccion) => void
  alCambiarRango: (r: Rango) => void
}) {
  const marco = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(800)
  const [arrastre, setArrastre] = useState<{ x0: number; x1: number } | null>(null)
  useEffect(() => {
    const el = marco.current
    if (!el) return
    const medir = () => setAncho(Math.max(200, el.clientWidth - ETIQUETAS))
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  const e = escala(rango, ancho)
  const yCarril = (host: string) => HOSTS.indexOf(host as (typeof HOSTS)[number]) * CARRIL
  const enRango = aristas.map((a, i) => ({ a, i })).filter(({ a }) => a.ms >= rango.desde && a.ms <= rango.hasta)
  const xLocal = (ev: EventoPuntero<SVGRectElement>) => ev.clientX - ev.currentTarget.getBoundingClientRect().left

  const soltar = (ev: EventoPuntero<SVGRectElement>) => {
    if (!arrastre) return
    const x1 = xLocal(ev)
    const nuevo = rangoDeArrastre(arrastre.x0, x1, rango, ancho)
    setArrastre(null)
    if (nuevo) return alCambiarRango(nuevo)
    // un clic: la marca más cercana de ese carril (6 px a cada lado)
    const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top
    const host = HOSTS[Math.floor(y / CARRIL)]
    const cerca = alertas.filter((a) => a.host === host).map((a) => ({ a, d: Math.abs(e.x(a.ms) - x1) })).sort((p, q) => p.d - q.d)[0]
    if (cerca && cerca.d <= 6) alElegir({ tipo: 'alerta', alerta: cerca.a })
  }

  return (
    <div ref={marco} className="relative w-full min-w-0 overflow-hidden select-none">
      <div className="flex min-w-0">
        <div className="shrink-0" style={{ width: ETIQUETAS }}>
          {HOSTS.map((h) => (
            <p key={h} className="flex items-center font-mono text-[12px] font-semibold text-texto" style={{ height: CARRIL }}>{h}</p>
          ))}
        </div>
        <svg width={ancho} height={HOSTS.length * CARRIL + EJE} role="img" aria-label={`Alertas entre ${textoDeMs(rango.desde)} y ${textoDeMs(rango.hasta)} por host; arrastra para ampliar un rango`} className="overflow-visible">
          {HOSTS.map((h, i) => <rect key={h} x={0} y={i * CARRIL + 2} width={ancho} height={CARRIL - 4} rx={6} className="fill-superficie-alterna" />)}
          {marcas(rango).map((m) => (
            <g key={m.ms}>
              <line x1={e.x(m.ms)} x2={e.x(m.ms)} y1={0} y2={HOSTS.length * CARRIL} className="stroke-borde" strokeDasharray="2 3" />
              <text x={e.x(m.ms)} y={HOSTS.length * CARRIL + 15} textAnchor={e.x(m.ms) > ancho - 24 ? 'end' : e.x(m.ms) < 24 ? 'start' : 'middle'} className="fill-texto-suave font-mono text-[11px]">{m.texto}</text>
            </g>
          ))}
          {campanas.map((c) => {
            if (!c.inicio || !c.fin) return null
            const host = c.patron === 'P2' ? c.hosts[1] : c.hosts[0]
            const x0 = Math.max(0, e.x(msHora(c.inicio.hora)))
            const x1 = Math.min(ancho, e.x(msHora(c.fin.hora)))
            if (x1 <= 0 || x0 >= ancho) return null
            const y = yCarril(host) + (c.patron === 'P2' ? CARRIL - 15 : 4)
            return (
              <g key={c.id}>
                <rect x={x0} y={y} width={Math.max(2, x1 - x0)} height={11} rx={3} fill="color-mix(in srgb, var(--fund-inferido) 16%, transparent)" stroke="var(--fund-inferido)" strokeDasharray="4 3" />
                {x1 - x0 > 70 && <text x={x0 + 4} y={y + 9} className="fill-texto font-sans text-[10px] font-semibold">{c.patron} · {c.confianza?.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</text>}
              </g>
            )
          })}
          {enRango.map(({ a, i }) => (
            <line key={`r${i}`} x1={e.x(a.ms)} x2={e.x(a.ms)} y1={CARRIL - 6} y2={CARRIL + 6} stroke="var(--fund-observado)" strokeWidth={seleccion?.tipo === 'arista' && seleccion.indice === i ? 3 : 1.4} opacity={0.85} />
          ))}
          {alertas.map((a) => {
            const x = e.x(a.ms)
            const elegida = seleccion?.tipo === 'alerta' && seleccion.alerta.id === a.id
            return <line key={a.id} x1={x} x2={x} y1={yCarril(a.host) + 17} y2={yCarril(a.host) + CARRIL - 17} stroke={TRAZO[a.nivel]} strokeWidth={elegida ? 3.5 : a.nivel === 'high' ? 2 : 1.3} />
          })}
          {seleccion?.tipo === 'alerta' && <circle cx={e.x(seleccion.alerta.ms)} cy={yCarril(seleccion.alerta.host) + CARRIL / 2} r={7} fill="none" stroke="var(--acento)" strokeWidth={2} />}
          {arrastre && <rect x={Math.min(arrastre.x0, arrastre.x1)} y={0} width={Math.abs(arrastre.x1 - arrastre.x0)} height={HOSTS.length * CARRIL} fill="color-mix(in srgb, var(--acento) 14%, transparent)" stroke="var(--acento)" />}
          <rect
            x={0}
            y={0}
            width={ancho}
            height={HOSTS.length * CARRIL}
            fill="transparent"
            className="cursor-crosshair"
            onPointerDown={(ev) => { ev.currentTarget.setPointerCapture(ev.pointerId); const x = xLocal(ev); setArrastre({ x0: x, x1: x }) }}
            onPointerMove={(ev) => arrastre && setArrastre({ ...arrastre, x1: xLocal(ev) })}
            onPointerUp={soltar}
            onDoubleClick={() => alCambiarRango(DIA)}
          />
        </svg>
      </div>
    </div>
  )
}

function Detalle({ seleccion, campanas, legado }: { seleccion?: Seleccion; campanas: readonly Incidente[]; legado: Parameters<typeof enlaceGrafo>[1] }) {
  if (!seleccion) return <p className="rounded-2xl border border-dashed border-borde-discontinuo p-3 text-xs text-texto-suave">Elige una alerta en el gráfico o en la lista.</p>
  if (seleccion.tipo === 'arista') {
    const a = seleccion.arista
    const arista = a.puerto === 5985 ? 'e-winrm' : a.puerto === 445 ? 'e-smb' : 'e-rpc'
    return (
      <section aria-label="Evento elegido" className="space-y-2 rounded-2xl border border-borde bg-superficie p-3 text-xs">
        <p className="font-mono text-[13px] font-semibold text-texto tabular-nums">{formatearHora(a.hora)}</p>
        <h2 className="text-sm">Conexión {seleccion.indice + 1} de 17 · puerto {a.puerto}</h2>
        <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1">
          <dt className="text-texto-suave">Origen</dt><dd className="font-mono">{a.host} · {a.ipOrigen}</dd>
          <dt className="text-texto-suave">Destino</dt><dd className="font-mono">NASHUA · {a.ipDestino}:{a.puerto}</dd>
          <dt className="text-texto-suave">Proceso</dt><dd className="font-mono break-all">{a.proceso}</dd>
          <dt className="text-texto-suave">Usuario</dt><dd className="font-mono break-all">{a.usuario}</dd>
        </dl>
        <Link to={`/ataque?sel=${arista}`} className="inline-flex items-center gap-1 font-medium text-acento hover:underline">Ver en el grafo <ArrowRight className="size-3" aria-hidden /></Link>
      </section>
    )
  }
  const a = seleccion.alerta
  const suyas = campanasDe(a, campanas)
  return (
    <section aria-label="Evento elegido" className="space-y-2 rounded-2xl border border-borde bg-superficie p-3 text-xs">
      <p className="flex items-center justify-between gap-2">
        <span className="font-mono text-[13px] font-semibold text-texto tabular-nums">{formatearHora(a.hora)}</span>
        <ChipNivel nivel={a.nivel} />
      </p>
      <h2 className="text-sm break-words">{a.regla}</h2>
      <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1">
        <dt className="text-texto-suave">Host</dt><dd className="font-mono">{a.hostCompleto}</dd>
        <dt className="text-texto-suave">Técnicas</dt><dd className="font-mono">{a.tecnicas.join(', ') || 'ninguna'}</dd>
        <dt className="text-texto-suave">Tácticas</dt><dd>{a.tacticas.join(', ') || 'ninguna'}</dd>
        <dt className="text-texto-suave">Usuario</dt><dd className="font-mono break-all">{a.usuario || '—'}</dd>
        <dt className="text-texto-suave">Proceso</dt><dd className="font-mono break-all">{a.proceso || '—'}</dd>
        <dt className="text-texto-suave">EventID</dt><dd className="font-mono">{a.eventoOrigen}</dd>
        <dt className="text-texto-suave">alert_id</dt><dd className="font-mono break-all text-texto-suave">{a.id}</dd>
      </dl>
      {suyas.length > 0 && (
        <p className="text-texto-suave">
          En la campaña{suyas.length > 1 ? 's' : ''}{' '}
          {suyas.map((c, i) => (
            <span key={c.id}>{i > 0 && ', '}<Link to={`/incidentes?id=${encodeURIComponent(c.id)}`} className="text-acento hover:underline">{c.patron} · {c.hosts.join(' → ')}</Link></span>
          ))}
        </p>
      )}
      <Link to={enlaceGrafo(a, legado, campanas)} className="inline-flex items-center gap-1 font-medium text-acento hover:underline">Ver en el grafo <ArrowRight className="size-3" aria-hidden /></Link>
    </section>
  )
}

export default function PaginaCronologia() {
  const consulta = useLineaTemporal()
  const [parametros, setParametros] = useSearchParams()
  const rango = leerRango(parametros.get('desde'), parametros.get('hasta'))
  const hostUrl = HOSTS.find((h) => h === parametros.get('host'))
  // Los filtros sobreviven a ir y volver; un ?host= en la URL manda (y guarda aparte).
  const [hosts, setHosts] = useEstadoSesion(hostUrl ? `cronologia:hosts:${hostUrl}` : 'cronologia:hosts', hostUrl ? [hostUrl] : [...HOSTS], esListaDeTextos)
  const [niveles, setNiveles] = useEstadoSesion<NivelRegla[]>('cronologia:niveles', ['critical', 'high', 'medium', 'low', 'informational'], (v): v is NivelRegla[] => esListaDeTextos(v))
  const [mostradas, setMostradas] = useState(PAGINA)
  const datos = consulta.data
  const seleccion = datos ? resolverSeleccion(parametros.get('sel'), datos.alertas, datos.aristas, datos.legado) : undefined
  const visibles = useMemo(() => (datos ? filtrarAlertas(datos.alertas, { rango, hosts, niveles }) : []), [datos, rango, hosts, niveles])
  // La fila elegida siempre se pinta, aunque quede más allá de las que se muestran.
  const indiceElegida = seleccion?.tipo === 'alerta' ? visibles.findIndex((a) => a.id === seleccion.alerta.id) : -1
  const limite = Math.max(mostradas, indiceElegida + 11)

  const cambiar = (cambios: Record<string, string | null>) =>
    setParametros((previos) => {
      const nuevos = new URLSearchParams(previos)
      for (const [k, v] of Object.entries(cambios)) {
        if (v == null) nuevos.delete(k)
        else nuevos.set(k, v)
      }
      return nuevos
    }, { replace: true })
  const fijarRango = (r: Rango) => {
    setMostradas(PAGINA)
    cambiar(r.desde === DIA.desde && r.hasta === DIA.hasta ? { desde: null, hasta: null } : { desde: textoDeMs(r.desde), hasta: textoDeMs(r.hasta) })
  }
  const elegir = (s: Seleccion) => cambiar({ sel: idSeleccion(s) })

  // La fila elegida se trae a la vista (también cuando se elige desde el gráfico).
  useEffect(() => {
    if (seleccion?.tipo === 'alerta') document.getElementById(`fila-${seleccion.alerta.id}`)?.scrollIntoView({ block: 'nearest' })
  }, [seleccion])

  return (
    <>
      <EncabezadoPagina
        titulo="Línea temporal · APT29 day1"
        descripcion="Las 741 alertas de APT29 day1 en el tiempo, por host."
        comoLeer={
          <>
            <p>Arrastra sobre el gráfico para ampliar un rango y haz doble clic para volver al día entero; los atajos de rango hacen lo mismo con el teclado.</p>
            <p>Las bandas son las ventanas de las campañas; las líneas verdes entre SCRANTON y NASHUA, las 17 conexiones del salto lateral (P2). Horas UTC del dataset (2-5-2020), del evento.</p>
          </>
        }
      />
      {consulta.isError ? (
        <EstadoError error={consulta.error} alReintentar={() => void consulta.refetch()} reintentando={consulta.isFetching} />
      ) : !datos ? (
        <div role="status" aria-label="Cargando la línea temporal"><Skeleton className="h-96 rounded-2xl" /></div>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
            <section aria-label="Carriles por host" className="min-w-0 space-y-3 rounded-2xl border border-borde bg-superficie p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div role="group" aria-label="Rango" className="flex flex-wrap gap-1">
                  {PRESETS.map((p) => (
                    <Button key={p.id} size="sm" variant={p.rango.desde === rango.desde && p.rango.hasta === rango.hasta ? 'default' : 'outline'} aria-pressed={p.rango.desde === rango.desde && p.rango.hasta === rango.hasta} onClick={() => fijarRango(p.rango)}>
                      {p.texto}
                    </Button>
                  ))}
                </div>
                <div role="group" aria-label="Hosts" className="flex flex-wrap gap-1">
                  {HOSTS.map((h) => <Conmutador key={h} activo={hosts.includes(h)} alPulsar={() => setHosts((l) => alternar(l, h))}>{h}</Conmutador>)}
                </div>
                <div role="group" aria-label="Nivel" className="flex flex-wrap gap-1">
                  {NIVELES.map((n) => <Conmutador key={n.valor} activo={niveles.includes(n.valor)} alPulsar={() => setNiveles((l) => alternar(l, n.valor))}>{n.texto}</Conmutador>)}
                </div>
                <ChipProcedencia procedencia="documentada" fuente="eval/portal/alertas-apt29-day1.jsonl y aristas-p2.jsonl (21-10-2026)" className="ml-auto" />
              </div>
              <Carriles rango={rango} alertas={visibles} aristas={datos.aristas} campanas={datos.campanas} seleccion={seleccion} alElegir={elegir} alCambiarRango={fijarRango} />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-texto-suave" aria-label="Leyenda">
                {NIVELES.map((n) => <span key={n.valor} className="flex items-center gap-1"><span className="inline-block h-3 w-0.5" style={{ background: n.trazo }} aria-hidden />{n.texto}</span>)}
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-5 rounded-sm border border-dashed border-fund-inferido bg-fund-inferido/15" aria-hidden />Campaña (su ventana)</span>
                <span className="flex items-center gap-1"><span className="inline-block h-3 w-0.5 bg-fund-observado" aria-hidden />Conexión de P2 SCRANTON → NASHUA</span>
                <span>† hora reconstruida (Security o PowerShell): resolución de segundo; dentro de un mismo segundo el orden es incierto.</span>
              </div>
              <p role="status" className="flex items-center gap-2 text-xs text-texto">
                <span className="font-mono tabular-nums">{textoDeMs(rango.desde)} – {textoDeMs(rango.hasta)}</span>
                <span className="text-texto-suave">· {formatearEntero(visibles.length)} alertas</span>
                {(rango.desde !== DIA.desde || rango.hasta !== DIA.hasta) && (
                  <Button size="sm" variant="ghost" onClick={() => fijarRango(DIA)}><RotateCcw aria-hidden />Todo day1</Button>
                )}
              </p>
            </section>

            <section aria-label="Alertas del rango" className="min-w-0 rounded-2xl border border-borde bg-superficie p-2">
              <div className="max-h-[22rem] overflow-y-auto">
                <table className="w-full table-fixed text-xs">
                  <colgroup>
                    <col className="w-28" />
                    <col className="w-24" />
                    <col className="w-28" />
                    <col />
                    <col className="w-44" />
                  </colgroup>
                  <thead className="sticky top-0 bg-superficie text-texto-suave">
                    <tr>
                      <th scope="col" className="px-2 py-1 text-left font-semibold">Hora (UTC)</th>
                      <th scope="col" className="px-2 py-1 text-left font-semibold">Host</th>
                      <th scope="col" className="px-2 py-1 text-left font-semibold">Nivel</th>
                      <th scope="col" className="px-2 py-1 text-left font-semibold">Regla</th>
                      <th scope="col" className="px-2 py-1 text-left font-semibold">Técnicas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.slice(0, limite).map((a) => {
                      const elegida = seleccion?.tipo === 'alerta' && seleccion.alerta.id === a.id
                      return (
                        <tr key={a.id} id={`fila-${a.id}`} aria-current={elegida ? 'true' : undefined} className={cn('border-t border-borde/50', elegida && 'bg-acento-suave')}>
                          <td className="px-2 py-0.5 whitespace-nowrap">
                            <button type="button" onClick={() => elegir({ tipo: 'alerta', alerta: a })} className="font-mono text-texto tabular-nums hover:text-acento hover:underline">{formatearHora(a.hora)}</button>
                          </td>
                          <td className="px-2 py-0.5 font-mono text-[11px] text-texto-suave">{a.host}</td>
                          <td className="px-2 py-0.5"><ChipNivel nivel={a.nivel} /></td>
                          <td className="max-w-0 truncate px-2 py-0.5 text-texto" title={a.regla}>{a.regla}</td>
                          <td className="px-2 py-0.5 font-mono text-[11px] whitespace-nowrap text-texto-suave">{a.tecnicas.slice(0, 2).join(', ')}{a.tecnicas.length > 2 ? ' …' : ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {visibles.length > limite && (
                <Button size="sm" variant="ghost" className="mt-1" onClick={() => setMostradas(limite + PAGINA)}>Mostrar {Math.min(PAGINA, visibles.length - limite)} más de {formatearEntero(visibles.length - limite)}</Button>
              )}
            </section>
          </div>
          <aside aria-label="Detalle" className="xl:sticky xl:top-4">
            <Detalle seleccion={seleccion} campanas={datos.campanas} legado={datos.legado} />
          </aside>
        </div>
      )}
    </>
  )
}
