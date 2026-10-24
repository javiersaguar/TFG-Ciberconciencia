import { describe, expect, it } from 'vitest'

import { cargarAristasP2, cargarCampanaP2, cargarCampanasP1 } from '@/api/exportaciones'
import { construirGrafoAtaque } from '@/api/simulado/grafoAtaque'

import { absoluta, asignarColumnas, CARRILES, carrilDe, disponerEnCarriles, idCarril, interpolar, MEDIDAS, PX_POR_MINUTO, repartirEnFilas } from './carriles'

const [campanasP1, campanaP2, aristas] = await Promise.all([cargarCampanasP1(), cargarCampanaP2(), cargarAristasP2()])
const grafo = construirGrafoAtaque({ campanasP1, campanaP2, aristas })
const d = disponerEnCarriles(grafo.nodos, grafo.aristas)
const seSolapan = (a: { x: number; y: number; ancho: number; alto: number }, b: typeof a) =>
  a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto

describe('disposición en carriles', () => {
  it('un carril por host, de arriba abajo en el orden del ataque, del ancho de todo el eje', () => {
    const ys = CARRILES.map((h) => d.cajas[idCarril(h)].y)
    expect([...ys].sort((a, b) => a - b)).toEqual(ys)
    for (const h of CARRILES) expect(d.cajas[idCarril(h)]).toMatchObject({ x: 0, ancho: d.ancho })
  })

  it('cada nodo con hora va dentro de su carril, en su host (P2 en el destino)', () => {
    for (const n of grafo.nodos.filter((x) => x.tipo !== 'host')) {
      expect(n.ms, n.id).toBeTypeOf('number')
      expect(d.padres[n.id], n.id).toBe(idCarril(carrilDe(n)!))
      const caja = d.cajas[n.id]
      const carril = d.cajas[d.padres[n.id]]
      expect(caja.y + caja.alto, n.id).toBeLessThanOrEqual(carril.alto)
    }
    expect(d.padres['camp-p2-scranton-nashua']).toBe('host-nashua')
  })

  it('nada se monta: ningún par de elementos del mismo carril se solapa', () => {
    for (const h of CARRILES) {
      const propios = Object.keys(d.padres).filter((id) => d.padres[id] === idCarril(h))
      for (const a of propios) for (const b of propios) if (a < b) expect(seSolapan(d.cajas[a], d.cajas[b]), `${a} / ${b}`).toBe(false)
    }
  })

  it('el tiempo va de izquierda a derecha: una tarjeta más tardía nunca queda a la izquierda', () => {
    const tarjetas = grafo.nodos.filter((n) => n.ms != null && n.tipo !== 'campana').sort((a, b) => a.ms! - b.ms!)
    for (let i = 1; i < tarjetas.length; i++) expect(d.cajas[tarjetas[i].id].x, tarjetas[i].id).toBeGreaterThanOrEqual(d.cajas[tarjetas[i - 1].id].x)
    // y las bandas, por su hora de inicio
    const bandas = grafo.nodos.filter((n) => n.tipo === 'campana').sort((a, b) => a.ms! - b.ms!)
    for (let i = 1; i < bandas.length; i++) expect(d.cajas[bandas[i].id].x).toBeGreaterThanOrEqual(d.cajas[bandas[i - 1].id].x)
  })

  it('cada momento con evidencia es una columna: sin solapes, con aire entre tarjetas y su hora escrita', () => {
    const tarjetas = grafo.nodos.filter((n) => n.tipo !== 'host' && n.tipo !== 'campana')
    const xs = [...new Set(tarjetas.map((n) => d.cajas[n.id].x))].sort((a, b) => a - b)
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(MEDIDAS.tarjeta.ancho + 24)
    expect(d.columnas).toHaveLength(xs.length)
    expect(d.columnas[0].texto).toBe('03:00:29')
    // la cuenta y su powershell.exe son del mismo instante y del mismo host: misma columna, una encima de otra
    expect(d.cajas['cuenta-pbeesly'].x).toBe(d.cajas['proc-powershell'].x)
    expect(d.cajas['cuenta-pbeesly'].y).toBeLessThan(d.cajas['proc-powershell'].y)
    // wsmprovhost.exe (84 ms después, en NASHUA) comparte columna con el powershell.exe que lo lanza
    expect(d.cajas['proc-wsmprovhost'].x).toBe(d.cajas['proc-powershell'].x)
  })

  it('entre columnas lejanas se indica el tiempo que pasa', () => {
    expect(d.saltos.map((s) => s.texto)).toContain('+5 min')
    for (const s of d.saltos) expect(s.texto).toMatch(/^\+\d+ min$/)
  })

  it('las campañas son bandas que cubren su evidencia', () => {
    const banda = d.cajas['camp-p1-scranton-1']
    const centro = (id: string) => d.cajas[id].x + d.cajas[id].ancho / 2
    expect(banda.x).toBeLessThanOrEqual(centro('alerta-al-0300-drop'))
    expect(banda.x + banda.ancho).toBeGreaterThanOrEqual(centro('alerta-al-0305-lsass'))
    expect(banda.ancho).toBeGreaterThanOrEqual(MEDIDAS.banda.minimo)
  })

  it('las 17 conexiones de P2 llegan al carril de NASHUA a su hora real: WinRM, luego SMB, luego RPC', () => {
    const asas = d.asas['host-nashua'].filter((a) => a.tipo === 'target' && /^t-\d+$/.test(a.id))
    const x = Object.fromEntries(asas.map((a) => [a.id, a.x]))
    expect(x['t-5985']).toBeLessThan(x['t-445'])
    expect(x['t-445']).toBeLessThan(x['t-135'])
    for (const a of asas) expect(a.lado).toBe('arriba')
  })

  it('toda arista que sale o llega a un carril tiene su asa en ese carril', () => {
    for (const a of grafo.aristas) {
      if (a.destino.startsWith('host-')) expect(d.asas[a.destino].some((x) => x.id === a.asaDestino && x.tipo === 'target'), a.id).toBe(true)
      if (a.origen.startsWith('host-')) expect(d.asas[a.origen].some((x) => x.id === a.asaOrigen && x.tipo === 'source'), a.id).toBe(true)
    }
  })

  it('es determinista y la posición absoluta suma la de su carril', () => {
    expect(disponerEnCarriles(grafo.nodos, grafo.aristas)).toEqual(d)
    const abs = absoluta('proc-wsmprovhost', d)
    expect(abs.y).toBe(d.cajas['proc-wsmprovhost'].y + d.cajas['host-nashua'].y)
  })

  it('asignar columnas: apila lo simultáneo del mismo host y comparte columna entre hosts', () => {
    const u = asignarColumnas([
      { id: 'a', ms: 0, carril: 'S' },
      { id: 'b', ms: 400, carril: 'S' },
      { id: 'c', ms: 500, carril: 'N' },
      { id: 'd', ms: 9000, carril: 'N' },
      { id: 'e', ms: 9500, carril: 'S' },
    ])
    expect(Object.fromEntries([...u].map(([k, v]) => [k, `${v.columna}.${v.fila}`]))).toEqual({ a: '0.0', b: '0.1', c: '0.0', d: '1.0', e: '1.0' })
  })

  it('interpolar respeta los extremos y es lineal entre puntos', () => {
    const p = [{ ms: 0, x: 0 }, { ms: 10, x: 100 }, { ms: 20, x: 120 }]
    expect([interpolar(p, -5), interpolar(p, 5), interpolar(p, 15), interpolar(p, 99)]).toEqual([0, 50, 110, 120])
  })

  it('repartir en filas pone en otra fila lo que no cabe', () => {
    const filas = repartirEnFilas([{ id: 'a', x: 0, ancho: 100 }, { id: 'b', x: 50, ancho: 100 }, { id: 'c', x: 120, ancho: 50 }], 10)
    expect([filas.get('a'), filas.get('b'), filas.get('c')]).toEqual([0, 1, 0])
  })
})

