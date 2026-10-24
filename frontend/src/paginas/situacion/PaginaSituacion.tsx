/**
 * Situación: la portada, un panel SOC de un vistazo sobre APT29 day1. Arriba los indicadores (tres principales y el
 * resto secundarios); en el centro la actividad por minuto apilada por nivel y el reparto por severidad; abajo el
 * mapa de calor táctica × host y las campañas con enlace a su incidente. Todo documentado; la procedencia va por
 * bloque. El avance del proyecto y el estado del pipeline están en `/proyecto`: son contexto del TFG, no del SOC.
 *
 * Sin librerías de gráficos: barras y mapa de calor en HTML, así la portada no descarga Recharts ni React Flow.
 */
import { ArrowRight, Info, NotebookText } from 'lucide-react'
import { Link } from 'react-router'

import { useIncidentes, type Incidente } from '@/api/incidentes'
import { useActividadDay1, useSituacion, type ActividadDay1, type Cifra } from '@/api/situacion'
import { NIVELES_ORDEN } from '@/api/simulado/actividad'
import type { NivelRegla } from '@/api/tipos'
import { Ayuda } from '@/componentes/datos/Ayuda'
import { ChipProcedencia } from '@/componentes/datos/Chips'
import { formatearEntero, formatearPorcentaje } from '@/componentes/datos/formato'
import { formatearHora } from '@/componentes/datos/hora'
import { useNumeroAnimado } from '@/componentes/datos/useNumeroAnimado'
import { EncabezadoPagina, EstadoError } from '@/componentes/shell'
import { Skeleton } from '@/componentes/ui/skeleton'
import { cn } from '@/lib/utils'

const NIVEL: Record<NivelRegla, { texto: string; fondo: string }> = {
  // alto y crítico, además de su color, van rayados: el color nunca es la única señal
  critical: { texto: 'Crítico', fondo: 'bg-sev-critica rayado' },
  high: { texto: 'Alto', fondo: 'bg-sev-alta rayado' },
  medium: { texto: 'Medio', fondo: 'bg-sev-media' },
  low: { texto: 'Bajo', fondo: 'bg-sev-baja' },
  informational: { texto: 'Informativo', fondo: 'bg-sev-info' },
}
/** Mezcla del color de serie con la superficie: el número va encima con el color de texto normal (AA comprobado). */
const CALOR = ['', 'bg-chart-1/10', 'bg-chart-1/18', 'bg-chart-1/26', 'bg-chart-1/34', 'bg-chart-1/42'] as const
const nivelCalor = (v: number, max: number) => (v <= 0 || max <= 0 ? 0 : Math.max(1, Math.min(5, Math.ceil((5 * Math.log1p(v)) / Math.log1p(max)))))

function Panel({ titulo, fuente, enlace, children, className }: { titulo: string; fuente: string; enlace?: { a: string; texto: string }; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={titulo} className={cn('flex min-w-0 flex-col rounded-2xl border border-borde bg-superficie p-3.5', className)}>
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px]">{titulo}</h2>
        <span className="flex items-center gap-2">
          <ChipProcedencia procedencia="documentada" fuente={fuente} />
          {enlace && (
            <Link to={enlace.a} className="inline-flex items-center gap-0.5 text-xs font-medium text-acento hover:underline">
              {enlace.texto} <ArrowRight className="size-3" aria-hidden />
            </Link>
          )}
        </span>
      </header>
      {children}
    </section>
  )
}

