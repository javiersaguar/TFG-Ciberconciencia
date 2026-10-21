import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import ML1 from '@/api/datos/ml1-resultados.json'
import { construirEvaluacion } from '@/api/simulado/evaluacion'
import { renderizarRutas } from '@/pruebas/utilidades'

const evaluacion = construirEvaluacion()

describe('evaluación (datos)', () => {
  it('copia ML-1 tal cual del fichero de resultados, con el control de volumen marcado como tal', () => {
    expect(evaluacion.ml1.resultados).toHaveLength(ML1.resultados.length)
    const porClave = Object.fromEntries(evaluacion.ml1.resultados.map((r) => [r.clave, r]))
    expect(porClave.A.aucRoc).toBe(0.995)
    expect(porClave.E).toMatchObject({ aucRoc: 0.941, papel: 'control', nFeatures: 1 })
    expect(porClave.F.aucRoc).toBe(0.867)
    expect(new Set(evaluacion.ml1.resultados.map((r) => r.muestras))).toEqual(new Set([28]))
  })

  it('lo no medido no lleva ningún número', () => {
    for (const p of evaluacion.pendientes) {
      expect(p).not.toHaveProperty('valor')
      expect(Object.values(p).every((v) => typeof v === 'string')).toBe(true)
      expect(`${p.metrica} ${p.como}`).not.toMatch(/%|0,\d/)
    }
    expect(evaluacion.pendientes.map((p) => p.metrica).join(' ')).toMatch(/precision.*F1.*Falsos positivos.*Latencia/s)
  })

  it('la reducción de P1 lleva su advertencia de no comparabilidad', () => {
    expect(evaluacion.medidas.find((m) => m.clave === 'reduccion-p1')?.advertencia).toMatch(/No es comparable con la línea base/)
  })
})

describe('página de evaluación', () => {
  it('enseña el 0,995 junto al control de 0,941, el aviso de las 28 ventanas y lo pendiente', async () => {
    renderizarRutas('/evaluacion')
    const tabla = await screen.findByRole('table', { name: 'Resultados de ML-1 por estrategia' })
    expect(within(tabla).getAllByText('0,995').length).toBeGreaterThan(0)
    expect(within(tabla).getByText('0,941')).toBeInTheDocument()
    expect(screen.getByText(/28 ventanas/)).toBeInTheDocument()
    expect(screen.getAllByText('pendiente (F7)').length).toBeGreaterThan(0)
    expect(screen.getByRole('listitem', { name: 'Variantes LSASS detectadas por P1' })).toHaveTextContent('7 de 7')
  })
})
