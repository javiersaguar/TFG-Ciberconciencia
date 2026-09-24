/**
 * Puntuación explicable del incidente (anticipo del Pilar C): un número de 0 a 100 que **siempre** viene con su
 * descomposición en factores independientes normalizados a [0, 1], para que un analista vea por qué un incidente
 * está por encima de otro. Pesos iguales al esquema de ROADMAP F6.1 simplificado; en F6 se ajustarán (ML-4) y se
 * explicarán con SHAP, pero la forma —suma ponderada de factores legibles— se mantiene.
 */
import { porId, ORDEN_TACTICAS, type Organizacion } from '../modelo'
import type { RutaProbable } from '../razonamiento'
import type { Evaluacion } from '../simulacion'

export interface Factor {
  clave: string
  titulo: string
  /** 0 – 1. */
  valor: number
  peso: number
  explicacion: string
}

export interface Puntuacion {
  total: number
  nivel: 'Sin incidente' | 'Baja' | 'Media' | 'Alta' | 'Crítica'
  factores: Factor[]
}

export const PESOS = { criticidad: 0.3, avance: 0.25, proximidad: 0.25, amplitud: 0.1, confianza: 0.1 } as const

export function puntuar(org: Organizacion, ev: Evaluacion, ruta: RutaProbable | null): Puntuacion {
  if (ev.ocurridos.length === 0) return { total: 0, nivel: 'Sin incidente', factores: [] }
  const activos = porId(org.activos)
  const comprometidos = [...ev.comprometidos].map((id) => activos.get(id)!).filter(Boolean)
  const maxCriticidad = Math.max(0, ...comprometidos.map((a) => a.criticidad))
  const indice = Math.max(0, ...ev.tacticas.map((t) => ORDEN_TACTICAS.indexOf(t as (typeof ORDEN_TACTICAS)[number])))
  const joyaTomada = comprometidos.some((a) => a.joya) || ev.impactos.length > 0
  const proximidad = joyaTomada ? 1 : ruta ? Math.max(0, 1 - (ruta.saltos - 1) / 4) : 0
  const defendibles = org.activos.filter((a) => a.tipo !== 'atacante').length
  const patrones = [...new Set(ev.ocurridos.map((p) => p.patron).filter(Boolean))]

  const factores: Factor[] = [
    {
      clave: 'criticidad',
      titulo: 'Criticidad de lo comprometido',
      valor: maxCriticidad / 5,
      peso: PESOS.criticidad,
      explicacion: maxCriticidad ? `El activo más crítico en manos del atacante vale ${maxCriticidad} de 5.` : 'Aún no controla ningún activo.',
    },
    {
      clave: 'avance',
      titulo: 'Avance en la kill chain',
      valor: indice / (ORDEN_TACTICAS.length - 1),
      peso: PESOS.avance,
      explicacion: `Ha llegado a la táctica ${indice + 1} de ${ORDEN_TACTICAS.length}.`,
    },
    {
      clave: 'proximidad',
      titulo: 'Cercanía a una joya de la corona',
      valor: proximidad,
      peso: PESOS.proximidad,
      explicacion: joyaTomada
        ? 'Ya ha alcanzado un objetivo crítico.'
        : ruta
          ? `Está a ${ruta.saltos} ${ruta.saltos === 1 ? 'salto' : 'saltos'} de la joya más cercana.`
          : 'No tiene ruta hacia ninguna joya.',
    },
    {
      clave: 'amplitud',
      titulo: 'Amplitud del compromiso',
      valor: comprometidos.length / defendibles,
      peso: PESOS.amplitud,
      explicacion: `${comprometidos.length} de ${defendibles} activos comprometidos.`,
    },
    {
      clave: 'confianza',
      titulo: 'Confianza de la detección',
      valor: patrones.length ? 1 : 0.5,
      peso: PESOS.confianza,
      explicacion: patrones.length
        ? `Secuencia reconocida por ${patrones.join(' y ')} (CEP), no solo alertas sueltas.`
        : 'Solo alertas individuales, sin secuencia reconocida.',
    },
  ]
  const total = Math.round(factores.reduce((suma, f) => suma + f.valor * f.peso, 0) * 100)
  const nivel = total >= 75 ? 'Crítica' : total >= 50 ? 'Alta' : total >= 25 ? 'Media' : 'Baja'
  return { total, nivel, factores }
}
