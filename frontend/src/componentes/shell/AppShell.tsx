/**
 * Esqueleto de la aplicación: barra lateral fija y contenido (`<Outlet />`). El grafo del pipeline y la conciencia
 * situacional ocupan todo el hueco (son lienzos); el resto de páginas van sobre el fondo gris con relleno.
 */
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'

import { Skeleton } from '@/componentes/ui/skeleton'
import { cn } from '@/lib/utils'

import { BarraLateral } from './BarraLateral'
import { BarraSuperior } from './BarraSuperior'
import { guardarMenuAbierto, menuAbiertoGuardado } from './menuLateral'

// La paleta (y su índice: campañas, técnicas, diálogo) solo se descarga la primera vez que se abre.
const PaletaComandos = lazy(() => import('./PaletaComandos').then((m) => ({ default: m.PaletaComandos })))

function CargandoPagina({ lienzo }: { lienzo: boolean }) {
  return (
    <div role="status" aria-label="Cargando la sección" className={cn('grid gap-3', lienzo ? 'h-full' : 'mx-auto w-full max-w-[1600px]')}>
      <Skeleton className="h-12 rounded-2xl" />
      <Skeleton className={cn('rounded-2xl', lienzo ? 'h-full' : 'h-96')} />
    </div>
  )
}

export function AppShell() {
  const { pathname } = useLocation()
  const [menuAbierto, setMenuAbierto] = useState(menuAbiertoGuardado)
  const alternarMenu = useCallback(() => {
    setMenuAbierto((abierto) => {
      guardarMenuAbierto(!abierto)
      return !abierto
    })
  }, [])

  // Paleta de comandos: Ctrl/Cmd + K desde cualquier página.
  const [paleta, setPaleta] = useState(false)
  const [paletaUsada, setPaletaUsada] = useState(false)
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletaUsada(true)
        setPaleta(true)
      }
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [])

  // secciones de lienzo: ocupan todo el alto de la ventana, sin relleno ni ancho máximo
  const lienzo = ['/grafo', '/conciencia', '/ataque'].some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))

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
        <BarraSuperior alBuscar={() => { setPaletaUsada(true); setPaleta(true) }} />
        <main
          id="contenido"
          tabIndex={-1}
          className={cn('outline-none', lienzo ? 'h-[calc(100svh-2.5rem)] overflow-hidden p-3' : 'flex-1 px-4 py-4 sm:px-6 sm:py-5')}
        >
          {/* Las páginas se cargan bajo demanda (rutas.tsx): mientras llega el chunk, un esqueleto en su sitio. */}
          <Suspense fallback={<CargandoPagina lienzo={lienzo} />}>
            {/* Fundido breve al cambiar de página (solo de ruta: cambiar `?sel=` no vuelve a montar la página). */}
            {lienzo ? (
              <div key={pathname} className="entrada-pagina h-full">
                <Outlet />
              </div>
            ) : (
              <div key={pathname} className="entrada-pagina mx-auto w-full max-w-[1600px]">
                <Outlet />
              </div>
            )}
          </Suspense>
        </main>
      </div>
      {paletaUsada && (
        <Suspense fallback={null}>
          <PaletaComandos abierta={paleta} alCambiar={setPaleta} />
        </Suspense>
      )}
    </div>
  )
}
