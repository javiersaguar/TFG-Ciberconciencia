import { describe, expect, it } from 'vitest'

import { aEsfera, type Vec3 } from '@/componentes/tierra/esfera'

import { centroDePais, girarVista, LATITUD_MAXIMA, paisesPorCodigo, pintarPaises, quedaDetras } from './vistaGlobo'

const latLon = (v: Vec3) => {
  const r = Math.hypot(...v)
  return { lat: (Math.asin(v[1] / r) * 180) / Math.PI, lon: (Math.atan2(v[0], v[2]) * 180) / Math.PI, r }
}

describe('países del globo', () => {
  it('encuentra los mismos polígonos que el mapa 2D por su código, sin repetir ni inventar', () => {
    expect(paisesPorCodigo(['ESP', 'USA', 'ESP']).map((p) => p.properties.codigo)).toEqual(['ESP', 'USA'])
    expect(paisesPorCodigo(['XXX', ''])).toEqual([])
  })

  it('centra cada país en su parte principal, no en territorios lejanos', () => {
    const espana = centroDePais('ESP')!
    expect(espana.lat).toBeGreaterThan(36)
    expect(espana.lat).toBeLessThan(44)
    expect(espana.lon).toBeGreaterThan(-10)
    expect(espana.lon).toBeLessThan(4)
    // Francia sin la Guayana; Estados Unidos sin Alaska
    const francia = centroDePais('FRA')!
    expect(francia.lon).toBeGreaterThan(-5)
    expect(francia.lat).toBeGreaterThan(42)
    const eeuu = centroDePais('USA')!
    expect(eeuu.lon).toBeGreaterThan(-125)
    expect(eeuu.lon).toBeLessThan(-65)
    expect(centroDePais('XXX')).toBeNull()
  })

  it('pinta cada país con relleno y contorno, sin dejar el contexto cambiado', () => {
    const llamadas: string[] = []
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_, clave: string) => (...args: unknown[]) => { llamadas.push(clave); return args },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D
    pintarPaises(ctx, 2048, paisesPorCodigo(['ESP', 'JPN']), '#345f9e')
    expect(llamadas.filter((l) => l === 'fill')).toHaveLength(2)
    expect(llamadas.filter((l) => l === 'stroke')).toHaveLength(2)
    expect(llamadas[0]).toBe('save')
    expect(llamadas.at(-1)).toBe('restore')
  })
})

describe('flechas del globo', () => {
  const inicio = aEsfera(20, 10, 4.4)

  it('cada flecha mueve la vista 20° en su sentido y conserva la distancia', () => {
    const casos = [
      ['arriba', 40, 10],
      ['abajo', 0, 10],
      ['izquierda', 20, -10],
      ['derecha', 20, 30],
    ] as const
    for (const [sentido, lat, lon] of casos) {
      const v = latLon(girarVista(inicio, sentido))
      expect(v.lat, sentido).toBeCloseTo(lat, 6)
      expect(v.lon, sentido).toBeCloseTo(lon, 6)
      expect(v.r, sentido).toBeCloseTo(4.4, 6)
    }
  })

  it('no pasa por encima de los polos y da la vuelta por el antimeridiano', () => {
    let v: Vec3 = inicio
    for (let i = 0; i < 10; i++) v = girarVista(v, 'arriba')
    expect(latLon(v).lat).toBeCloseTo(LATITUD_MAXIMA, 6)
    const este = latLon(girarVista(aEsfera(0, 170, 2), 'derecha'))
    expect(este.lon).toBeCloseTo(-170, 6)
  })
})

describe('qué queda detrás del globo', () => {
  const camara = aEsfera(30, 0, 4.4)
  it('no gira si lo elegido se ve y sí si algún extremo queda a espaldas', () => {
    expect(quedaDetras(camara, [aEsfera(40, -4), aEsfera(50, 10)])).toBe(false)
    expect(quedaDetras(camara, [aEsfera(40, -4), aEsfera(-34, 151)])).toBe(true)
  })
})
