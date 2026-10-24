/**
 * Lógica del globo del mapa mundial que no necesita three.js: qué países resaltar y dónde está cada uno, cómo se
 * pintan en la textura de resalte, cuánto gira la vista con las flechas y cuándo una selección queda a espaldas de la
 * cámara. Mismos polígonos que el mapa 2D (`tierra.json`, Natural Earth), así que se resaltan exactamente los mismos
 * países en las dos vistas.
 */
import { geoArea, geoCentroid, geoEquirectangular, geoPath, type GeoPermissibleObjects } from 'd3-geo'

import { aEsfera, type Coordenadas, type Vec3 } from '@/componentes/tierra/esfera'

import tierra from './tierra.json'

type Pais = (typeof tierra.features)[number]

const POR_CODIGO = new Map<string, Pais[]>()
for (const f of tierra.features) POR_CODIGO.set(f.properties.codigo, [...(POR_CODIGO.get(f.properties.codigo) ?? []), f])

/** Los polígonos de los países pedidos (códigos ISO de tres letras); los códigos desconocidos se ignoran. */
export function paisesPorCodigo(codigos: readonly string[]): Pais[] {
  return [...new Set(codigos)].flatMap((c) => POR_CODIGO.get(c) ?? [])
}

/**
 * Dónde mirar para ver un país: el centro de su parte más grande (para que Francia no se vaya hacia la Guayana ni
 * Estados Unidos hacia Alaska). `null` si el código no existe.
 */
export function centroDePais(codigo: string): Coordenadas | null {
  const partes = (POR_CODIGO.get(codigo) ?? []).flatMap((f): GeoPermissibleObjects[] =>
    f.geometry.type === 'MultiPolygon'
      ? (f.geometry.coordinates as number[][][][]).map((coordinates) => ({ type: 'Polygon', coordinates }))
      : [f.geometry as GeoPermissibleObjects],
  )
  if (!partes.length) return null
  const mayor = partes.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a))
  const [lon, lat] = geoCentroid(mayor)
  return { lat, lon }
}

/**
 * Pinta los países en una textura equirectangular transparente (la misma proyección que la de `Tierra3D`): relleno
 * suave y contorno del color de acento, como `.mapa-pais-seleccionado` en el 2D.
 */
export function pintarPaises(ctx: CanvasRenderingContext2D, ancho: number, paises: readonly Pais[], color: string) {
  const proyeccion = geoEquirectangular().scale(ancho / (2 * Math.PI)).translate([ancho / 2, ancho / 4])
  const camino = geoPath(proyeccion, ctx)
  ctx.save()
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineJoin = 'round'
  ctx.lineWidth = ancho / 700
  for (const pais of paises) {
    ctx.beginPath()
    camino(pais as GeoPermissibleObjects)
    ctx.globalAlpha = 0.42
    ctx.fill('evenodd')
    ctx.globalAlpha = 0.95
    ctx.stroke()
  }
  ctx.restore()
}

export type Sentido = 'arriba' | 'abajo' | 'izquierda' | 'derecha'

/** Paso de cada flecha, en grados, y latitud máxima de la cámara (más allá, el globo se ve de canto sobre el polo). */
export const PASO_FLECHA = 20
export const LATITUD_MAXIMA = 75

/**
 * Nueva posición de la cámara tras pulsar una flecha: se desplaza sobre la esfera a la misma distancia del centro.
 * Arriba lleva la vista al norte, abajo al sur, izquierda al oeste y derecha al este.
 */
export function girarVista(posicion: Vec3, sentido: Sentido, paso = PASO_FLECHA): Vec3 {
  const r = Math.hypot(...posicion)
  if (r < 1e-9) return posicion
  const lat = (Math.asin(Math.max(-1, Math.min(1, posicion[1] / r))) * 180) / Math.PI
  const lon = (Math.atan2(posicion[0], posicion[2]) * 180) / Math.PI
  const nuevaLat = Math.max(-LATITUD_MAXIMA, Math.min(LATITUD_MAXIMA, lat + (sentido === 'arriba' ? paso : sentido === 'abajo' ? -paso : 0)))
  const nuevaLon = lon + (sentido === 'derecha' ? paso : sentido === 'izquierda' ? -paso : 0)
  return aEsfera(nuevaLat, ((((nuevaLon + 180) % 360) + 360) % 360) - 180, r)
}

/**
 * ¿Queda algún punto a espaldas de quien mira desde `camara`? Se usa para no mover la vista cuando lo elegido ya se
 * ve (se ha pinchado en el propio globo) y girarla solo si está detrás (elegido desde la tabla o el filtro de país).
 */
export function quedaDetras(camara: Vec3, puntos: readonly Vec3[], umbral = 0.2): boolean {
  const n = Math.hypot(...camara)
  if (n < 1e-9) return false
  return puntos.some((p) => {
    const m = Math.hypot(...p) || 1
    return (camara[0] * p[0] + camara[1] * p[1] + camara[2] * p[2]) / (n * m) < umbral
  })
}