function KpiPrincipal({ cifra }: { cifra: Cifra }) {
  const animado = useNumeroAnimado(cifra.valor)
  return (
    <section aria-label={cifra.titulo} className="flex flex-col gap-0.5 rounded-2xl border border-borde bg-superficie px-4 py-3">
      <h2 className="flex items-center justify-between gap-2 text-[13px] font-semibold text-texto-suave">
        {cifra.titulo}
        <Ayuda texto={`Documentado en: ${cifra.fuente}`}>
          <span tabIndex={0} className="text-ok" aria-label={`Fuente: ${cifra.fuente}`}>
            <NotebookText className="size-3.5" aria-hidden />
          </span>
        </Ayuda>
      </h2>
      <p className="text-[1.8rem] leading-none font-semibold tracking-tight text-primario tabular-nums">{formatearEntero(animado == null ? null : Math.round(animado))}</p>
      <p className="text-xs text-texto-suave">{cifra.detalle}</p>
    </section>
  )
}

function KpiSecundaria({ titulo, valor, detalle, nota }: { titulo: string; valor: string; detalle: string; nota?: string }) {
  return (
    <section aria-label={titulo} className="flex items-baseline gap-2 rounded-xl border border-borde bg-superficie px-3 py-1.5">
      <h2 className="min-w-0 flex-1 text-xs leading-tight font-semibold text-texto-suave">{titulo}</h2>
      <span className="text-[15px] font-semibold text-texto tabular-nums">{valor}</span>
      <span className="text-[11px] text-texto-suave">{detalle}</span>
      {nota && (
        <Ayuda texto={nota} className="self-center">
          <button type="button" className="text-texto-suave hover:text-acento" aria-label={`Nota: ${nota}`}>
            <Info className="size-3.5" aria-hidden />
          </button>
        </Ayuda>
      )}
    </section>
  )
}

