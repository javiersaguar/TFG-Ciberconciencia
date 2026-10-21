/**
 * Aviso permanente de que el portal no está conectado a nada: todo lo que enseña sale de `src/api/simulado`.
 * Vive en la barra superior, siempre visible, para que no se pueda confundir una captura con el sistema en marcha.
 */
import { FlaskConical } from 'lucide-react'

import { Ayuda } from '@/componentes/datos/Ayuda'
import { cn } from '@/lib/utils'

export function AvisoSimulado({ className }: { className?: string }) {
  return (
    <Ayuda
      texto={
        <>
        La API (F6.3) aún no existe. Las cifras marcadas «documentado» son medidas reales del corpus de F3, con su fuente; las
        marcadas «ilustrativo» son inventadas para dar forma a los paneles o a la demo.
        </>
      }
    >
        <p
          tabIndex={0}
          className={cn('flex items-center gap-1.5 rounded-full bg-aviso/10 px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap text-aviso', className)}
        >
          <FlaskConical className="size-3.5 shrink-0" aria-hidden />
          Datos simulados · sin backend
        </p>
    </Ayuda>
  )
}
