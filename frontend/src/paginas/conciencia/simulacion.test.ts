import { describe, expect, it } from 'vitest'

import { puntuar } from './asistente/puntuacion'
import { recomendar } from './asistente/reglas'
import type { AccionAplicada, Efecto } from './modelo'
import { DMEVALS } from './organizaciones/dmevals'
import { HELIOS } from './organizaciones/helios'
import { rutaProbable } from './razonamiento'
import { desenlace, duracionEscenario, evaluar } from './simulacion'

const accion = (efecto: Efecto, t: number): AccionAplicada => ({ clave: JSON.stringify(efecto), titulo: 'prueba', efecto, t })

describe('simulación sin respuesta', () => {
  it.each([DMEVALS, HELIOS])('en $nombre el ataque llega entero y cumple sus objetivos', (org) => {
    const ev = evaluar(org, duracionEscenario(org))
    expect(ev.bloqueados).toHaveLength(0)
    expect(ev.ocurridos).toHaveLength(org.pasos.length)
    expect(ev.impactos.length).toBeGreaterThan(0)
    expect(desenlace(ev)?.tono).toBe('impacto')
  })

  it('antes de empezar no hay nada, y a mitad solo lo que ya ocurrió', () => {
    expect(evaluar(HELIOS, 0).ocurridos).toHaveLength(0)
    const mitad = evaluar(HELIOS, 30)
    expect(mitad.ocurridos.every((p) => p.t <= 30)).toBe(true)
    expect(mitad.comprometidos.has('pc-mkt')).toBe(true)
    expect(mitad.comprometidos.has('dc')).toBe(false)
    expect(desenlace(mitad)).toBeNull()
  })

  it('el phishing no compromete el equipo hasta que se abre el adjunto', () => {
    expect(evaluar(HELIOS, 3).comprometidos.has('pc-mkt')).toBe(false)
    expect(evaluar(HELIOS, 9).comprometidos.has('pc-mkt')).toBe(true)
  })
})

describe('la respuesta cambia el curso del ataque', () => {
  it('retirar el correo a tiempo lo para todo', () => {
    const ev = evaluar(HELIOS, duracionEscenario(HELIOS), [accion({ tipo: 'bloquear-canal', canal: 'correo' }, 1)])
    expect(ev.ocurridos).toHaveLength(0)
    expect(desenlace(ev)?.tono).toBe('contenido')
  })

  it('aislar SCRANTON antes del salto lateral salva a NASHUA y todo lo que venía detrás', () => {
    const ev = evaluar(DMEVALS, duracionEscenario(DMEVALS), [accion({ tipo: 'aislar', activo: 'scranton' }, 30)])
    const d6 = ev.pasos.find((p) => p.paso.id === 'd6')!
    expect(d6.ocurrido).toBe(false)
    expect(d6.motivo).toBe('SCRANTON está aislado')
    expect(ev.comprometidos.has('nashua')).toBe(false)
    expect(ev.estado.get('scranton')).toBe('aislado')
    expect(ev.impactos.map((p) => p.id)).toEqual([])
    expect(ev.pasos.find((p) => p.paso.id === 'd15')!.motivo).toBe('Depende de un paso que no llegó a ocurrir')
  })

  it('responder tarde no deshace lo ocurrido: solo afecta a lo posterior', () => {
    const ev = evaluar(DMEVALS, duracionEscenario(DMEVALS), [accion({ tipo: 'aislar', activo: 'scranton' }, 60)])
    expect(ev.pasos.find((p) => p.paso.id === 'd6')!.ocurrido).toBe(true)
    expect(ev.pasos.find((p) => p.paso.id === 'd10')!.ocurrido).toBe(false)
    expect(ev.comprometidos.has('nashua')).toBe(true)
  })

  it('restablecer krbtgt tras el DCSync corta todo lo que dependía del dominio', () => {
    const ev = evaluar(HELIOS, duracionEscenario(HELIOS), [accion({ tipo: 'bloquear-cuenta', cuenta: 'dominio' }, 62)])
    for (const id of ['h10', 'h13', 'h14', 'h16']) expect(ev.pasos.find((p) => p.paso.id === id)!.ocurrido, id).toBe(false)
    expect(ev.pasos.find((p) => p.paso.id === 'h9')!.ocurrido).toBe(true)
  })

  it('proteger la joya del final de la ruta impide alcanzarla', () => {
    const ev = evaluar(HELIOS, duracionEscenario(HELIOS), [accion({ tipo: 'proteger', activo: 'bd-formulas' }, 70)])
    expect(ev.pasos.find((p) => p.paso.id === 'h11')!.motivo).toBe('BD-FÓRMULAS está protegido')
    expect(ev.impactos.map((p) => p.id)).not.toContain('h12')
  })
})