function Actividad({ actividad }: { actividad: ActividadDay1 }) {
  const maximo = Math.max(...actividad.porMinuto.map((m) => m.total))
  const presentes = NIVELES_ORDEN.filter((n) => actividad.porNivel.some((p) => p.nivel === n))
  return (
    <Panel titulo="Actividad de APT29 day1 por minuto" fuente={actividad.fuente} enlace={{ a: '/cronologia', texto: 'Línea temporal' }}>
      <div className="flex gap-2">
        <span className="pt-0.5 text-right font-mono text-[11px] text-texto-suave tabular-nums" aria-hidden>{maximo}</span>
        <div className="min-w-0 flex-1">
          <div className="flex h-32 items-end gap-[3px] border-b border-borde" aria-hidden>
            {actividad.porMinuto.map((m) => (
              <div
                key={m.minuto}
                title={`${m.minuto} · ${m.total} alertas${m.total ? `: ${presentes.filter((n) => m.porNivel[n]).map((n) => `${m.porNivel[n]} ${NIVEL[n].texto.toLowerCase()}`).join(', ')}` : ''}`}
                className="flex h-full min-w-0 flex-1 flex-col-reverse"
              >
                {presentes.map((n) => (m.porNivel[n] ? <div key={n} className={NIVEL[n].fondo} style={{ height: `${(m.porNivel[n] / maximo) * 100}%` }} /> : null))}
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[11px] text-texto-suave tabular-nums" aria-hidden>
            {actividad.porMinuto.filter((_, i) => i % 4 === 0).map((m) => <span key={m.minuto}>{m.minuto}</span>)}
          </div>
        </div>
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-texto" aria-label="Niveles">
        {[...presentes].reverse().map((n) => (
          <li key={n} className="flex items-center gap-1.5"><span className={cn('size-2.5 rounded-sm', NIVEL[n].fondo)} aria-hidden />{NIVEL[n].texto}</li>
        ))}
        <li className="text-texto-suave">UTC del dataset (2-5-2020), hora del evento</li>
      </ul>
      <table className="sr-only">
        <caption>Alertas por minuto y nivel</caption>
        <thead><tr><th scope="col">Minuto</th><th scope="col">Total</th>{presentes.map((n) => <th key={n} scope="col">{NIVEL[n].texto}</th>)}</tr></thead>
        <tbody>{actividad.porMinuto.map((m) => <tr key={m.minuto}><th scope="row">{m.minuto}</th><td>{m.total}</td>{presentes.map((n) => <td key={n}>{m.porNivel[n]}</td>)}</tr>)}</tbody>
      </table>
    </Panel>
  )
}

function Severidad({ actividad }: { actividad: ActividadDay1 }) {
  return (
    <Panel titulo="Reparto por severidad" fuente={actividad.fuente}>
      <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>
        {actividad.porNivel.map((p) => <div key={p.nivel} className={NIVEL[p.nivel].fondo} style={{ width: `${(p.alertas / actividad.total) * 100}%` }} />)}
      </div>
      <ul className="mt-3 space-y-1.5" aria-label="Alertas por nivel">
        {actividad.porNivel.map((p) => (
          <li key={p.nivel} className="flex items-center gap-2 text-[13px]">
            <span className={cn('size-2.5 rounded-sm', NIVEL[p.nivel].fondo)} aria-hidden />
            <span className="flex-1 text-texto">{NIVEL[p.nivel].texto}</span>
            <span className="font-semibold text-texto tabular-nums">{formatearEntero(p.alertas)}</span>
            <span className="w-14 text-right text-xs text-texto-suave tabular-nums">{formatearPorcentaje((p.alertas / actividad.total) * 100)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-2 text-[11px] text-texto-suave">{formatearEntero(actividad.total)} alertas de APT29 day1, por el nivel de su regla Sigma.</p>
    </Panel>
  )
}

function MapaCalor({ actividad }: { actividad: ActividadDay1 }) {
  const { mapa } = actividad
  const fila = (nombre: string, valores: number[], cursiva = false) => (
    <tr key={nombre}>
      <th scope="row" className={cn('truncate py-px pr-2 text-left font-normal text-texto', cursiva && 'text-texto-suave italic')}>{nombre}</th>
      {valores.map((v, i) => (
        <td key={mapa.hosts[i]} className={cn('rounded-[3px] px-1 py-px text-center tabular-nums', v ? cn('text-texto', CALOR[nivelCalor(v, mapa.maximo)]) : 'text-texto-suave/70')}>{v || '·'}</td>
      ))}
    </tr>
  )
  return (
    <Panel titulo="Tácticas por host" fuente={actividad.fuente} enlace={{ a: '/attack', texto: 'Matriz ATT&CK' }}>
      <table className="w-full table-fixed border-separate border-spacing-[2px] text-[11.5px]">
        <thead>
          <tr>
            <th scope="col" className="w-[42%] text-left font-normal text-texto-suave">Táctica</th>
            {mapa.hosts.map((h) => <th key={h} scope="col" className="font-mono font-semibold text-texto-suave">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {mapa.tacticas.map((t, i) => fila(t, mapa.celdas[i]))}
          {fila('(sin táctica)', mapa.sinTactica, true)}
        </tbody>
      </table>
      <p className="mt-1.5 text-[11px] text-texto-suave">Una alerta con varias tácticas cuenta en cada una.</p>
    </Panel>
  )
}

const PATRON = { P1: 'bg-fam-violeta-fondo text-fam-violeta-texto', P2: 'bg-fam-coral-fondo text-fam-coral-texto' } as const

function CampanasDay1({ incidentes }: { incidentes: Incidente[] }) {
  const day1 = incidentes.filter((i) => i.dataset === 'SDWIN-200501225525').sort((a, b) => (a.inicio?.hora ?? '').localeCompare(b.inicio?.hora ?? ''))
  return (
    <Panel titulo="Campañas de APT29 day1" fuente="eval/portal/p1-campanas.jsonl · p2-campanas.jsonl (21-10-2026)" enlace={{ a: '/incidentes', texto: `Las ${incidentes.length} campañas` }}>
      <table className="w-full text-xs">
        <thead className="text-texto-suave">
          <tr>
            <th scope="col" className="py-1 text-left font-semibold">Patrón</th>
            <th scope="col" className="py-1 text-left font-semibold">Hosts</th>
            <th scope="col" className="py-1 text-left font-semibold">Ventana (UTC)</th>
            <th scope="col" className="py-1 text-right font-semibold">Alertas</th>
            <th scope="col" className="py-1 text-right font-semibold">Confianza</th>
          </tr>
        </thead>
        <tbody>
          {day1.map((i) => (
            <tr key={i.id} className="border-t border-borde/60">
              <td className="py-1.5"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', PATRON[i.patron])}>{i.patron}</span></td>
              <td className="py-1.5">
                <Link to={`/incidentes?id=${encodeURIComponent(i.id)}`} className="font-medium text-texto hover:text-acento hover:underline">{i.hosts.join(' → ')}</Link>
              </td>
              <td className="py-1.5 font-mono text-[11.5px] whitespace-nowrap text-texto tabular-nums">{i.inicio ? formatearHora(i.inicio) : '—'} → {i.fin ? formatearHora(i.fin) : '—'}</td>
              <td className="py-1.5 text-right text-texto tabular-nums">{formatearEntero(i.alertas)}</td>
              <td className="py-1.5 text-right text-texto tabular-nums">{i.confianza == null ? '—' : i.confianza.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-auto pt-2 text-[11px] text-texto-suave">† hora reconstruida, con resolución de segundo. Las dos de SCRANTON comparten 22 alertas.</p>
    </Panel>
  )
}

export default function PaginaSituacion() {
  const situacion = useSituacion()
  const actividad = useActividadDay1()
  const incidentes = useIncidentes()
  const error = situacion.error ?? actividad.error ?? incidentes.error
  const datos = situacion.data
  const cifra = (clave: string) => datos?.cifras.find((c) => c.clave === clave)

  return (
    <>
      <EncabezadoPagina
        titulo="Situación"
        descripcion="APT29 day1: actividad, severidad, tácticas y campañas."
        comoLeer={
          <>
            <p>Los tres indicadores grandes son del corpus completo (nueve datasets); el resto, de APT29 day1 (MITRE ATT&CK Evaluations, 2-5-2020).</p>
            <p>La reducción del 99,1 % es solo del patrón P1 y no se compara con la línea base (741 → 87, 88,3 %): miden cosas distintas. F2 es la fase de detección del proyecto, cerrada el 30-07. El avance del proyecto está en «Proyecto».</p>
          </>
        }
      />
      {error ? (
        <EstadoError error={error} alReintentar={() => { void situacion.refetch(); void actividad.refetch(); void incidentes.refetch() }} reintentando={situacion.isFetching || actividad.isFetching} />
      ) : !datos || !actividad.data || !incidentes.data ? (
        <div role="status" aria-label="Cargando la situación" className="grid gap-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="entrada-escalonada grid gap-3 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.35fr)]">
            {(['alertas', 'campanas', 'eventos'] as const).map((clave, i) => {
              const c = cifra(clave)
              return c ? <div key={clave} style={{ '--i': i } as React.CSSProperties}><KpiPrincipal cifra={c} /></div> : null
            })}
            <div className="grid gap-1.5" style={{ '--i': 3 } as React.CSSProperties}>
              <KpiSecundaria titulo="Reducción de alertas" valor={formatearPorcentaje(cifra('reduccion')!.valor)} detalle="en P1" nota={cifra('reduccion')!.detalle} />
              <KpiSecundaria titulo="Variantes LSASS detectadas" valor="7 de 7" detalle="batch y Flink" />
              <KpiSecundaria titulo="Técnicas observadas" valor={String(actividad.data.tecnicas.hoy)} detalle={`hoy (21-10) · ${actividad.data.tecnicas.f2} en F2 (28-07)`} />
            </div>
          </div>
          <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Actividad actividad={actividad.data} />
            <Severidad actividad={actividad.data} />
          </div>
          <div className="grid items-stretch gap-3 xl:grid-cols-2">
            <MapaCalor actividad={actividad.data} />
            <CampanasDay1 incidentes={incidentes.data} />
          </div>
        </div>
      )}
    </>
  )
}
