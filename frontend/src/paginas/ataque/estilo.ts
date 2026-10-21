/**
 * Cómo se distingue el FUNDAMENTO de una relación: color, trazo e icono a la vez (nunca solo el color), y siempre con
 * su texto en la leyenda y en el detalle. Los colores son tokens (`--fund-*`) que cambian con el tema y cumplen 3:1
 * sobre el lienzo en los dos (lo comprueba `estilos/contraste.test.ts`).
 */
import { CircleHelp, Eye, GitMerge, type LucideIcon } from 'lucide-react'

import type { Fundamento } from '@/api/ataque'

export const ESTILO_FUNDAMENTO: Record<Fundamento, { color: string; trazo?: string; icono: LucideIcon; claseTexto: string }> = {
  observado: { color: 'var(--fund-observado)', icono: Eye, claseTexto: 'text-fund-observado' },
  inferido: { color: 'var(--fund-inferido)', trazo: '9 5', icono: GitMerge, claseTexto: 'text-fund-inferido' },
  hipotesis: { color: 'var(--fund-hipotesis)', trazo: '1.5 6', icono: CircleHelp, claseTexto: 'text-fund-hipotesis' },
}
