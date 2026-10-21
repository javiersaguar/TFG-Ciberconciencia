/**
 * Recorrido de extremo a extremo del portal: navegación, tema claro/oscuro (recordado y sin parpadeo), explorador del
 * grafo de ataque (filtros, selección con ratón y teclado, secuencia y reproducción), la línea temporal con su brush,
 * el maestro-detalle de incidentes, la paleta Ctrl+K, la matriz por táctica, el copiloto, la demo de conciencia
 * situacional, capturas de cada pantalla en los dos temas y el peso de la primera carga. Corre en los tres anchos de `playwright.config.ts`.
 */
import { expect, test, type Page } from '@playwright/test'

const PANTALLAS = [
  { ruta: '/', menu: 'Situación', h1: 'Situación', nombre: 'situacion' },
  { ruta: '/incidentes?id=p2-scranton-nashua', menu: 'Incidentes', h1: 'Incidentes', nombre: 'incidentes' },
  { ruta: '/ataque?sel=e-winrm', menu: 'Grafo de ataque', h1: 'Grafo de ataque · APT29 day1', nombre: 'ataque' },
  { ruta: '/cronologia?sel=al-0309-remota', menu: 'Línea temporal', h1: 'Línea temporal · APT29 day1', nombre: 'cronologia' },
  { ruta: '/attack?tecnica=T1003.001', menu: 'Matriz ATT&CK', h1: 'Matriz ATT&CK', nombre: 'attack' },
  { ruta: '/respuesta?caso=p2-scranton-nashua', menu: 'Asistente de respuesta', h1: 'Asistente de respuesta', nombre: 'respuesta' },
  { ruta: '/copiloto', menu: 'Copiloto', h1: 'Copiloto', nombre: 'copiloto' },
  { ruta: '/proyecto', menu: 'Proyecto', h1: 'Proyecto', nombre: 'proyecto' },
  { ruta: '/evaluacion', menu: 'Evaluación', h1: 'Evaluación', nombre: 'evaluacion' },
  { ruta: '/grafo', menu: 'Grafo del pipeline', h1: 'Grafo del pipeline', nombre: 'grafo' },
  { ruta: '/observabilidad', menu: 'Observabilidad', h1: 'Observabilidad', nombre: 'observabilidad' },
  { ruta: '/conciencia?org=helios&t=150', menu: 'Conciencia situacional', h1: 'Conciencia situacional', nombre: 'conciencia' },
  { ruta: '/inteligencia', menu: 'Inteligencia de amenazas', h1: 'Inteligencia de amenazas', nombre: 'inteligencia' },
] as const

/** Falla el test si la página escribe errores en la consola o lanza excepciones. */
function vigilarErrores(page: Page): string[] {
  const errores: string[] = []
  page.on('console', (m) => m.type() === 'error' && errores.push(m.text()))
  page.on('pageerror', (e) => errores.push(e.message))
  return errores
}

const menu = (page: Page) => page.getByRole('navigation', { name: 'Secciones del portal' })