describe('eje de tiempo real (el de la versión anterior, a elegir)', () => {
  const t = disponerEnCarriles(grafo.nodos, grafo.aristas, undefined, 'tiempo')
  const tarjetas = grafo.nodos.filter((n) => n.tipo !== 'host' && n.tipo !== 'campana' && n.ms != null)

  it('la posición es proporcional a la hora: la distancia entre dos tarjetas es su diferencia de tiempo a escala', () => {
    const [a, b] = [...tarjetas].sort((x, y) => x.ms! - y.ms!).filter((_, i, l) => i === 0 || i === l.length - 1)
    const centro = (id: string) => t.cajas[id].x + t.cajas[id].ancho / 2
    expect(centro(b.id) - centro(a.id)).toBeCloseTo(((b.ms! - a.ms!) / 60_000) * PX_POR_MINUTO, 3)
  })

  it('una marca de hora cada dos minutos, sin huecos indicados (el hueco ya se ve a escala)', () => {
    expect(t.saltos).toEqual([])
    expect(t.columnas.length).toBeGreaterThan(5)
    for (let i = 1; i < t.columnas.length; i++) expect(t.columnas[i].ms - t.columnas[i - 1].ms).toBe(120_000)
    for (const c of t.columnas) expect(c.texto).toMatch(/^\d{2}:\d{2}$/)
  })

  it('en un carril, lo que se solaparía baja de fila: ninguna tarjeta pisa a otra', () => {
    for (const a of tarjetas) for (const b of tarjetas) if (a.id < b.id && t.padres[a.id] === t.padres[b.id]) expect(seSolapan(t.cajas[a.id], t.cajas[b.id]), `${a.id} / ${b.id}`).toBe(false)
  })

  it('los dos ejes colocan los mismos nodos en los mismos carriles', () => {
    expect(t.padres).toEqual(d.padres)
  })
})
