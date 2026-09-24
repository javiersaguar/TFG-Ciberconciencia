/**
 * Situación: la portada. Las cifras del corpus de F3, las doce campañas del oráculo en batch y el avance de las
 * fases. Todo documentado (bitácora hasta el 15-09-2026); cada cifra dice de dónde sale.
 *
 * Es el embrión del «Panel de situación» y de la «Cola de incidentes» del MVF (ROADMAP F8.3): cuando existan la
 * priorización y la API, la tabla de campañas pasará a ser la cola de incidentes ordenada por puntuación.
 */
import { CheckCircle2, CircleDashed, LoaderCircle, NotebookText } from 'lucide-react'

import { useSituacion, type Cifra, type Fase } from '@/api/situacion'
import { formatearEntero, formatearPorcentaje } from '@/componentes/datos/formato'
import { useNumeroAnimado } from '@/componentes/datos/useNumeroAnimado'
import { EncabezadoPagina, EstadoError } from '@/componentes/shell'
import { Skeleton } from '@/componentes/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/componentes/ui/tooltip'
import { cn } from '@/lib/utils'

function valorCifra(cifra: Cifra, valor: number | null): string {
  if (cifra.unidad === 'porcentaje') return formatearPorcentaje(valor)
  return formatearEntero(valor)
}

function TarjetaCifra({ cifra }: { cifra: Cifra }) {
  const animado = useNumeroAnimado(cifra.valor)
  return (
    <section aria-label={cifra.titulo} className="flex flex-col gap-1 rounded-2xl border border-borde bg-superficie p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <header className="flex items-start justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-texto-suave">{cifra.titulo}</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="text-ok" aria-label={`Fuente: ${cifra.fuente}`}>
              <NotebookText className="size-3.5" aria-hidden />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">Documentado en: {cifra.fuente}</TooltipContent>
        </Tooltip>
      </header>
      <p className="text-[1.9rem] leading-none font-semibold tracking-tight text-primario tabular-nums">
        {valorCifra(cifra, cifra.unidad === 'porcentaje' ? animado : animado == null ? null : Math.round(animado))}
      </p>
      <p className="text-xs text-texto-suave">{cifra.detalle}</p>
    </section>
  )
}

const PATRON: Record<'P1' | 'P2', { texto: string; clase: string }> = {
  P1: { texto: 'P1 · credenciales', clase: 'bg-[#dfd9ea] text-[#57458c]' },
  P2: { texto: 'P2 · lateral', clase: 'bg-[#ecd9d0] text-[#8d4526]' },
}

function Campanas({ campanas }: { campanas: NonNullable<ReturnType<typeof useSituacion>['data']>['campanas'] }) {
  return (
    <section aria-labelledby="titulo-campanas" className="flex min-w-0 flex-col rounded-2xl border border-borde bg-superficie p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titulo-campanas" className="text-base">Campañas detectadas</h2>
        <p className="text-xs text-texto-suave">Oráculo en batch sobre ClickHouse · horas del evento (UTC del dataset)</p>
      </header>
      <div className="overflow-x-auto rounded-lg border border-borde/70">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-superficie-alterna text-texto-suave">
            <tr>
              <th scope="col" className="px-2.5 py-2 text-left font-semibold">Patrón</th>
              <th scope="col" className="px-2.5 py-2 text-left font-semibold">Dataset</th>
              <th scope="col" className="px-2.5 py-2 text-left font-semibold">Hosts</th>
              <th scope="col" className="px-2.5 py-2 text-left font-semibold">Ventana</th>
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">Alertas</th>
              <th scope="col" className="px-2.5 py-2 text-left font-semibold">Nota</th>
            </tr>
          </thead>
          <tbody>
            {campanas.map((c) => (
              <tr key={c.id} className="border-t border-borde/60 odd:bg-superficie even:bg-superficie-alterna/50">
                <td className="px-2.5 py-1.5 whitespace-nowrap">
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', PATRON[c.patron].clase)}>{PATRON[c.patron].texto}</span>
                </td>
                <td className="px-2.5 py-1.5 font-mono text-[11.5px] whitespace-nowrap text-texto">{c.dataset}</td>
                <td className="px-2.5 py-1.5 whitespace-nowrap text-texto">{c.hosts}</td>
                <td className="px-2.5 py-1.5 whitespace-nowrap text-texto tabular-nums">
                  {c.inicio ? `${c.inicio} → ${c.fin ?? '—'}` : '—'}
                </td>
                <td className="px-2.5 py-1.5 text-right text-texto tabular-nums">{formatearEntero(c.alertas)}</td>
                <td className="px-2.5 py-1.5 text-texto-suave">{c.nota ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-texto-suave">
        Una alerta puede pertenecer a dos campañas del mismo host (las dos de SCRANTON comparten 22); la reducción de alertas las
        cuenta una sola vez.
      </p>
    </section>
  )
}

const ESTADO_FASE: Record<Fase['estado'], { icono: typeof CheckCircle2; clase: string; texto: string }> = {
  hecha: { icono: CheckCircle2, clase: 'text-ok', texto: 'Hecha' },
  'en-curso': { icono: LoaderCircle, clase: 'text-acento', texto: 'En curso' },
  pendiente: { icono: CircleDashed, clase: 'text-texto-suave', texto: 'Pendiente' },
}

function Fases({ fases }: { fases: Fase[] }) {
  return (
    <section aria-labelledby="titulo-fases" className="rounded-2xl border border-borde bg-superficie p-4">
      <h2 id="titulo-fases" className="mb-3 text-base">Avance del proyecto</h2>
      <ol className="space-y-2.5">
        {fases.map((fase) => {
          const estado = ESTADO_FASE[fase.estado]
          const Icono = estado.icono
          return (
            <li key={fase.id} className="flex items-start gap-2.5">
              <Icono className={cn('mt-0.5 size-4 shrink-0', estado.clase)} aria-label={estado.texto} />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-texto">
                  <span className="mr-1.5 font-semibold text-texto-suave">{fase.id}</span>
                  {fase.titulo}
                </p>
                <p className="text-xs text-texto-suave">{fase.nota}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default function PaginaSituacion() {
  const situacion = useSituacion()
  const datos = situacion.data

  return (
    <>
      <EncabezadoPagina
        titulo="Situación"
        descripcion="Corpus reproducible de F3: APT29 day1, las siete campañas LSASS y el atómico de referencia. Cifras a 15-09-2026."
      />
      {situacion.isError ? (
        <EstadoError error={situacion.error} alReintentar={() => void situacion.refetch()} reintentando={situacion.isFetching} />
      ) : !datos ? (
        <div role="status" aria-label="Cargando la situación" className="grid gap-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {datos.cifras.map((cifra) => <TarjetaCifra key={cifra.clave} cifra={cifra} />)}
          </div>
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <Campanas campanas={datos.campanas} />
            <Fases fases={datos.fases} />
          </div>
        </div>
      )}
    </>
  )
}
