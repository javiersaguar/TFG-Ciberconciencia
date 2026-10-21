/**
 * Cobertura ATT&CK con tres capas MEDIDAS y el catálogo oficial:
 *
 *   potencial       técnicas que alguna regla Sigma cubre (capa Navigator de F2, 28-07-2026; puntuación = nº de reglas)
 *   observada F2    técnicas con alertas en el corpus de entonces (capa Navigator de F2, 28-07: apt29 + atómico, 34)
 *   observada hoy   técnicas con alertas en el corpus ACTUAL (exportación del 21-10-2026, con las campañas LSASS: 47)
 *
 * Las dos observadas son ciertas para su alcance: nunca se sustituye una por otra sin decir cuál es y de cuándo.
 * Nombres y tácticas salen del catálogo ATT&CK Enterprise v19 (`attack-catalogo-v19.json`), no de memoria.
 *
 *   const cobertura = useCoberturaAttack()
 */
import { useQuery } from '@tanstack/react-query'

import { cargarCatalogo, cargarTecnicasObservadas, type TacticaAttack } from './exportaciones'
import { construirCobertura } from './simulado/attack'

export interface TecnicaCapa {
  techniqueID: string
  score: number
  comment?: string
  enabled?: boolean
}

export interface CapaNavigator {
  name: string
  description?: string
  domain: string
  versions: { attack: string; navigator: string; layer: string }
  techniques: TecnicaCapa[]
}

export type CapaCobertura = 'potencial' | 'observadaF2' | 'observadaHoy'

export interface CeldaTecnica {
  id: string
  familia: string
  subtecnica: boolean
  /** Nombre oficial (catálogo v19); `null` si el ID no estuviera en el catálogo. */
  nombre: string | null
  /** Tácticas oficiales con su nombre corto (`credential-access`). */
  tacticas: string[]
  /** Reglas Sigma que la cubren (capa potencial); `null` si no está en esa capa. */
  reglas: number | null
  /** Alertas en la capa observada de F2 (28-07); `null` si no está. */
  alertasF2: number | null
  /** Alertas en el corpus actual (21-10); `null` si no tiene ninguna. */
  alertasHoy: number | null
  /** Datasets del corpus actual con alertas de esta técnica. */
  datasetsHoy: string[]
}

export interface FamiliaTecnica {
  id: string
  nombre: string | null
  celdas: CeldaTecnica[]
  reglas: number
  alertasF2: number
  alertasHoy: number
}

export interface ColumnaTactica {
  tactica: TacticaAttack
  /** Familias con alguna técnica de esta táctica; cada una solo con sus celdas de esta táctica. */
  familias: FamiliaTecnica[]
}

export interface TacticaObservada {
  /** Nombre de la táctica tal como lo llevan las alertas (nunca un TAxxxx). */
  tactica: string
  hosts: string[]
  alertas: number
}

export interface CoberturaAttack {
  familias: FamiliaTecnica[]
  /** Las 15 tácticas en el orden de la matriz Enterprise v19, con sus técnicas. */
  columnas: ColumnaTactica[]
  resumen: {
    potenciales: number
    subtecnicasPotenciales: number
    familiasPotenciales: number
    /** Suma de puntuaciones de la capa potencial: una regla con varias técnicas cuenta en cada una. */
    paresReglaTecnica: number
    observadasF2: number
    subtecnicasObservadasF2: number
    /** Suma de puntuaciones de la capa observada de F2: una alerta con varias técnicas cuenta en cada una. */
    paresAlertaTecnicaF2: number
    activacionF2: number
    observadasHoy: number
    paresAlertaTecnicaHoy: number
    /** Derivada: observadas hoy que están entre las potenciales, sobre las potenciales. */
    activacionHoy: number
  }
  capas: { potencial: CapaNavigator; observadaF2: CapaNavigator }
  catalogo: { version: string; extraido: string; fuente: string }
  tacticasDay1: TacticaObservada[]
  fuente: string
}

export function useCoberturaAttack() {
  return useQuery({
    queryKey: ['cobertura-attack'],
    queryFn: async () => {
      const [tecnicas, catalogo] = await Promise.all([cargarTecnicasObservadas(), cargarCatalogo()])
      return construirCobertura(tecnicas, catalogo)
    },
    staleTime: Infinity,
  })
}
