/**
 * Cliente de TanStack Query del portal, con los valores por defecto comunes a todas las páginas.
 * Los tests crean el suyo con `crearClientePruebas()` (sin reintentos ni caché).
 */
import { QueryClient } from '@tanstack/react-query'

export function crearClienteConsultas() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 2,
      },
    },
  })
}
