/**
 * «Preguntar al Copiloto sobre esto»: abre el panel con la pregunta precargada (no la envía) y con lo elegido como
 * contexto. Ligero: solo usa el estado del shell; el panel se descarga al abrirse.
 */
import { MessagesSquare } from 'lucide-react'

import { cn } from '@/lib/utils'

import { useCopiloto, type OrgCopiloto } from './estado'
import type { SeleccionContexto } from './nucleo'

export function BotonPreguntar({ pregunta, seleccion, org = 'dmevals', className }: { pregunta: string; seleccion: SeleccionContexto; org?: OrgCopiloto; className?: string }) {
  const { abrir } = useCopiloto()
  return (
    <button
      type="button"
      onClick={() => abrir({ org, pregunta, seleccion })}
      className={cn('inline-flex items-center gap-1 font-medium text-acento hover:underline', className)}
    >
      <MessagesSquare className="size-3" aria-hidden />
      Preguntar al Copiloto sobre esto
    </button>
  )
}
