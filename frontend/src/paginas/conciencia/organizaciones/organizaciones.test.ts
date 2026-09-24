import { describe, expect, it } from 'vitest'

import { ORDEN_TACTICAS, porId, TARJETA } from '../modelo'
import { organizacion, ORGANIZACIONES } from '.'

describe.each(ORGANIZACIONES.map((o) => [o.nombre, o] as const))('integridad de %s', (_, org) => {
  const activos = porId(org.activos)

  it('los enlaces y los pasos solo hablan de activos que existen', () => {
    for (const e of org.enlaces) {
      expect(activos.has(e.desde), e.desde).toBe(true)
      expect(activos.has(e.hasta), e.hasta).toBe(true)
    }
    for (const p of org.pasos) {
      expect(activos.has(p.desde), `${p.id}: ${p.desde}`).toBe(true)
      expect(activos.has(p.hasta), `${p.id}: ${p.hasta}`).toBe(true)
      expect(org.zonas.some((z) => z.id === activos.get(p.hasta)!.zona)).toBe(true)
      if (p.cuenta) expect(org.cuentas[p.cuenta], `${p.id}: cuenta ${p.cuenta}`).toBeDefined()
      if (p.expone) expect(org.cuentas[p.expone], `${p.id}: expone ${p.expone}`).toBeDefined()
      expect(ORDEN_TACTICAS as readonly string[]).toContain(p.tactica)
    }
  })

  it('el atacante no se teletransporta: todo salto entre activos internos sigue un enlace de red', () => {
    for (const p of org.pasos) {
      if (p.desde === p.hasta || p.hasta === 'atacante' || p.desde === 'atacante') continue
      expect(org.enlaces.some((e) => e.desde === p.desde && e.hasta === p.hasta), `${p.id}: ${p.desde} → ${p.hasta}`).toBe(true)
    }
  })

  it('los requisitos son pasos anteriores y los identificadores no se repiten', () => {
    const vistos = new Set<string>()
    for (const p of [...org.pasos].sort((a, b) => a.t - b.t)) {
      for (const r of p.requiere ?? []) expect(vistos.has(r), `${p.id} requiere ${r}`).toBe(true)
      expect(vistos.has(p.id)).toBe(false)
      vistos.add(p.id)
    }
    expect(new Set(org.activos.map((a) => a.id)).size).toBe(org.activos.length)
  })

  it('tiene joyas de la corona, un único atacante y todas las tarjetas caben en el lienzo sin pisarse', () => {
    expect(org.activos.some((a) => a.joya)).toBe(true)
    expect(org.activos.filter((a) => a.tipo === 'atacante')).toHaveLength(1)
    for (const a of org.activos) {
      expect(a.x - TARJETA.ancho / 2).toBeGreaterThanOrEqual(0)
      expect(a.x + TARJETA.ancho / 2).toBeLessThanOrEqual(org.lienzo.ancho)
      expect(a.y - TARJETA.alto / 2).toBeGreaterThanOrEqual(40)
      expect(a.y + TARJETA.alto / 2).toBeLessThanOrEqual(org.lienzo.alto)
      for (const b of org.activos) {
        if (a === b) continue
        const separadas = Math.abs(a.x - b.x) >= TARJETA.ancho + 10 || Math.abs(a.y - b.y) >= TARJETA.alto + 10
        expect(separadas, `${a.id} pisa a ${b.id}`).toBe(true)
      }
    }
  })
})

describe('selección de organización', () => {
  it('un id desconocido da la primera', () => {
    expect(organizacion('no-existe')).toBe(ORGANIZACIONES[0])
    expect(organizacion('dmevals').nombre).toBe('DMEVALS')
  })
})
