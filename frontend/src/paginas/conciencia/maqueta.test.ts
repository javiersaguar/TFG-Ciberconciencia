import { describe, expect, it } from 'vitest'

import { alturaPlataforma, cima, construirEscena, encuadreDePaso, puntoDelArco, resumenEscena } from './maqueta'
import type { AccionAplicada, Efecto, Organizacion } from './modelo'
import { DMEVALS } from './organizaciones/dmevals'
import { HELIOS } from './organizaciones/helios'
import { enRiesgo, rutaProbable } from './razonamiento'
import { duracionEscenario, evaluar } from './simulacion'

const accion = (efecto: Efecto, t: number): AccionAplicada => ({ clave: JSON.stringify(efecto), titulo: 'prueba', efecto, t })

function escena(org: Organizacion, t: number, acciones: AccionAplicada[] = []) {
  const ev = evaluar(org, t, acciones)
  const ruta = rutaProbable(org, ev)
  return { ev, ruta, escena: construirEscena(org, ev, ruta, enRiesgo(org, ev)) }
}

describe('maqueta 3D: la organización', () => {
  it.each([HELIOS, DMEVALS])('en $nombre, una plataforma por zona, escalonadas de Internet a los activos críticos', (org) => {
    const { escena: e } = escena(org, 0)
    expect(e.plataformas.map((p) => p.id)).toEqual([...org.zonas].sort((a, b) => a.columna - b.columna).map((z) => z.id))
    const alturas = e.plataformas.map((p) => p.medidas[1])
    for (let i = 1; i < alturas.length; i++) expect(alturas[i]).toBeGreaterThan(alturas[i - 1])
    // y de izquierda a derecha, como en 2D
    const xs = e.plataformas.map((p) => p.centro[0])
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
  })

  it.each([HELIOS, DMEVALS])('en $nombre, cada activo está sobre su zona, y el atacante flota sobre Internet', (org) => {
    const { escena: e } = escena(org, 0)
    expect(e.piezas).toHaveLength(org.activos.length)
    for (const activo of org.activos) {
      const pieza = e.piezas.find((p) => p.id === activo.id)!
      const columna = org.zonas.find((z) => z.id === activo.zona)!.columna
      if (activo.tipo === 'atacante') expect(pieza.base[1]).toBeGreaterThan(alturaPlataforma(columna))
      else expect(pieza.base[1]).toBeCloseTo(alturaPlataforma(columna))
      const plataforma = e.plataformas.find((p) => p.id === activo.zona)!
      expect(Math.abs(pieza.base[0] - plataforma.centro[0])).toBeLessThan(plataforma.medidas[0] / 2)
      expect(Math.abs(pieza.base[2])).toBeLessThan(plataforma.medidas[2] / 2)
    }
  })

  it('antes del ataque solo hay red: ningún paso, ninguna ruta y nada comprometido', () => {
    const { escena: e } = escena(HELIOS, 0)
    expect(e.arcos.every((a) => a.tipo === 'red')).toBe(true)
    expect(e.arcos).toHaveLength(HELIOS.enlaces.filter((l) => l.desde !== 'atacante' && l.hasta !== 'atacante').length)
    expect(e.marcas).toHaveLength(0)
    expect(e.piezas.filter((p) => p.estado !== 'atacante').every((p) => p.estado === 'normal')).toBe(true)
  })
})

