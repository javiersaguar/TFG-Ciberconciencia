import { describe, expect, it } from 'vitest'

import { debeGirar, encuadrarTraza, REANUDAR_GIRO_MS, type EstadoGiro } from './camara'
import { aEsfera, type Vec3 } from './esfera'

const punto = (v: Vec3, w: Vec3) => v[0] * w[0] + v[1] * w[1] + v[2] * w[2]

describe('giro automático de los globos', () => {
  const base: EstadoGiro = { activo: true, reducido: false, enTransicion: false, tocando: false, msDesdeToque: Infinity }

  it('gira por defecto', () => {
    expect(debeGirar(base)).toBe(true)
  })

  it('no gira con algo que mirar, con movimiento reducido, de camino a un encuadre ni mientras se toca', () => {
    expect(debeGirar({ ...base, activo: false })).toBe(false)
    expect(debeGirar({ ...base, reducido: true })).toBe(false)
    expect(debeGirar({ ...base, enTransicion: true })).toBe(false)
    expect(debeGirar({ ...base, tocando: true })).toBe(false)
  })

  it('tras moverlo a mano, espera un poco y vuelve a girar', () => {
    expect(debeGirar({ ...base, msDesdeToque: 500 })).toBe(false)
    expect(debeGirar({ ...base, msDesdeToque: REANUDAR_GIRO_MS })).toBe(true)
  })
})

describe('encuadre de una traza', () => {
  const madrid = { lat: 40.42, lon: -3.7 }
  const barcelona = { lat: 41.39, lon: 2.17 }
  const tokio = { lat: 35.68, lon: 139.69 }
  const sidney = { lat: -33.87, lon: 151.21 }
  const sanFrancisco = { lat: 37.77, lon: -122.42 }

  it('mira desde encima de la traza: los dos extremos quedan de cara', () => {
    for (const [a, b] of [[madrid, tokio], [sidney, sanFrancisco], [madrid, barcelona]] as const) {
      const { direccion } = encuadrarTraza(a, b)
      expect(Math.hypot(...direccion)).toBeCloseTo(1, 9)
      expect(punto(direccion, aEsfera(a.lat, a.lon))).toBeGreaterThan(0.2)
      expect(punto(direccion, aEsfera(b.lat, b.lon))).toBeGreaterThan(0.2)
    }
  })

  it('se acerca a las trazas cortas y se aleja con las largas, dentro de sus límites', () => {
    const corta = encuadrarTraza(madrid, barcelona).distancia
    const larga = encuadrarTraza(madrid, tokio).distancia
    expect(corta).toBeLessThan(larga)
    expect(corta).toBeGreaterThanOrEqual(2.3)
    expect(larga).toBeLessThanOrEqual(4.4)
  })

  it('ladea la vista hacia el norte para ver la curva del arco, no su canto', () => {
    const { direccion } = encuadrarTraza(madrid, tokio)
    const medio = aEsfera(48, 70)
    expect(direccion[1]).toBeGreaterThan(0)
    expect(punto(direccion, medio)).toBeLessThan(1)
  })

  it('no se rompe con extremos iguales o en las antípodas', () => {
    for (const [a, b] of [[madrid, madrid], [{ lat: 0, lon: 0 }, { lat: 0, lon: 180 }]] as const) {
      const { direccion, distancia } = encuadrarTraza(a, b)
      expect(direccion.every(Number.isFinite)).toBe(true)
      expect(Number.isFinite(distancia)).toBe(true)
    }
  })
})
