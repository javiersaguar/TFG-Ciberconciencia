import { describe, expect, it } from 'vitest'

import { aEsfera, arcoGeodesico, conexiones, direccionDeVista, ladosDeEtiqueta, resumenMundo, segmentosEnEsfera, sitiosDeFuera } from './globo'
import { DMEVALS } from './organizaciones/dmevals'
import { HELIOS } from './organizaciones/helios'
import { duracionEscenario, evaluar } from './simulacion'

describe('el mundo de la demo', () => {
  it('en Helios, al final: el phishing entra desde Ámsterdam, el C2 sale a Fráncfort y la exfiltración a Virginia', () => {
    const cs = conexiones(HELIOS, evaluar(HELIOS, duracionEscenario(HELIOS)))
    expect(cs.map((c) => [c.paso.id, c.sentido, c.sentido === 'entrada' ? c.desde.nombre : c.hasta.nombre])).toEqual([
      ['h1', 'entrada', 'Ámsterdam'],
      ['h3', 'salida', 'Fráncfort'],
      ['h12', 'salida', 'Ashburn (Virginia)'],
    ])
    expect(cs.filter((c) => c.ultimo).map((c) => c.paso.id)).toEqual(['h12'])
    expect(sitiosDeFuera(cs)).toHaveLength(3)
  })

  it('antes del ataque no hay conexiones, y solo aparecen las que ya llegaron', () => {
    expect(conexiones(HELIOS, evaluar(HELIOS, 0))).toEqual([])
    expect(conexiones(HELIOS, evaluar(HELIOS, 14)).map((c) => c.paso.id)).toEqual(['h1', 'h3'])
  })

  it('en DMEVALS, la exfiltración por el canal del implante (T1041) va al servidor de C2, no al destino de la otra', () => {
    const cs = conexiones(DMEVALS, evaluar(DMEVALS, duracionEscenario(DMEVALS)))
    const porId = Object.fromEntries(cs.map((c) => [c.paso.id, c]))
    expect(porId.d5.hasta.nombre).toBe('Estocolmo')
    expect(porId.d14.hasta.nombre).toBe('Singapur')
    expect(porId.d1.desde.nombre).toBe('Estocolmo')
    // el mismo sitio con dos papeles cuenta una vez
    expect(sitiosDeFuera(cs).map((s) => s.nombre).sort()).toEqual(['Estocolmo', 'Singapur'])
  })

  it('los puntos de la Tierra están en la esfera unidad, con el norte arriba y el meridiano 0 hacia +z', () => {
    expect(aEsfera(0, 0)).toEqual([0, 0, 1])
    expect(aEsfera(90, 0)[1]).toBeCloseTo(1)
    expect(aEsfera(0, 90)[0]).toBeCloseTo(1)
    const v = aEsfera(40.6, -3.71)
    expect(Math.hypot(...v)).toBeCloseTo(1)
  })

  it('un arco empieza y acaba en sus sitios y se levanta en medio', () => {
    const geo = HELIOS.geografia!
    const arco = arcoGeodesico(geo.sede, geo.infraestructura.salida!)
    const a = aEsfera(geo.sede.lat, geo.sede.lon)
    arco[0].forEach((x, i) => expect(x).toBeCloseTo(a[i]))
    expect(Math.hypot(...arco[Math.floor(arco.length / 2)])).toBeGreaterThan(1.1)
  })

  it('la vista mira hacia los sitios, y el mapamundi da segmentos enteros sobre la esfera', () => {
    const geo = HELIOS.geografia!
    const d = direccionDeVista([geo.sede, geo.infraestructura.salida!])
    const sede = aEsfera(geo.sede.lat, geo.sede.lon)
    expect(d[0] * sede[0] + d[1] * sede[1] + d[2] * sede[2]).toBeGreaterThan(0.5)
    const segmentos = segmentosEnEsfera([[0, 0, 10, 0, 20, 0]])
    expect(segmentos.length).toBe(12)
  })

  it('el resumen dice que es ilustrativo y qué cruza la frontera', () => {
    const texto = resumenMundo(HELIOS, conexiones(HELIOS, evaluar(HELIOS, 14)))
    expect(texto).toContain('ilustrativas')
    expect(texto).toContain('Fráncfort')
  })

  it('las etiquetas de dos ciudades cercanas van a lados distintos; las lejanas, a la derecha', () => {
    const geo = HELIOS.geografia!
    const { correo, c2, salida } = geo.infraestructura
    expect(ladosDeEtiqueta([correo!, c2!, salida!, geo.sede])).toEqual(['derecha', 'izquierda', 'derecha', 'derecha'])
  })
})
