import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderizarRutas } from '@/pruebas/utilidades'

describe('Situación (portada SOC)', () => {
  it('indicadores con jerarquía: tres principales y la reducción de P1 con su nota de no comparabilidad', async () => {
    renderizarRutas('/')
    expect(within(await screen.findByRole('region', { name: 'Eventos normalizados' })).getByText('530.401')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Campañas' })).getByText('12')).toBeInTheDocument()
    const reduccion = screen.getByRole('region', { name: 'Reducción de alertas' })
    expect(within(reduccion).getByText('99,1 %')).toBeInTheDocument()
    expect(within(reduccion).getByRole('button', { name: /no es comparable con la línea base/ })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Técnicas observadas' })).getByText(/34 en F2 \(28-07\)/)).toBeInTheDocument()
  })

  it('actividad por minuto (28 minutos), severidad real, tácticas por host y campañas de day1 con enlace', async () => {
    renderizarRutas('/')
    const actividad = await screen.findByRole('region', { name: 'Actividad de APT29 day1 por minuto' })
    // tabla accesible: cabecera + un minuto por fila, de 02:56 a 03:23
    expect(within(actividad).getAllByRole('row', { hidden: true })).toHaveLength(29)
    const severidad = screen.getByRole('region', { name: 'Reparto por severidad' })
    for (const n of ['263', '413', '55', '10']) expect(within(severidad).getByText(n)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Tácticas por host' })).getByText('(sin táctica)')).toBeInTheDocument()
    const campanas = screen.getByRole('region', { name: 'Campañas de APT29 day1' })
    expect(within(campanas).getByRole('link', { name: 'SCRANTON → NASHUA' })).toHaveAttribute('href', '/incidentes?id=p2-scranton-nashua')
    expect(within(campanas).getAllByRole('row')).toHaveLength(5)
  })

  it('el avance del proyecto vive en /proyecto, no en la portada', async () => {
    renderizarRutas('/proyecto')
    expect(await screen.findByText('Pilar A — detección multi-etapa (CEP)')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Estado del pipeline/ })).toBeInTheDocument()
  })
})
