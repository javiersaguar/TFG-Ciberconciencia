/**
 * Raíz de la aplicación: el proveedor de TanStack Query y el enrutador. (Cada tooltip de Radix trae su proveedor.)
 */
import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { RouterProvider } from 'react-router'

import { crearClienteConsultas } from '@/lib/consultas'
import { crearEnrutador } from '@/rutas'

export default function App() {
  const [cliente] = useState(crearClienteConsultas)
  const [enrutador] = useState(crearEnrutador)
  return (
    <QueryClientProvider client={cliente}>
      <RouterProvider router={enrutador} />
    </QueryClientProvider>
  )
}
