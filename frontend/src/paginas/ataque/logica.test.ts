import { describe, expect, it } from 'vitest'

import { cargarAristasP2, cargarCampanaP2, cargarCampanasP1 } from '@/api/exportaciones'
import { construirGrafoAtaque } from '@/api/simulado/grafoAtaque'
import { formatearHora, milisegundosDelDia } from '@/componentes/datos/hora'

import { alternar, FILTROS_INICIALES, filtrarGrafo, leerCampana, leerSeleccion, recorridoHasta } from './logica'

const [campanasP1, campanaP2, aristas] = await Promise.all([cargarCampanasP1(), cargarCampanaP2(), cargarAristasP2()])
const grafo = construirGrafoAtaque({ campanasP1, campanaP2, aristas })
const ids = (lista: { id: string }[]) => lista.map((e) => e.id)

describe('filtros del explorador', () => {
  it('sin filtros se ve todo', () => {
    const v = filtrarGrafo(grafo, FILTROS_INICIALES)
    expect(v.nodos).toHaveLength(grafo.nodos.length)
    expect(v.aristas).toHaveLength(grafo.aristas.length)
  })

  it('por campaña P1: su campaña, su host y su evidencia; nada de los procesos de P2', () => {
    const v = filtrarGrafo(grafo, { ...FILTROS_INICIALES, campana: 'p1-scranton-1' })
    expect(ids(v.nodos).sort()).toEqual(['alerta-al-0300-drop', 'alerta-al-0305-lsass', 'camp-p1-scranton-1', 'host-scranton'])
    expect(v.aristas.every((a) => a.relacion === 'evidencia')).toBe(true)
  })

  it('por campaña P2: las tres conexiones y su evidencia, sin campañas P1 ni la hipótesis que las une', () => {
    const v = filtrarGrafo(grafo, { ...FILTROS_INICIALES, campana: 'p2-scranton-nashua' })
    expect(ids(v.aristas)).toEqual(expect.arrayContaining(['e-winrm', 'e-rpc', 'e-smb', 'e-cuenta-pbeesly']))
    expect(ids(v.nodos)).not.toContain('camp-p1-nashua')
    expect(ids(v.aristas)).not.toContain('e-hip-habilita')
  })

  it('por host: un hijo nunca se ve sin su host', () => {
    const v = filtrarGrafo(grafo, { ...FILTROS_INICIALES, hosts: ['NASHUA'] })
    expect(ids(v.nodos)).not.toContain('proc-powershell')
    expect(ids(v.nodos)).toContain('proc-wsmprovhost')
    expect(ids(v.aristas)).not.toContain('e-winrm')
  })

  it('ocultar lo inferido oculta las campañas y su evidencia', () => {
    const v = filtrarGrafo(grafo, { ...FILTROS_INICIALES, fundamentos: ['observado'] })
    expect(v.nodos.some((n) => n.tipo === 'campana')).toBe(false)
    expect(v.aristas.every((a) => a.fundamento === 'observado')).toBe(true)
  })

  it('por tipo de relación', () => {
    const v = filtrarGrafo(grafo, { ...FILTROS_INICIALES, relaciones: ['conexion'] })
    expect(new Set(v.aristas.map((a) => a.relacion))).toEqual(new Set(['conexion']))
  })
})

describe('secuencia temporal', () => {
  it('acumula lo alcanzado hito a hito', () => {
    expect(recorridoHasta(grafo, 0).nodos.has('host-scranton')).toBe(true)
    expect(recorridoHasta(grafo, 0).nodos.has('camp-p2-scranton-nashua')).toBe(false)
    const final = recorridoHasta(grafo, grafo.hitos.length - 1)
    for (const h of grafo.hitos) h.nodos.forEach((id) => expect(final.nodos.has(id)).toBe(true))
  })
})

describe('parámetros de la URL y utilidades', () => {
  it('solo acepta selecciones y campañas que existen', () => {
    expect(leerSeleccion('e-winrm', grafo)).toBe('e-winrm')
    expect(leerSeleccion('<img src=x onerror=alert(1)>', grafo)).toBeNull()
    expect(leerSeleccion(null, grafo)).toBeNull()
    expect(leerCampana('p2-scranton-nashua', grafo)).toBe('p2-scranton-nashua')
    expect(leerCampana('p1-lsass_campaign_01', grafo)).toBeNull()
  })

  it('alternar quita o añade', () => {
    expect(alternar(['a', 'b'], 'a')).toEqual(['b'])
    expect(alternar(['b'], 'a')).toEqual(['b', 'a'])
  })

  it('las horas no aparentan precisión que no tienen', () => {
    expect(formatearHora({ hora: '03:00:29.705', resolucion: 'ms' })).toBe('03:00:29,705')
    expect(formatearHora({ hora: '03:19:17', resolucion: 'reconstruida' })).toBe('03:19:17 †')
    expect(formatearHora({ hora: '02:57:18', resolucion: 'segundo' })).toBe('02:57:18')
    expect(milisegundosDelDia({ hora: '03:19:17', resolucion: 'reconstruida' })).toBeLessThan(milisegundosDelDia({ hora: '03:19:17.154', resolucion: 'ms' }))
  })
})
