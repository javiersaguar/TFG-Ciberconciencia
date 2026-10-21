import { describe, expect, it } from 'vitest'

import { CONTENIDO_MINIMO_EMPUJE, empujaContenido } from './estado'

describe('el panel del Copiloto empuja el contenido solo si le deja sitio', () => {
  it('a 1440 px con la barra lateral abierta se superpone: empujar dejaría unos 800 px y las tablas se cortarían', () => {
    expect(empujaContenido(1440, 240, 400)).toBe(false)
  })

  it('a 1920 px empuja: quedan 1280 px de contenido', () => {
    expect(empujaContenido(1920, 240, 400)).toBe(true)
  })

  it('el límite es exactamente el mínimo declarado, y un panel más ancho deja de empujar', () => {
    expect(empujaContenido(240 + 400 + CONTENIDO_MINIMO_EMPUJE, 240, 400)).toBe(true)
    expect(empujaContenido(240 + 400 + CONTENIDO_MINIMO_EMPUJE - 1, 240, 400)).toBe(false)
    expect(empujaContenido(1920, 240, 860)).toBe(false)
  })

  it('con la barra lateral cerrada hay más sitio', () => {
    expect(empujaContenido(1440, 56, 380)).toBe(true)
  })
})
