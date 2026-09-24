import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderizarRutas } from '@/pruebas/utilidades'

/** Avanza el reloj de la demo `segundos` a velocidad ×1. */
function avanzar(segundos: number) {
  act(() => vi.advanceTimersByTime(segundos * 1000))
}

describe('Conciencia situacional', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  const preparar = (ruta = '/conciencia') => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const resultado = renderizarRutas(ruta)
    return { usuario, ...resultado }
  }

  it('en calma: el grafo con sus joyas y un asistente que espera la primera evidencia', async () => {
    const { container } = preparar()
    expect(await screen.findByRole('region', { name: 'Grafo de Helios Farmacéutica' })).toBeInTheDocument()
    expect(container.querySelectorAll('[data-estado="comprometido"]')).toHaveLength(0)
    expect(screen.getByRole('button', { name: /BD-FÓRMULAS · I\+D · normal · joya de la corona/ })).toBeInTheDocument()
    expect(within(screen.getByRole('complementary', { name: 'Asistente de respuesta' })).getByText(/Sin actividad sospechosa en Helios Farmacéutica/)).toBeInTheDocument()
  })

  it('el ataque avanza, el asistente recomienda, y aislar el equipo comprometido lo contiene', async () => {
    const { usuario, container } = preparar()
    await usuario.click(await screen.findByRole('button', { name: 'Simular ciberataque' }))
    avanzar(30)

    expect(container.querySelector('[data-activo="pc-mkt"]')).toHaveAttribute('data-estado', 'comprometido')
    expect(screen.getByLabelText('Áreas afectadas')).toHaveTextContent('Marketing')
    const asistente = screen.getByRole('complementary', { name: 'Asistente de respuesta' })
    expect(within(asistente).getByText(/La ruta más probable lleva a/)).toBeInTheDocument()
    expect(container.querySelectorAll('[data-ruta]').length).toBeGreaterThan(0)

    // las recomendaciones llegan ordenadas y cada una trae su porqué
    const respuesta = within(asistente).getByRole('region', { name: 'Respuesta inmediata' })
    const tarjetas = within(respuesta).getAllByRole('listitem').filter((li) => li.parentElement?.tagName === 'OL')
    expect(tarjetas.length).toBeGreaterThan(2)
    expect(tarjetas[0]).toHaveTextContent(/Inmediata/)

    // aislar el único equipo comprometido deja al atacante sin salida
    const aislar = tarjetas.find((li) => li.textContent?.includes('Aislar PC-MKT-07 de la red'))!
    expect(aislar).toHaveTextContent('Por qué:')
    await usuario.click(within(aislar).getByRole('button', { name: 'Aplicar' }))
    expect(within(asistente).getByRole('region', { name: 'Acciones aplicadas' })).toHaveTextContent('Aislar PC-MKT-07 de la red')
    expect(container.querySelector('[data-activo="pc-mkt"]')).toHaveAttribute('data-estado', 'aislado')

    await usuario.click(screen.getByRole('radio', { name: '×4' }))
    avanzar(30)
    expect(screen.getByText(/^Ataque contenido: la respuesta impidió/)).toBeInTheDocument()
    expect(container.querySelector('[data-activo="dc"]')).toHaveAttribute('data-estado', 'normal')
    expect(container.querySelectorAll('[data-ocurrido="false"]').length).toBeGreaterThan(0)
  })

  it('sin respuesta, el ataque termina alcanzando sus objetivos', async () => {
    const { usuario } = preparar('/conciencia?org=dmevals')
    await usuario.click(await screen.findByRole('radio', { name: '×4' }))
    await usuario.click(screen.getByRole('button', { name: 'Simular ciberataque' }))
    avanzar(35)
    expect(screen.getByText(/El atacante alcanzó 3 objetivos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Simular ciberataque' })).toBeInTheDocument()
  })

  it('?t= abre la simulación en pausa en ese segundo, para enseñar un momento concreto', async () => {
    const { container } = preparar('/conciencia?org=helios&t=62')
    expect(await screen.findByRole('region', { name: 'Grafo de Helios Farmacéutica' })).toBeInTheDocument()
    expect(container.querySelector('[data-activo="dc"]')).toHaveAttribute('data-estado', 'comprometido')
    expect(screen.getByRole('button', { name: 'Reanudar el ataque' })).toBeInTheDocument()
    expect(screen.getByText(/Restablecer krbtgt dos veces/)).toBeInTheDocument()
  })

  it('cada organización lleva su propia simulación: cambiar de una a otra no la reinicia', async () => {
    const { usuario, enrutador } = preparar()
    await usuario.click(await screen.findByRole('button', { name: 'Simular ciberataque' }))
    avanzar(10)
    const organizaciones = screen.getByRole('navigation', { name: 'Organizaciones' })
    await usuario.click(within(organizaciones).getByRole('button', { name: /DMEVALS/ }))
    expect(enrutador.state.location.search).toBe('?org=dmevals')
    expect(within(organizaciones).getByRole('button', { name: /Helios Farmacéutica/ })).toHaveTextContent('Ataque en curso')
    expect(within(organizaciones).getByRole('button', { name: /DMEVALS/ })).toHaveTextContent('En calma')
    expect(screen.getByRole('region', { name: 'Grafo de DMEVALS' })).toBeInTheDocument()
  })
})
