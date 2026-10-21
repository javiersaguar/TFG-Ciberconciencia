/**
 * Barra superior fina con el contexto: dónde estás (grupo › sección), qué datos se ven (APT29 day1 sobre el corpus
 * de F3), el aviso de datos simulados y la búsqueda (Ctrl/Cmd + K).
 */
import { ChevronRight, Database, Search } from 'lucide-react'
import { useLocation } from 'react-router'

import { AvisoSimulado } from './AvisoSimulado'
import { seccionDe, TITULO_GRUPO } from './navegacion'

export function BarraSuperior({ alBuscar }: { alBuscar: () => void }) {
  const { pathname } = useLocation()
  const seccion = seccionDe(pathname)
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  return (
    <header className="flex h-10 shrink-0 items-center gap-3 border-b border-borde bg-lateral/60 px-4 text-xs">
      <nav aria-label="Ruta de navegación" className="flex min-w-0 items-center gap-1 text-texto-suave">
        {seccion?.grupo && <span>{TITULO_GRUPO[seccion.grupo]}</span>}
        {seccion?.grupo && <ChevronRight className="size-3 shrink-0" aria-hidden />}
        <span aria-current="page" className="truncate font-medium text-texto">{seccion?.titulo ?? 'Página no encontrada'}</span>
      </nav>
      <span className="ml-auto flex items-center gap-1.5 text-texto-suave" title="Datos que enseña el portal">
        <Database className="size-3.5" aria-hidden />
        APT29 day1 · corpus F3
      </span>
      <AvisoSimulado />
      <button
        type="button"
        onClick={alBuscar}
        className="flex items-center gap-2 rounded-lg border border-borde bg-superficie px-2.5 py-1 text-texto-suave hover:border-acento hover:text-texto"
      >
        <Search className="size-3.5" aria-hidden />
        Buscar
        <kbd className="rounded border border-borde px-1 font-mono text-[10.5px]">{mac ? '⌘' : 'Ctrl'} K</kbd>
      </button>
    </header>
  )
}
