/**
 * Línea temporal de APT29 day1 con los datos documentados (horas del EVENTO, UTC del dataset, 2-5-2020).
 *
 *   const cronologia = useCronologia()   // EventoCronologia[] sin ordenar; la página ordena con su resolución
 *
 * Mezcla cuatro tipos de entrada, cada uno con su fuente: la primera alerta de cada táctica y host (escenario §4),
 * las alertas documentadas una a una (bloque de P1), los hitos de red de P2 y el inicio y fin de cada campaña.
 */
import { useQuery } from '@tanstack/react-query'

import { desdeSimulado } from './fuente'
import type { HoraDataset, NivelRegla } from './simulado/corpus'
import { construirCronologia } from './simulado/cronologia'
import { cargarAlertasDay1, cargarAristasP2, cargarCampanaP2, cargarCampanasP1 } from './exportaciones'
import { construirIncidentes } from './simulado/incidentes'

export type TipoEvento = 'tactica' | 'alerta' | 'red' | 'campana'

export interface EventoCronologia {
  id: string
  tipo: TipoEvento
  hora: HoraDataset
  hosts: string[]
  titulo: string
  detalle?: string
  tacticas: string[]
  tecnicas: string[]
  /** Nivel de la regla Sigma; `null` cuando el documento no lo da (filas agregadas por táctica, hitos de red). */
  nivel: NivelRegla | null
  alertas?: number
  duracionMin?: number
  fuente: string
  /** Nodo o arista del grafo de ataque al que saltar. */
  enGrafo?: string
  incidente?: string
}

export function useCronologia() {
  return useQuery({ queryKey: ['cronologia', 'apt29-day1'], queryFn: () => desdeSimulado(construirCronologia), staleTime: Infinity })
}

/**
 * Línea temporal real: las 741 alertas de day1 y las 17 aristas de P2 (exportaciones del 21-10-2026), las campañas
 * de day1 como bandas y los eventos documentados de la ronda anterior, que solo sirven para traducir los enlaces
 * antiguos (`?sel=al-0309-remota`) a su alerta real.
 */
export function useLineaTemporal() {
  return useQuery({
    queryKey: ['linea-temporal', 'apt29-day1'],
    queryFn: async () => {
      const [alertas, aristas, p1, p2] = await Promise.all([cargarAlertasDay1(), cargarAristasP2(), cargarCampanasP1(), cargarCampanaP2()])
      const campanas = construirIncidentes(p1, p2).filter((i) => i.dataset === 'SDWIN-200501225525')
      return { alertas, aristas, campanas, legado: construirCronologia() }
    },
    staleTime: Infinity,
  })
}
