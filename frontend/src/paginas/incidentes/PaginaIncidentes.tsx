/**
 * Explorador de incidentes en maestro-detalle. Hasta F6 un incidente es una CAMPAÑA (12): tabla con búsqueda,
 * filtros y orden, agrupada por dataset (las 7 variantes LSASS en un grupo plegable), y el detalle al lado, con su
 * evidencia y enlaces al grafo, a la línea temporal y al asistente de respuesta. Host, ventana y confianza salen de
 * las exportaciones de los oráculos (21-10-2026). No hay columna de prioridad: el Pilar C no existe aún para datos
 * reales, y se dice una vez en la cabecera en vez de repetir «—» en cada fila.
 */
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useIncidentes, type Incidente } from '@/api/incidentes'
import { ChipNivel, ChipProcedencia } from '@/componentes/datos/Chips'
import { formatearEntero } from '@/componentes/datos/formato'
import { formatearHora } from '@/componentes/datos/hora'
import { esListaDeTextos, esObjeto, useEstadoSesion } from '@/componentes/datos/useEstadoSesion'
import { EncabezadoPagina, EstadoError } from '@/componentes/shell'
import { Skeleton } from '@/componentes/ui/skeleton'
import { cn } from '@/lib/utils'

import { CRITERIOS_INICIALES, filtrarIncidentes, grupoDe, leerIncidente, ORDEN_INICIAL, ordenarIncidentes, type CampoOrden, type CriteriosIncidentes, type GrupoDataset, type Orden } from './logica'

const PATRON = {
  P1: { texto: 'P1 · credenciales', clase: 'bg-fam-violeta-fondo text-fam-violeta-texto' },
  P2: { texto: 'P2 · lateral', clase: 'bg-fam-coral-fondo text-fam-coral-texto' },
} as const

const GRUPOS: { id: Exclude<GrupoDataset, 'todos'>; titulo: string; plegable: boolean }[] = [
  { id: 'apt29', titulo: 'APT29 day1 (MITRE Evals)', plegable: false },
  { id: 'lsass', titulo: 'Campañas LSASS · 7 variantes de volcado', plegable: true },
  { id: 'atomico', titulo: 'Atómico de referencia', plegable: false },
]

const esCriterios = (v: unknown): v is CriteriosIncidentes =>
  esObjeto(v) && typeof v.texto === 'string' && esListaDeTextos(v.patrones) && ['todos', 'apt29', 'lsass', 'atomico'].includes(String(v.grupo))
const esOrden = (v: unknown): v is Orden =>
  esObjeto(v) && ['inicio', 'alertas', 'confianza', 'patron', 'dataset'].includes(String(v.campo)) && (v.sentido === 'asc' || v.sentido === 'desc')

const confianza = (v: number | null) => (v == null ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: 2 }))
const ventana = (i: Incidente) => `${i.inicio ? formatearHora(i.inicio) : '—'} → ${i.fin ? formatearHora(i.fin) : '—'}`

