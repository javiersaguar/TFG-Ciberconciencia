import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderizarRutas } from '@/pruebas/utilidades'

describe('mapa mundial del boceto', () => {
  it('declara la simulación, permite pausar y mantiene visible la procedencia', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/mapa')
    expect(await screen.findByRole('heading', { level: 1, name: 'Mapa mundial de alertas' })).toBeInTheDocument()
    expect(screen.getByText('Demo geográfica ilustrativa.')).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Mapa de rutas geográficas' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Pausar demo' }))
    expect(screen.getByText('Demo en pausa')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Reanudar demo' }))
    expect(screen.getByText('Demo en directo')).toBeInTheDocument()
  })

  it('abre el detalle de una ruta, filtra y ofrece un estado vacío', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/mapa')
    const tabla = await screen.findByRole('table', { name: 'Alertas geográficas recientes' })
    await usuario.click(screen.getByRole('button', { name: 'Pausar demo' }))
    const ruta = within(tabla).getAllByRole('button')[0]
    await usuario.click(ruta)
    const detalle = screen.getByRole('complementary', { name: 'Detalle de la alerta geográfica' })
    expect(within(detalle).getByText('ORIGEN')).toBeInTheDocument()
    expect(within(detalle).getByText('DESTINO')).toBeInTheDocument()
    expect(within(detalle).getByText(/Sensor de la demo/)).toBeInTheDocument()
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por severidad' }), 'critical')
    const niveles = within(tabla).getAllByText('nivel crítico')
    expect(niveles.length).toBeGreaterThan(0)
    expect(within(tabla).queryByText('nivel bajo')).not.toBeInTheDocument()
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por país' }), 'CAN')
    expect(within(tabla).getByText('Sin alertas para la selección actual.')).toBeInTheDocument()
    expect(screen.getByText('No hay alertas con estos filtros en la ventana actual.')).toBeInTheDocument()
  })

  it('valida la URL y permite reiniciar con el reloj pausado', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/mapa?nivel=no-valido&pais=no-valido')
    expect(await screen.findByRole('table', { name: 'Alertas geográficas recientes' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filtrar por severidad' })).toHaveValue('todos')
    expect(screen.getByRole('combobox', { name: 'Filtrar por país' })).toHaveValue('')
    await usuario.click(screen.getByRole('button', { name: 'Pausar demo' }))
    await usuario.click(screen.getByRole('button', { name: 'Reiniciar demo geográfica' }))
    expect(screen.getByText('Demo en pausa')).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Alertas geográficas recientes' })).getAllByRole('button')).toHaveLength(1)
  })

  it('sin WebGL el globo no se ofrece: el 3D está desactivado y un ?vista=3d se queda en el mapa 2D', async () => {
    renderizarRutas('/mapa?vista=3d')
    expect(await screen.findByRole('region', { name: 'Mapa de rutas geográficas' })).toBeInTheDocument()
    const vista = screen.getByRole('radiogroup', { name: 'Vista del mapa' })
    expect(within(vista).getByRole('radio', { name: '2D' })).toHaveAttribute('aria-checked', 'true')
    expect(within(vista).getByRole('radio', { name: '3D' })).toBeDisabled()
    expect(screen.queryByRole('region', { name: 'Globo de rutas geográficas' })).not.toBeInTheDocument()
  })
})
