/**
 * Geometría de la Tierra en 3D, pura (sin three.js): sitios sobre la esfera, arcos por el círculo máximo, la retícula y
 * el mapamundi como segmentos. La usan el globo de conciencia situacional y el del mapa mundial de alertas.
 *
 * Convenio: esfera de radio 1, el norte hacia +y y el meridiano 0 hacia +z.
 */
export type Vec3 = readonly [number, number, number]

/** Un sitio con latitud y longitud (en grados). */
export interface Coordenadas {
  lat: number
  lon: number
}

const rad = (g: number) => (g * Math.PI) / 180

/** Un punto de la Tierra en la escena del globo: radio `r`, el meridiano 0 hacia +z y el norte hacia +y. */
export function aEsfera(lat: number, lon: number, r = 1): Vec3 {
  const la = rad(lat)
  const lo = rad(lon)
  return [r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo)]
}

/**
 * Arco por el círculo máximo entre dos sitios, levantado sobre la superficie (`altura` en la mitad, en radios de la
 * Tierra), como los vuelos en un mapa: interpolación esférica de los dos vectores y una joroba de seno.
 */
export function arcoGeodesico(a: Coordenadas, b: Coordenadas, n = 48, altura?: number): Vec3[] {
  const p = aEsfera(a.lat, a.lon)
  const q = aEsfera(b.lat, b.lon)
  const coseno = Math.min(1, Math.max(-1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]))
  const angulo = Math.acos(coseno)
  const alto = altura ?? Math.min(0.35, 0.06 + angulo * 0.12)
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const sa = angulo < 1e-6 ? 1 - t : Math.sin((1 - t) * angulo) / Math.sin(angulo)
    const sb = angulo < 1e-6 ? t : Math.sin(t * angulo) / Math.sin(angulo)
    const r = 1 + Math.sin(Math.PI * t) * alto
    return [(sa * p[0] + sb * q[0]) * r, (sa * p[1] + sb * q[1]) * r, (sa * p[2] + sb * q[2]) * r] as Vec3
  })
}

/** Dirección desde la que mirar el globo para ver a la vez la sede y los sitios de fuera (su media en la esfera). */
export function direccionDeVista(lugares: readonly Coordenadas[]): Vec3 {
  const suma = lugares.map((l) => aEsfera(l.lat, l.lon)).reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]] as Vec3, [0, 0, 0] as Vec3)
  const n = Math.hypot(...suma)
  if (n < 1e-6) return lugares[0] ? aEsfera(lugares[0].lat, lugares[0].lon) : [0, 0, 1]
  // un poco desde el norte, para que los arcos se vean en curva y no de canto
  const v: Vec3 = [suma[0] / n, suma[1] / n + 0.12, suma[2] / n]
  const m = Math.hypot(...v)
  return [v[0] / m, v[1] / m, v[2] / m]
}

/** Coordenadas del mapamundi (listas planas lon, lat) como segmentos sobre la esfera, a radio `r`. */
export function segmentosEnEsfera(lineas: readonly (readonly number[])[], r = 1.0015): Float32Array {
  const salida: number[] = []
  for (const l of lineas) {
    for (let i = 2; i + 1 < l.length; i += 2) salida.push(...aEsfera(l[i - 1], l[i - 2], r), ...aEsfera(l[i + 1], l[i], r))
  }
  return new Float32Array(salida)
}

/** Paralelos y meridianos cada `paso` grados, como segmentos sobre la esfera. */
export function reticula(paso = 15, r = 1.001): Float32Array {
  const lineas: number[][] = []
  for (let lat = -90 + paso; lat < 90; lat += paso) lineas.push(Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]).flat())
  for (let lon = -180; lon < 180; lon += paso) lineas.push(Array.from({ length: 37 }, (_, i) => [lon, -90 + i * 5]).flat())
  return segmentosEnEsfera(lineas, r)
}
