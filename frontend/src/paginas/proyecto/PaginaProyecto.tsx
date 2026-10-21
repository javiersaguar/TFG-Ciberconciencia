/**
 * Proyecto: el contexto académico que antes ocupaba el centro de la portada. Avance de las fases del TFG y estado
 * documentado del pipeline (sin backend no hay estado en vivo: son las cifras de la última carga).
 */
import { CheckCircle2, CircleDashed, LoaderCircle } from 'lucide-react'

import { useSituacion, type EtapaPipeline, type Fase } from '@/api/situacion'
import { ChipProcedencia } from '@/componentes/datos/Chips'
import { EncabezadoPagina, EstadoError } from '@/componentes/shell'
import { Skeleton } from '@/componentes/ui/skeleton'
import { cn } from '@/lib/utils'

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

function Pipeline({ etapas }: { etapas: EtapaPipeline[] }) {
  return (
    <section aria-labelledby="titulo-pipeline" className="rounded-2xl border border-borde bg-superficie p-4">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titulo-pipeline" className="text-base">Estado del pipeline</h2>
        <ChipProcedencia procedencia="documentada" fuente="Cifras de la última carga documentada; el estado en vivo no existe sin backend." />
      </header>
      <ol className="space-y-2">
        {etapas.map((e) => (
          <li key={e.etapa} className="text-xs">
            <p className="font-medium text-texto">{e.etapa}</p>
            <p className="text-texto-suave" title={e.fuente}>{e.medida}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default function PaginaProyecto() {
  const situacion = useSituacion()
  const datos = situacion.data
  return (
    <>
      <EncabezadoPagina titulo="Proyecto" descripcion="Avance de las fases del TFG y estado documentado del pipeline." />
      {situacion.isError ? (
        <EstadoError error={situacion.error} alReintentar={() => void situacion.refetch()} reintentando={situacion.isFetching} />
      ) : !datos ? (
        <div role="status" aria-label="Cargando el proyecto"><Skeleton className="h-96 rounded-2xl" /></div>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Fases fases={datos.fases} />
          <Pipeline etapas={datos.pipeline} />
        </div>
      )}
    </>
  )
}
