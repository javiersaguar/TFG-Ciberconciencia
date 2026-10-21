import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { BLOQUE_P1, CRONOLOGIA_DAY1 } from '@/api/simulado/corpus'
import { construirCronologia } from '@/api/simulado/cronologia'
import { cargarAlertasDay1, cargarAristasP2, cargarCampanaP2, cargarCampanasP1 } from '@/api/exportaciones'
import { construirGrafoAtaque } from '@/api/simulado/grafoAtaque'
import { milisegundosDelDia } from '@/componentes/datos/hora'
import { renderizarRutas } from '@/pruebas/utilidades'

import { DIA, enlaceGrafo, filtrarAlertas, HOSTS, leerRango, marcas, msDeTexto, RANGO_MINIMO, rangoDeArrastre, resolverSeleccion, textoDeMs } from './linea'
import { FILTROS_CRONOLOGIA, filtrarCronologia, leerEvento, leerHost, ordenarCronologia } from './logica'

const eventos = ordenarCronologia(construirCronologia())

describe('línea temporal (lógica)', () => {
  it('incluye las 21 filas por táctica, todo el bloque de P1 y los hitos de P2', () => {
    expect(eventos.filter((e) => e.tipo === 'tactica')).toHaveLength(CRONOLOGIA_DAY1.length)
    for (const a of BLOQUE_P1) expect(eventos.some((e) => e.id === a.id)).toBe(true)
    expect(eventos.some((e) => e.id === 'red-winrm')).toBe(true)
  })

  it('va en orden y marca como incierto lo que comparte segundo sin milisegundos', () => {
    const tiempos = eventos.map((e) => milisegundosDelDia(e.hora))
    expect([...tiempos].sort((a, b) => a - b)).toEqual(tiempos)
    // 03:19:17 † (netsh reconstruida) y 03:19:17,154 comparten segundo: el orden entre ellas no es seguro
    expect(eventos.find((e) => e.id === 'al-0319-netsh')?.ordenIncierto).toBe(true)
    expect(eventos.find((e) => e.id === 'al-0305-lsass')?.ordenIncierto).toBe(false)
  })

  it('las reconstruidas no se enseñan con milisegundos', () => {
    for (const e of eventos.filter((x) => x.hora.resolucion !== 'ms')) expect(e.hora.hora).not.toContain('.')
  })

  it('filtra por host, nivel y tipo', () => {
    const nashua = filtrarCronologia(eventos, { ...FILTROS_CRONOLOGIA, hosts: ['NASHUA'] })
    expect(nashua.every((e) => e.hosts.some((h) => h.includes('NASHUA')))).toBe(true)
    const altos = filtrarCronologia(eventos, { ...FILTROS_CRONOLOGIA, niveles: ['high'] })
    expect(altos.map((e) => e.id).sort()).toEqual(['al-0300-drop', 'al-0300-drop-2', 'al-0309-remota'])
    expect(filtrarCronologia(eventos, { ...FILTROS_CRONOLOGIA, tipos: ['red'] })).toHaveLength(2)
  })

  it('cada salto al grafo apunta a un nodo o arista que existe, y la URL se valida', async () => {
    const [campanasP1, campanaP2, aristas] = await Promise.all([cargarCampanasP1(), cargarCampanaP2(), cargarAristasP2()])
    const grafo = construirGrafoAtaque({ campanasP1, campanaP2, aristas })
    const ids = new Set([...grafo.nodos.map((n) => n.id), ...grafo.aristas.map((a) => a.id)])
    for (const e of eventos) if (e.enGrafo) expect(ids.has(e.enGrafo), `${e.id} → ${e.enGrafo}`).toBe(true)
    expect(leerEvento('al-0305-lsass', eventos)).toBe('al-0305-lsass')
    expect(leerEvento('javascript:alert(1)', eventos)).toBeNull()
    expect(leerHost('NASHUA')).toBe('NASHUA')
    expect(leerHost('<b>')).toBeNull()
  })
})

const [alertas, aristasP2] = await Promise.all([cargarAlertasDay1(), cargarAristasP2()])

