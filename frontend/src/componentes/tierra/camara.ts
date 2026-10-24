/**
 * Reglas de cámara compartidas por los globos 3D del portal (mapa mundial de alertas y «Mundo» de conciencia
 * situacional), sin three.js para poder probarlas.
 *
 * Decisión de Javier (24-10-2026): los globos GIRAN SOLOS en todo momento, salvo cuando hay algo que mirar (una traza
 * elegida o, en el mapa mundial, un país filtrado). Si se mueven a mano, el giro espera a que se suelten y retoma al
 * poco; con movimiento reducido, nunca giran solos.
 */
import { aEsfera, type Coordenadas, type Vec3 } from './esfera'

/** Tras soltar el globo (o pulsar una flecha), cuánto espera el giro automático antes de volver. */
export const REANUDAR_GIRO_MS = 4000

export interface EstadoGiro {
  /** Gira por defecto (no hay traza elegida ni país filtrado). */
  activo: boolean
  reducido: boolean
  /** La cámara va de camino a un encuadre. */
  enTransicion: boolean
  /** Se está arrastrando ahora mismo. */
  tocando: boolean
  /** Milisegundos desde el último toque (arrastre o flecha). */
  msDesdeToque: number
}

export function debeGirar(e: EstadoGiro): boolean {
  return e.activo && !e.reducido && !e.enTransicion && !e.tocando && e.msDesdeToque >= REANUDAR_GIRO_MS
}

const normalizar = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v) || 1
  return [v[0] / n, v[1] / n, v[2] / n]
}
const cruz = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** Grados que la vista se ladea respecto al plano de la traza, para ver la curva del arco y no su canto. */
export const LADEO_TRAZA = 18

/**
 * Desde dónde mirar una traza para que se vean lo mejor posible su origen y su destino: por encima del punto medio
 * del círculo máximo, un poco ladeado (hacia el norte) para que el arco se vea curvo, y a la distancia justa para que
 * quepan los dos extremos: cerca si están próximos, lejos si están en lados opuestos del mundo.
 *
 * `fov` es el campo de visión vertical de la cámara, en grados (el más estrecho de los dos en un lienzo apaisado).
 */
export function encuadrarTraza(a: Coordenadas, b: Coordenadas, fov = 30, limites: [number, number] = [2.3, 4.4]): { direccion: Vec3; distancia: number } {
  const p = aEsfera(a.lat, a.lon)
  const q = aEsfera(b.lat, b.lon)
  const suma: Vec3 = [p[0] + q[0], p[1] + q[1], p[2] + q[2]]
  // casi en las antípodas el punto medio no está definido: se toma uno a 90° de los dos
  const medio = Math.hypot(...suma) > 1e-6 ? normalizar(suma) : normalizar(cruz(p, [0, 1, 0]))
  let normal = cruz(p, q)
  if (Math.hypot(...normal) < 1e-9) normal = cruz(medio, [1, 0, 0])
  normal = normalizar(normal)
  if (normal[1] < 0) normal = [-normal[0], -normal[1], -normal[2]]
  const l = (LADEO_TRAZA * Math.PI) / 180
  const direccion = normalizar([medio[0] * Math.cos(l) + normal[0] * Math.sin(l), medio[1] * Math.cos(l) + normal[1] * Math.sin(l), medio[2] * Math.cos(l) + normal[2] * Math.sin(l)])
  // medio ángulo entre los extremos: a esa distancia del centro de la vista quedan, más el margen del arco
  const mitad = Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]))) / 2
  const necesaria = Math.cos(mitad) + (1.35 * Math.sin(mitad) + 0.12) / Math.tan(((fov / 2) * Math.PI) / 180)
  return { direccion, distancia: Math.max(limites[0], Math.min(limites[1], necesaria)) }
}
