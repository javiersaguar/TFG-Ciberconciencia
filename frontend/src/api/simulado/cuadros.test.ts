import { describe, expect, it } from 'vitest'

import { construirCuadro, RESUMENES } from './cuadros'

const AHORA = Date.UTC(2026, 8, 23, 10, 0, 0)

describe('cuadros simulados', () => {
  it.each(RESUMENES.map((r) => r.uid))('%s: los paneles caben en la rejilla de 24 columnas y no se pisan', (uid) => {
    const cuadro = construirCuadro(uid, AHORA)
    const ocupadas = new Map<string, number>()
    for (const panel of cuadro.paneles) {
      expect(panel.x).toBeGreaterThanOrEqual(0)
      expect(panel.x + panel.ancho).toBeLessThanOrEqual(24)
      for (let x = panel.x; x < panel.x + panel.ancho; x += 1) {
        for (let y = panel.y; y < panel.y + panel.alto; y += 1) {
          const celda = `${x},${y}`
          expect(ocupadas.get(celda), `el panel ${panel.id} pisa al ${ocupadas.get(celda)} en ${celda}`).toBeUndefined()
          ocupadas.set(celda, panel.id)
        }
      }
    }
  })

  it.each(RESUMENES.map((r) => r.uid))('%s: identificadores únicos y todo panel dice de dónde sale su cifra', (uid) => {
    const { paneles } = construirCuadro(uid, AHORA)
    expect(new Set(paneles.map((p) => p.id)).size).toBe(paneles.length)
    for (const panel of paneles.filter((p) => p.tipo !== 'fila')) {
      expect(panel.procedencia, `panel «${panel.titulo}»`).toBeDefined()
      if (panel.procedencia === 'documentada') expect(panel.fuente, `panel «${panel.titulo}»`).toBeTruthy()
    }
  })

  it('las series ilustrativas son deterministas y avanzan con el reloj', () => {
    const serie = (ahora: number) => construirCuadro('tfg-pipeline-health', ahora).paneles.find((p) => p.id === 4)!.series![0].puntos
    expect(serie(AHORA)).toEqual(serie(AHORA))
    const despues = serie(AHORA + 60_000)
    // dos puntos nuevos al final; los que se repiten conservan su valor
    expect(despues.at(-1)![0] - serie(AHORA).at(-1)![0]).toBe(60)
    expect(despues[0]).toEqual(serie(AHORA)[2])
  })

  it('un uid desconocido es un error, no un cuadro vacío', () => {
    expect(() => construirCuadro('no-existe', AHORA)).toThrow(/no-existe/)
  })
})
