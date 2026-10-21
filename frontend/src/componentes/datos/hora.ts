/**
 * Horas del dataset (UTC de la captura de apt29, 2020-05-02) con su resolución real.
 *
 * Regla del proyecto: no aparentar una precisión que no hay. Una hora reconstruida con `EventTime` (marcada con † en
 * el escenario) tiene resolución de segundo, así que se enseña sin milisegundos y con †; una hora que el documento da
 * al segundo se enseña al segundo. Solo las horas de Sysmon llevan milisegundos.
 */
import type { HoraDataset } from '@/api/tipos'

/** `03:00:29.705` → `03:00:29,705`; `03:19:17` reconstruida → `03:19:17 †`. */
export function formatearHora(h: HoraDataset): string {
  const [segundos, milis] = h.hora.split('.')
  if (h.resolucion === 'ms' && milis) return `${segundos},${milis}`
  return h.resolucion === 'reconstruida' ? `${segundos} †` : segundos
}

/** Milisegundos desde las 00:00 del día del dataset (el inicio del segundo si no hay milisegundos). */
export function milisegundosDelDia(h: HoraDataset): number {
  const [hms, milis = '0'] = h.hora.split('.')
  const [hh, mm, ss] = hms.split(':').map(Number)
  return ((hh * 60 + mm) * 60 + ss) * 1000 + (h.resolucion === 'ms' ? Number(milis.padEnd(3, '0')) : 0)
}

/** El segundo al que pertenece la hora (para agrupar lo que no se puede ordenar con precisión). */
export function segundoDelDia(h: HoraDataset): number {
  return Math.floor(milisegundosDelDia(h) / 1000)
}

export const NOTA_RESOLUCION: Record<HoraDataset['resolucion'], string> = {
  ms: 'Hora del evento con milisegundos (Sysmon).',
  segundo: 'El documento da esta hora al segundo.',
  reconstruida: 'Hora reconstruida (EventTime + desfase horario) con resolución de segundo: el orden respecto a otros eventos del mismo segundo no es seguro.',
}