describe('maqueta 3D: el ataque encima', () => {
  it('tras el DCSync: los saltos ocurridos son arcos de ataque, uno es el último y los pasos locales son marcas', () => {
    const { ev, escena: e } = escena(HELIOS, 62)
    const ataque = e.arcos.filter((a) => a.tipo === 'ataque')
    const saltos = new Set(ev.ocurridos.filter((p) => p.desde !== p.hasta).map((p) => `${p.desde}>${p.hasta}`))
    expect(ataque.map((a) => a.id.replace('paso-', '')).sort()).toEqual([...saltos].sort())
    expect(e.arcos.filter((a) => a.ultimo).map((a) => a.id)).toEqual(['paso-pc-fin>dc'])
    expect(e.marcas).toEqual([{ activo: 'pc-mkt', tipo: 'ataque' }])
    expect(e.piezas.find((p) => p.id === 'dc')).toMatchObject({ estado: 'comprometido', golpeado: true })
  })

  it('lo que la respuesta impide es un arco impedido, no de ataque', () => {
    const { escena: e } = escena(HELIOS, 70, [accion({ tipo: 'aislar', activo: 'pc-fin' }, 40)])
    expect(e.arcos.find((a) => a.id === 'paso-pc-mkt>pc-fin')?.tipo).toBe('impedido')
    expect(e.piezas.find((p) => p.id === 'pc-fin')?.estado).toBe('aislado')
  })

  it('la ruta probable sigue su camino hasta la joya, que queda marcada como objetivo', () => {
    const { ruta, escena: e } = escena(HELIOS, 30)
    expect(ruta).not.toBeNull()
    const tramos = e.arcos.filter((a) => a.tipo === 'ruta')
    expect(tramos).toHaveLength(ruta!.saltos)
    expect(e.piezas.filter((p) => p.objetivo).map((p) => p.id)).toEqual([ruta!.joya])
  })

  it('al final del escenario sin respuesta, la exfiltración sale por arriba de todo', () => {
    const { escena: e } = escena(HELIOS, duracionEscenario(HELIOS))
    const salida = e.arcos.find((a) => a.id === 'paso-bd-formulas>atacante')!
    const salto = e.arcos.find((a) => a.id === 'paso-pc-mkt>pc-fin')!
    expect(salida.elevacion).toBeGreaterThan(salto.elevacion)
    for (const p of e.piezas) expect(cima(p)[1]).toBeLessThanOrEqual(e.extension.max[1])
  })

  it('el arco empieza y acaba en sus extremos y su cima está a la elevación pedida', () => {
    const arco = { desde: [0, 1, 0] as const, hasta: [4, 2, 2] as const, elevacion: 1 }
    expect(puntoDelArco(arco, 0)).toEqual([0, 1, 0])
    expect(puntoDelArco(arco, 1)).toEqual([4, 2, 2])
    expect(puntoDelArco(arco, 0.5)[1]).toBeGreaterThan(2)
  })

  it('el resumen para lectores de pantalla dice qué está comprometido y hacia dónde va', () => {
    const { escena: e } = escena(HELIOS, 62)
    const texto = resumenEscena(HELIOS, e)
    expect(texto).toContain('Maqueta 3D de Helios Farmacéutica')
    expect(texto).toContain('DC01')
    expect(texto).toMatch(/Ruta probable hacia/)
  })

  it('la cámara que sigue el ataque mira al salto desde arriba y delante, con el salto entero a la vista', () => {
    const { escena: e } = escena(HELIOS, 62)
    const enc = encuadreDePaso(e, { desde: 'pc-fin', hasta: 'dc' })!
    const a = e.piezas.find((p) => p.id === 'pc-fin')!
    const b = e.piezas.find((p) => p.id === 'dc')!
    expect(enc.objetivo[0]).toBeCloseTo((a.base[0] + b.base[0]) / 2)
    expect(enc.posicion[1]).toBeGreaterThan(enc.objetivo[1] + 5)
    expect(enc.posicion[2]).toBeGreaterThan(enc.objetivo[2])
    const distancia = Math.hypot(...([0, 1, 2] as const).map((i) => enc.posicion[i] - enc.objetivo[i]) as [number, number, number])
    expect(distancia).toBeGreaterThan(Math.hypot(b.base[0] - a.base[0], b.base[2] - a.base[2]))
    // un paso local se encuadra sobre su pieza, sin pegarse a ella; uno que no está en la escena, no
    const local = encuadreDePaso(e, { desde: 'pc-mkt', hasta: 'pc-mkt' })!
    expect(local.objetivo[0]).toBeCloseTo(e.piezas.find((p) => p.id === 'pc-mkt')!.base[0])
    expect(Math.hypot(...([0, 1, 2] as const).map((i) => local.posicion[i] - local.objetivo[i]) as [number, number, number])).toBeGreaterThanOrEqual(16)
    expect(encuadreDePaso(e, { desde: 'nada', hasta: 'dc' })).toBeNull()
  })
})
