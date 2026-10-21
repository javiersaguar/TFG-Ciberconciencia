import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { renderizarRutas } from '@/pruebas/utilidades'

import { SECCIONES, SECCIONES_FUTURAS, seccionDe } from './navegacion'

describe('shell y navegación', () => {
  beforeEach(() => localStorage.clear())

  it('la barra lateral enseña las secciones construidas, las futuras con su fase y el aviso de datos simulados', async () => {
    renderizarRutas('/')
    const nav = await screen.findByRole('navigation', { name: 'Secciones del portal' })
    for (const seccion of SECCIONES) expect(within(nav).getByRole('link', { name: new RegExp(seccion.titulo) })).toBeInTheDocument()
    for (const seccion of SECCIONES_FUTURAS) {
      expect(within(nav).getByRole('link', { name: new RegExp(`${seccion.titulo}.*${seccion.fase}`) })).toBeInTheDocument()
    }
    expect(screen.getByText('Datos simulados · sin backend')).toBeInTheDocument()
  })

  it('navega a Observabilidad desde el menú', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/')
    await usuario.click(await screen.findByRole('link', { name: /Observabilidad/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Observabilidad' })).toBeInTheDocument()
  })

  it('una sección futura dice en qué fase llega y qué enseñará', async () => {
    renderizarRutas('/inteligencia')
    expect(await screen.findByRole('heading', { level: 1, name: 'Inteligencia de amenazas' })).toBeInTheDocument()
    expect(screen.getByText('Se construye en F4 · F8.3')).toBeInTheDocument()
    expect(screen.getByText(/OpenCTI \(STIX 2.1\)/)).toBeInTheDocument()
  })

  it('una ruta desconocida da «Página no encontrada» dentro del shell', async () => {
    renderizarRutas('/no-existe')
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Secciones del portal' })).toBeInTheDocument()
  })

  it('el menú se cierra, recuerda que está cerrado y vuelve a abrirse', async () => {
    const usuario = userEvent.setup()
    const { unmount } = renderizarRutas('/')
    await usuario.click(await screen.findByRole('button', { name: 'Cerrar el menú' }))
    expect(localStorage.getItem('tfg-menu-abierto')).toBe('0')
    unmount()
    renderizarRutas('/')
    await usuario.click(await screen.findByRole('button', { name: 'Abrir el menú' }))
    expect(localStorage.getItem('tfg-menu-abierto')).toBe('1')
  })

  it('seccionDe reconoce subrutas y rutas sin sección', () => {
    expect(seccionDe('/')?.titulo).toBe('Situación')
    expect(seccionDe('/grafo/algo')?.titulo).toBe('Grafo del pipeline')
    expect(seccionDe('/attack')?.titulo).toBe('Matriz ATT&CK')
    expect(seccionDe('/nada')).toBeUndefined()
  })
})
