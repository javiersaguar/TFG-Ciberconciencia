/**
 * Lógica pura de la matriz ATT&CK: capa elegida, filtros, orden, escala de calor y validación de `?tecnica=`.
 *
 * Tres capas, cada una con su fecha: potencial (reglas Sigma, F2 28-07), observada en F2 (28-07, 34 técnicas) y
 * observada en el corpus actual (21-10, 47). Nunca se mezclan: cada valor dice de qué capa es.
 */
import type { CapaCobertura, CeldaTecnica, CoberturaAttack, FamiliaTecnica } from '@/api/attack'

export type Capa = CapaCobertura
export type OrdenFamilias = 'id' | 'reglas' | 'alertasHoy'

export const ETIQUETA_CAPA: Record<Capa, string> = {
  potencial: 'Potencial · reglas Sigma',
  observadaF2: 'Observada en F2 · 28-07',
  observadaHoy: 'Observada hoy · 21-10',
}

/** Formato de un ID de técnica de ATT&CK (T1003 o T1003.001). */
const ID_TECNICA = /^T\d{4}(\.\d{3})?$/

/** Valor de una celda en la capa elegida: reglas en la potencial, alertas en las observadas. */
export function valorCelda(celda: CeldaTecnica, capa: Capa): number | null {
  if (capa === 'potencial') return celda.reglas
  return capa === 'observadaF2' ? celda.alertasF2 : celda.alertasHoy
}

/** ¿Está observada (tiene alertas) en la capa observada que corresponde? En la potencial se mira la de hoy. */
export function observada(celda: CeldaTecnica, capa: Capa): boolean {
  return (capa === 'observadaF2' ? celda.alertasF2 : celda.alertasHoy) !== null
}

/** Nivel de calor 0–5 en escala logarítmica (las puntuaciones van de 1 a más de cien). 0 = sin valor. */
export function nivelCalor(valor: number | null, maximo: number): number {
  if (!valor || valor <= 0 || maximo <= 0) return 0
  return Math.max(1, Math.min(5, Math.ceil((5 * Math.log1p(valor)) / Math.log1p(maximo))))
}

export function maximoCapa(familias: readonly FamiliaTecnica[], capa: Capa): number {
  return Math.max(0, ...familias.flatMap((f) => f.celdas.map((c) => valorCelda(c, capa) ?? 0)))
}

export interface FiltroMatriz {
  texto: string
  soloObservadas: boolean
}

/** Busca por ID o por nombre; en una capa observada solo quedan las técnicas con valor en esa capa. */
export function filtrarFamilias(familias: readonly FamiliaTecnica[], f: FiltroMatriz, capa: Capa): FamiliaTecnica[] {
  const buscado = f.texto.trim().toLowerCase()
  return familias
    .map((familia) => ({
      ...familia,
      celdas: familia.celdas.filter(
        (c) =>
          (!buscado || c.id.toLowerCase().startsWith(buscado) || (c.nombre ?? '').toLowerCase().includes(buscado)) &&
          (!f.soloObservadas || observada(c, capa)) &&
          (capa === 'potencial' || valorCelda(c, capa) !== null),
      ),
    }))
    .filter((familia) => familia.celdas.length > 0)
}

export function ordenarFamilias(familias: readonly FamiliaTecnica[], orden: OrdenFamilias): FamiliaTecnica[] {
  if (orden === 'id') return [...familias].sort((a, b) => a.id.localeCompare(b.id))
  return [...familias].sort((a, b) => b[orden] - a[orden] || a.id.localeCompare(b.id))
}

/** `?tecnica=`: solo un ID con formato válido Y que esté en alguna de las capas. */
export function leerTecnica(valor: string | null, cobertura: CoberturaAttack): CeldaTecnica | undefined {
  if (!valor || !ID_TECNICA.test(valor)) return undefined
  return cobertura.familias.flatMap((f) => f.celdas).find((c) => c.id === valor)
}

/** `?capa=`: solo una de las tres capas. */
export function leerCapa(valor: string | null): Capa | null {
  return valor === 'potencial' || valor === 'observadaF2' || valor === 'observadaHoy' ? valor : null
}

/** URL pública de una técnica en attack.mitre.org (T1003.001 → /techniques/T1003/001/). */
export function urlTecnica(id: string): string {
  const [familia, sub] = id.split('.')
  return `https://attack.mitre.org/techniques/${familia}/${sub ? `${sub}/` : ''}`
}
