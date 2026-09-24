/**
 * Formato español de cifras: `530.401`, `99,1 %`, `516 s`.
 *
 * A mano y sin `Intl` para que el resultado sea idéntico en el navegador, en Node y en jsdom, y para agrupar
 * siempre los millares (Intl en `es-ES` no separa los números de cuatro cifras: daría `1184` y no `1.184`).
 */

/** Lo que se pinta cuando no hay valor (nulo, indefinido, NaN). */
export const SIN_DATO = '—'

type Numero = number | null | undefined

function agruparMillares(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function esNumero(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor)
}

/** `1234567` → `1.234.567`. */
export function formatearEntero(valor: Numero): string {
  if (!esNumero(valor)) return SIN_DATO
  const redondeado = Math.round(valor)
  const signo = redondeado < 0 ? '-' : ''
  return signo + agruparMillares(String(Math.abs(redondeado)))
}

/** `0.991` → `0,991`; `1234.5` → `1.234,50` con dos decimales. */
export function formatearDecimal(valor: Numero, decimales = 2): string {
  if (!esNumero(valor)) return SIN_DATO
  const [entera, decimal] = Math.abs(valor).toFixed(decimales).split('.')
  const signo = valor < 0 && Number(Math.abs(valor).toFixed(decimales)) !== 0 ? '-' : ''
  return signo + agruparMillares(entera) + (decimal ? `,${decimal}` : '')
}

/** `99.1` → `99,1 %` (el valor ya viene en tanto por ciento, 0-100). */
export function formatearPorcentaje(valor: Numero, decimales = 1): string {
  if (!esNumero(valor)) return SIN_DATO
  return `${formatearDecimal(valor, decimales)} %`
}

/** Plural sencillo: `pluralizar(1, 'campaña')` → `1 campaña`; `pluralizar(3, 'campaña')` → `3 campañas`. */
export function pluralizar(cantidad: number, singular: string, plural = `${singular}s`): string {
  return `${formatearEntero(cantidad)} ${cantidad === 1 ? singular : plural}`
}