test('navega por todas las secciones desde el menú, sin errores en consola', async ({ page }) => {
  const errores = vigilarErrores(page)
  await page.goto('/')
  for (const p of PANTALLAS) {
    await menu(page).getByRole('link', { name: new RegExp(`^${p.menu.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click()
    await expect(page.getByRole('heading', { level: 1, name: p.h1, exact: true })).toBeAttached()
  }
  expect(errores).toEqual([])
})

test('el tema cambia, se recuerda al recargar y se aplica antes del primer pintado', async ({ page }) => {
  // Antes de cualquier script de la página: anota la clase de <html> en cuanto aparece <body> (el primer pintado).
  await page.addInitScript(() => {
    new MutationObserver((_c, observador) => {
      if (document.body) {
        ;(window as unknown as { claseAlPintar: string }).claseAlPintar = document.documentElement.className
        observador.disconnect()
      }
    }).observe(document, { childList: true, subtree: true })
  })
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).not.toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Cambiar a modo oscuro' }).click()
  await expect(html).toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: 'Cambiar a modo claro' })).toHaveAttribute('aria-pressed', 'true')

  await page.reload()
  await expect(html).toHaveClass(/dark/)
  expect(await page.evaluate(() => (window as unknown as { claseAlPintar: string }).claseAlPintar)).toContain('dark')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0e131a')

  // también con la barra lateral cerrada, y vuelta al claro
  await page.getByRole('button', { name: 'Cerrar el menú' }).click()
  await page.getByRole('button', { name: 'Cambiar a modo claro' }).click()
  await expect(html).not.toHaveClass(/dark/)
  await page.reload()
  await expect(html).not.toHaveClass(/dark/)
})

test('explorador del grafo: filtros, selección con ratón y con teclado, y secuencia temporal', async ({ page }) => {
  const errores = vigilarErrores(page)
  await page.goto('/ataque')
  const campanas = page.locator('.react-flow__node-campana')
  await expect(campanas).toHaveCount(4)

  const fundamento = page.getByRole('group', { name: 'Fundamento' })
  await fundamento.getByRole('button', { name: /Inferido/ }).click()
  await expect(campanas).toHaveCount(0)
  await fundamento.getByRole('button', { name: /Inferido/ }).click()
  await expect(campanas).toHaveCount(4)

  await page.getByRole('combobox', { name: 'Campaña' }).selectOption('p2-scranton-nashua')
  await expect(campanas).toHaveCount(1)
  await page.getByRole('button', { name: 'Restablecer' }).click()
  await expect(campanas).toHaveCount(4)

  const detalle = page.getByRole('region', { name: 'Detalle' })
  await page.locator('.react-flow__node[data-id="proc-powershell"]').click()
  await expect(detalle.getByRole('heading', { name: 'powershell.exe' })).toBeVisible()
  await expect(page).toHaveURL(/sel=proc-powershell/)

  await page.locator('.react-flow__node[data-id="host-nashua"]').focus()
  await page.keyboard.press('Enter')
  await expect(detalle.getByRole('heading', { name: 'NASHUA' })).toBeVisible()

  await page.getByRole('button', { name: /Siguiente/ }).click()
  await expect(page.getByRole('group', { name: 'Secuencia del ataque' }).getByRole('status')).toContainText('Paso 1 de 10')
  expect(errores).toEqual([])
})

test('demo de conciencia situacional: simular, acelerar y aplicar una respuesta en la simulación', async ({ page }) => {
  await page.goto('/conciencia?org=helios')
  await page.getByRole('button', { name: 'Simular ciberataque' }).click()
  await page.getByRole('radio', { name: '×4' }).click()
  const asistente = page.getByRole('complementary', { name: 'Asistente de respuesta' })
  const respuesta = asistente.getByRole('region', { name: 'Respuesta inmediata' })
  await expect(respuesta.getByRole('button', { name: 'Aplicar' }).first()).toBeVisible({ timeout: 20_000 })
  await respuesta.getByRole('button', { name: 'Aplicar' }).first().click()
  await expect(asistente.getByRole('region', { name: 'Acciones aplicadas' })).toBeVisible()
  await expect(asistente.getByRole('link', { name: /asistente de respuesta/ })).toHaveAttribute('href', /^\/respuesta\?caso=helios/)
})

for (const tema of ['claro', 'oscuro'] as const) {
  test(`capturas de cada pantalla en tema ${tema}, sin desbordamiento horizontal`, async ({ page }, info) => {
    await page.addInitScript((t) => localStorage.setItem('tfg-tema', t), tema)
    for (const p of PANTALLAS) {
      await page.goto(p.ruta)
      await expect(page.getByRole('heading', { level: 1, name: p.h1, exact: true })).toBeAttached()
      await expect(page.locator('[role="status"][aria-label^="Cargando"]')).toHaveCount(0)
      if (p.nombre === 'ataque') await expect(page.locator('.react-flow__node').first()).toBeVisible()
      await expect(page.locator('html')).toHaveClass(tema === 'oscuro' ? /dark/ : /^(?!.*dark)/)
      await page.waitForTimeout(400)
      const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(desborda, `${p.ruta} desborda en horizontal`).toBe(false)
      await page.screenshot({ path: `capturas/${info.project.name}/${tema}/${p.nombre}.png` })
    }
  })
}

test('peso de la primera carga: la portada no descarga Recharts ni React Flow', async ({ page }, info) => {
  test.skip(info.project.name !== '1280', 'basta con medirlo una vez')
  const scripts = new Map<string, number>()
  page.on('response', async (r) => {
    if (r.request().resourceType() === 'script') scripts.set(new URL(r.url()).pathname, (await r.body()).byteLength)
  })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Eventos normalizados' })).toBeVisible()
  const portada = [...scripts.entries()]
  const total = portada.reduce((s, [, b]) => s + b, 0)
  console.log(`JS de la portada: ${(total / 1000).toFixed(2)} kB en ${portada.length} ficheros (${portada.map(([r, b]) => `${r.split('/').pop()} ${(b / 1000).toFixed(1)}`).join(', ')})`)
  expect(portada.some(([ruta]) => /\/(graficos|flujo)-/.test(ruta))).toBe(false)

  scripts.clear()
  await menu(page).getByRole('link', { name: /^Grafo de ataque/ }).click()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  const ataque = [...scripts.entries()]
  console.log(`JS añadido al abrir el grafo de ataque: ${(ataque.reduce((s, [, b]) => s + b, 0) / 1000).toFixed(2)} kB (${ataque.map(([r]) => r.split('/').pop()).join(', ')})`)
  expect(ataque.some(([ruta]) => /\/flujo-/.test(ruta))).toBe(true)
  expect(ataque.some(([ruta]) => /\/graficos-/.test(ruta))).toBe(false)
})

test('grafo de ataque: «Reproducir ataque» recorre la secuencia y se puede pausar', async ({ page }) => {
  const errores = vigilarErrores(page)
  await page.goto('/ataque')
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  const secuencia = page.getByRole('group', { name: 'Secuencia del ataque' })
  // a ×1 cada paso dura 1,8 s: tiempo de sobra para que la comprobación lo vea aunque la máquina vaya cargada
  await secuencia.getByRole('button', { name: 'Reproducir ataque' }).click()
  await expect(secuencia.getByRole('status')).toContainText('Paso 1 de 10')
  await expect(secuencia.getByRole('status')).toContainText('Paso 2 de 10', { timeout: 6000 })
  await secuencia.getByRole('button', { name: 'Pausar' }).click()
  await expect(secuencia.getByRole('button', { name: 'Reproducir ataque' })).toBeVisible()
  expect(errores).toEqual([])
})

test('línea temporal: el brush amplía el rango y la lista lo sigue', async ({ page }) => {
  await page.goto('/cronologia')
  await expect(page.getByText(/· 741 alertas/)).toBeVisible()
  const caja = (await page.locator('svg[role="img"] rect.cursor-crosshair').boundingBox())!
  await page.mouse.move(caja.x + caja.width * 0.45, caja.y + 20)
  await page.mouse.down()
  await page.mouse.move(caja.x + caja.width * 0.6, caja.y + 30, { steps: 5 })
  await page.mouse.up()
  await expect(page).toHaveURL(/desde=.*hasta=/)
  await expect(page.getByText(/· 741 alertas/)).toHaveCount(0)
})

test('incidentes: el detalle se abre al lado de la tabla, con enlace al asistente', async ({ page }) => {
  await page.goto('/incidentes')
  await page.getByRole('button', { name: /Ver el incidente P2/ }).click()
  const panel = page.getByRole('complementary', { name: 'Incidente elegido' })
  await expect(panel.getByRole('link', { name: /Asistente de respuesta/ })).toHaveAttribute('href', '/respuesta?caso=p2-scranton-nashua')
  const tabla = (await page.getByRole('region', { name: 'Lista de incidentes' }).boundingBox())!
  const lado = (await panel.boundingBox())!
  expect(lado.x).toBeGreaterThan(tabla.x + tabla.width - 5)
})

test('Ctrl+K: buscar una técnica por su nombre y saltar a la matriz', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Eventos normalizados' })).toBeVisible()
  await page.keyboard.press('Control+k')
  await page.getByRole('combobox', { name: /Buscar secciones/ }).fill('lsass memory')
  await expect(page.getByRole('option').first()).toContainText('T1003.001')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/attack\?tecnica=T1003\.001/)
  await expect(page.getByRole('region', { name: 'Técnica elegida' })).toContainText('LSASS Memory')
})

test('matriz ATT&CK: una columna por táctica y subtécnicas plegables', async ({ page }) => {
  await page.goto('/attack')
  const matriz = page.getByRole('region', { name: 'Matriz por táctica' })
  await expect(matriz.getByRole('region')).toHaveCount(15)
  const credenciales = matriz.getByRole('region', { name: /^Credential Access:/ })
  await credenciales.getByRole('button', { name: /Desplegar las \d+ subtécnicas de T1003/ }).click()
  await expect(credenciales.getByRole('button', { name: /^T1003\.001 LSASS Memory/ })).toBeVisible()
})

test('copiloto: responde con citas y remite las mitigaciones al asistente de respuesta', async ({ page }) => {
  const errores = vigilarErrores(page)
  await page.goto('/copiloto')
  await page.getByRole('button', { name: '¿Qué pasó en NASHUA?' }).click()
  await expect(page.getByRole('list', { name: 'Fuentes' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Pregunta' }).fill('¿Cómo lo mitigo?')
  await page.getByRole('button', { name: 'Preguntar' }).click()
  await expect(page.getByRole('log', { name: 'Conversación' }).getByRole('link', { name: /Asistente de respuesta/ })).toHaveAttribute('href', /\/respuesta\?caso=/)
  expect(errores).toEqual([])
})
