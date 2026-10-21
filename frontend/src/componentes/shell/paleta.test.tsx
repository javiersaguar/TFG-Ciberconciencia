import { act, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { cargarCampanaP2, cargarCampanasP1, cargarCatalogo, cargarTecnicasObservadas } from '@/api/exportaciones'
import { construirIncidentes } from '@/api/simulado/incidentes'
import { leerSesion, useEstadoSesion } from '@/componentes/datos/useEstadoSesion'
import { renderizarRutas } from '@/pruebas/utilidades'

import { buscarComandos, comandosBase, comandosCampanas, comandosTecnicas } from './comandos'

const [p1, p2, tecnicas, catalogo] = await Promise.all([cargarCampanasP1(), cargarCampanaP2(), cargarTecnicasObservadas(), cargarCatalogo()])
const indice = [...comandosBase(), ...comandosCampanas(construirIncidentes(p1, p2)), ...comandosTecnicas(tecnicas, catalogo)]

describe('índice de la paleta de comandos', () => {
  it('reúne secciones, los 4 hosts, las 12 campañas y las 47 técnicas observadas, con su destino', () => {
    const por = (tipo: string) => indice.filter((c) => c.tipo === tipo)
    expect(por('host').map((c) => c.titulo)).toEqual(['SCRANTON', 'NASHUA', 'NEWYORK', 'UTICA'])
    expect(por('campana')).toHaveLength(12)
    expect(por('tecnica')).toHaveLength(47)
    expect(indice.find((c) => c.id === 'tecnica:T1685')).toMatchObject({ titulo: 'T1685 · Disable or Modify Tools', a: '/attack?tecnica=T1685' })
  })

  it('busca sin tildes ni mayúsculas, con todas las palabras, y por nombre de técnica', () => {
    expect(buscarComandos(indice, 'linea temporal')[0]).toMatchObject({ a: '/cronologia' })
    expect(buscarComandos(indice, 'NASHUA').some((c) => c.a === '/incidentes?id=p2-scranton-nashua')).toBe(true)
    expect(buscarComandos(indice, 'lsass memory').map((c) => c.id)).toContain('tecnica:T1003.001')
    expect(buscarComandos(indice, 'zzzz')).toEqual([])
  })

  it('sin consulta enseña las acciones (Copiloto), las secciones y los hosts', () => {
    const sin = buscarComandos(indice, '')
    expect(sin[0]).toMatchObject({ tipo: 'accion', a: '#copiloto' })
    expect(sin.every((c) => c.tipo === 'accion' || c.tipo === 'seccion' || c.tipo === 'host')).toBe(true)
  })
})

describe('paleta de comandos', () => {
  it('se abre con Ctrl+K, se recorre con flechas y lleva al destino con Intro', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/')
    await screen.findByRole('region', { name: 'Campañas' })
    await usuario.keyboard('{Control>}k{/Control}')
    const caja = await screen.findByRole('combobox', { name: /Buscar secciones/ })
    await usuario.type(caja, 'grafo de ataque')
    const lista = screen.getByRole('listbox', { name: 'Resultados' })
    expect(within(lista).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
    await usuario.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: /Grafo de ataque/ })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Buscar secciones/ })).not.toBeInTheDocument()
  })

  it('la barra superior dice dónde estás y abre la búsqueda', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/incidentes')
    const ruta = await screen.findByRole('navigation', { name: 'Ruta de navegación' })
    expect(ruta).toHaveTextContent('Investigación')
    expect(ruta).toHaveTextContent('Incidentes')
    await usuario.click(screen.getByRole('button', { name: /Buscar/ }))
    expect(await screen.findByRole('combobox', { name: /Buscar secciones/ })).toBeInTheDocument()
  })
})

describe('estado de sesión', () => {
  it('guarda, recupera y descarta lo inválido', () => {
    const esNumero = (v: unknown): v is number => typeof v === 'number'
    const { result, unmount } = renderHook(() => useEstadoSesion('prueba', 1, esNumero))
    act(() => result.current[1](5))
    unmount()
    expect(renderHook(() => useEstadoSesion('prueba', 1, esNumero)).result.current[0]).toBe(5)
    sessionStorage.setItem('tfg:prueba', '"no es un número"')
    expect(leerSesion('prueba', esNumero)).toBeUndefined()
    sessionStorage.setItem('tfg:prueba', '{roto')
    expect(leerSesion('prueba', esNumero)).toBeUndefined()
  })

  it('sigue funcionando si el almacenamiento lanza', () => {
    const espia = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado') })
    const { result } = renderHook(() => useEstadoSesion('otra', 'a', (v): v is string => typeof v === 'string'))
    act(() => result.current[1]('b'))
    expect(result.current[0]).toBe('b')
    espia.mockRestore()
  })

  it('los filtros de incidentes sobreviven a ir y volver', async () => {
    const usuario = userEvent.setup()
    const { unmount } = renderizarRutas('/incidentes')
    await usuario.type(await screen.findByRole('searchbox', { name: 'Buscar incidentes' }), 'NASHUA')
    unmount()
    renderizarRutas('/incidentes')
    expect(await screen.findByRole('searchbox', { name: 'Buscar incidentes' })).toHaveValue('NASHUA')
  })
})
