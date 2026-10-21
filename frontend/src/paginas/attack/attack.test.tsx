import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { cargarCatalogo, cargarTecnicasObservadas } from '@/api/exportaciones'
import { construirCobertura } from '@/api/simulado/attack'
import { renderizarRutas } from '@/pruebas/utilidades'

import { filtrarFamilias, leerCapa, leerTecnica, nivelCalor, ordenarFamilias, urlTecnica } from './logica'

const cobertura = construirCobertura(await cargarTecnicasObservadas(), await cargarCatalogo())
const celdas = cobertura.familias.flatMap((f) => f.celdas)
const ORDEN_MATRIZ = [
  'reconnaissance', 'resource-development', 'initial-access', 'execution', 'persistence', 'privilege-escalation', 'stealth',
  'defense-impairment', 'credential-access', 'discovery', 'lateral-movement', 'collection', 'command-and-control', 'exfiltration', 'impact',
]

describe('cobertura ATT&CK: tres capas fechadas y catálogo v19', () => {
  it('da las cifras documentadas: 300 potenciales, 34 observadas en F2 (11,3 %) y 47 en el corpus actual', () => {
    const r = cobertura.resumen
    expect([r.potenciales, r.subtecnicasPotenciales, r.familiasPotenciales, r.paresReglaTecnica]).toEqual([300, 177, 144, 2780])
    expect([r.observadasF2, r.subtecnicasObservadasF2, r.paresAlertaTecnicaF2]).toEqual([34, 23, 616])
    expect(r.activacionF2 * 100).toBeCloseTo(11.3, 1)
    expect(r.observadasHoy).toBe(47)
    // derivada: las 47 están todas entre las 300 potenciales
    expect(r.activacionHoy).toBeCloseTo(47 / 300, 10)
  })

  it('las 34 de F2 están dentro de las 47 de hoy, y cada capa conserva su propio valor', () => {
    const f2 = celdas.filter((c) => c.alertasF2 !== null)
    expect(f2).toHaveLength(34)
    expect(f2.every((c) => c.alertasHoy !== null)).toBe(true)
    expect(celdas.find((c) => c.id === 'T1003.001')).toMatchObject({ alertasF2: 30 })
  })

  it('T1685 está verificado: lleva su nombre oficial y su táctica del catálogo', () => {
    expect(celdas.find((c) => c.id === 'T1685')).toMatchObject({ nombre: 'Disable or Modify Tools', tacticas: ['defense-impairment'] })
    expect(celdas.find((c) => c.id === 'T1685.001')?.nombre).toBe('Disable or Modify Windows Event Log')
    expect(celdas.every((c) => c.nombre !== null)).toBe(true)
  })

  it('una columna por táctica en el orden de la matriz; una técnica con varias tácticas está en cada una', () => {
    expect(cobertura.columnas.map((c) => c.tactica.shortname)).toEqual(ORDEN_MATRIZ)
    for (const col of cobertura.columnas) for (const f of col.familias) for (const c of f.celdas) expect(c.tacticas).toContain(col.tactica.shortname)
    const multiple = celdas.find((c) => c.tacticas.length > 1)!
    for (const t of multiple.tacticas) {
      expect(cobertura.columnas.find((col) => col.tactica.shortname === t)!.familias.flatMap((f) => f.celdas).some((c) => c.id === multiple.id)).toBe(true)
    }
  })

  it('las tácticas observadas van con su nombre, nunca como TAxxxx', () => {
    for (const t of cobertura.tacticasDay1) expect(t.tactica).not.toMatch(/^TA\d{4}$/)
  })

  it('filtra por capa, busca por ID o por nombre, ordena y escala el calor', () => {
    const cuenta = (capa: Parameters<typeof filtrarFamilias>[2]) => filtrarFamilias(cobertura.familias, { texto: '', soloObservadas: false }, capa).reduce((s, f) => s + f.celdas.length, 0)
    expect(cuenta('observadaHoy')).toBe(47)
    expect(cuenta('observadaF2')).toBe(34)
    expect(cuenta('potencial')).toBe(300)
    const lsass = filtrarFamilias(cobertura.familias, { texto: 'lsass', soloObservadas: false }, 'potencial').flatMap((f) => f.celdas)
    expect(lsass.map((c) => c.id)).toContain('T1003.001')
    const ordenadas = ordenarFamilias(cobertura.familias, 'alertasHoy')
    expect(ordenadas[0].alertasHoy).toBeGreaterThanOrEqual(ordenadas[1].alertasHoy)
    expect([nivelCalor(null, 100), nivelCalor(1, 100), nivelCalor(100, 100)]).toEqual([0, 1, 5])
  })

  it('?tecnica= y ?capa= solo aceptan valores válidos', () => {
    expect(leerTecnica('T1003.001', cobertura)?.alertasHoy).toBeGreaterThan(0)
    expect(leerTecnica('T9999', cobertura)).toBeUndefined()
    expect(leerTecnica('T1003.001"><img src=x>', cobertura)).toBeUndefined()
    expect(leerCapa('observadaHoy')).toBe('observadaHoy')
    expect(leerCapa('<script>')).toBeNull()
    expect(urlTecnica('T1003.001')).toBe('https://attack.mitre.org/techniques/T1003/001/')
  })
})

describe('página de la matriz ATT&CK', () => {
  it('distingue las 47 de hoy de las 34 de F2 y enseña T1685 con su nombre, sin aviso de verificación', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/attack?tecnica=T1685')
    expect(within(await screen.findByRole('region', { name: 'Observadas hoy (21-10)' })).getByText('47')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Observadas en F2 (28-07)' })).getByText('34')).toBeInTheDocument()
    const ficha = screen.getByRole('region', { name: 'Técnica elegida' })
    expect(ficha).toHaveTextContent('Disable or Modify Tools')
    expect(ficha).not.toHaveTextContent(/verificar/)
    expect(within(ficha).getByRole('link', { name: /attack.mitre.org/ })).toHaveAttribute('rel', 'noopener noreferrer')
    await usuario.click(screen.getByRole('checkbox', { name: 'Solo observadas' }))
    expect(screen.getByText(/· 47 técnicas/)).toBeInTheDocument()
  })
})

describe('matriz por táctica', () => {
  it('una columna por táctica en el orden de v19 y las subtécnicas plegadas hasta que se despliegan', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/attack')
    const matriz = await screen.findByRole('region', { name: 'Matriz por táctica' })
    const columnas = within(matriz).getAllByRole('region').map((c) => c.getAttribute('aria-label')!.split(':')[0])
    expect(columnas).toHaveLength(15)
    expect(columnas[0]).toBe('Reconnaissance')
    expect(columnas.at(-1)).toBe('Impact')
    const credenciales = within(matriz).getByRole('region', { name: /^Credential Access:/ })
    expect(within(credenciales).queryByRole('button', { name: /^T1003\.001 / })).not.toBeInTheDocument()
    await usuario.click(within(credenciales).getByRole('button', { name: /Desplegar las \d+ subtécnicas de T1003/ }))
    expect(within(credenciales).getByRole('button', { name: /^T1003\.001 LSASS Memory/ })).toBeInTheDocument()
  })
})
