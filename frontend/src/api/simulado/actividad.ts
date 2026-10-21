/**
 * Agregados de las 741 alertas de APT29 day1 (exportación del 21-10-2026) para la portada: alertas por minuto
 * apiladas por nivel, reparto por severidad y mapa de calor táctica × host. Funciones puras; con la API serán
 * consultas de ClickHouse con el mismo resultado.
 */
import type { AlertaDay1 } from '../exportaciones'
import type { NivelRegla } from './corpus'

/** De menos a más grave: el orden de apilado y de la leyenda. */
export const NIVELES_ORDEN: readonly NivelRegla[] = ['informational', 'low', 'medium', 'high', 'critical']

export interface MinutoActividad {
  /** `03:09` */
  minuto: string
  total: number
  porNivel: Record<NivelRegla, number>
}

export interface MapaTacticaHost {
  tacticas: string[]
  hosts: string[]
  /** `celdas[t][h]`: alertas de la táctica `t` en el host `h`. Una alerta con varias tácticas cuenta en cada una. */
  celdas: number[][]
  maximo: number
  /** Alertas sin ninguna táctica, por host (el punto ciego del etiquetado). */
  sinTactica: number[]
}

const MINUTO = 60_000
const dos = (n: number) => String(n).padStart(2, '0')
const minutoDe = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const vacio = (): Record<NivelRegla, number> => ({ informational: 0, low: 0, medium: 0, high: 0, critical: 0 })

/** Un hueco por minuto entre `desde` y `hasta` (incluidos), aunque no tenga alertas: el silencio también se ve. */
export function alertasPorMinuto(alertas: readonly AlertaDay1[], desde = '02:56', hasta = '03:23'): MinutoActividad[] {
  const inicio = minutoDe(desde)
  const fin = minutoDe(hasta)
  const minutos: MinutoActividad[] = Array.from({ length: fin - inicio + 1 }, (_, i) => ({
    minuto: `${dos(Math.floor((inicio + i) / 60))}:${dos((inicio + i) % 60)}`,
    total: 0,
    porNivel: vacio(),
  }))
  for (const a of alertas) {
    const m = minutos[Math.floor(a.ms / MINUTO) - inicio]
    if (!m) continue
    m.total += 1
    m.porNivel[a.nivel] += 1
  }
  return minutos
}

/** Reparto por nivel, solo de los niveles que aparecen, de más a menos grave. */
export function repartoPorNivel(alertas: readonly AlertaDay1[]): { nivel: NivelRegla; alertas: number }[] {
  const cuenta = vacio()
  for (const a of alertas) cuenta[a.nivel] += 1
  return [...NIVELES_ORDEN].reverse().filter((n) => cuenta[n] > 0).map((nivel) => ({ nivel, alertas: cuenta[nivel] }))
}

export function mapaTacticaHost(alertas: readonly AlertaDay1[], hosts: readonly string[] = ['SCRANTON', 'NASHUA', 'NEWYORK', 'UTICA']): MapaTacticaHost {
  const porTactica = new Map<string, number[]>()
  const sinTactica = hosts.map(() => 0)
  for (const a of alertas) {
    const h = hosts.indexOf(a.host)
    if (h < 0) continue
    if (a.tacticas.length === 0) sinTactica[h] += 1
    for (const t of a.tacticas) {
      const fila = porTactica.get(t) ?? hosts.map(() => 0)
      fila[h] += 1
      porTactica.set(t, fila)
    }
  }
  const filas = [...porTactica.entries()].sort((a, b) => b[1].reduce((s, x) => s + x, 0) - a[1].reduce((s, x) => s + x, 0) || a[0].localeCompare(b[0]))
  const celdas = filas.map(([, fila]) => fila)
  return { tacticas: filas.map(([t]) => t), hosts: [...hosts], celdas, maximo: Math.max(0, ...celdas.flat(), ...sinTactica), sinTactica }
}
