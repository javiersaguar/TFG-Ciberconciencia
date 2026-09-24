import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderizarRutas } from '@/pruebas/utilidades'

import { NODOS } from './nodos'
import { DURACION_MS } from './useReplaySimulado'

const literal = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('Grafo del pipeline', () => {
  afterEach(() => vi.useRealTimers())

  it('dibuja todas las piezas, con las planificadas marcadas como tales', async () => {
    const { container } = renderizarRutas('/grafo')
    await screen.findByRole('region', { name: 'Grafo del pipeline' })
    for (const nodo of NODOS) {
      expect(screen.getByRole('button', { name: new RegExp(`^${literal(nodo.nombre ?? nodo.titulo)} · `) })).toBeInTheDocument()
    }
    expect(container.querySelectorAll('[data-estado="planificada"]')).toHaveLength(NODOS.filter((n) => n.estado === 'planificada').length)
    expect(container.querySelector('[data-arista="cep-grafo"]')).toHaveAttribute('data-planificada', 'true')
  })

  it('al pulsar una pieza abre su ficha con los ficheros del repositorio', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/grafo')
    await usuario.click(await screen.findByRole('button', { name: /^Correlación multi-etapa/ }))
    const ficha = await screen.findByRole('dialog', { name: 'Correlación multi-etapa (Pilar A)' })
    expect(ficha).toHaveTextContent('MATCH_RECOGNIZE')
    expect(ficha).toHaveTextContent('infra/flink/jobs/p1_0*.sql')
    await usuario.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('el replay simulado ilumina el camino del dato y termina en los totales medidos', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { container } = renderizarRutas('/grafo')
    await usuario.click(await screen.findByRole('button', { name: /Simular replay de apt29 day1/ }))

    act(() => vi.advanceTimersByTime(DURACION_MS / 2))
    expect(screen.getByRole('status', { name: 'Actividad del pipeline' })).toHaveTextContent(/Replay de apt29 day1 al \d+ %/)
    expect(container.querySelector('[data-arista="normalizador-deteccion"]')).toHaveAttribute('data-activa', 'true')
    expect(container.querySelector('[data-arista="cep-grafo"]')).not.toHaveAttribute('data-activa')

    act(() => vi.advanceTimersByTime(DURACION_MS))
    expect(screen.getByRole('status', { name: 'Actividad del pipeline' })).toHaveTextContent(
      'Replay terminado: 194.829 eventos, 741 alertas, 3 campañas de P1 y 1 de P2',
    )
    expect(container.querySelector('[data-activa="true"]')).toBeNull()
  })
})
