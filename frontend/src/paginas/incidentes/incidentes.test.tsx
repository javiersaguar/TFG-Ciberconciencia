import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { cargarCampanaP2, cargarCampanasP1 } from '@/api/exportaciones'
import { CAMPANAS, CORPUS } from '@/api/simulado/corpus'
import { construirIncidentes } from '@/api/simulado/incidentes'
import { renderizarRutas } from '@/pruebas/utilidades'

import { CRITERIOS_INICIALES, filtrarIncidentes, leerIncidente, ordenarIncidentes } from './logica'

const incidentes = construirIncidentes(await cargarCampanasP1(), await cargarCampanaP2())

describe('incidentes (lógica)', () => {
  it('son las 12 campañas documentadas, sin ninguna puntuación de prioridad inventada', () => {
    expect(incidentes).toHaveLength(CAMPANAS.length)
    expect(incidentes).toHaveLength(CORPUS.campanasP1 + CORPUS.campanasP2)
    for (const i of incidentes) expect(i).not.toHaveProperty('prioridad')
  })

  it('las 12 tienen su confianza medida (21-10) y coincide con lo que la bitácora ya documentaba', () => {
    expect(incidentes.every((i) => i.confianza !== null)).toBe(true)
    const confianza = Object.fromEntries(incidentes.map((i) => [i.id, i.confianza]))
    // las que ya estaban en la bitácora (31-07) y las nuevas de apt29 (21-10 (2))
    expect(confianza).toMatchObject({ 'p1-lsass_campaign_01': 0.5, 'p1-lsass_campaign_02': 0.95, 'p1-lsass_campaign_04': 0.85, 'p1-scranton-1': 0.85, 'p1-nashua': 0.8, 'p1-scranton-2': 0.65, 'p2-scranton-nashua': 1 })
    for (const i of incidentes.filter((x) => x.patron === 'P1')) {
      expect(i.factores.reduce((s, f) => s + (f.presente ? f.peso : 0), 0)).toBeCloseTo(i.confianza!, 10)
    }
  })

  it('las campañas LSASS ya tienen host y ventana', () => {
    for (const i of incidentes.filter((x) => x.dataset.startsWith('LSASS'))) {
      expect(i.hosts).toHaveLength(1)
      expect(i.inicio).not.toBeNull()
      expect(i.fin).not.toBeNull()
    }
  })

  it('busca sin distinguir mayúsculas ni tildes y filtra por patrón y dataset', () => {
    expect(filtrarIncidentes(incidentes, { ...CRITERIOS_INICIALES, texto: 'nashua' }).map((i) => i.id).sort()).toEqual(['p1-nashua', 'p2-scranton-nashua'])
    expect(filtrarIncidentes(incidentes, { ...CRITERIOS_INICIALES, patrones: ['P2'] })).toHaveLength(1)
    expect(filtrarIncidentes(incidentes, { ...CRITERIOS_INICIALES, grupo: 'lsass' })).toHaveLength(7)
    expect(filtrarIncidentes(incidentes, { ...CRITERIOS_INICIALES, texto: 'MIMIKATZ' }).map((i) => i.id)).toEqual(['p1-lsass_campaign_01'])
  })

  it('ordena de forma estable y deja los valores no documentados al final en los dos sentidos', () => {
    // ya no hay confianzas sin documentar: se simula una para comprobar que los `null` van al final
    const conHueco = incidentes.map((i, n) => (n === 0 ? { ...i, confianza: null } : i))
    const desc = ordenarIncidentes(conHueco, { campo: 'confianza', sentido: 'desc' })
    const asc = ordenarIncidentes(conHueco, { campo: 'confianza', sentido: 'asc' })
    expect(desc[0].confianza).toBe(1)
    expect(desc.at(-1)!.confianza).toBeNull()
    expect(asc.at(-1)!.confianza).toBeNull()
    expect(ordenarIncidentes(incidentes, { campo: 'alertas', sentido: 'desc' })[0].id).toBe('p1-scranton-1')
  })

  it('?id= solo selecciona un incidente que exista', () => {
    expect(leerIncidente('p2-scranton-nashua', incidentes)?.patron).toBe('P2')
    expect(leerIncidente('"><script>', incidentes)).toBeUndefined()
  })
})

describe('página de incidentes', () => {
  it('lista, busca y abre el detalle con evidencia y enlaces', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/incidentes')
    expect(await screen.findByRole('heading', { level: 1, name: 'Incidentes' })).toBeInTheDocument()
    await usuario.type(await screen.findByRole('searchbox', { name: 'Buscar incidentes' }), 'NASHUA')
    expect(screen.getByText('2 de 12')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /Ver el incidente P2/ }))
    const detalle = screen.getByRole('region', { name: 'Detalle del incidente' })
    expect(within(detalle).getByText('PsExec64.exe')).toBeInTheDocument()
    expect(within(detalle).getByRole('link', { name: /Grafo de ataque/ })).toHaveAttribute('href', '/ataque?sel=camp-p2-scranton-nashua')
    expect(within(detalle).getByRole('link', { name: /Asistente de respuesta/ })).toHaveAttribute('href', '/respuesta?caso=p2-scranton-nashua')
  })

  it('sin columna de prioridad, con las 7 variantes LSASS en un grupo plegable y su detalle al lado', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/incidentes')
    const lista = await screen.findByRole('region', { name: 'Lista de incidentes' })
    expect(within(lista).queryByRole('columnheader', { name: /Prioridad/ })).not.toBeInTheDocument()
    const grupo = within(lista).getByRole('button', { name: /Campañas LSASS · 7 variantes de volcado \(7\)/ })
    expect(grupo).toHaveAttribute('aria-expanded', 'false')
    await usuario.click(grupo)
    expect(grupo).toHaveAttribute('aria-expanded', 'true')
    await usuario.click(within(lista).getAllByRole('button', { name: /Ver el incidente P1 de ACCT01/ })[0])
    const detalle = screen.getByRole('complementary', { name: 'Incidente elegido' })
    // host, ventana con fecha y confianza de las LSASS, ya medidos (21-10)
    expect(detalle).toHaveTextContent('2023-08-15')
    expect(detalle).toHaveTextContent('0,95')
  })

  it('el orden por columna se anuncia con aria-sort', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/incidentes?id=p1-scranton-1')
    const cabecera = await screen.findByRole('columnheader', { name: /Ventana/ })
    expect(cabecera).toHaveAttribute('aria-sort', 'none')
    await usuario.click(within(cabecera).getByRole('button'))
    expect(cabecera).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByRole('region', { name: 'Detalle del incidente' })).toHaveTextContent('Cred Dump Tools Dropped Files')
  })
})
