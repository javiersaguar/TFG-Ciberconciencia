import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import ml1 from '@/api/datos/ml1-resultados.json'
import { CORPUS, CRONOLOGIA_DAY1, DATASETS, DAY1, P2 } from '@/api/simulado/corpus'
import { formatearDecimal, formatearEntero, formatearPorcentaje } from '@/componentes/datos/formato'
import { TODAS_LAS_SECCIONES } from '@/componentes/shell/navegacion'
import { buscarComandos, comandosBase } from '@/componentes/shell/comandos'
import { renderizarRutas } from '@/pruebas/utilidades'

import { pasoDeUrl, pasosPresentacion, rutaDePaso } from './guion'

const pasos = pasosPresentacion()

describe('guion de la presentación', () => {
  it('tiene ocho pasos, del problema a la demo, y cada uno lleva a una sección que existe', () => {
    expect(pasos.map((p) => p.id)).toEqual(['problema', 'tiempo', 'grafo', 'incidentes', 'respuesta', 'copiloto', 'evaluacion', 'conciencia'])
    const rutas = new Set(TODAS_LAS_SECCIONES.map((s) => s.ruta))
    for (const p of pasos) expect(rutas.has(p.ruta.split('?')[0])).toBe(true)
  })

  it('ninguna cifra está escrita a mano: todo número del texto sale de corpus.ts o de los resultados de ML-1', () => {
    // Las cifras que el guion tiene derecho a decir, construidas aquí desde las mismas fuentes y con el mismo formato.
    const aucs = ml1.resultados.map((r) => formatearDecimal(r.auc_roc, 3))
    const permitidas = new Set([
      formatearEntero(DAY1.alertas),
      String(Math.floor(DAY1.duracionS / 60)),
      String(DAY1.duracionS % 60),
      formatearEntero(DAY1.reglaDominante.alertas),
      formatearPorcentaje((DAY1.reglaDominante.alertas / DAY1.alertas) * 100, 0).replace(' %', ''),
      P2.primera.slice(0, 8),
      formatearEntero(P2.aristas),
      formatearEntero(CORPUS.alertas),
      formatearEntero(CORPUS.campanasP1 + CORPUS.campanasP2),
      formatearEntero(CORPUS.campanasP1),
      formatearEntero(CORPUS.campanasP2),
      formatearEntero(DATASETS.filter((d) => d.id.startsWith('LSASS_campaign')).length),
      formatearEntero(CRONOLOGIA_DAY1.find((c) => c.tactica === 'impact' && c.host === 'NASHUA')!.alertas),
      ...aucs,
      '800', // «NIST SP 800-61»: nombre de una norma, no una cifra del corpus
      '61',
    ])
    for (const p of pasos) {
      // cifras sueltas: no cuentan los dígitos pegados a letras (APT29, P1, D3FEND)
      const numeros = `${p.titulo} ${p.texto}`.match(/(?<![A-Za-z\d])(?:\d{1,2}:\d{2}:\d{2}|\d[\d.,]*\d|\d)(?![A-Za-z])/g) ?? []
      for (const n of numeros) expect(permitidas, `«${n}» en el paso «${p.id}»`).toContain(n)
    }
  })

  it('la regla dominante y el volumen cuadran con lo documentado (292 de 741, el 39 %)', () => {
    expect(pasos[0].texto).toContain(`${formatearEntero(292)} (39 %)`)
    expect(pasos[0].texto).toContain('26 min 27 s')
  })

  it('el parámetro de la URL se valida: fuera de rango o no numérico, no hay presentación', () => {
    expect(pasoDeUrl('1', 8)).toBe(1)
    expect(pasoDeUrl('8', 8)).toBe(8)
    for (const malo of [null, '0', '9', '-1', '1e1', '<img onerror=alert(1)>', '']) expect(pasoDeUrl(malo, 8)).toBeNull()
  })

  it('la ruta de un paso conserva su propia consulta y añade la presentación', () => {
    expect(rutaDePaso(pasos[7], 8)).toBe('/conciencia?org=helios&t=62&presentacion=8')
    expect(rutaDePaso(pasos[0], 1)).toBe('/?presentacion=1')
  })

  it('se puede iniciar desde Ctrl+K', () => {
    expect(buscarComandos(comandosBase(), 'presentacion')[0]).toMatchObject({ tipo: 'accion', a: '#presentacion' })
  })
})

describe('modo presentación en el portal', () => {
  it('con ?presentacion=1 enseña el paso 1, avanza con → y con el botón, retrocede con ← y sale con Esc', async () => {
    const usuario = userEvent.setup()
    const { enrutador } = renderizarRutas('/?presentacion=1')
    const tarjeta = await screen.findByRole('region', { name: 'Presentación' })
    expect(within(tarjeta).getByText('Presentación · paso 1 de 8')).toBeInTheDocument()
    expect(within(tarjeta).getByRole('heading', { name: pasos[0].titulo })).toBeInTheDocument()

    await usuario.keyboard('{ArrowRight}')
    await waitFor(() => expect(enrutador.state.location.pathname).toBe('/cronologia'))
    expect(enrutador.state.location.search).toBe('?presentacion=2')

    // la tarjeta ya enseña el paso 2 antes de pulsar (el enrutador cambia antes de que React vuelva a pintar)
    const tarjeta2 = await screen.findByRole('region', { name: 'Presentación' })
    await within(tarjeta2).findByText('Presentación · paso 2 de 8')
    await usuario.click(within(tarjeta2).getByRole('button', { name: /Siguiente/ }))
    await waitFor(() => expect(enrutador.state.location.pathname).toBe('/ataque'))

    await screen.findByText('Presentación · paso 3 de 8')
    await usuario.keyboard('{ArrowLeft}')
    await waitFor(() => expect(enrutador.state.location.pathname).toBe('/cronologia'))

    await screen.findByText('Presentación · paso 2 de 8')
    await usuario.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Presentación' })).not.toBeInTheDocument())
    expect(enrutador.state.location.pathname).toBe('/cronologia')
    expect(enrutador.state.location.search).toBe('')
    // recorre tres páginas enteras (la del grafo de ataque entre ellas): con la máquina cargada pasa de 5 s
  }, 15_000)

  it('sin el parámetro no hay tarjeta, y un valor no válido tampoco la abre', async () => {
    renderizarRutas('/?presentacion=99')
    await screen.findByRole('heading', { name: 'Situación', level: 1 })
    expect(screen.queryByRole('region', { name: 'Presentación' })).not.toBeInTheDocument()
  })

  it('en el paso del Copiloto abre el panel con una pregunta precargada', async () => {
    renderizarRutas('/incidentes?presentacion=6')
    await screen.findByRole('region', { name: 'Presentación' })
    expect(await screen.findByRole('complementary', { name: 'Copiloto' })).toBeInTheDocument()
  })
})
