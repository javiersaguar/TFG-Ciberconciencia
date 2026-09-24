/**
 * Aviso permanente de que el portal no está conectado a nada: todo lo que enseña sale de `src/api/simulado`.
 * Vive al pie de la barra lateral para que no se pueda confundir una captura de pantalla con el sistema en marcha.
 */
import { FlaskConical } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/componentes/ui/tooltip'
import { cn } from '@/lib/utils'

export function AvisoSimulado({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <p
          tabIndex={0}
          className={cn('flex items-center gap-2 rounded-xl bg-aviso/10 px-3 py-2 text-xs font-medium text-aviso', className)}
        >
          <FlaskConical className="size-3.5 shrink-0" aria-hidden />
          Datos simulados · sin backend
        </p>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-72">
        La API (F6.3) aún no existe. Las cifras marcadas «bitácora» son medidas reales del corpus de F3; las marcadas
        «ilustrativo» son inventadas para dar forma a los paneles.
      </TooltipContent>
    </Tooltip>
  )
}
