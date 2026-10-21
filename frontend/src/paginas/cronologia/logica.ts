/**
 * Lógica pura de la línea temporal: orden con su resolución real, filtros y validación de los parámetros de la URL.
 *
 * Orden: por milisegundos del día. Si un evento SIN milisegundos (hora documentada al segundo o reconstruida †) comparte
 * su segundo con otros, no se sabe en qué punto de ese segundo cae: se marca `ordenIncierto` y la interfaz lo dice en
 * vez de aparentar una precisión que el dato no tiene. Los que sí tienen milisegundos están bien ordenados entre sí.
 */
import type { EventoCronologia, TipoEvento } from '@/api/cronologia'
import type { NivelRegla } from '@/api/tipos'
import { milisegundosDelDia, segundoDelDia } from '@/componentes/datos/hora'

export interface EventoOrdenado extends EventoCronologia {
  ordenIncierto: boolean
}

export function ordenarCronologia(eventos: readonly EventoCronologia[]): EventoOrdenado[] {
  const ordenados = [...eventos]
    .map((e, indice) => ({ e, indice }))
    .sort((a, b) => milisegundosDelDia(a.e.hora) - milisegundosDelDia(b.e.hora) || a.indice - b.indice)
    .map((x) => x.e)
  const porSegundo = new Map<number, EventoCronologia[]>()
  for (const e of ordenados) porSegundo.set(segundoDelDia(e.hora), [...(porSegundo.get(segundoDelDia(e.hora)) ?? []), e])
  return ordenados.map((e) => {
    const mismos = porSegundo.get(segundoDelDia(e.hora)) ?? []
    return { ...e, ordenIncierto: mismos.length > 1 && e.hora.resolucion !== 'ms' }
  })
}

export type FiltroNivel = NivelRegla | 'sin-nivel'

export interface FiltrosCronologia {
  hosts: string[]
  tacticas: string[]
  niveles: FiltroNivel[]
  tipos: TipoEvento[]
}

export const TIPOS: readonly TipoEvento[] = ['tactica', 'alerta', 'red', 'campana']
export const ETIQUETA_TIPO: Record<TipoEvento, string> = {
  tactica: 'Primera alerta por táctica',
  alerta: 'Alerta documentada',
  red: 'Red (P2)',
  campana: 'Campaña',
}

/** Vacío = sin filtrar en ese eje. */
export const FILTROS_CRONOLOGIA: FiltrosCronologia = { hosts: [], tacticas: [], niveles: [], tipos: [] }

export function filtrarCronologia<T extends EventoCronologia>(eventos: readonly T[], f: FiltrosCronologia): T[] {
  return eventos.filter(
    (e) =>
      (f.hosts.length === 0 || e.hosts.some((h) => f.hosts.some((buscado) => h.includes(buscado)))) &&
      (f.tacticas.length === 0 || e.tacticas.some((t) => f.tacticas.includes(t))) &&
      (f.niveles.length === 0 || f.niveles.includes(e.nivel ?? 'sin-nivel')) &&
      (f.tipos.length === 0 || f.tipos.includes(e.tipo)),
  )
}

/** Tácticas presentes, en el orden en que aparecen por primera vez. */
export function tacticasPresentes(eventos: readonly EventoCronologia[]): string[] {
  return [...new Set(eventos.flatMap((e) => e.tacticas))]
}

/** `?sel=`: solo el id de un evento que exista. */
export function leerEvento(valor: string | null, eventos: readonly EventoCronologia[]): string | null {
  return valor && eventos.some((e) => e.id === valor) ? valor : null
}

/** `?host=`: solo un host conocido del escenario. */
export function leerHost(valor: string | null): string | null {
  return valor && ['SCRANTON', 'NASHUA', 'NEWYORK', 'UTICA'].includes(valor) ? valor : null
}
