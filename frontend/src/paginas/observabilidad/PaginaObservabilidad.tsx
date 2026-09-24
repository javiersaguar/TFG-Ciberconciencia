/**
 * Los cuadros de Grafana, dentro del portal y dibujados por él: los mismos cuatro cuadros, con sus paneles en el mismo
 * sitio, pero con los componentes y las animaciones del resto de la app. Mismo enfoque que en PIDS: el portal no
 * incrusta Grafana, redibuja sus cuadros. Grafana sigue siendo el sitio para editar los cuadros y las alertas.
 *
 * Hoy los datos son simulados (`api/simulado/cuadros.ts`) y cada panel dice si su cifra está documentada o es
 * ilustrativa. Con la API, el backend ejecutará las consultas de los JSON de Grafana y la página no cambiará.
 */
import { ExternalLink } from 'lucide-react'
import { useSearchParams } from 'react-router'

import { useCuadro, useCuadros, type Cuadro } from '@/api/observabilidad'
import { EstadoError } from '@/componentes/shell'
import { Skeleton } from '@/componentes/ui/skeleton'
import { cn } from '@/lib/utils'

import { CuadroNativo } from './CuadroNativo'
import { CUADROS, grafanaAlcanzable, urlCuadro } from './cuadros'
import { describirPeriodo } from './formatoUnidad'

function horaDe(segundos: number): string {
  return new Date(segundos * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function Resumen({ cuadro }: { cuadro: Cuadro }) {
  const documentados = cuadro.paneles.filter((p) => p.procedencia === 'documentada').length
  const ilustrativos = cuadro.paneles.filter((p) => p.procedencia === 'ilustrativa').length
  const periodo = describirPeriodo(cuadro.periodo)
  return (
    <p className="text-xs text-texto-suave">
      {periodo === cuadro.periodo ? `Datos: ${periodo}` : periodo.replace(/^ú/, 'Ú')} · actualizado a las {horaDe(cuadro.actualizado)}, se refresca cada 30 s ·{' '}
      <span className="text-ok">{documentados} paneles documentados</span>
      {ilustrativos > 0 && <>, <span className="text-aviso">{ilustrativos} ilustrativos</span></>}
    </p>
  )
}

function CuadroCargando() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" role="status" aria-label="Cargando el cuadro">
      {Array.from({ length: 4 }, (_, i) => <Skeleton key={`s${i}`} className="h-36 rounded-2xl" />)}
      {Array.from({ length: 2 }, (_, i) => <Skeleton key={`g${i}`} className="col-span-2 h-72 rounded-2xl" />)}
    </div>
  )
}

export default function PaginaObservabilidad() {
  const lista = useCuadros()
  // el cuadro abierto va en la URL (`?cuadro=tfg-lateral-movement`), como `/d/<uid>` en Grafana: se puede enlazar
  const [parametros, setParametros] = useSearchParams()
  const pedido = parametros.get('cuadro')
  const uid = CUADROS.some((c) => c.uid === pedido) ? pedido! : CUADROS[0].uid
  const setUid = (nuevo: string) => setParametros({ cuadro: nuevo }, { replace: true })
  const cuadro = useCuadro(uid)
  const textos = new Map(CUADROS.map((c) => [c.uid, c.texto]))
  const pestanas = (lista.data ?? CUADROS).map((c) => ({ uid: c.uid, titulo: c.titulo, texto: textos.get(c.uid) ?? '' }))
  const datos = cuadro.data
  const cambiando = cuadro.isPlaceholderData

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1>Observabilidad</h1>
          <p className="text-texto-suave">Los cuadros de Grafana dibujados por el portal: la máquina (Prometheus) y los datos (ClickHouse).</p>
          {datos && !cambiando && <Resumen cuadro={datos} />}
        </div>
        {grafanaAlcanzable() && (
          <a
            href={urlCuadro(uid)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-borde bg-superficie px-3 py-1.5 text-xs font-semibold text-acento shadow-sm hover:bg-acento-suave"
          >
            Abrir en Grafana
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </header>

      <div role="tablist" aria-label="Cuadros de mando" className="flex gap-2 overflow-x-auto pb-1">
        {pestanas.map((pestana) => {
          const elegido = pestana.uid === uid
          return (
            <button
              key={pestana.uid}
              type="button"
              role="tab"
              aria-selected={elegido}
              onClick={() => setUid(pestana.uid)}
              className={cn(
                'shrink-0 rounded-2xl border px-3.5 py-2 text-left transition',
                elegido ? 'border-acento bg-superficie shadow-sm' : 'border-transparent bg-superficie/60 hover:bg-superficie',
              )}
            >
              <span className={cn('block text-sm font-semibold', elegido ? 'text-acento' : 'text-texto')}>{pestana.titulo}</span>
              {pestana.texto && <span className="block text-[11px] text-texto-suave">{pestana.texto}</span>}
            </button>
          )
        })}
      </div>

      {cuadro.isError && !datos ? (
        <EstadoError error={cuadro.error} titulo="No se ha podido cargar el cuadro" alReintentar={() => void cuadro.refetch()} reintentando={cuadro.isFetching} />
      ) : !datos ? (
        <CuadroCargando />
      ) : (
        <div role="tabpanel" aria-label={`Cuadro ${datos.titulo}`} className={cn('grid gap-3 transition-opacity duration-300', cambiando && 'opacity-60')}>
          <CuadroNativo key={datos.uid} cuadro={datos} />
        </div>
      )}
    </div>
  )
}
