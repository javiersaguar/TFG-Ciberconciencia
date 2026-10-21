import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderizarRutas } from '@/pruebas/utilidades'

describe('menos texto en pantalla', () => {
  it.each(['/incidentes', '/attack', '/cronologia', '/respuesta', '/copiloto', '/evaluacion', '/'])('%s abre con una frase y deja el resto plegado en «Cómo leer esta página»', async (ruta) => {
    const usuario = userEvent.setup()
    renderizarRutas(ruta)
    const resumen = await screen.findByText('Cómo leer esta página')
    const desplegable = resumen.closest('details')!
    expect(desplegable).not.toHaveAttribute('open')
    await usuario.click(resumen)
    expect(desplegable).toHaveAttribute('open')
  })
})
