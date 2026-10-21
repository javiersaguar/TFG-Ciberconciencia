import { describe, expect, it } from 'vitest'

import { milisegundosDelDia } from '@/componentes/datos/hora'
import { disponerEnCarriles } from '@/paginas/ataque/carriles'

import { BLOQUE_P1, CAMPANAS, P2, P2_DETALLE } from './corpus'
import { cargarAristasP2, cargarCampanaP2, cargarCampanasP1 } from '../exportaciones'
import { construirGrafoAtaque } from './grafoAtaque'

const [campanasP1, campanaP2, aristas] = await Promise.all([cargarCampanasP1(), cargarCampanaP2(), cargarAristasP2()])
const grafo = construirGrafoAtaque({ campanasP1, campanaP2, aristas })
const nodo = (id: string) => grafo.nodos.find((n) => n.id === id)

describe('grafo de ataque construido desde corpus.ts', () => {
  it('ids únicos y ninguna arista hacia un nodo que no existe', () => {
    expect(new Set(grafo.nodos.map((n) => n.id)).size).toBe(grafo.nodos.length)
    expect(new Set(grafo.aristas.map((a) => a.id)).size).toBe(grafo.aristas.length)
    for (const a of grafo.aristas) {
      expect(nodo(a.origen), `${a.id} origen`).toBeDefined()
      expect(nodo(a.destino), `${a.id} destino`).toBeDefined()
    }
  })

  it('cada proceso y alerta cuelga de un host que existe, y todo nodo tiene su sitio en los carriles', () => {
    const disposicion = disponerEnCarriles(grafo.nodos, grafo.aristas)
    for (const n of grafo.nodos) {
      if (n.padre) expect(nodo(n.padre)?.tipo).toBe('host')
      expect(disposicion.cajas[n.id], n.id).toBeDefined()
    }
  })

  it('las conexiones de red son exactamente las 17 aristas de P2, con su reparto por puerto', () => {
    const conexiones = grafo.aristas.filter((a) => a.relacion === 'conexion')
    const total = conexiones.reduce((s, a) => s + Number(a.etiqueta.match(/×(\d+)/)?.[1] ?? 0), 0)
    expect(total).toBe(P2.aristas)
    for (const p of P2.porPuerto) expect(conexiones.some((a) => a.etiqueta === `${p.servicio} ${p.puerto} · ×${p.conexiones}`)).toBe(true)
    expect(conexiones.every((a) => a.fundamento === 'observado' && a.procedencia === 'documentada')).toBe(true)
  })

  it('la costura P1/P2: la alerta de acceso remoto a LSASS es evidencia de las dos campañas', () => {
    const destinos = grafo.aristas.filter((a) => a.origen === 'alerta-al-0309-remota' && a.relacion === 'evidencia').map((a) => a.destino)
    expect(destinos.sort()).toEqual(['camp-p1-nashua', 'camp-p2-scranton-nashua'])
  })

  it('las campañas son las cuatro de apt29 day1 documentadas, con sus alertas absorbidas', () => {
    const campanas = grafo.nodos.filter((n) => n.tipo === 'campana')
    const day1 = CAMPANAS.filter((c) => c.dataset === 'SDWIN-200501225525')
    expect(campanas.map((c) => c.id).sort()).toEqual(day1.map((c) => `camp-${c.id}`).sort())
    for (const c of day1) expect(nodo(`camp-${c.id}`)?.subtitulo).toContain(`${c.alertas} alertas`)
  })

  it('las confianzas son las medidas (21-10) y sus factores presentes suman exactamente ese valor', () => {
    const p2 = nodo('camp-p2-scranton-nashua')!.detalle.confianza!
    expect(p2.total).toBe(1)
    expect(p2.factores.reduce((s, f) => s + f.peso, 0)).toBeCloseTo(1, 10)
    const esperadas: Record<string, number> = { 'camp-p1-scranton-1': 0.85, 'camp-p1-nashua': 0.8, 'camp-p1-scranton-2': 0.65 }
    for (const [id, valor] of Object.entries(esperadas)) {
      const c = nodo(id)!.detalle.confianza!
      expect(c.total).toBe(valor)
      expect(c.factores.reduce((s, f) => s + (f.presente ? f.peso : 0), 0)).toBeCloseTo(valor, 10)
    }
  })

  it('las técnicas que enseña salen solo de los datos (bloque de P1 y P2)', () => {
    const conocidas = new Set([...BLOQUE_P1.flatMap((a) => a.tecnicas), ...P2_DETALLE.wsmprovhost.tecnicas, 'T1569.002'])
    for (const e of [...grafo.nodos, ...grafo.aristas]) for (const t of e.detalle.tecnicas) expect(conocidas.has(t), `${e.id}: ${t}`).toBe(true)
  })

  it('las hipótesis van marcadas como tales y la extrapolación de la demo como ilustrativa', () => {
    const hipotesis = grafo.aristas.filter((a) => a.fundamento === 'hipotesis')
    expect(hipotesis.map((a) => a.id).sort()).toEqual(['e-hip-dcsync', 'e-hip-habilita'])
    expect(grafo.aristas.find((a) => a.id === 'e-hip-dcsync')?.procedencia).toBe('ilustrativa')
    expect(grafo.aristas.filter((a) => a.procedencia === 'ilustrativa')).toHaveLength(1)
  })

  it('la secuencia va en orden temporal y solo cita elementos que existen', () => {
    const tiempos = grafo.hitos.map((h) => milisegundosDelDia(h.hora))
    expect([...tiempos].sort((a, b) => a - b)).toEqual(tiempos)
    for (const h of grafo.hitos) {
      for (const id of h.nodos) expect(nodo(id), `${h.id}: ${id}`).toBeDefined()
      for (const id of h.aristas) expect(grafo.aristas.some((a) => a.id === id), `${h.id}: ${id}`).toBe(true)
    }
  })
})
