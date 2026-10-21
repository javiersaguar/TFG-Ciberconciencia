import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { cargarAlertasDay1, cargarAristasP2, cargarCampanaP2, cargarCampanasP1 } from '@/api/exportaciones'
import { construirIncidentes } from '@/api/simulado/incidentes'
import { recomendar } from '@/paginas/conciencia/asistente/reglas'
import { HELIOS } from '@/paginas/conciencia/organizaciones/helios'
import { rutaProbable } from '@/paginas/conciencia/razonamiento'
import { duracionEscenario, evaluar } from '@/paginas/conciencia/simulacion'
import { renderizarRutas } from '@/pruebas/utilidades'

import { alertasDeCampana, casoDeDemo, casoDeIncidente, planComoTexto } from './plan'

const [p1, p2, alertas, aristas] = await Promise.all([cargarCampanasP1(), cargarCampanaP2(), cargarAlertasDay1(), cargarAristasP2()])
const incidentes = construirIncidentes(p1, p2)
const incidente = (id: string) => incidentes.find((i) => i.id === id)!

describe('plan de respuesta (lógica)', () => {
  it('P2: bloquear WinRM y SMB/RPC con el número de conexiones real y la cuenta que las abre', () => {
    const caso = casoDeIncidente(incidente('p2-scranton-nashua'), alertas, aristas)
    const titulos = caso.propuestas.map((p) => p.titulo)
    expect(titulos).toContain('Bloquear WinRM (5985) de SCRANTON a NASHUA')
    expect(titulos).toContain('Bloquear SMB (445) y RPC (135) de SCRANTON a NASHUA')
    expect(titulos).toContain('Deshabilitar y restablecer la cuenta DMEVALS\\pbeesly')
    expect(caso.propuestas.find((p) => p.clave === 'bloquear-winrm')!.porque[0]).toMatch(/^4 conexiones 5985/)
    expect(caso.propuestas.find((p) => p.clave === 'bloquear-smb-rpc')!.porque[0]).toMatch(/^8 conexiones 445 y 5 conexiones 135/)
  })

  it('P1 de apt29: aislar el host y restablecer credenciales, con la evidencia de sus alertas', () => {
    const inc = incidente('p1-scranton-1')
    const enVentana = alertasDeCampana(inc, alertas)
    expect(enVentana.length).toBeGreaterThan(0)
    expect(enVentana.every((a) => a.host === 'SCRANTON')).toBe(true)
    const caso = casoDeIncidente(inc, alertas, aristas)
    expect(caso.propuestas[0].titulo).toBe('Aislar SCRANTON de la red')
    expect(caso.confianza?.total).toBe(0.85)
  })

  it('las campañas sin alertas exportadas usan la evidencia por etapa del oráculo y lo dicen', () => {
    const caso = casoDeIncidente(incidente('p1-lsass_campaign_02'), alertas, aristas)
    expect(caso.hechos.some((h) => /no tiene sus alertas exportadas/.test(h.texto))).toBe(true)
    expect(caso.procedenciaHechos.fuente).toMatch(/p1-campanas/)
  })

  it('ninguna propuesta lleva un efecto ejecutable: solo texto', () => {
    for (const inc of incidentes) {
      for (const p of casoDeIncidente(inc, alertas, aristas).propuestas) expect(p).not.toHaveProperty('efecto')
    }
    for (const p of casoDeDemo(HELIOS).propuestas) expect(p).not.toHaveProperty('efecto')
  })

  it('la demo usa las mismas funciones que /conciencia y enlaza a la simulación', () => {
    const t = duracionEscenario(HELIOS)
    const ev = evaluar(HELIOS, t, [])
    const caso = casoDeDemo(HELIOS)
    expect(caso.propuestas.map((p) => p.titulo)).toEqual(recomendar(HELIOS, ev, rutaProbable(HELIOS, ev), []).map((r) => r.titulo))
    expect(caso.enlaces[0]).toEqual({ texto: 'Ver el efecto en la simulación', a: `/conciencia?org=helios&t=${Math.round(t)}` })
  })

  it('el plan copiado es texto plano y dice que no ejecuta nada', () => {
    const texto = planComoTexto(casoDeIncidente(incidente('p2-scranton-nashua'), alertas, aristas))
    expect(texto).toMatch(/no ejecuta nada/)
    expect(texto).not.toMatch(/<[a-z]/i)
  })
})

describe('página del asistente de respuesta', () => {
  it('propone sin ejecutar: tres bloques, sin botón «Aplicar», con «Copiar como plan» y el aviso fijo', async () => {
    renderizarRutas('/respuesta?caso=p2-scranton-nashua')
    expect(await screen.findByRole('heading', { name: 'Movimiento lateral SCRANTON → NASHUA' })).toBeInTheDocument()
    for (const bloque of ['Hechos observados', 'Inferencias del sistema', 'Recomendaciones']) expect(screen.getByRole('region', { name: bloque })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Aplicar/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copiar como plan de respuesta' })).toBeInTheDocument()
    expect(screen.getByText('El asistente propone; no ejecuta acciones.')).toBeInTheDocument()
  })

  it('la demo enlaza a la simulación y /conciencia enlaza de vuelta al asistente', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/respuesta')
    await usuario.click(within(await screen.findByRole('navigation', { name: 'Casos' })).getByRole('button', { name: /Helios Farmacéutica/ }))
    expect(screen.getByRole('link', { name: /Ver el efecto en la simulación/ })).toHaveAttribute('href', expect.stringMatching(/^\/conciencia\?org=helios&t=\d+$/))
    expect(within(screen.getByRole('region', { name: 'Hechos observados' })).getByText('Correo de phishing a Marketing')).toBeInTheDocument()
  })
})
