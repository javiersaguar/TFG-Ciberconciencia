/**
 * Botón de modo claro / oscuro. Vive en el shell y está siempre visible, también con la barra lateral cerrada.
 *
 * Accesibilidad: es un botón nativo (teclado con Enter y Espacio, foco visible). `aria-label` dice la acción que hará
 * («Cambiar a modo oscuro») y `aria-pressed` indica si el modo oscuro está activo; el icono es decorativo.
 */
import { Moon, Sun } from 'lucide-react'

import { cn } from '@/lib/utils'

import { useTema } from './useTema'

export function BotonTema({ className, conTexto = false }: { className?: string; conTexto?: boolean }) {
  const { tema, alternar } = useTema()
  const oscuro = tema === 'oscuro'
  const accion = oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'
  const Icono = oscuro ? Sun : Moon
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={accion}
      aria-pressed={oscuro}
      title={accion}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg text-texto-suave hover:bg-superficie-alterna hover:text-texto',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
        className,
      )}
    >
      <Icono className="size-4 shrink-0" aria-hidden />
      {/* El texto visible está contenido en el nombre accesible («Cambiar a modo oscuro»): WCAG 2.5.3. */}
      {conTexto && <span className="text-xs font-medium">{oscuro ? 'Modo claro' : 'Modo oscuro'}</span>}
    </button>
  )
}
