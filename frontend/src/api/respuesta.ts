/**
 * Datos del asistente de respuesta: los 12 incidentes reales con su evidencia medida (alertas de day1 y aristas de
 * P2, exportaciones del 21-10-2026). Las dos organizaciones de la demo no necesitan datos: se evalúan en la página
 * con las mismas funciones puras que `/conciencia`.
 */
import { useQuery } from '@tanstack/react-query'

import { cargarAlertasDay1, cargarAristasP2, cargarCampanaP2, cargarCampanasP1 } from './exportaciones'
import { construirIncidentes } from './simulado/incidentes'

export function useDatosRespuesta({ activo = true }: { activo?: boolean } = {}) {
  return useQuery({
    queryKey: ['respuesta'],
    enabled: activo,
    queryFn: async () => {
      const [p1, p2, alertas, aristas] = await Promise.all([cargarCampanasP1(), cargarCampanaP2(), cargarAlertasDay1(), cargarAristasP2()])
      return { incidentes: construirIncidentes(p1, p2), alertas, aristas }
    },
    staleTime: Infinity,
  })
}
