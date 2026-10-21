import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderizarRutas } from '@/pruebas/utilidades'

describe('Observabilidad', () => {
  it('abre el primer cuadro con sus filas y paneles, cada uno con su procedencia', async () => {
    renderizarRutas('/observabilidad')
    const cuadro = await screen.findByRole('tabpanel', { name: 'Cuadro Salud del pipeline' }, { timeout: 4000 })
    expect(within(cuadro).getByRole('heading', { name: 'Bus de eventos (Redpanda)' })).toBeInTheDocument()
    const particiones = within(cuadro).getByRole('region', { name: 'Particiones' })
    // el número se anima hasta su valor: se espera al final (con la máquina cargada tarda más)
    expect(await within(particiones).findByText('17', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(within(particiones).getByText('documentado')).toBeInTheDocument()
    expect(within(within(cuadro).getByRole('region', { name: 'Tráfico Kafka (bytes/s)' })).getByText('ilustrativo')).toBeInTheDocument()
  })

  it('cambia de cuadro con las pestañas y dibuja tablas, indicador y grafo', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/observabilidad')
    await screen.findByRole('tabpanel', { name: 'Cuadro Salud del pipeline' }, { timeout: 4000 })

    await usuario.click(screen.getByRole('tab', { name: /Cobertura y calidad/ }))
    const calidad = await screen.findByRole('tabpanel', { name: 'Cuadro Cobertura y calidad' })
    expect(within(calidad).getByRole('img', { name: /Cobertura OCSF de apt29 day1: 99,4 %/ })).toBeInTheDocument()
    const datasets = within(calidad).getByRole('region', { name: 'Datasets del corpus F3' })
    expect(within(datasets).getByText('SDWIN-200501225525')).toBeInTheDocument()
    expect(within(datasets).getByText('741')).toBeInTheDocument()

    await usuario.click(screen.getByRole('tab', { name: /Movimiento lateral/ }))
    const lateral = await screen.findByRole('tabpanel', { name: 'Cuadro Movimiento lateral' })
    const grafo = within(lateral).getByRole('img', { name: /Quién se conecta con quién/ })
    expect(within(grafo).getByText('SCRANTON')).toBeInTheDocument()
    expect(within(grafo).getByText(/17 conexiones/)).toBeInTheDocument()
  })

  it('el cuadro abierto va en la URL: se puede enlazar y un uid desconocido abre el primero', async () => {
    const usuario = userEvent.setup()
    const { enrutador } = renderizarRutas('/observabilidad?cuadro=tfg-lateral-movement')
    expect(await screen.findByRole('tabpanel', { name: 'Cuadro Movimiento lateral' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('tab', { name: /Cobertura y calidad/ }))
    expect(enrutador.state.location.search).toBe('?cuadro=tfg-data-quality')

    await enrutador.navigate('/observabilidad?cuadro=no-existe')
    expect(await screen.findByRole('tabpanel', { name: 'Cuadro Salud del pipeline' }, { timeout: 4000 })).toBeInTheDocument()
  })

  it('ningún panel del cuadro de seguridad es ilustrativo', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/observabilidad')
    await usuario.click(await screen.findByRole('tab', { name: /Panel de seguridad/ }))
    const seguridad = await screen.findByRole('tabpanel', { name: 'Cuadro Panel de seguridad' })
    expect(within(seguridad).queryByText('ilustrativo')).not.toBeInTheDocument()
    expect(within(within(seguridad).getByRole('region', { name: 'Alertas' })).getByText('1.184')).toBeInTheDocument()
  })
})
