import { describe, expect, it } from 'vitest'

import { cargarAlertasDay1, cargarAristasP2, cargarCampanaP2, cargarCampanasP1, type AlertaDay1 } from '@/api/exportaciones'
import { construirIncidentes } from '@/api/simulado/incidentes'
import { HELIOS } from '@/paginas/conciencia/organizaciones/helios'
import { evaluar } from '@/paginas/conciencia/simulacion'

import { contextoDemo, contextoDmevals, verificarFragmento } from './nucleo'
import { detectarImpactoPrevio, detectarP1AMedias, detectarPasosSinPatron, detectarSinTecnica, senalesDmevals, UMBRALES } from './senales'

const [alertas, aristas, p1, p2] = await Promise.all([cargarAlertasDay1(), cargarAristasP2(), cargarCampanasP1(), cargarCampanaP2()])
const incidentes = construirIncidentes(p1, p2)
const contexto = contextoDmevals(alertas, aristas, incidentes)
const sinTecnica = alertas.filter((a) => a.tecnicas.length === 0)

describe('señales débiles con los tres casos reales de APT29 day1', () => {
  it('NASHUA: alertas de impact antes del salto lateral', () => {
    const [senal, ...resto] = detectarImpactoPrevio(alertas, aristas, incidentes)
    expect(resto).toEqual([])
    expect(senal).toMatchObject({ host: 'NASHUA', atencion: 'alta', procedencia: 'documentada' })
    // las dos de las 02:59:37,453 y la primera conexión desde SCRANTON (03:09:23,801)
    expect(senal.porque).toContain('2 alertas de impact')
    expect(senal.porque).toContain('02:59:37,453')
    expect(senal.porque).toContain('9 min 46 s antes')
    expect(senal.porque).toContain('03:09:23,801')
    expect(senal.porque).toContain('en todo el día son 3')
    expect(senal.citas).toHaveLength(3)
  })

  it('SCRANTON: concentración de alertas sin técnica en una ventana de 5 min', () => {
    const senales = detectarSinTecnica(alertas)
    expect(senales.map((s) => s.host)).toEqual(['SCRANTON'])
    const n = Number(/^(\d+) alertas sin técnica/.exec(senales[0].porque)![1])
    expect(n).toBeGreaterThanOrEqual(UMBRALES.sinTecnica.minimo)
    // la ventana es de verdad de 5 min y todas están en SCRANTON y sin técnica
    expect(n).toBeLessThanOrEqual(sinTecnica.filter((a) => a.host === 'SCRANTON').length)
    // NASHUA (8) y NEWYORK (4) no llegan al umbral
    expect(sinTecnica.filter((a) => a.host === 'NASHUA').length).toBeLessThan(UMBRALES.sinTecnica.minimo)
  })

  it('SCRANTON 03:10: la campaña P1 con una sola etapa de refuerzo', () => {
    const senales = detectarP1AMedias(incidentes)
    expect(senales).toHaveLength(1)
    expect(senales[0].porque).toContain('03:10:22')
    expect(senales[0].porque).toContain('2 accesos a LSASS')
    expect(senales[0].porque).toContain('confianza 0,65')
  })

  it('toda señal cita evidencia que existe en el Copiloto de esa organización', () => {
    for (const s of senalesDmevals({ alertas, aristas, incidentes })) {
      expect(verificarFragmento({ tipo: 'texto', bloque: 'senales', texto: s.porque, citas: s.citas }, contexto).tipo, s.id).toBe('texto')
    }
  })
})

describe('umbrales', () => {
  const base = alertas[0]
  const alerta = (ms: number, extra: Partial<AlertaDay1>): AlertaDay1 => ({ ...base, id: `x${ms}`, ms, ...extra })

  it('por debajo del umbral no hay aviso: un patrón que no sale de los datos no se enseña', () => {
    const pocas = Array.from({ length: UMBRALES.sinTecnica.minimo - 1 }, (_, i) => alerta(i * 1000, { host: 'UTICA', tecnicas: [] }))
    expect(detectarSinTecnica(pocas)).toEqual([])
    const una = [alerta(0, { host: 'NASHUA', tacticas: ['impact'] })]
    expect(detectarImpactoPrevio(una, aristas, incidentes)).toEqual([])
    expect(detectarImpactoPrevio(alertas, [], incidentes)).toEqual([])
  })

  it('alertas sin técnica repartidas en más de 5 min no cuentan como concentración', () => {
    const repartidas = Array.from({ length: 40 }, (_, i) => alerta(i * 60_000, { host: 'UTICA', tecnicas: [] }))
    // 40 alertas, una por minuto: en 5 min caben 5
    expect(detectarSinTecnica(repartidas)).toEqual([])
  })
})

describe('señal débil en la demo (tiempo real)', () => {
  it('aparece cuando un activo acumula pasos sin patrón, y nunca cita datos de DMEVALS', () => {
    expect(detectarPasosSinPatron(HELIOS, evaluar(HELIOS, 0))).toEqual([])
    const ev = evaluar(HELIOS, 10)
    const senales = detectarPasosSinPatron(HELIOS, ev)
    expect(senales.length).toBeGreaterThan(0)
    const demo = contextoDemo(HELIOS, 10)
    for (const s of senales) {
      expect(s.procedencia).toBe('ilustrativa')
      expect(s.citas.every((c) => c.id.startsWith('paso:'))).toBe(true)
      expect(verificarFragmento({ tipo: 'texto', bloque: 'senales', texto: s.porque, citas: s.citas }, demo).tipo).toBe('texto')
      // aislamiento: la misma señal no pasa la verificación con el contexto de DMEVALS
      expect(verificarFragmento({ tipo: 'texto', bloque: 'senales', texto: s.porque, citas: s.citas }, contexto).tipo).toBe('aviso')
    }
  })
})
