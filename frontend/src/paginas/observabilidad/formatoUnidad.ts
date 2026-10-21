/**
 * Unidades y colores de los paneles, con los mismos nombres que usa Grafana (`short`, `bytes`, `Bps`, `s`, `reqps`,
 * `percent`, `percentunit`…). Lógica pura: se prueba sin navegador. Heredado del portal de PIDS, con una diferencia:
 * los recuentos enteros se pintan exactos (530.401, no «530,4 mil»), porque en este portal casi todos son cifras
 * documentadas que se cotejan contra la bitácora.
 */
import type { PanelCuadro } from '@/api/observabilidad'
import { formatearDecimal, formatearEntero } from '@/componentes/datos/formato'

function numero(valor: number, decimales: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: decimales }).format(valor)
}

/** 1234 → «1234»; 12 345 → «12,3 mil»; 0,0342 → «0,034». Para ejes y magnitudes continuas. */
export function corto(valor: number): string {
  const absoluto = Math.abs(valor)
  if (absoluto >= 1e9) return `${numero(valor / 1e9, 1)} mil M`
  if (absoluto >= 1e6) return `${numero(valor / 1e6, 1)} M`
  if (absoluto >= 1e4) return `${numero(valor / 1e3, 1)} mil`
  if (absoluto >= 100) return formatearEntero(valor)
  if (absoluto >= 1) return numero(valor, 1)
  if (absoluto === 0) return '0'
  return numero(valor, 3)
}

function bytes(valor: number, base = 1024): string {
  const unidades = base === 1024 ? ['B', 'KiB', 'MiB', 'GiB', 'TiB'] : ['B', 'kB', 'MB', 'GB', 'TB']
  let indice = 0
  let resto = Math.abs(valor)
  while (resto >= base && indice < unidades.length - 1) {
    resto /= base
    indice += 1
  }
  return `${numero(Math.sign(valor) * resto, resto >= 100 || indice === 0 ? 0 : 1)} ${unidades[indice]}`
}

function duracion(segundos: number): string {
  if (segundos < 60) return `${numero(segundos, segundos < 10 ? 1 : 0)} s`
  if (segundos < 3600) return `${Math.floor(segundos / 60)} min ${Math.round(segundos % 60)} s`
  if (segundos < 86_400) return `${Math.floor(segundos / 3600)} h ${Math.round((segundos % 3600) / 60)} min`
  return `${numero(segundos / 86_400, 1)} d`
}

/** El valor con su unidad, como lo enseñaría Grafana pero en español. `eje`: la versión corta, para los ejes. */
export function formatear(valor: number | null | undefined, unidad: string, eje = false): string {
  if (valor == null || !Number.isFinite(valor)) return '—'
  switch (unidad) {
    case 'bytes':
      return bytes(valor)
    case 'Bps':
      return `${bytes(valor)}/s`
    case 's':
      return duracion(valor)
    case 'reqps':
      return `${corto(valor)}/s`
    case 'percent':
      return `${numero(valor, eje ? 0 : 1)} %`
    case 'percentunit':
      return `${numero(valor * 100, eje ? 0 : 1)} %`
    case 'decimal1':
      return formatearDecimal(valor, 1)
    default:
      if (!eje && Number.isInteger(valor) && Math.abs(valor) < 1e7) return formatearEntero(valor)
      return corto(valor)
  }
}

/** Los colores con nombre de Grafana, en la paleta apagada del portal: tokens `--graf-*`, que cambian con el tema. */
const COLORES: Record<string, string> = {
  green: 'var(--graf-verde)',
  orange: 'var(--graf-naranja)',
  red: 'var(--graf-rojo)',
  yellow: 'var(--graf-amarillo)',
  blue: 'var(--graf-azul)',
  purple: 'var(--graf-morado)',
}

export function color(nombre: string | null | undefined): string | undefined {
  if (!nombre) return undefined
  return COLORES[nombre] ?? nombre
}

/** Color de un valor según los umbrales del panel (el último paso cuyo `desde` no supera el valor). */
export function colorPorUmbral(panel: Pick<PanelCuadro, 'umbrales' | 'color'>, valor: number | null | undefined): string | undefined {
  if (valor != null && panel.umbrales.length > 1) {
    let elegido: string | undefined
    for (const paso of panel.umbrales) {
      if (paso.desde == null || valor >= paso.desde) elegido = paso.color
    }
    return color(elegido)
  }
  return color(panel.color)
}

/** Series de un panel en filas para Recharts: `[{t, «serie A»: 3, «serie B»: 1}, …]`. */
export function aFilas(series: readonly { nombre: string; puntos: readonly (readonly [number, number | null])[] }[]) {
  const filas = new Map<number, Record<string, number | null>>()
  for (const serie of series) {
    for (const [t, v] of serie.puntos) {
      const fila = filas.get(t) ?? { t }
      fila[serie.nombre] = v
      filas.set(t, fila)
    }
  }
  return [...filas.values()].sort((a, b) => (a.t as number) - (b.t as number))
}

const UNIDADES_PERIODO: Record<string, string> = { s: 's', m: 'min', h: 'h', d: 'd' }

/** `30m` → «últimos 30 min»; un texto que no es una ventana (`corpus F3`) se devuelve tal cual. */
export function describirPeriodo(periodo: string): string {
  const partes = /^(\d+)([smhd])$/.exec(periodo)
  return partes ? `últimos ${partes[1]} ${UNIDADES_PERIODO[partes[2]]}` : periodo
}

/** Alto en píxeles de `alto` filas de la rejilla de Grafana: 28 px por fila y 12 px de hueco entre filas. */
export const altoPanel = (alto: number) => alto * 40 - 12

/** Alto útil de la gráfica de un panel: sin el relleno de la tarjeta, la cabecera y, si la hay, la leyenda. */
export function altoGrafica(alto: number, conLeyenda: boolean): number {
  return Math.max(120, altoPanel(alto) - 32 - 30 - (conLeyenda ? 22 : 0))
}
