import { describe, expect, it } from 'vitest'

import { cargarAristasP2, cargarCampanaP2, cargarCampanasP1 } from '@/api/exportaciones'
import { construirGrafoAtaque } from '@/api/simulado/grafoAtaque'

import { absoluta, CARRILES, carrilDe, disponerEnCarriles, idCarril, MEDIDAS, repartirEnFilas } from './carriles'

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

  it('el tiempo va de izquierda a derecha: más tarde, más a la derecha', () => {
    const conHora = grafo.nodos.filter((n) => n.ms != null).sort((a, b) => a.ms! - b.ms!)
    for (let i = 1; i < conHora.length; i++) expect(d.cajas[conHora[i].id].x).toBeGreaterThanOrEqual(d.cajas[conHora[i - 1].id].x)
  })

  it('las campañas son bandas del largo de su ventana', () => {
    const p1 = grafo.nodos.find((n) => n.id === 'camp-p1-scranton-1')!
    expect(d.cajas[p1.id].ancho).toBeCloseTo(((p1.msFin! - p1.ms!) / 60_000) * MEDIDAS.pxPorMinuto, 0)
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

  it('repartir en filas pone en otra fila lo que no cabe', () => {
    const filas = repartirEnFilas([{ id: 'a', x: 0, ancho: 100 }, { id: 'b', x: 50, ancho: 100 }, { id: 'c', x: 120, ancho: 50 }], 10)
    expect([filas.get('a'), filas.get('b'), filas.get('c')]).toEqual([0, 1, 0])
  })
})