function Cabecera({ campo, titulo, orden, alOrdenar, derecha }: { campo: CampoOrden; titulo: string; orden: Orden; alOrdenar: (c: CampoOrden) => void; derecha?: boolean }) {
  const activo = orden.campo === campo
  const Icono = !activo ? ArrowUpDown : orden.sentido === 'asc' ? ArrowUp : ArrowDown
  return (
    <th scope="col" aria-sort={activo ? (orden.sentido === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('px-2.5 py-2 font-semibold', derecha ? 'text-right' : 'text-left')}>
      <button type="button" onClick={() => alOrdenar(campo)} className="inline-flex items-center gap-1 hover:text-texto">
        {titulo}
        <Icono className="size-3" aria-hidden />
      </button>
    </th>
  )
}

function Detalle({ incidente }: { incidente: Incidente | undefined }) {
  if (!incidente) {
    return <p className="rounded-2xl border border-dashed border-borde-discontinuo p-4 text-xs text-texto-suave">Elige un incidente de la tabla para ver su evidencia.</p>
  }
  const i = incidente
  const etapas = i.etapas
  return (
    <section aria-label="Detalle del incidente" className="space-y-3 rounded-2xl border border-borde bg-superficie p-4">
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', PATRON[i.patron].clase)}>{PATRON[i.patron].texto}</span>
          <ChipProcedencia procedencia="documentada" fuente={i.fuente} />
        </div>
        <h2 className="text-base break-words">{i.hosts.length ? i.hosts.join(' → ') : i.descripcionDataset}</h2>
        <p className="font-mono text-[11.5px] text-texto-suave">{i.dataset} · {i.descripcionDataset}</p>
      </header>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-superficie-alterna p-2"><dt className="text-texto-suave">Alertas absorbidas</dt><dd className="text-lg font-semibold text-texto tabular-nums">{formatearEntero(i.alertas)}</dd></div>
        <div className="rounded-lg bg-superficie-alterna p-2"><dt className="text-texto-suave">Confianza</dt><dd className="text-lg font-semibold text-texto tabular-nums" title={i.fuenteConfianza}>{confianza(i.confianza)}</dd></div>
        <div className="col-span-2 rounded-lg bg-superficie-alterna p-2">
          <dt className="text-texto-suave">Ventana (UTC del dataset{i.fecha && i.dataset !== 'SDWIN-200501225525' ? `, ${i.fecha}` : ''})</dt>
          <dd className="font-mono text-texto tabular-nums">{ventana(i)}</dd>
        </div>
      </dl>
      {i.factores.length > 0 && (
        <ul className="space-y-0.5" aria-label="Factores de la confianza">
          {i.factores.map((f) => (
            <li key={f.factor} className={cn('flex justify-between gap-2 text-[11px]', f.presente ? 'text-texto' : 'text-texto-suave line-through')}>
              <span><span className="sr-only">{f.presente ? 'Presente: ' : 'Ausente: '}</span>{f.factor}</span>
              <span className="tabular-nums">+{f.peso.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
            </li>
          ))}
        </ul>
      )}
      {etapas && (
        <dl className="grid grid-cols-4 gap-1.5 text-center text-[11px]" aria-label="Evidencia por etapa del detector P1">
          {([['LSASS', etapas.lsass], ['Volcado', etapas.fichero], ['Herramienta', etapas.herramienta], ['Limpieza', etapas.limpieza]] as const).map(([t, v]) => (
            <div key={t} className="rounded-lg bg-superficie-alterna px-1 py-1.5"><dt className="text-texto-suave">{t}</dt><dd className="text-sm font-semibold text-texto tabular-nums">{v}</dd></div>
          ))}
        </dl>
      )}
      {i.tecnicas.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Técnicas ATT&CK">{i.tecnicas.map((t) => <li key={t} className="rounded-md bg-superficie-alterna px-1.5 py-0.5 font-mono text-[11px] text-texto">{t}</li>)}</ul>
      )}
      {i.evidencia.length > 0 && (
        <ol className="space-y-1" aria-label="Evidencia alerta a alerta">
          {i.evidencia.map((a) => (
            <li key={a.id} className="rounded-lg border border-borde p-2 text-xs">
              <span className="flex flex-wrap items-center gap-1.5"><span className="font-mono text-texto tabular-nums">{formatearHora(a.hora)}</span><ChipNivel nivel={a.nivel} /></span>
              <span className="mt-0.5 block font-medium text-texto">{a.regla}{a.veces > 1 ? ` (×${a.veces})` : ''}</span>
            </li>
          ))}
        </ol>
      )}
      {i.aristasP2.length > 0 && (
        <table className="w-full text-xs">
          <caption className="mb-1 text-left text-[11px] font-semibold text-texto-suave">Conexiones de P2 (Sysmon EID 3)</caption>
          <thead className="text-texto-suave"><tr><th scope="col" className="text-left font-semibold">Servicio</th><th scope="col" className="text-right font-semibold">Conexiones</th><th scope="col" className="pl-2 text-left font-semibold">Proceso</th></tr></thead>
          <tbody>{i.aristasP2.map((a) => <tr key={a.puerto} className="border-t border-borde"><td className="py-1 text-texto">{a.servicio} {a.puerto}</td><td className="text-right text-texto tabular-nums">{a.conexiones}</td><td className="pl-2 font-mono text-texto">{a.proceso}</td></tr>)}</tbody>
        </table>
      )}
      {i.notas.map((n) => <p key={n} className="text-xs text-texto-suave">{n}</p>)}
      <nav aria-label="Ir a" className="flex flex-wrap gap-x-3 gap-y-1 border-t border-borde pt-2 text-xs">
        {i.nodoGrafo && <Link to={`/ataque?sel=${encodeURIComponent(i.nodoGrafo)}`} className="inline-flex items-center gap-1 font-medium text-acento hover:underline">Grafo de ataque <ArrowRight className="size-3" aria-hidden /></Link>}
        {i.eventoCronologia && <Link to={`/cronologia?sel=${encodeURIComponent(i.eventoCronologia)}`} className="inline-flex items-center gap-1 font-medium text-acento hover:underline">Línea temporal <ArrowRight className="size-3" aria-hidden /></Link>}
        <Link to={`/respuesta?caso=${encodeURIComponent(i.id)}`} className="inline-flex items-center gap-1 font-medium text-acento hover:underline">Asistente de respuesta <ArrowRight className="size-3" aria-hidden /></Link>
      </nav>
    </section>
  )
}

export default function PaginaIncidentes() {
  const consulta = useIncidentes()
  const [parametros, setParametros] = useSearchParams()
  // Filtros, orden y grupo plegado sobreviven a ir a otra página y volver.
  const [criterios, setCriterios] = useEstadoSesion('incidentes:criterios', CRITERIOS_INICIALES, esCriterios)
  const [orden, setOrden] = useEstadoSesion('incidentes:orden', ORDEN_INICIAL, esOrden)
  const [lsassAbierto, setLsassAbierto] = useEstadoSesion('incidentes:lsass', false, (v): v is boolean => typeof v === 'boolean')
  const lista = useMemo(() => (consulta.data ? ordenarIncidentes(filtrarIncidentes(consulta.data, criterios), orden) : []), [consulta.data, criterios, orden])
  const elegido = consulta.data ? leerIncidente(parametros.get('id'), consulta.data) : undefined
  const ordenar = (campo: CampoOrden) => setOrden((o) => ({ campo, sentido: o.campo === campo && o.sentido === 'desc' ? 'asc' : 'desc' }))
  // Elegir conserva el resto de la URL (filtros futuros, contexto de vuelta).
  const elegir = (id: string) => setParametros((p) => { const n = new URLSearchParams(p); n.set('id', id); return n }, { replace: true })
  // El grupo LSASS se abre solo si lo elegido o lo buscado está dentro.
  const abierto = lsassAbierto || (elegido && grupoDe(elegido.dataset) === 'lsass') || criterios.texto.trim() !== '' || criterios.grupo === 'lsass'

  return (
    <>
      <EncabezadoPagina
        titulo="Incidentes"
        descripcion="Cada campaña detectada es un incidente."
        comoLeer={
          <>
            <p>Las campañas las encuentran los patrones de correlación (CEP): P1, robo de credenciales, y P2, movimiento lateral.</p>
            <p>No hay columna de prioridad: la priorización explicable (Pilar C) llega en la fase F6, con la API. Hasta entonces no se inventa.</p>
            <p>La confianza es la suma de sus factores, cada uno con su peso. † marca una hora reconstruida, con resolución de segundo.</p>
          </>
        }
      />
      {consulta.isError ? (
        <EstadoError error={consulta.error} alReintentar={() => void consulta.refetch()} reintentando={consulta.isFetching} />
      ) : !consulta.data ? (
        <div role="status" aria-label="Cargando los incidentes"><Skeleton className="h-96 rounded-2xl" /></div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_25rem]">
          <section aria-label="Lista de incidentes" className="min-w-0 rounded-2xl border border-borde bg-superficie p-4">
            <div role="search" className="mb-3 flex flex-wrap items-center gap-3">
              <label className="relative flex min-w-48 flex-1 items-center">
                <span className="sr-only">Buscar incidentes</span>
                <Search className="pointer-events-none absolute left-2 size-3.5 text-texto-suave" aria-hidden />
                <input
                  type="search"
                  value={criterios.texto}
                  maxLength={80}
                  onChange={(e) => setCriterios((c) => ({ ...c, texto: e.target.value }))}
                  placeholder="Host, dataset, técnica…"
                  className="w-full rounded-lg border border-borde bg-superficie py-1.5 pr-2 pl-7 text-xs text-texto placeholder:text-texto-suave"
                />
              </label>
              <span role="group" aria-label="Patrón" className="flex gap-1">
                {(['P1', 'P2'] as const).map((p) => (
                  <button key={p} type="button" aria-pressed={criterios.patrones.includes(p)} onClick={() => setCriterios((c) => ({ ...c, patrones: c.patrones.includes(p) ? c.patrones.filter((x) => x !== p) : [...c.patrones, p] }))} className={cn('rounded-full border px-2 py-0.5 text-[11.5px] font-medium', criterios.patrones.includes(p) ? 'border-acento bg-acento text-sobre-intenso' : 'border-dashed border-borde-discontinuo text-texto-suave line-through')}>
                    {PATRON[p].texto}
                  </button>
                ))}
              </span>
              <label className="flex items-center gap-1.5 text-xs text-texto-suave">
                Dataset
                <select value={criterios.grupo} onChange={(e) => setCriterios((c) => ({ ...c, grupo: e.target.value as GrupoDataset }))} className="rounded-md border border-borde bg-superficie px-1.5 py-1 text-xs text-texto">
                  <option value="todos">Todos</option>
                  <option value="apt29">APT29 day1</option>
                  <option value="lsass">Campañas LSASS</option>
                  <option value="atomico">Atómico de referencia</option>
                </select>
              </label>
              <p role="status" className="text-xs text-texto-suave">{lista.length} de {consulta.data.length}</p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-borde/70">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-superficie-alterna text-texto-suave">
                  <tr>
                    <Cabecera campo="patron" titulo="Patrón" orden={orden} alOrdenar={ordenar} />
                    <th scope="col" className="px-2.5 py-2 text-left font-semibold">Hosts</th>
                    <Cabecera campo="inicio" titulo="Ventana (UTC)" orden={orden} alOrdenar={ordenar} />
                    <Cabecera campo="alertas" titulo="Alertas" orden={orden} alOrdenar={ordenar} derecha />
                    <Cabecera campo="confianza" titulo="Confianza" orden={orden} alOrdenar={ordenar} derecha />
                  </tr>
                </thead>
                {lista.length === 0 && (
                  <tbody><tr><td colSpan={5} className="px-2.5 py-6 text-center text-texto-suave">Ningún incidente con estos filtros.</td></tr></tbody>
                )}
                {GRUPOS.map((g) => {
                  const filas = lista.filter((i) => grupoDe(i.dataset) === g.id)
                  if (filas.length === 0) return null
                  const visible = !g.plegable || abierto
                  return (
                    <tbody key={g.id}>
                      <tr className="border-t border-borde bg-superficie-hundida/60">
                        <th scope="rowgroup" colSpan={5} className="px-2.5 py-1 text-left text-[11px] font-semibold text-texto-suave">
                          {g.plegable ? (
                            <button type="button" aria-expanded={visible} onClick={() => setLsassAbierto(!visible)} className="inline-flex items-center gap-1 hover:text-texto">
                              {visible ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
                              {g.titulo} ({filas.length})
                            </button>
                          ) : (
                            <>{g.titulo} ({filas.length})</>
                          )}
                        </th>
                      </tr>
                      {visible && filas.map((i) => (
                        <tr key={i.id} aria-selected={i.id === elegido?.id} className={cn('border-t border-borde/60', i.id === elegido?.id ? 'bg-acento-suave/60' : 'hover:bg-superficie-alterna/60')}>
                          <td className="px-2.5 py-1.5 whitespace-nowrap">
                            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', PATRON[i.patron].clase)}>{PATRON[i.patron].texto}</span>
                          </td>
                          <td className="px-2.5 py-1.5">
                            <button type="button" onClick={() => elegir(i.id)} className="text-left font-medium text-texto hover:text-acento hover:underline" aria-label={`Ver el incidente ${i.patron} de ${i.hosts.join(' → ') || i.dataset}`}>
                              {i.hosts.join(' → ') || '—'}
                            </button>
                            {g.id !== 'apt29' && <span className="block max-w-[16rem] truncate text-[11px] text-texto-suave" title={i.descripcionDataset}>{i.descripcionDataset}</span>}
                          </td>
                          <td className="px-2.5 py-1.5 font-mono whitespace-nowrap text-texto tabular-nums">
                            {g.id !== 'apt29' && i.fecha && <span className="mr-1 text-texto-suave">{i.fecha}</span>}
                            {ventana(i)}
                          </td>
                          <td className="px-2.5 py-1.5 text-right text-texto tabular-nums">{formatearEntero(i.alertas)}</td>
                          <td className="px-2.5 py-1.5 text-right text-texto tabular-nums">{confianza(i.confianza)}</td>
                        </tr>
                      ))}
                    </tbody>
                  )
                })}
              </table>
            </div>
            <p className="mt-2 text-[11px] text-texto-suave">† hora reconstruida, con resolución de segundo. Las dos campañas de SCRANTON comparten 22 alertas.</p>
          </section>
          <aside aria-label="Incidente elegido" className="lg:sticky lg:top-4">
            <Detalle incidente={elegido} />
          </aside>
        </div>
      )}
    </>
  )
}
