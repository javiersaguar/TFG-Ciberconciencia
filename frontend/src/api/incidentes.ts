/**
 * Incidentes. Hasta F6 un incidente ES una campaña detectada (12 documentadas: 11 de P1 y 1 de P2).
 *
 *   const incidentes = useIncidentes()
 *
 * Hoy se construyen con las filas medidas de los oráculos (`p1-campanas.jsonl`, `p2-campanas.jsonl`, 21-10-2026).
 * Cuando exista la API (F6.3) vendrán de `det.campaigns` + scoring con su puntuación de prioridad; hoy esa
 * puntuación NO existe para datos reales y no se inventa: el campo ni siquiera está en el tipo.
 */
import { useQuery } from '@tanstack/react-query'

import type { FactorConfianza } from './ataque'
import { cargarCampanaP2, cargarCampanasP1 } from './exportaciones'
import type { AlertaDocumentada, HoraDataset } from './simulado/corpus'
import { construirIncidentes } from './simulado/incidentes'

export interface Incidente {
  id: string
  patron: 'P1' | 'P2'
  dataset: string
  descripcionDataset: string
  hosts: string[]
  /** Día del dataset (`2020-05-02`): las campañas LSASS son de 2023. */
  fecha: string | null
  inicio: HoraDataset | null
  fin: HoraDataset | null
  alertas: number
  /** Confianza documentada; `null` si no está escrita en ninguna parte. */
  confianza: number | null
  fuenteConfianza?: string
  /** Factores de la confianza con su presencia real (calculada de los contadores de evidencia del oráculo). */
  factores: FactorConfianza[]
  /** Evidencia por etapa de P1 (alertas de cada tipo). */
  etapas?: { lsass: number; herramienta: number; fichero: number; limpieza: number }
  /** Solo las técnicas documentadas para esa campaña. */
  tecnicas: string[]
  notas: string[]
  /** Alertas documentadas una a una que son evidencia (solo apt29 day1). */
  evidencia: AlertaDocumentada[]
  /** Aristas de P2 por puerto (solo P2). */
  aristasP2: { servicio: string; puerto: number; conexiones: number; proceso: string }[]
  fuente: string
  /** Nodo del grafo de ataque (solo apt29 day1, que es lo que dibuja el grafo). */
  nodoGrafo?: string
  /** Evento de la línea temporal con el que empieza su evidencia. */
  eventoCronologia?: string
}

export function useIncidentes() {
  return useQuery({
    queryKey: ['incidentes'],
    queryFn: async () => {
      const [p1, p2] = await Promise.all([cargarCampanasP1(), cargarCampanaP2()])
      return construirIncidentes(p1, p2)
    },
    staleTime: Infinity,
  })
}
