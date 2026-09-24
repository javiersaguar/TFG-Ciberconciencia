import { describe, expect, it } from 'vitest'

import { DAY1 } from '@/api/simulado/corpus'

import { claveArista, describirReplay, estadoReplay, flujosDe, REPLAY_PARADO } from './actividad'
import { ARISTAS, NODOS } from './nodos'

describe('replay simulado de apt29 day1', () => {
  it('llega exactamente a los totales medidos', () => {
    const final = estadoReplay(1)
    expect(final).toMatchObject({ lineas: DAY1.lineas, eventos: DAY1.eventos, alertas: DAY1.alertas, campanasP1: 3, campanasP2: 1, enMarcha: false })
    expect(final.dlq).toBe(DAY1.lineas - DAY1.eventos)
  })

  it('no sale de [0, 1] y las cifras nunca bajan al avanzar', () => {
    expect(estadoReplay(-1).progreso).toBe(0)
    expect(estadoReplay(7).progreso).toBe(1)
    let anterior = estadoReplay(0)
    for (let p = 0.05; p <= 1; p += 0.05) {
      const actual = estadoReplay(p)
      for (const clave of ['lineas', 'eventos', 'dlq', 'alertas', 'campanasP1', 'campanasP2'] as const) {
        expect(actual[clave]).toBeGreaterThanOrEqual(anterior[clave])
      }
      anterior = actual
    }
  })

  it('parado no ilumina nada; en marcha ilumina solo aristas y piezas que existen', () => {
    expect(flujosDe(REPLAY_PARADO).aristas.size).toBe(0)
    const flujos = flujosDe(estadoReplay(0.5))
    const aristas = new Set(ARISTAS.map((a) => claveArista(a.desde, a.hasta)))
    const nodos = new Set(NODOS.map((n) => n.id))
    expect(flujos.aristas.size).toBeGreaterThan(0)
    for (const clave of flujos.aristas.keys()) expect(aristas.has(clave), clave).toBe(true)
    for (const id of flujos.nodos.keys()) expect(nodos.has(id), id).toBe(true)
  })

  it('nunca ilumina un tramo de una fase futura', () => {
    const planificadas = new Set(NODOS.filter((n) => n.estado === 'planificada').map((n) => n.id))
    for (const flujo of flujosDe(estadoReplay(0.9)).aristas.values()) {
      expect(planificadas.has(flujo.desde) || planificadas.has(flujo.hasta)).toBe(false)
    }
  })

  it('describe el estado en una frase', () => {
    expect(describirReplay(REPLAY_PARADO)).toBe('Sin procesos en marcha')
    expect(describirReplay(estadoReplay(0.42))).toBe('Replay de apt29 day1 al 42 %')
    expect(describirReplay(estadoReplay(1))).toBe('Replay terminado: 194.829 eventos, 741 alertas, 3 campañas de P1 y 1 de P2')
  })
})

describe('coherencia del grafo', () => {
  it('toda arista une dos piezas existentes y ninguna se repite', () => {
    const ids = new Set(NODOS.map((n) => n.id))
    for (const arista of ARISTAS) {
      expect(ids.has(arista.desde), arista.desde).toBe(true)
      expect(ids.has(arista.hasta), arista.hasta).toBe(true)
    }
    expect(new Set(ARISTAS.map((a) => claveArista(a.desde, a.hasta))).size).toBe(ARISTAS.length)
    expect(ids.size).toBe(NODOS.length)
  })
})
