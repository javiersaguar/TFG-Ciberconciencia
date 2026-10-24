/**
 * «Notas»: las explicaciones largas, plegadas. Cada página abre con una sola frase y el resto queda
 * aquí, a un clic, en vez de ocupar la pantalla.
 */
import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function ComoLeer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <details className={cn('text-xs', className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-acento hover:underline [&::-webkit-details-marker]:hidden">
        <Info className="size-3.5" aria-hidden />
        Notas
      </summary>
      <div className="mt-1.5 max-w-3xl space-y-1.5 rounded-xl border border-borde bg-superficie p-3 leading-relaxed text-texto">{children}</div>
    </details>
  )
}
