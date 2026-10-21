import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderizarRutas } from '@/pruebas/utilidades'

describe('asistente: hechos, inferencias, recomendaciones y autonomía (demo)', () => {
  it('el panel de la simulación es un resumen: enlaza al razonamiento completo y dice que «Aplicar» solo actúa sobre la simulación', async () => {
    renderizarRutas('/conciencia?org=helios&t=30')
    const asistente = await screen.findByRole('complementary', { name: 'Asistente de respuesta' })
    expect(within(asistente).getByRole('link', { name: /asistente de respuesta/ })).toHaveAttribute('href', '/respuesta?caso=helios&t=30')
    expect(within(asistente).queryByRole('region', { name: 'Hechos observados' })).not.toBeInTheDocument()
    expect(within(asistente).getByText(/solo cambia la simulación de esta demo/)).toBeInTheDocument()
  })

  it('los hechos y las inferencias de ese mismo instante están en /respuesta', async () => {
    renderizarRutas('/respuesta?caso=helios&t=30')
    expect(within(await screen.findByRole('region', { name: 'Hechos observados' })).getByText('Correo de phishing a Marketing')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Inferencias del sistema' })).toHaveTextContent('Patrones reconocidos: P1')
  })

  it('en nivel 1 pide confirmación explícita antes de aplicar, y los niveles 2 a 4 no se pueden elegir', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/conciencia?org=helios&t=30')
    const asistente = await screen.findByRole('complementary', { name: 'Asistente de respuesta' })
    for (const n of [2, 3, 4]) expect(within(asistente).getByRole('radio', { name: new RegExp(`Nivel ${n}`) })).toBeDisabled()
    await usuario.click(within(asistente).getByRole('radio', { name: /Nivel 1/ }))
    const tarjeta = within(within(asistente).getByRole('region', { name: 'Respuesta inmediata' })).getAllByRole('button', { name: 'Aplicar' })[0]
    await usuario.click(tarjeta)
    const dialogo = await screen.findByRole('dialog', { name: '¿Aplicar en la simulación?' })
    expect(within(asistente).queryByRole('region', { name: 'Acciones aplicadas' })).not.toBeInTheDocument()
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar y aplicar en la simulación' }))
    expect(within(asistente).getByRole('region', { name: 'Acciones aplicadas' })).toBeInTheDocument()
  })
})

describe('situación como panel SOC', () => {
  it('avisa (en una nota) de que el 99,1 % no es comparable con la línea base y enlaza a investigar desde cada bloque', async () => {
    renderizarRutas('/')
    const reduccion = await screen.findByRole('region', { name: 'Reducción de alertas' })
    expect(within(reduccion).getByRole('button', { name: /no es comparable con la línea base 741 → 87 \(88,3 %\)/ })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Tácticas por host' })).getByRole('link', { name: /Matriz ATT&CK/ })).toHaveAttribute('href', '/attack')
    expect(within(screen.getByRole('region', { name: 'Actividad de APT29 day1 por minuto' })).getByRole('link', { name: /Línea temporal/ })).toHaveAttribute('href', '/cronologia')
  })
})
