/**
 * Contenido del tooltip de Recharts con formato español: etiqueta arriba y una línea por serie con su color.
 */
import type { TooltipContentProps } from 'recharts'

import { formatearEntero } from '@/componentes/datos/formato'

type Props = Partial<TooltipContentProps> & {
  formatearEtiqueta?: (etiqueta: string | number) => string
  formatearValor?: (valor: number) => string
}

export function TooltipGrafico({ active, payload, label, formatearEtiqueta, formatearValor = formatearEntero }: Props) {
  if (!active || !payload?.length) return null
  const etiqueta = label !== undefined && label !== null ? (formatearEtiqueta ? formatearEtiqueta(label) : String(label)) : null

  return (
    <div className="min-w-36 rounded-md border bg-superficie px-3 py-2 text-xs shadow-md">
      {etiqueta && <p className="mb-1 font-semibold text-foreground">{etiqueta}</p>}
      <ul className="space-y-0.5">
        {payload.map((entrada, indice) => {
          const valor = entrada.value
          const texto = typeof valor === 'number' ? formatearValor(valor) : valor === undefined || valor === null ? '—' : String(valor)
          return (
            <li key={`${String(entrada.dataKey ?? entrada.name)}-${indice}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-texto-suave">
                <span className="size-2 rounded-full" style={{ background: entrada.color ?? 'var(--chart-1)' }} aria-hidden />
                {String(entrada.name ?? entrada.dataKey ?? '')}
              </span>
              <span className="cifra font-semibold">{texto}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
