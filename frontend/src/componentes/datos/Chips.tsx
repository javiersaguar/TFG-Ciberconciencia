/**
 * Chips comunes de las secciones nuevas:
 *   - procedencia: «documentado» (con su fuente en el tooltip) o «ilustrativo» (decisión del proyecto, bitácora §2);
 *   - nivel de regla Sigma, con texto y no solo color.
 */
import { FlaskConical, NotebookText } from 'lucide-react'

import type { Procedencia } from '@/api/observabilidad'
import type { NivelRegla } from '@/api/tipos'
import { Ayuda } from './Ayuda'
import { cn } from '@/lib/utils'

export function ChipProcedencia({ procedencia, fuente, className }: { procedencia: Procedencia; fuente?: string; className?: string }) {
  const documentada = procedencia === 'documentada'
  const Icono = documentada ? NotebookText : FlaskConical
  const chip = (
    <span
      tabIndex={fuente ? 0 : undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-semibold',
        documentada ? 'bg-ok/12 text-ok' : 'bg-aviso/10 text-aviso',
        className,
      )}
    >
      <Icono className="size-3" aria-hidden />
      {documentada ? 'documentado' : 'ilustrativo'}
    </span>
  )
  if (!fuente) return chip
  return (
    <Ayuda texto={documentada ? `Documentado en: ${fuente}` : fuente}>{chip}</Ayuda>
  )
}

const CLASE_NIVEL: Record<NivelRegla, string> = {
  critical: 'bg-sev-critica text-sobre-intenso',
  high: 'bg-sev-alta text-sobre-intenso',
  medium: 'bg-sev-media text-sobre-intenso',
  low: 'bg-sev-baja text-sobre-intenso',
  informational: 'bg-sev-info text-sobre-intenso',
}

const TEXTO_NIVEL: Record<NivelRegla, string> = { critical: 'crítico', high: 'alto', medium: 'medio', low: 'bajo', informational: 'informativo' }

export function ChipNivel({ nivel, className }: { nivel: NivelRegla; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-semibold', CLASE_NIVEL[nivel], className)}>
      nivel {TEXTO_NIVEL[nivel]}
    </span>
  )
}
