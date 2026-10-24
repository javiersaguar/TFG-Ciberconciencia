/** Proyección y rutas geodésicas. D3 recorta en el antimeridiano sin atravesar el mapa. */
import { geoGraticule10, geoInterpolate, geoNaturalEarth1, geoPath, type GeoPermissibleObjects } from 'd3-geo'

import type { UbicacionMapa } from '@/api/mapa'

import tierra from './tierra.json'

export const ANCHO = 1000
export const ALTO = 540
export const proyeccion = geoNaturalEarth1().fitExtent([[24, 16], [ANCHO - 24, ALTO - 16]], { type: 'Sphere' })
const dibujar = geoPath(proyeccion).digits(2)
export const CONTORNO = dibujar({ type: 'Sphere' }) ?? ''
export const RETICULA = dibujar(geoGraticule10()) ?? ''
export const PAISES = tierra.features.map((f) => ({
  ...f.properties,
  trazo: dibujar(f as GeoPermissibleObjects) ?? '',
}))

export function rutaGeografica(desde: UbicacionMapa, hasta: UbicacionMapa): string {
  return dibujar({ type: 'LineString', coordinates: [desde.coordenadas, hasta.coordenadas] }) ?? ''
}

export function interpolarRuta(desde: UbicacionMapa, hasta: UbicacionMapa) {
  const interpolar = geoInterpolate(desde.coordenadas, hasta.coordenadas)
  return (avance: number) => proyeccion(interpolar(Math.max(0, Math.min(1, avance)))) ?? [0, 0]
}

export interface VistaMapa { escala: number; x: number; y: number }
export const VISTA_MUNDO: VistaMapa = { escala: 1, x: 0, y: 0 }
export function acotarVista(vista: VistaMapa): VistaMapa {
  const escala = Math.max(1, Math.min(3, vista.escala))
  return {
    escala,
    x: Math.max(-(escala - 1) * ANCHO / 2, Math.min((escala - 1) * ANCHO / 2, vista.x)),
    y: Math.max(-(escala - 1) * ALTO / 2, Math.min((escala - 1) * ALTO / 2, vista.y)),
  }
}
