import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { renderizarRutas } from '@/pruebas/utilidades'

import { CLAVE_TEMA } from './tema'

beforeEach(() => localStorage.clear())
afterEach(() => document.documentElement.classList.remove('dark'))

describe('BotonTema en el shell', () => {
  it('empieza en claro y cambia a oscuro (y vuelve) recordándolo', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/')
    const boton = await screen.findByRole('button', { name: 'Cambiar a modo oscuro' })
    expect(boton).toHaveAttribute('aria-pressed', 'false')
    expect(document.documentElement).not.toHaveClass('dark')

    await usuario.click(boton)
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem(CLAVE_TEMA)).toBe('oscuro')
    const vuelta = screen.getByRole('button', { name: 'Cambiar a modo claro' })
    expect(vuelta).toHaveAttribute('aria-pressed', 'true')

    await usuario.click(vuelta)
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem(CLAVE_TEMA)).toBe('claro')
  })

  it('se usa con el teclado', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/')
    const boton = await screen.findByRole('button', { name: 'Cambiar a modo oscuro' })
    boton.focus()
    await usuario.keyboard('{Enter}')
    expect(document.documentElement).toHaveClass('dark')
    await usuario.keyboard(' ')
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('sigue visible con la barra lateral cerrada', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/')
    await usuario.click(await screen.findByRole('button', { name: 'Cerrar el menú' }))
    expect(screen.getByRole('button', { name: 'Abrir el menú' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cambiar a modo oscuro' })).toBeVisible()
  })
})
