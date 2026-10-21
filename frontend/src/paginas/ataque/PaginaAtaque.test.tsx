import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderizarRutas } from '@/pruebas/utilidades'

describe('explorador del grafo de ataque', () => {
  it('se abre desde la navegación y enseña la leyenda de fundamentos', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/')
    const menu = await screen.findByRole('navigation', { name: 'Secciones del portal' })
    await usuario.click(within(menu).getByRole('link', { name: /Grafo de ataque/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Grafo de ataque · APT29 day1' })).toBeInTheDocument()
    // la leyenda va en una línea; lo que significa cada trazo, plegado hasta que se pide
    const leyenda = screen.getByRole('region', { name: 'Leyenda: fundamento de cada relación' })
    const desplegar = within(leyenda).getByRole('button', { name: 'Qué significa cada trazo' })
    expect(desplegar).toHaveAttribute('aria-expanded', 'false')
    await usuario.click(desplegar)
    expect(within(leyenda).getByText('Telemetría directa: aristas de Sysmon EID 3 y alertas Sigma.')).toBeInTheDocument()
  })

  it('al elegir una relación en la lista enseña su detalle, su fundamento y su procedencia', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/ataque')
    const relaciones = await screen.findByRole('list', { name: 'Relaciones' })
    await usuario.click(within(relaciones).getByRole('button', { name: /WinRM 5985 · ×4/ }))
    const detalle = screen.getByRole('region', { name: 'Detalle' })
    expect(within(detalle).getByRole('heading', { name: 'powershell.exe → NASHUA' })).toBeInTheDocument()
    expect(within(detalle).getByText('03:09:23,801')).toBeInTheDocument()
    expect(within(detalle).getByText('documentado')).toBeInTheDocument()
  })

  it('una selección de la URL que no existe se ignora; una que existe se respeta', async () => {
    renderizarRutas('/ataque?sel=camp-p2-scranton-nashua')
    const detalle = await screen.findByRole('region', { name: 'Detalle' })
    expect(within(detalle).getByText('1,00')).toBeInTheDocument()
  })

  it('los filtros reducen lo visible y la secuencia avanza paso a paso', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/ataque?sel=<script>')
    expect(await screen.findByText('Nada seleccionado')).toBeInTheDocument()
    const filtros = screen.getByRole('group', { name: 'Fundamento' })
    await usuario.click(within(filtros).getByRole('button', { name: /Inferido/ }))
    expect(within(screen.getByRole('list', { name: 'Nodos' })).queryByRole('button', { name: /campaña/ })).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /Siguiente/ }))
    expect(screen.getByText(/Paso 1 de 10/)).toBeInTheDocument()
  })
})
