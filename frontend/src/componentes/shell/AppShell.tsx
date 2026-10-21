/**
 * Esqueleto de la aplicación: barra lateral fija, barra superior, contenido (`<Outlet />`) y el panel del Copiloto a
 * la derecha. El grafo del pipeline, el de ataque y la conciencia situacional ocupan todo el hueco (son lienzos); el
 * resto de páginas van sobre el fondo gris con relleno.
 *
 * El Copiloto: si le deja al contenido al menos 1000 px, lo EMPUJA (le deja su ancho a la derecha); por debajo se
 * superpone. Se abre y se cierra con su botón, con Ctrl/Cmd + I y con Esc; su panel y su lógica se descargan solo al
 * abrirlo. El estado de las simulaciones de la demo vive aquí para que el Copiloto lo lea en tiempo real.
 */
import { lazy, Suspense, useCallback, useEffect, useState, type KeyboardEvent as EventoTeclado, type PointerEvent as EventoPuntero } from 'react'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router'

import { acotarAncho, ANCHO_PANEL, empujaContenido, useCopiloto } from '@/copiloto/estado'
import { ProveedorEstadoCopiloto } from '@/copiloto/ProveedorEstadoCopiloto'
import { Skeleton } from '@/componentes/ui/skeleton'
import { cn } from '@/lib/utils'
import { useEstadoSimulaciones } from '@/paginas/conciencia/estadoSimulaciones'
import { ProveedorSimulaciones } from '@/paginas/conciencia/ProveedorSimulaciones'

import { BarraLateral } from './BarraLateral'
import { BarraSuperior } from './BarraSuperior'
import { guardarMenuAbierto, menuAbiertoGuardado } from './menuLateral'

// La paleta (y su índice: campañas, técnicas, diálogo) solo se descarga la primera vez que se abre.
const PaletaComandos = lazy(() => import('./PaletaComandos').then((m) => ({ default: m.PaletaComandos })))
// El panel del Copiloto y el vigía de señales débiles, igual: en diferido.
const PanelCopiloto = lazy(() => import('@/copiloto/PanelCopiloto'))
const VigiaCopiloto = lazy(() => import('@/copiloto/Vigia'))
// El modo presentación (F8.4): solo se descarga si la URL lo pide (`?presentacion=n`).
const Presentacion = lazy(() => import('@/componentes/presentacion/Presentacion'))

/** Páginas que ya cargan la evidencia de DMEVALS: en ellas el vigía puede evaluar sus señales sin descargar nada más. */
const CON_EVIDENCIA = ['/cronologia', '/ataque', '/incidentes', '/respuesta', '/copiloto']

function CargandoPagina({ lienzo }: { lienzo: boolean }) {
  return (
    <div role="status" aria-label="Cargando la sección" className={cn('grid gap-3', lienzo ? 'h-full' : 'mx-auto w-full max-w-[1600px]')}>
      <Skeleton className="h-12 rounded-2xl" />
      <Skeleton className={cn('rounded-2xl', lienzo ? 'h-full' : 'h-96')} />
    </div>
  )
}

function useAnchoVentana() {
  const [ancho, setAncho] = useState(() => globalThis.innerWidth || 1440)
  useEffect(() => {
    const medir = () => setAncho(window.innerWidth)
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])
  return ancho
}

/** Borde izquierdo del panel: se arrastra (o se mueve con las flechas) para cambiar su ancho, que se recuerda. */
function Redimensionador() {
  const { ancho, fijarAncho } = useCopiloto()
  const [arrastrando, setArrastrando] = useState(false)
  const maximo = acotarAncho(Number.POSITIVE_INFINITY)
  const alMover = (e: EventoPuntero<HTMLDivElement>) => {
    if (arrastrando) fijarAncho(window.innerWidth - e.clientX)
  }
  const alTeclear = (e: EventoTeclado<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') fijarAncho(ancho + 24)
    else if (e.key === 'ArrowRight') fijarAncho(ancho - 24)
    else return
    e.preventDefault()
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Ancho del Copiloto"
      aria-valuemin={ANCHO_PANEL.minimo}
      aria-valuemax={maximo}
      aria-valuenow={ancho}
      tabIndex={0}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setArrastrando(true) }}
      onPointerMove={alMover}
      onPointerUp={() => setArrastrando(false)}
      onKeyDown={alTeclear}
      className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize focus-visible:bg-acento/40 hover:bg-acento/25"
    />
  )
}

