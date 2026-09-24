/**
 * Rutas del portal. Todas cuelgan del shell; las secciones de fases futuras (incidentes, matriz ATT&CK) existen ya
 * como páginas «próximamente» para que la navegación final esté fijada desde la base.
 */
import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router'

import { AppShell } from '@/componentes/shell/AppShell'
import { SECCIONES_FUTURAS } from '@/componentes/shell/navegacion'
import PaginaConciencia from '@/paginas/conciencia/PaginaConciencia'
import PaginaGrafo from '@/paginas/grafo/PaginaGrafo'
import PaginaNoEncontrado from '@/paginas/no-encontrado/PaginaNoEncontrado'
import PaginaObservabilidad from '@/paginas/observabilidad/PaginaObservabilidad'
import PaginaProximamente from '@/paginas/proximamente/PaginaProximamente'
import PaginaSituacion from '@/paginas/situacion/PaginaSituacion'

export const rutas: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <PaginaSituacion /> },
      { path: 'conciencia', element: <PaginaConciencia /> },
      { path: 'grafo', element: <PaginaGrafo /> },
      { path: 'observabilidad', element: <PaginaObservabilidad /> },
      ...SECCIONES_FUTURAS.map((seccion) => ({
        path: seccion.ruta.slice(1),
        element: <PaginaProximamente seccion={seccion} />,
      })),
      { path: '*', element: <PaginaNoEncontrado /> },
    ],
  },
]

/** El enrutador del navegador (producción y desarrollo). */
export function crearEnrutador() {
  return createBrowserRouter(rutas)
}

/** Un enrutador en memoria con las mismas rutas, para los tests (`initialEntries` marca dónde empieza). */
export function crearEnrutadorEnMemoria(initialEntries: string[] = ['/']) {
  return createMemoryRouter(rutas, { initialEntries })
}
