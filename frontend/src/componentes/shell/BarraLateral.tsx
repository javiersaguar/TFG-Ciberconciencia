/**
 * Barra lateral fija: logotipo, las secciones construidas, las de fases futuras (atenuadas, con su fase) y el aviso
 * de datos simulados. El botón de la cabecera la oculta; al cerrarla queda solo el de volver a abrirla.
 */
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router'

import { cn } from '@/lib/utils'

import { AvisoSimulado } from './AvisoSimulado'
import { Logo } from './Logo'
import { SECCIONES, SECCIONES_FUTURAS, type Seccion } from './navegacion'

const ENLACE =
  'flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento'

function Enlace({ seccion, fase }: { seccion: Seccion; fase?: string }) {
  const Icono = seccion.icono
  return (
    <NavLink
      to={seccion.ruta}
      end={seccion.ruta === '/'}
      title={seccion.descripcion}
      className={({ isActive }) =>
        cn(
          ENLACE,
          isActive
            ? 'bg-acento-suave text-acento'
            : fase
              ? 'text-texto-suave/80 hover:bg-superficie-alterna hover:text-texto'
              : 'text-texto-suave hover:bg-superficie-alterna hover:text-texto',
        )
      }
    >
      <Icono className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{seccion.titulo}</span>
      {fase && <span className="shrink-0 rounded-full bg-superficie-hundida px-1.5 py-px text-[10px] font-semibold text-texto-suave">{fase}</span>}
    </NavLink>
  )
}

export function BarraLateral({ abierta, alAlternar }: { abierta: boolean; alAlternar: () => void }) {
  const botonAbrir = useRef<HTMLButtonElement>(null)
  const pendienteFoco = useRef(false)

  useEffect(() => {
    if (!abierta && pendienteFoco.current) {
      pendienteFoco.current = false
      botonAbrir.current?.focus()
    }
  }, [abierta])

  const alternar = () => {
    if (abierta) pendienteFoco.current = true
    alAlternar()
  }

  return (
    <>
      <aside
        id="menu-lateral"
        aria-hidden={!abierta}
        inert={!abierta}
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-borde bg-lateral text-texto-suave transition-transform duration-200 motion-reduce:transition-none',
          abierta ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-2 px-4 pt-5 pb-4">
          <Logo className="shrink-0" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[15px] font-semibold tracking-tight text-primario">Ciberconciencia</p>
            <p className="truncate text-xs text-texto-suave">Conciencia cibersituacional</p>
          </div>
          <button
            type="button"
            onClick={alternar}
            aria-expanded={abierta}
            aria-controls="menu-lateral"
            title="Cerrar el menú"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-texto-suave hover:bg-superficie-alterna hover:text-texto"
          >
            <PanelLeftClose className="size-4" aria-hidden />
            <span className="sr-only">Cerrar el menú</span>
          </button>
        </div>

        <nav aria-label="Secciones del portal" className="mt-2 flex-1 space-y-5 overflow-y-auto px-3">
          <ul className="space-y-0.5">
            {SECCIONES.map((seccion) => (
              <li key={seccion.ruta}>
                <Enlace seccion={seccion} />
              </li>
            ))}
          </ul>
          <div>
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-texto-suave/80 uppercase">Próximas fases</p>
            <ul className="space-y-0.5">
              {SECCIONES_FUTURAS.map((seccion) => (
                <li key={seccion.ruta}>
                  <Enlace seccion={seccion} fase={seccion.fase} />
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="border-t border-borde p-3">
          <AvisoSimulado />
        </div>
      </aside>
      {!abierta && (
        <button
          ref={botonAbrir}
          type="button"
          onClick={alternar}
          aria-expanded={false}
          aria-controls="menu-lateral"
          title="Abrir el menú"
          className="fixed top-3 left-3 z-40 flex size-9 items-center justify-center rounded-xl border border-borde bg-superficie text-texto-suave shadow-sm hover:bg-superficie-alterna hover:text-texto"
        >
          <PanelLeftOpen className="size-4" aria-hidden />
          <span className="sr-only">Abrir el menú</span>
        </button>
      )}
    </>
  )
}
