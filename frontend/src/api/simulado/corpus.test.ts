import { describe, expect, it } from 'vitest'

import { CAMPANAS, CORPUS, DATASETS, DAY1, DLQ_POR_TIPO, EVENTOS_LSASS_SIN_REPARTO, P2, TOPICS } from './corpus'

const suma = (valores: readonly number[]) => valores.reduce((total, v) => total + v, 0)

describe('las cifras documentadas cuadran entre sí', () => {
  it('las alertas por dataset suman las 1.184 del corpus', () => {
    expect(suma(DATASETS.map((d) => d.alertas))).toBe(CORPUS.alertas)
  })

  it('los eventos por dataset (con el bloque LSASS sin reparto) suman los 530.401', () => {
    const conocidos = suma(DATASETS.map((d) => d.eventos ?? 0))
    expect(conocidos + EVENTOS_LSASS_SIN_REPARTO).toBe(CORPUS.eventosNormalizados)
  })

  it('consumidos = normalizados + DLQ, y la DLQ por tipo suma la DLQ', () => {
    expect(CORPUS.eventosNormalizados + CORPUS.eventosDlq).toBe(CORPUS.lineasConsumidas)
    expect(suma(DLQ_POR_TIPO.map((t) => t.eventos))).toBe(CORPUS.eventosDlq)
  })

  it('las campañas son 11 de P1 y 1 de P2', () => {
    expect(CAMPANAS.filter((c) => c.patron === 'P1')).toHaveLength(CORPUS.campanasP1)
    expect(CAMPANAS.filter((c) => c.patron === 'P2')).toHaveLength(CORPUS.campanasP2)
  })

  it('las alertas absorbidas por P1, restando las contadas dos veces, son las 1.164 distintas', () => {
    const p1 = suma(CAMPANAS.filter((c) => c.patron === 'P1').map((c) => c.alertas))
    expect(p1 - CORPUS.alertasContadasDosVeces).toBe(CORPUS.alertasAbsorbidas)
  })

  it('la cobertura de day1 es la documentada y P2 reparte sus 17 aristas por puerto', () => {
    expect((DAY1.eventos / DAY1.lineas) * 100).toBeCloseTo(DAY1.coberturaPct, 1)
    expect(suma(P2.porPuerto.map((p) => p.conexiones))).toBe(P2.aristas)
    expect(DAY1.tiempoUtcTimePct + DAY1.tiempoEventTimePct).toBeCloseTo(100)
  })

  it('las particiones de los topics suman 17', () => {
    expect(suma(TOPICS.map((t) => t.particiones))).toBe(17)
  })
})
