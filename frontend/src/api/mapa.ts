/** Contrato geográfico del boceto. Las ubicaciones de esta fuente son ilustrativas. */
import { useQuery } from '@tanstack/react-query'

import { desdeSimulado } from './fuente'
import { MAPA_DEMO } from './simulado/mapa'
import type { NivelRegla } from './tipos'

export interface UbicacionMapa {
  id: string
  ciudad: string
  pais: string
  codigoPais: string
  /** Longitud, latitud, en grados. Nunca se deducen de las IP privadas del corpus. */
  coordenadas: [number, number]
}

export interface RutaMapa {
  id: string
  origen: string
  destino: string
  nivel: NivelRegla
  titulo: string
  sensor: string
  categoria: 'Red' | 'Identidad' | 'Datos'
}

export interface EscenarioMapa {
  organizacion: string
  procedencia: 'ilustrativa'
  fuente: string
  intervaloMs: number
  ubicaciones: UbicacionMapa[]
  rutas: RutaMapa[]
}

/** Punto de sustitución por la futura API: el navegador no consulta servicios GeoIP. */
export function useMapaMundial() {
  return useQuery({
    queryKey: ['mapa-mundial'],
    queryFn: () => desdeSimulado<EscenarioMapa>(() => MAPA_DEMO),
    staleTime: Infinity,
  })
}
