/**
 * Utilidades para los tests de la SPA:
 *
 *   renderizarRutas('/observabilidad')              // toda la aplicación, en memoria, en esa ruta
 *   renderizarConProveedores(<MiComponente />)      // un componente suelto con TanStack Query y tooltips
 *
 * No hace falta simular `fetch`: la fuente de datos es el simulador, con latencia 0 en los tests (`api/fuente.ts`).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import { useState, type ReactElement, type ReactNode } from 'react'
import { MemoryRouter, RouterProvider } from 'react-router'

import { TooltipProvider } from '@/componentes/ui/tooltip'
import { crearEnrutadorEnMemoria } from '@/rutas'

/** Cliente de consultas para tests: sin reintentos ni caché entre tests. */
export function crearClientePruebas() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

export function Proveedores({ children, cliente }: { children: ReactNode; cliente?: QueryClient }) {
  const [clienteConsultas] = useState(() => cliente ?? crearClientePruebas())
  return (
    <QueryClientProvider client={clienteConsultas}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  )
}

interface OpcionesRender extends Omit<RenderOptions, 'wrapper'> {
  ruta?: string
  cliente?: QueryClient
}

/** Renderiza un componente suelto con TanStack Query, tooltips y un `MemoryRouter`. */
export function renderizarConProveedores(ui: ReactElement, { ruta = '/', cliente, ...opciones }: OpcionesRender = {}) {
  return render(ui, {
    wrapper: ({ children }) => (
      <Proveedores cliente={cliente}>
        <MemoryRouter initialEntries={[ruta]}>{children}</MemoryRouter>
      </Proveedores>
    ),
    ...opciones,
  })
}

/** Renderiza la aplicación completa (rutas reales) empezando en `ruta`. Devuelve también el enrutador. */
export function renderizarRutas(ruta = '/', cliente?: QueryClient) {
  const enrutador = crearEnrutadorEnMemoria([ruta])
  const resultado = render(
    <Proveedores cliente={cliente}>
      <RouterProvider router={enrutador} />
    </Proveedores>,
  )
  return { ...resultado, enrutador }
}
