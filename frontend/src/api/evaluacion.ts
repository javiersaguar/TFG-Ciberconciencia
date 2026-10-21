/**
 * Evaluación: SOLO lo medido y documentado. Lo que aún no se ha medido (precisión, exhaustividad, F1, falsos
 * positivos, latencia) aparece como pendiente, con lo que se medirá y en qué fase, NUNCA con un número.
 *
 *   const evaluacion = useEvaluacion()   // {ml1, medidas, pendientes}
 */
import { useQuery } from '@tanstack/react-query'

import { desdeSimulado } from './fuente'
import { construirEvaluacion } from './simulado/evaluacion'

export interface ResultadoMl1 {
  /** Letra de la estrategia (A–G) y su texto original en `resultados.json`. */
  clave: string
  estrategia: string
  papel: 'principal' | 'control' | 'ablacion' | 'contaminado'
  aucRoc: number
  aucPr: number
  positivos: number
  muestras: number
  nEntrenamiento: number
  nFeatures: number
}

export interface MedidaDocumentada {
  clave: string
  titulo: string
  valor: string
  detalle: string
  fuente: string
  /** Advertencia de lectura (p. ej. «no comparable con…»). */
  advertencia?: string
}

export interface Pendiente {
  metrica: string
  fase: string
  /** Qué se medirá y sobre qué datos. */
  como: string
}

export interface Evaluacion {
  ml1: { minutosVentana: number; resultados: ResultadoMl1[]; fuente: string }
  medidas: MedidaDocumentada[]
  pendientes: Pendiente[]
}

export function useEvaluacion() {
  return useQuery({ queryKey: ['evaluacion'], queryFn: () => desdeSimulado(construirEvaluacion), staleTime: Infinity })
}
