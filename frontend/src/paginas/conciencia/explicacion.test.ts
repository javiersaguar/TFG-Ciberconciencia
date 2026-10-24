import { describe, expect, it } from 'vitest'

import { explicarActivo } from './explicacion'
import type { AccionAplicada, Efecto, Organizacion } from './modelo'
import { DMEVALS } from './organizaciones/dmevals'
import { HELIOS } from './organizaciones/helios'
import { enRiesgo, rutaProbable } from './razonamiento'
import { evaluar } from './simulacion'

const accion = (efecto: Efecto, t: number): AccionAplicada => ({ clave: JSON.stringify(efecto), titulo: 'Aislar PC-FIN-02 de la red', efecto, t })

function explicar(org: Organizacion, t: number, id: string, acciones: AccionAplicada[] = []) {
  const ev = evaluar(org, t, acciones)
  return explicarActivo(org, ev, rutaProbable(org, ev), enRiesgo(org, ev), acciones, id)!
}

describe('por qué está así un activo', () => {
  it('un activo comprometido dice qué paso lo alcanzó, desde dónde, con qué cuenta y qué patrón lo detectó', () => {
    const e = explicar(HELIOS, 62, 'pc-fin')
    expect(e.estado).toBe('comprometido')
    expect(e.titular).toMatch(/^Comprometido desde las 09:52/)
    const ataque = e.motivos.find((m) => m.tono === 'ataque' && m.tecnica === 'T1021.002')!
    expect(ataque.titulo).toBe('Movimiento lateral: Salto por SMB a Finanzas')
    expect(ataque.detalle).toMatch(/Desde PC-MKT-07 con la cuenta/)
    expect(e.motivos.find((m) => m.tono === 'deteccion')?.titulo).toBe('Detectado por el patrón P2 (movimiento lateral)')
    // y lo que el atacante hizo después desde él
    expect(e.motivos.some((m) => m.tono === 'ataque' && m.titulo.startsWith('Desde aquí: DCSync'))).toBe(true)
  })

  it('un activo en riesgo dice qué vecino comprometido llega a él y si es el siguiente objetivo', () => {
    const e = explicar(HELIOS, 62, 'backup')
    expect(e.estado).toBe('riesgo')
    expect(e.motivos.filter((m) => m.tono === 'riesgo').map((m) => m.titulo)).toContain('DC01 está comprometido y llega a él')
    expect(e.motivos.find((m) => m.tono === 'ruta')?.titulo).toMatch(/^Siguiente objetivo probable del atacante/)
    expect(e.motivos.at(-1)).toMatchObject({ tono: 'contexto', titulo: 'Joya de la corona' })
  })

  it('un activo aislado cuenta la respuesta aplicada y los pasos que impidió', () => {
    const e = explicar(HELIOS, 70, 'pc-fin', [accion({ tipo: 'aislar', activo: 'pc-fin' }, 40)])
    expect(e.estado).toBe('aislado')
    expect(e.motivos.find((m) => m.tono === 'respuesta')?.titulo).toBe('Aislar PC-FIN-02 de la red')
    const impedido = e.motivos.find((m) => m.tono === 'impedido')!
    expect(impedido.titulo).toBe('Impedido: Salto por SMB a Finanzas')
    expect(impedido.detalle).toMatch(/aislado/)
  })

  it('en DMEVALS los pasos medidos llevan su procedencia documentada', () => {
    const e = explicar(DMEVALS, 60, 'nashua')
    const salto = e.motivos.find((m) => m.tono === 'ataque' && m.tecnica === 'T1021.006')!
    expect(salto.procedencia).toBe('documentada')
    expect(salto.fuente).toBeTruthy()
    expect(e.motivos.find((m) => m.tono === 'deteccion')?.detalle).toMatch(/4 alertas Sigma/)
  })

  it('sin ataque, nada que explicar salvo el contexto; y un id desconocido no da explicación', () => {
    const e = explicar(HELIOS, 0, 'lims')
    expect(e.titular).toBe('Sin actividad del atacante.')
    expect(e.motivos.map((m) => m.tono)).toEqual(['contexto'])
    const ev = evaluar(HELIOS, 0)
    expect(explicarActivo(HELIOS, ev, null, new Set(), [], 'no-existe')).toBeNull()
  })
})
