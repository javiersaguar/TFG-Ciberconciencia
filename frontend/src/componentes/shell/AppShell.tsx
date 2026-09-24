/**
 * Esqueleto de la aplicación: barra lateral fija y contenido (`<Outlet />`). El grafo del pipeline y la conciencia
 * situacional ocupan todo el hueco (son lienzos); el resto de páginas van sobre el fondo gris con relleno.
 */
import { useCallback, useState } from 'react'
import { Outlet, useLocation } from 'react-router'

import { cn } from '@/lib/utils'

import { BarraLateral } from './BarraLateral'
import { guardarMenuAbierto, menuAbiertoGuardado } from './menuLateral'

export function AppShell() {
  const { pathname } = useLocation()
  const [menuAbierto, setMenuAbierto] = useState(menuAbiertoGuardado)
  const alternarMenu = useCallback(() => {
    setMenuAbierto((abierto) => {
      guardarMenuAbierto(!abierto)
      return !abierto
    })
  }, [])

  // secciones de lienzo: ocupan todo el alto de la ventana, sin relleno ni ancho máximo
  const lienzo = ['/grafo', '/conciencia'].some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))

  return (
    <div className="min-h-svh bg-fondo">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-superficie focus:px-3 focus:py-2 focus:shadow-md"
      >
        Saltar al contenido
      </a>
      <BarraLateral abierta={menuAbierto} alAlternar={alternarMenu} />
      <div className={cn('flex min-h-svh flex-col transition-[padding] duration-200 motion-reduce:transition-none', menuAbierto ? 'pl-60' : 'pl-14')}>
        <main
          id="contenido"
          tabIndex={-1}
          className={cn('outline-none', lienzo ? 'h-svh overflow-hidden p-3' : 'flex-1 px-4 py-4 sm:px-6 sm:py-5')}
        >
          {lienzo ? (
            <Outlet />
          ) : (
            <div className="mx-auto w-full max-w-[1600px]">
              <Outlet />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
