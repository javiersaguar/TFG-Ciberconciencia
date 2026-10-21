/**
 * Une cada campaña documentada (`CAMPANAS` de `corpus.ts`, con sus notas) con su fila MEDIDA de la exportación de
 * los oráculos (`p1-campanas.jsonl`, 21-10-2026), y descompone la confianza de P1 a partir de sus contadores de
 * evidencia. Funciones puras: `campanas.test.ts` comprueba que la descomposición reproduce la confianza exportada.
 */
import type { FactorConfianza } from '../ataque'
import type { CampanaP1Medida } from '../exportaciones'
import { horaCorta } from '../exportaciones'
import { P1_CONFIANZA, type Campana } from './corpus'

/** La fila medida de una campaña P1: mismo dataset, mismo host (si se conoce) y misma hora de inicio (si se conoce). */
export function campanaMedida(c: Campana, medidas: readonly CampanaP1Medida[]): CampanaP1Medida | undefined {
  return medidas.find(
    (m) => m.dataset === c.dataset && (c.hosts === '—' || m.host === c.hosts) && (!c.inicio || horaCorta(m.inicio) === c.inicio),
  )
}

/**
 * Factores de la confianza de P1 con su presencia REAL: base 0,40 + 0,25 si hay acceso a LSASS + 0,20 si hay fichero
 * de volcado + 0,10 si se ejecuta la herramienta + 0,15 si hay limpieza (pesos de `p1_credential_theft.sql`).
 */
export function factoresP1(m: CampanaP1Medida): FactorConfianza[] {
  const [lsass, fichero, herramienta, limpieza] = P1_CONFIANZA.etapas
  return [
    { ...P1_CONFIANZA.base, presente: true },
    { ...lsass, presente: m.evidencia.lsass > 0 },
    { ...fichero, presente: m.evidencia.fichero > 0 },
    { ...herramienta, presente: m.evidencia.herramienta > 0 },
    { ...limpieza, presente: m.evidencia.limpieza > 0 },
  ]
}

/** La suma de los factores presentes, con el mismo tope de 1 que la vista. */
export function confianzaDeFactores(factores: readonly FactorConfianza[]): number {
  return Math.min(1, Math.round(factores.reduce((s, f) => s + (f.presente ? f.peso : 0), 0) * 100) / 100)
}
