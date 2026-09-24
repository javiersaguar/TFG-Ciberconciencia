import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CAMPANAS } from '@/api/simulado/corpus'
import { renderizarRutas } from '@/pruebas/utilidades'

describe('Situación', () => {
  it('enseña las cifras del corpus, las campañas y las fases', async () => {
    renderizarRutas('/')
    const eventos = await screen.findByRole('region', { name: 'Eventos normalizados' })
    expect(within(eventos).getByText('530.401')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Reducción de alertas' })).getByText('99,1 %')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Campañas' })).getByText('12')).toBeInTheDocument()

    const tabla = screen.getByRole('table')
    // cabecera + una fila por campaña
    expect(within(tabla).getAllByRole('row')).toHaveLength(CAMPANAS.length + 1)
    expect(within(tabla).getByText('SCRANTON → NASHUA')).toBeInTheDocument()

    expect(screen.getByText('Pilar A — detección multi-etapa (CEP)')).toBeInTheDocument()
  })
})
