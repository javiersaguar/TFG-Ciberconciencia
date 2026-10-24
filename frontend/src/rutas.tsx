/**
 * Rutas del portal. Todas cuelgan del shell; las secciones de fases futuras existen ya como páginas «próximamente»
 * para que la navegación final esté fijada desde la base.
 *
 * CARGA DIFERIDA: cada página es un chunk aparte (`paginasDiferidas.tsx`) y el shell la espera con un `Suspense`.
 */
import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router'

import { AppShell } from '@/componentes/shell/AppShell'
import { SECCIONES_FUTURAS } from '@/componentes/shell/navegacion'
import {
  PaginaAtaque,
  PaginaAttack,
  PaginaConciencia,
  PaginaMapaMundial,
  PaginaCopiloto,
  PaginaCronologia,
  PaginaEvaluacion,
  PaginaGrafo,
  PaginaIncidentes,
  PaginaNoEncontrado,
  PaginaObservabilidad,
  PaginaProximamente,
  PaginaProyecto,
  PaginaRespuesta,
  PaginaSituacion,
} from '@/paginasDiferidas'

export const rutas: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <PaginaSituacion /> },
      { path: 'conciencia', element: <PaginaConciencia /> },
      { path: 'mapa', element: <PaginaMapaMundial /> },
      { path: 'incidentes', element: <PaginaIncidentes /> },
      { path: 'ataque', element: <PaginaAtaque /> },
      { path: 'cronologia', element: <PaginaCronologia /> },
      { path: 'attack', element: <PaginaAttack /> },
      { path: 'respuesta', element: <PaginaRespuesta /> },
      { path: 'copiloto', element: <PaginaCopiloto /> },
      { path: 'proyecto', element: <PaginaProyecto /> },
      { path: 'evaluacion', element: <PaginaEvaluacion /> },
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