describe('razonamiento y asistente', () => {
  it('la ruta probable parte de lo comprometido y termina en una joya; aislar el primer salto la cambia', () => {
    const ev = evaluar(HELIOS, 30)
    const ruta = rutaProbable(HELIOS, ev)!
    expect(ruta.camino[0]).toBe('pc-mkt')
    expect(HELIOS.activos.find((a) => a.id === ruta.joya)?.joya).toBe(true)
    const aislado = evaluar(HELIOS, 30, [accion({ tipo: 'aislar', activo: 'pc-mkt' }, 29)])
    expect(rutaProbable(HELIOS, aislado)).toBeNull()
  })

  it.each([DMEVALS, HELIOS])('en $nombre ningún paso ocurrido se queda sin una respuesta propuesta', (org) => {
    for (const paso of org.pasos) {
      const ev = evaluar(org, paso.t)
      const recs = recomendar(org, ev, rutaProbable(org, ev))
      const propias = recs.filter((r) => r.porque.some((linea) => linea.includes(paso.titulo)))
      expect(propias.length, `${paso.id}: ${paso.titulo}`).toBeGreaterThan(0)
    }
  })

  it('las recomendaciones van por prioridad y desaparecen al aplicarse', () => {
    const ev = evaluar(HELIOS, 62)
    const recs = recomendar(HELIOS, ev, rutaProbable(HELIOS, ev))
    expect(recs.map((r) => r.prioridad)).toEqual([...recs.map((r) => r.prioridad)].sort((a, b) => b - a))
    const krbtgt = recs.find((r) => r.clave === 'cuenta:dominio')!
    expect(krbtgt.titulo).toMatch(/krbtgt/)
    expect(krbtgt.impactoNegocio).toBeDefined()
    const despues = recomendar(HELIOS, ev, rutaProbable(HELIOS, ev), [{ ...krbtgt, t: 62 }])
    expect(despues.some((r) => r.clave === 'cuenta:dominio')).toBe(false)
  })

  it('con el dominio robado, lo primero es expulsar al atacante: krbtgt va por delante de blindar nada', () => {
    const ev = evaluar(HELIOS, 62)
    const recs = recomendar(HELIOS, ev, rutaProbable(HELIOS, ev))
    expect(recs[0].clave).toBe('cuenta:dominio')
    expect(recs.findIndex((r) => r.fase === 'Protección preventiva')).toBeGreaterThan(0)
  })

  it('aislar el DC es último recurso: va por detrás de restablecer krbtgt', () => {
    const ev = evaluar(HELIOS, 62)
    const recs = recomendar(HELIOS, ev, rutaProbable(HELIOS, ev))
    const dc = recs.findIndex((r) => r.clave === 'aislar:dc')
    const krbtgt = recs.findIndex((r) => r.clave === 'cuenta:dominio')
    expect(dc).toBeGreaterThan(krbtgt)
  })

  it('la gravedad crece con el ataque y se descompone en factores que suman el total', () => {
    const totales = [10, 30, 60, 90, 120].map((t) => {
      const ev = evaluar(HELIOS, t)
      return puntuar(HELIOS, ev, rutaProbable(HELIOS, ev))
    })
    expect(totales[0].total).toBeLessThan(totales.at(-1)!.total)
    expect(totales.at(-1)!.nivel).toBe('Crítica')
    for (const p of totales) {
      const suma = Math.round(p.factores.reduce((s, f) => s + f.valor * f.peso, 0) * 100)
      expect(p.total).toBe(suma)
    }
    expect(puntuar(HELIOS, evaluar(HELIOS, 0), null).nivel).toBe('Sin incidente')
  })
})
