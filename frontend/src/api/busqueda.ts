/**
 * Datos del índice de la paleta de comandos: las 12 campañas y las 47 técnicas observadas con su nombre oficial.
 * Solo se cargan cuando se abre la paleta (`activo`), así la portada no paga el catálogo de ATT&CK.
 */
import { useQuery } from '@tanstack/react-query'

import { cargarCampanaP2, cargarCampanasP1, cargarCatalogo, cargarTecnicasObservadas } from './exportaciones'
import { construirIncidentes } from './simulado/incidentes'

export function useIndiceBusqueda(activo: boolean) {
  return useQuery({
    queryKey: ['indice-busqueda'],
    enabled: activo,
    staleTime: Infinity,
    queryFn: async () => {
      const [p1, p2, tecnicas, catalogo] = await Promise.all([cargarCampanasP1(), cargarCampanaP2(), cargarTecnicasObservadas(), cargarCatalogo()])
      return { incidentes: construirIncidentes(p1, p2), tecnicas, catalogo }
    },
  })
}
