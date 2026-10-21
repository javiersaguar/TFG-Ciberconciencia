/**
 * Colores y ayudas comunes de los gráficos: la paleta apagada del tema (`--chart-*`) y los ejes en texto suave.
 * La severidad no sale de aquí: tiene su propia escala (`--sev-*`), para que un color de serie nunca se confunda
 * con «alta» o «crítica».
 */
export const COLOR_BORDE = 'var(--borde)'

/** Paleta para varias series: los cinco tonos del tema y unos cuantos más, todos de luminancia media. */
export const COLORES_SERIES = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
] as const

export function colorSerie(indice: number): string {
  return COLORES_SERIES[indice % COLORES_SERIES.length]
}

/** Estilo de los ejes: texto pequeño y suave, sin líneas de eje. */
export const ESTILO_TICK = { fontSize: 11, fill: 'var(--texto-suave)' } as const
