/**
 * Barra superior fina con el contexto: dónde estás (grupo › sección), qué datos se ven (APT29 day1 sobre el corpus
 * de F3), el aviso de datos simulados, la búsqueda (Ctrl/Cmd + K) y el Copiloto (Ctrl/Cmd + I), con un contador discreto
 * de avisos «Conviene vigilar» pendientes.
 */
import { ChevronRight, Database, MessagesSquare, Search } from 'lucide-react'
import { useLocation } from 'react-router'

import { useCopiloto } from '@/copiloto/estado'
import { cn } from '@/lib/utils'

import { AvisoSimulado } from './AvisoSimulado'
import { seccionDe, TITULO_GRUPO } from './navegacion'

export function BarraSuperior({ alBuscar }: { alBuscar: () => void }) {
  const { pathname } = useLocation()
  const seccion = seccionDe(pathname)
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  return (
    <header className="@container/barra flex h-10 shrink-0 items-center gap-3 border-b border-borde bg-lateral/60 px-4 text-xs">
      <nav aria-label="Ruta de navegación" className="flex min-w-0 items-center gap-1 text-texto-suave">
        {seccion?.grupo && <span>{TITULO_GRUPO[seccion.grupo]}</span>}
        {seccion?.grupo && <ChevronRight className="size-3 shrink-0" aria-hidden />}
        <span aria-current="page" className="truncate font-medium text-texto">{seccion?.titulo ?? 'Página no encontrada'}</span>
      </nav>
      <span className="ml-auto hidden items-center gap-1.5 whitespace-nowrap text-texto-suave @3xl/barra:flex" title="Datos que enseña el portal">
        <Database className="size-3.5" aria-hidden />
        {pathname === '/mapa' ? 'Helios · demo geográfica' : 'APT29 day1 · corpus F3'}
      </span>
      <AvisoSimulado className="@max-3xl/barra:ml-auto" />
      <BotonCopiloto mac={mac} />
      <button
        type="button"
        onClick={alBuscar}
        className="flex shrink-0 items-center gap-2 rounded-lg border border-borde bg-superficie px-2.5 py-1 whitespace-nowrap text-texto-suave hover:border-acento hover:text-texto"
      >
        <Search className="size-3.5" aria-hidden />
        Buscar
        <kbd className="hidden rounded border border-borde px-1 font-mono text-[10.5px] @xl/barra:inline">{mac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
    </header>
  )
}

function BotonCopiloto({ mac }: { mac: boolean }) {
  const { abierto, alternar, avisos, refBoton } = useCopiloto()
  const { pathname } = useLocation()
  const n = Object.values(avisos).reduce((s, x) => s + x, 0)
  const activo = abierto && pathname !== '/copiloto'
  return (
    <button
      ref={refBoton}
      type="button"
      onClick={alternar}
      aria-expanded={activo}
      aria-controls="panel-copiloto"
      aria-keyshortcuts="Control+I Meta+I"
      title={`Copiloto (${mac ? '⌘' : 'Ctrl'} I)`}
      className={cn('flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 whitespace-nowrap hover:border-acento hover:text-texto', activo ? 'border-acento bg-acento-suave text-acento' : 'border-borde bg-superficie text-texto-suave')}
    >
      <MessagesSquare className="size-3.5" aria-hidden />
      Copiloto
      {n > 0 && (
        <span className="rounded-full border border-dashed border-fund-hipotesis px-1.5 text-[10.5px] font-semibold text-texto tabular-nums">
          {n}
          <span className="sr-only"> {n === 1 ? 'aviso' : 'avisos'} «Conviene vigilar»</span>
        </span>
      )}
    </button>
  )
}
