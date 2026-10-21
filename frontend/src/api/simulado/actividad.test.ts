import { describe, expect, it } from 'vitest'

import { cargarAlertasDay1, type AlertaDay1 } from '../exportaciones'
import actividadPorMinuto from '../datos/actividad-por-minuto.json'
import severidad from '../datos/severidad.json'
import tacticasPorHost from '../datos/tacticas-por-host.json'
import { alertasPorMinuto, mapaTacticaHost, repartoPorNivel } from './actividad'

const alertas = await cargarAlertasDay1()

describe('agregados de APT29 day1', () => {
  it('por minuto: un hueco por minuto de 02:56 a 03:23 y ninguna alerta perdida', () => {
    const minutos = alertasPorMinuto(alertas)
    expect(minutos).toHaveLength(28)
    expect(minutos[0].minuto).toBe('02:56')
    expect(minutos.at(-1)!.minuto).toBe('03:23')
    expect(minutos.reduce((s, m) => s + m.total, 0)).toBe(741)
    for (const m of minutos) expect(Object.values(m.porNivel).reduce((s, x) => s + x, 0)).toBe(m.total)
  })

  it('por severidad: los cuatro niveles reales con sus cifras documentadas', () => {
    expect(repartoPorNivel(alertas)).toEqual([
      { nivel: 'high', alertas: 263 },
      { nivel: 'medium', alertas: 413 },
      { nivel: 'low', alertas: 55 },
      { nivel: 'informational', alertas: 10 },
    ])
  })

  it('mapa táctica × host: cuenta cada táctica de cada alerta y separa las que no llevan ninguna', () => {
    const mapa = mapaTacticaHost(alertas)
    const conTactica = alertas.filter((a) => a.tacticas.length > 0)
    expect(mapa.celdas.flat().reduce((s, x) => s + x, 0)).toBe(conTactica.reduce((s, a) => s + a.tacticas.length, 0))
    expect(mapa.sinTactica.reduce((s, x) => s + x, 0)).toBe(alertas.length - conTactica.length)
    const totales = mapa.celdas.map((f) => f.reduce((s, x) => s + x, 0))
    expect([...totales].sort((a, b) => b - a)).toEqual(totales)
    for (const t of mapa.tacticas) expect(t).not.toMatch(/^TA\d{4}$/)
  })

  it('ignora lo que cae fuera de la ventana o de los hosts', () => {
    const rara = { ...alertas[0], ms: 0, host: 'OTRO' } as AlertaDay1
    expect(alertasPorMinuto([rara]).reduce((s, m) => s + m.total, 0)).toBe(0)
    expect(mapaTacticaHost([rara]).maximo).toBe(0)
  })
})

describe('agregados precalculados al sincronizar (los que carga la portada)', () => {
  it('son exactamente los que se calculaban en el navegador con las 741 alertas', () => {
    expect(actividadPorMinuto).toEqual(alertasPorMinuto(alertas))
    expect(severidad).toEqual(repartoPorNivel(alertas))
    expect(tacticasPorHost).toEqual(mapaTacticaHost(alertas))
  })
})