describe('línea temporal real (lógica)', () => {
  it('horas en texto y en milisegundos, con validación', () => {
    expect(msDeTexto('03:09')).toBe(((3 * 60 + 9) * 60) * 1000)
    expect(textoDeMs(msDeTexto('03:09:23')!)).toBe('03:09:23')
    for (const malo of ['3:09', '25:00', '03:61', '<b>', null]) expect(msDeTexto(malo)).toBeNull()
  })

  it('?desde y ?hasta: solo rangos válidos dentro de day1; si no, todo el día', () => {
    expect(leerRango('03:09', '03:18')).toEqual({ desde: msDeTexto('03:09'), hasta: msDeTexto('03:18') })
    expect(leerRango('03:18', '03:09')).toEqual(DIA)
    expect(leerRango('javascript:', '03:18')).toEqual(DIA)
    expect(leerRango('01:00', '03:10').desde).toBe(DIA.desde)
  })

  it('el brush ordena, recorta a day1, impone un rango mínimo y un clic no es un rango', () => {
    expect(rangoDeArrastre(100, 102, DIA, 1000)).toBeNull()
    const r = rangoDeArrastre(600, 200, DIA, 1000)!
    expect(r.desde).toBeLessThan(r.hasta)
    const estrecho = rangoDeArrastre(500, 505, DIA, 100_000)!
    expect(estrecho.hasta - estrecho.desde).toBeGreaterThanOrEqual(RANGO_MINIMO)
    expect(rangoDeArrastre(-500, 5000, DIA, 1000)).toEqual(DIA)
  })

  it('las marcas del eje se adaptan al rango', () => {
    expect(marcas(DIA).length).toBeLessThan(20)
    const corto = { desde: msDeTexto('03:09')!, hasta: msDeTexto('03:11')! }
    expect(marcas(corto).some((m) => m.texto.split(':').length === 3)).toBe(true)
  })

  it('el día entero con todos los filtros son las 741; el rango y los filtros recortan', () => {
    const todos = { rango: DIA, hosts: [...HOSTS], niveles: ['critical', 'high', 'medium', 'low', 'informational'] as const }
    expect(filtrarAlertas(alertas, { ...todos, niveles: [...todos.niveles] })).toHaveLength(741)
    const salto = filtrarAlertas(alertas, { ...todos, niveles: [...todos.niveles], rango: { desde: msDeTexto('03:09')!, hasta: msDeTexto('03:18')! } })
    expect(salto.every((a) => a.ms >= msDeTexto('03:09')! && a.ms <= msDeTexto('03:18')!)).toBe(true)
    expect(filtrarAlertas(alertas, { ...todos, niveles: ['high'] }).every((a) => a.nivel === 'high')).toBe(true)
  })

  it('?sel= acepta alert_id, arista-N y los ids antiguos, que se traducen a su evento real', () => {
    const remota = resolverSeleccion('al-0309-remota', alertas, aristasP2, eventos)
    expect(remota?.tipo === 'alerta' && remota.alerta.regla).toBe('Remote LSASS Process Access Through Windows Remote Management')
    const winrm = resolverSeleccion('red-winrm', alertas, aristasP2, eventos)
    expect(winrm?.tipo === 'arista' && winrm.arista.hora.hora).toBe('03:09:23.801')
    expect(resolverSeleccion(alertas[5].id, alertas, aristasP2, eventos)).toMatchObject({ tipo: 'alerta' })
    expect(resolverSeleccion('arista-17', alertas, aristasP2, eventos)).toMatchObject({ tipo: 'arista', indice: 16 })
    expect(resolverSeleccion('arista-99', alertas, aristasP2, eventos)).toBeUndefined()
    expect(resolverSeleccion('javascript:alert(1)', alertas, aristasP2, eventos)).toBeUndefined()
    if (remota?.tipo === 'alerta') expect(enlaceGrafo(remota.alerta, eventos, [])).toBe('/ataque?sel=alerta-al-0309-remota')
  })
})

describe('página de la línea temporal', () => {
  it('abre el evento de la URL (también con un id antiguo) con su detalle y su enlace al grafo', async () => {
    renderizarRutas('/cronologia?sel=al-0309-remota')
    const detalle = await screen.findByRole('region', { name: 'Evento elegido' })
    expect(detalle).toHaveTextContent('Remote LSASS Process Access Through Windows Remote Management')
    expect(within(detalle).getByRole('link', { name: /Ver en el grafo/ })).toHaveAttribute('href', '/ataque?sel=alerta-al-0309-remota')
    const fila = within(screen.getByRole('region', { name: 'Alertas del rango' })).getAllByRole('row').find((r) => r.getAttribute('aria-current') === 'true')
    expect(fila).toBeDefined()
  })

  it('los atajos de rango y los filtros recortan la lista, que dice cuántas quedan', async () => {
    const usuario = userEvent.setup()
    renderizarRutas('/cronologia')
    expect(await screen.findByText(/· 741 alertas/)).toBeInTheDocument()
    await usuario.click(within(screen.getByRole('group', { name: 'Rango' })).getByRole('button', { name: 'Salto a NASHUA' }))
    const enSalto = alertas.filter((a) => a.ms >= msDeTexto('03:09')! && a.ms <= msDeTexto('03:18')!).length
    expect(screen.getByText(new RegExp(`· ${enSalto} alertas`))).toBeInTheDocument()
    await usuario.click(within(screen.getByRole('group', { name: 'Nivel' })).getByRole('button', { name: 'Alto' }))
    const altosSalto = alertas.filter((a) => a.nivel !== 'high' && a.ms >= msDeTexto('03:09')! && a.ms <= msDeTexto('03:18')!).length
    expect(screen.getByText(new RegExp(`· ${altosSalto} alertas`))).toBeInTheDocument()
  })
})
