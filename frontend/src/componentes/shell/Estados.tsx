/**
 * Estados comunes de las páginas: error con reintento. Cuando exista la API, «cargando» y «sin datos» se añaden aquí
 * para que todas las secciones los enseñen igual.
 */
import { RefreshCw, TriangleAlert } from 'lucide-react'

import { Button } from '@/componentes/ui/button'
import { cn } from '@/lib/utils'

interface PropsError {
  error: unknown
  titulo?: string
  alReintentar?: () => void
  reintentando?: boolean
  className?: string
}

function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Error desconocido'
}

export function EstadoError({ error, titulo = 'No se ha podido cargar', alReintentar, reintentando, className }: PropsError) {
  return (
    <div role="alert" className={cn('flex items-start gap-3 rounded-2xl border border-l-4 border-l-peligro bg-superficie p-4', className)}>
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-peligro" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-foreground">{titulo}</p>
        <p className="break-words text-texto-suave">{mensajeDeError(error)}</p>
      </div>
      {alReintentar && (
        <Button variant="outline" size="sm" onClick={alReintentar} disabled={reintentando}>
          <RefreshCw className={cn(reintentando && 'animate-spin')} aria-hidden />
          Reintentar
        </Button>
      )}
    </div>
  )
}
