import { describe, expect, it } from 'vitest'

import type { PanelCuadro } from '@/api/observabilidad'
import { construirCuadro, listarCuadros } from '@/api/simulado/cuadros'

import { ALTO_COMPACTO, compactarFilasDeUnNumero } from './compactar'

const celdas = (paneles: readonly PanelCuadro[]) => {
  const ocupadas = new Map<string, string | number>()
  for (const p of paneles.filter((x) => x.tipo !== 'fila')) {
    for (let y = p.y; y < p.y + p.alto; y++) for (let x = p.x; x < p.x + p.ancho; x++) {
      const clave = `${x},${y}`
      if (ocupadas.has(clave)) throw new Error(`${p.id} pisa a ${ocupadas.get(clave)} en ${clave}`)
      ocupadas.set(clave, p.id)
    }
  }
  return ocupadas.size
}

describe('compactar las filas de paneles de un número', () => {
  it.each(listarCuadros().map((c) => [c.uid] as const))('%s: nada se monta y no se pierde ningún panel', (uid) => {
    const cuadro = construirCuadro(uid, Date.UTC(2026, 9, 21, 10))
    const compacto = compactarFilasDeUnNumero(cuadro.paneles)
    expect(compacto).toHaveLength(cuadro.paneles.length)
    expect(() => celdas(compacto)).not.toThrow()
    // el orden de lectura (arriba abajo, izquierda derecha) se conserva
    const orden = (ps: readonly PanelCuadro[]) => [...ps].sort((a, b) => a.y - b.y || a.x - b.x).map((p) => p.id)
    expect(orden(compacto)).toEqual(orden(cuadro.paneles))
  })

  it('una banda solo de números baja a la altura compacta, uniforme, y lo de debajo sube', () => {
    const p = (id: number, tipo: PanelCuadro['tipo'], x: number, y: number, ancho: number, alto: number) =>
      ({ id, tipo, titulo: String(id), x, y, ancho, alto, unidad: 'short', umbrales: [], valores: [{ nombre: 'v', valor: 1 }] }) as unknown as PanelCuadro
    const compacto = compactarFilasDeUnNumero([p(1, 'stat', 0, 0, 12, 4), p(2, 'stat', 12, 0, 12, 4), p(3, 'serie', 0, 4, 24, 8)])
    expect(compacto.map((x) => [x.y, x.alto])).toEqual([[0, ALTO_COMPACTO], [0, ALTO_COMPACTO], [ALTO_COMPACTO, 8]])
  })

  it('si una serie alta comparte filas con los números, la banda no se toca', () => {
    const p = (id: number, tipo: PanelCuadro['tipo'], x: number, y: number, ancho: number, alto: number) =>
      ({ id, tipo, titulo: String(id), x, y, ancho, alto, unidad: 'short', umbrales: [], valores: [{ nombre: 'v', valor: 1 }] }) as unknown as PanelCuadro
    const entrada = [p(1, 'stat', 0, 0, 12, 4), p(2, 'serie', 12, 0, 12, 9)]
    expect(compactarFilasDeUnNumero(entrada)).toEqual(entrada)
  })
})

describe('compactar con vecinos al lado', () => {
  it('los números bajan y el panel de debajo, en sus mismas columnas, se queda la altura: la columna mide lo mismo', () => {
    const p = (id: number, tipo: PanelCuadro['tipo'], x: number, y: number, ancho: number, alto: number) =>
      ({ id, tipo, titulo: String(id), x, y, ancho, alto, unidad: 'short', umbrales: [], valores: [{ nombre: 'v', valor: 1 }] }) as unknown as PanelCuadro
    const salida = compactarFilasDeUnNumero([p(1, 'stat', 0, 1, 6, 4), p(2, 'stat', 6, 1, 6, 4), p(3, 'serie', 12, 1, 12, 9), p(4, 'barras', 0, 5, 12, 5)])
    expect(salida.map((x) => [x.id, x.y, x.alto])).toEqual([[1, 1, ALTO_COMPACTO], [2, 1, ALTO_COMPACTO], [3, 1, 9], [4, 1 + ALTO_COMPACTO, 5 + 4 - ALTO_COMPACTO]])
  })

  it('en el cuadro de salud del pipeline, las tarjetas de Redpanda y de Flink quedan bajas', () => {
    const cuadro = construirCuadro(listarCuadros()[0].uid, Date.UTC(2026, 9, 21, 10))
    const compacto = compactarFilasDeUnNumero(cuadro.paneles)
    for (const titulo of ['Particiones', 'Topics', 'TaskManagers', 'Slots totales', 'Jobs en ejecución']) {
      expect(compacto.find((x) => x.titulo === titulo)?.alto, titulo).toBe(ALTO_COMPACTO)
    }
  })
})
