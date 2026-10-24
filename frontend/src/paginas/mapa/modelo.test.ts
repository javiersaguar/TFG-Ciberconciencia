import { describe, expect, it } from 'vitest'

import { MAPA_DEMO } from '@/api/simulado/mapa'

import { acotarVista, ALTO, ANCHO, interpolarRuta, PAISES, proyeccion, rutaGeografica } from './geografia'
import { alertasEnVentana, filtrarAlertas, INICIO_MS, nivelValido, resumirAlertas, VENTANA_MS } from './modelo'

describe('flujo geográfico ilustrativo', () => {
  it('preserva identidad, extremos y orden del flujo al avanzar el reloj', () => {
    const antes = alertasEnVentana(MAPA_DEMO, INICIO_MS)
    const despues = alertasEnVentana(MAPA_DEMO, INICIO_MS + MAPA_DEMO.intervaloMs)
    expect(despues.slice(1)).toEqual(antes)
    expect(new Set(despues.map((a) => a.id)).size).toBe(despues.length)
    for (const a of despues) {
      expect(a.origen).toBe(a.desde.id)
      expect(a.destino).toBe(a.hasta.id)
      expect(a.instanteMs).toBeLessThanOrEqual(INICIO_MS + MAPA_DEMO.intervaloMs)
    }
  })

  it('mantiene acotada la ventana incluso tras muchas horas de reproducción', () => {
    for (const tiempo of [0, INICIO_MS, VENTANA_MS, 72 * 3600_000]) {
      const alertas = alertasEnVentana(MAPA_DEMO, tiempo)
      expect(alertas.length).toBeLessThanOrEqual(Math.ceil(VENTANA_MS / MAPA_DEMO.intervaloMs))
      expect(alertas.every((a) => a.instanteMs <= tiempo && a.instanteMs > tiempo - VENTANA_MS)).toBe(true)
    }
    expect(alertasEnVentana(MAPA_DEMO, Number.POSITIVE_INFINITY)).toEqual([])
    expect(alertasEnVentana(MAPA_DEMO, -1)).toEqual([])
  })

  it('filtra por los dos extremos y por nivel, y calcula sus indicadores con ese mismo alcance', () => {
    const alertas = alertasEnVentana(MAPA_DEMO, 60_000)
    const seleccion = filtrarAlertas(alertas, 'critical', 'ESP')
    expect(seleccion.length).toBeGreaterThan(0)
    expect(seleccion.every((a) => a.nivel === 'critical' && (a.desde.codigoPais === 'ESP' || a.hasta.codigoPais === 'ESP'))).toBe(true)
    expect(seleccion.some((a) => a.desde.id === 'madrid')).toBe(true)
    expect(resumirAlertas(seleccion)).toEqual({ total: seleccion.length, prioritarias: seleccion.length, origenes: 1, destinos: 2 })
    expect(filtrarAlertas(alertas, 'todos', 'NO-EXISTE')).toEqual([])
  })

  it('rechaza parámetros arbitrarios y mantiene marcada la procedencia de la demo', () => {
    expect(nivelValido('critical')).toBe('critical')
    expect(nivelValido('<script>')).toBe('todos')
    expect(MAPA_DEMO.procedencia).toBe('ilustrativa')
    for (const ubicacion of MAPA_DEMO.ubicaciones) {
      const [longitud, latitud] = ubicacion.coordenadas
      expect(Math.abs(longitud)).toBeLessThanOrEqual(180)
      expect(Math.abs(latitud)).toBeLessThanOrEqual(90)
    }
  })
})

describe('geografía del mapa', () => {
  it('incluye cartografía mundial y coloca la partícula exactamente en sus extremos', () => {
    expect(PAISES.length).toBeGreaterThan(170)
    const a = alertasEnVentana(MAPA_DEMO, INICIO_MS)[0]
    const punto = interpolarRuta(a.desde, a.hasta)
    expect(punto(0)[0]).toBeCloseTo(proyeccion(a.desde.coordenadas)![0])
    expect(punto(1)[1]).toBeCloseTo(proyeccion(a.hasta.coordenadas)![1])
    expect(rutaGeografica(a.desde, a.hasta)).not.toMatch(/NaN|Infinity/)
  })

  it('recorta el salto del Pacífico en el antimeridiano en lugar de cruzar Europa', () => {
    const desde = MAPA_DEMO.ubicaciones.find((u) => u.id === 'san-francisco')!
    const hasta = MAPA_DEMO.ubicaciones.find((u) => u.id === 'sidney')!
    const trazo = rutaGeografica(desde, hasta)
    expect(trazo.match(/M/g)?.length).toBe(2)
    const mitad = interpolarRuta(desde, hasta)(0.5)
    expect(mitad[0] < ANCHO * 0.2 || mitad[0] > ANCHO * 0.8).toBe(true)
  })

  it('limita zoom y arrastre a los bordes del mundo y permite volver al encuadre inicial', () => {
    expect(acotarVista({ escala: 0, x: 100, y: 80 })).toEqual({ escala: 1, x: 0, y: 0 })
    expect(acotarVista({ escala: 4, x: 10_000, y: -10_000 })).toEqual({ escala: 3, x: ANCHO, y: -ALTO })
  })
})
