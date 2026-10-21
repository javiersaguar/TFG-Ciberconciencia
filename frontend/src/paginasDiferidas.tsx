/**
 * Las páginas, cada una en su propio chunk (`React.lazy`). Van en un módulo aparte de `rutas.tsx` para que Fast
 * Refresh siga funcionando (un módulo que exporta componentes no debe exportar también funciones).
 *
 * Así la portada no descarga Recharts ni React Flow: solo entran en las rutas que los usan. El shell espera a cada
 * página con un `Suspense` (`AppShell.tsx`).
 */
import { lazy } from 'react'

export const PaginaSituacion = lazy(() => import('@/paginas/situacion/PaginaSituacion'))
export const PaginaConciencia = lazy(() => import('@/paginas/conciencia/PaginaConciencia'))
export const PaginaAtaque = lazy(() => import('@/paginas/ataque/PaginaAtaque'))
export const PaginaIncidentes = lazy(() => import('@/paginas/incidentes/PaginaIncidentes'))
export const PaginaCronologia = lazy(() => import('@/paginas/cronologia/PaginaCronologia'))
export const PaginaAttack = lazy(() => import('@/paginas/attack/PaginaAttack'))
export const PaginaRespuesta = lazy(() => import('@/paginas/respuesta/PaginaRespuesta'))
export const PaginaCopiloto = lazy(() => import('@/paginas/copiloto/PaginaCopiloto'))
export const PaginaProyecto = lazy(() => import('@/paginas/proyecto/PaginaProyecto'))
export const PaginaEvaluacion = lazy(() => import('@/paginas/evaluacion/PaginaEvaluacion'))
export const PaginaGrafo = lazy(() => import('@/paginas/grafo/PaginaGrafo'))
export const PaginaObservabilidad = lazy(() => import('@/paginas/observabilidad/PaginaObservabilidad'))
export const PaginaProximamente = lazy(() => import('@/paginas/proximamente/PaginaProximamente'))
export const PaginaNoEncontrado = lazy(() => import('@/paginas/no-encontrado/PaginaNoEncontrado'))
