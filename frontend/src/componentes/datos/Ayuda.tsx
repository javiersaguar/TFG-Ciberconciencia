/**
 * Ayuda emergente ligera (sin dependencias) para lo que está en la primera carga: la portada, la barra superior y los
 * chips de procedencia. Así la portada no descarga Radix (≈ 42 kB). Accesible: el disparador lleva `aria-describedby`;
 * aparece al pasar el ratón y al enfocar con el teclado, se puede recorrer con el ratón y Esc la oculta. Las páginas
 * que ya cargan Radix (Observabilidad, la demo) siguen con su tooltip.
 */
import { cloneElement, useId, useState, type ReactElement, type ReactNode, type KeyboardEvent } from 'react'

import { cn } from '@/lib/utils'

const POSICION = {
  'abajo-fin': 'top-full right-0 mt-1.5',
  'abajo-inicio': 'top-full left-0 mt-1.5',
  abajo: 'top-full left-1/2 mt-1.5 -translate-x-1/2',
} as const

export function Ayuda({ texto, children, lado = 'abajo-fin', className }: { texto: ReactNode; children: ReactElement; lado?: keyof typeof POSICION; className?: string }) {
  const id = useId()
  const [oculta, setOculta] = useState(false)
  const disparador = cloneElement(children as ReactElement<Record<string, unknown>>, {
    'aria-describedby': id,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOculta(true)
    },
    onFocus: () => setOculta(false),
    onMouseEnter: () => setOculta(false),
  })
  return (
    <span className={cn('group/ayuda relative inline-flex', className)}>
      {disparador}
      <span
        role="tooltip"
        id={id}
        className={cn(
          'invisible absolute z-50 w-max max-w-xs rounded-md bg-foreground px-3 py-1.5 text-xs font-normal text-background opacity-0 shadow-md',
          'transition-opacity duration-100 group-focus-within/ayuda:visible group-focus-within/ayuda:opacity-100 group-hover/ayuda:visible group-hover/ayuda:opacity-100 motion-reduce:transition-none',
          POSICION[lado],
          oculta && 'hidden',
        )}
      >
        {texto}
      </span>
    </span>
  )
}