function Shell() {
  const { pathname } = useLocation()
  const [parametros] = useSearchParams()
  const navegar = useNavigate()
  const presentacion = parametros.has('presentacion')
  const copiloto = useCopiloto()
  const { simulaciones } = useEstadoSimulaciones()
  const anchoVentana = useAnchoVentana()
  // El vigía de señales arranca cuando el navegador está ocioso: no compite con la carga de la página. Donde no hay
  // `requestIdleCallback` (jsdom, en los tests unitarios) no arranca; el contador se prueba aparte y en Playwright.
  const [vigiaListo, setVigiaListo] = useState(false)
  useEffect(() => {
    if (typeof window.requestIdleCallback !== 'function') return
    const id = window.requestIdleCallback(() => setVigiaListo(true), { timeout: 3000 })
    return () => window.cancelIdleCallback(id)
  }, [])
  const [menuAbierto, setMenuAbierto] = useState(menuAbiertoGuardado)
  const alternarMenu = useCallback(() => {
    setMenuAbierto((abierto) => {
      guardarMenuAbierto(!abierto)
      return !abierto
    })
  }, [])

  // Paleta de comandos: Ctrl/Cmd + K. Copiloto: Ctrl/Cmd + I, y Esc lo cierra (si no hay un diálogo encima).
  const [paleta, setPaleta] = useState(false)
  const [paletaUsada, setPaletaUsada] = useState(false)
  const { alternar: alternarCopiloto, cerrar: cerrarCopiloto, abierto: copilotoAbierto } = copiloto
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      const atajo = e.ctrlKey || e.metaKey
      if (atajo && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletaUsada(true)
        setPaleta(true)
      } else if (atajo && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        alternarCopiloto()
      } else if (e.key === 'Escape' && copilotoAbierto && !e.defaultPrevented && !document.querySelector('[role="dialog"]')) {
        cerrarCopiloto()
      }
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [alternarCopiloto, cerrarCopiloto, copilotoAbierto])

  // secciones de lienzo: ocupan todo el alto de la ventana, sin relleno ni ancho máximo
  const lienzo = ['/grafo', '/conciencia', '/ataque'].some((ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`))
  // en /copiloto el Copiloto ya ocupa la página: el panel lateral no se abre encima
  const lateral = copiloto.abierto && pathname !== '/copiloto'
  // la barra lateral mide 15 rem abierta (pl-60) y 3,5 rem cerrada (pl-14)
  const empuja = lateral && empujaContenido(anchoVentana, menuAbierto ? 240 : 56, copiloto.ancho)
  // El vigía de señales: donde ya está la evidencia de DMEVALS, con el panel abierto o con una simulación tocada.
  const vigiaDmevals = lateral || CON_EVIDENCIA.some((r) => pathname.startsWith(r))
  const vigiaDemo = Object.keys(simulaciones).length > 0

  return (
    <div className="min-h-svh bg-fondo">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-superficie focus:px-3 focus:py-2 focus:shadow-md"
      >
        Saltar al contenido
      </a>
      <BarraLateral abierta={menuAbierto} alAlternar={alternarMenu} />
      <div
        className={cn('flex min-h-svh flex-col transition-[padding] duration-200 motion-reduce:transition-none', menuAbierto ? 'pl-60' : 'pl-14')}
        style={empuja ? { paddingRight: copiloto.ancho } : undefined}
      >
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
      {lateral && (
        <aside
          id="panel-copiloto"
          aria-label="Copiloto"
          style={{ width: copiloto.ancho }}
          className={cn('entrada-panel fixed top-0 right-0 z-40 h-svh border-l border-borde bg-superficie', !empuja && 'shadow-2xl')}
        >
          <Redimensionador />
          <Suspense fallback={<div role="status" aria-label="Cargando el Copiloto" className="p-3"><Skeleton className="h-40 rounded-2xl" /></div>}>
            <PanelCopiloto modo="lateral" />
          </Suspense>
        </aside>
      )}
      {vigiaListo && (vigiaDmevals || vigiaDemo) && (
        <Suspense fallback={null}>
          <VigiaCopiloto dmevals={vigiaDmevals} demo={vigiaDemo} />
        </Suspense>
      )}
      {presentacion && (
        <Suspense fallback={null}>
          <Presentacion />
        </Suspense>
      )}
      {paletaUsada && (
        <Suspense fallback={null}>
          <PaletaComandos abierta={paleta} alCambiar={setPaleta} alAccion={(accion) => {
            if (accion === '#copiloto') copiloto.abrir()
            else if (accion === '#presentacion') navegar('/?presentacion=1')
          }} />
        </Suspense>
      )}
    </div>
  )
}

export function AppShell() {
  return (
    <ProveedorSimulaciones>
      <ProveedorEstadoCopiloto>
        <Shell />
      </ProveedorEstadoCopiloto>
    </ProveedorSimulaciones>
  )
}
