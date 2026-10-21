import { describe, expect, it } from 'vitest'

import { aFilas, colorPorUmbral, corto, describirPeriodo, formatear } from './formatoUnidad'

describe('formato de unidades', () => {
  it('los recuentos enteros van exactos y las magnitudes continuas, abreviadas', () => {
    expect(formatear(530_401, 'short')).toBe('530.401')
    expect(formatear(1_184, 'short')).toBe('1.184')
    expect(formatear(530_401, 'short', true)).toBe('530,4 mil')
    expect(formatear(2.37, 'short')).toBe('2,4')
    expect(corto(0)).toBe('0')
  })

  it('porcentajes, bytes, duraciones y peticiones por segundo', () => {
    expect(formatear(99.1, 'percent')).toBe('99,1 %')
    expect(formatear(0.183, 'percentunit')).toBe('18,3 %')
    expect(formatear(1536, 'bytes')).toBe('1,5 KiB')
    expect(formatear(2048, 'Bps')).toBe('2 KiB/s')
    expect(formatear(516, 's')).toBe('8 min 36 s')
    expect(formatear(2.4, 'reqps')).toBe('2,4/s')
    expect(formatear(25.2, 'decimal1')).toBe('25,2')
    expect(formatear(null, 'short')).toBe('—')
  })

  it('colorea por el último umbral que el valor alcanza', () => {
    const panel = { color: null, umbrales: [{ color: 'red', desde: null }, { color: 'orange', desde: 90 }, { color: 'green', desde: 97 }] }
    expect(colorPorUmbral(panel, 50)).toBe('var(--graf-rojo)')
    expect(colorPorUmbral(panel, 95)).toBe('var(--graf-naranja)')
    expect(colorPorUmbral(panel, 99.36)).toBe('var(--graf-verde)')
    expect(colorPorUmbral({ color: 'orange', umbrales: [] }, 1)).toBe('var(--graf-naranja)')
  })

  it('junta varias series en filas por instante', () => {
    const filas = aFilas([
      { nombre: 'a', puntos: [[20, 2], [10, 1]] },
      { nombre: 'b', puntos: [[10, 5]] },
    ])
    expect(filas).toEqual([{ t: 10, a: 1, b: 5 }, { t: 20, a: 2 }])
  })

  it('describe el periodo', () => {
    expect(describirPeriodo('30m')).toBe('últimos 30 min')
    expect(describirPeriodo('corpus F3')).toBe('corpus F3')
  })
})
