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
  // El Copiloto ya no está en la barra lateral (ronda 3): se abre desde la barra superior y /copiloto es su vista ampliada.
  for (const p of PANTALLAS.filter((x) => x.ruta !== '/copiloto')) {
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

test('maqueta 3D: se elige, dibuja la organización, abre la ficha de un activo y se recuerda', async ({ page }, info) => {
  const errores = vigilarErrores(page)
  await page.goto('/conciencia?org=helios&t=62')
  const vista = page.getByRole('radiogroup', { name: 'Vista de la organización' })
  // el 3D se habilita en cuanto la página comprueba que hay WebGL
  await expect(vista.getByRole('radio', { name: '3D' })).toBeEnabled()
  await vista.getByRole('radio', { name: '3D' }).click()
  const maqueta = page.getByRole('region', { name: 'Maqueta 3D de Helios Farmacéutica' })
  await expect(maqueta.locator('canvas')).toBeVisible()
  await expect(page).toHaveURL(/vista=3d/)
  // el resumen para lectores de pantalla y las etiquetas, que son botones
  await expect(maqueta.getByRole('img', { name: /Comprometidos: .*DC01/ })).toBeAttached()
  const dc = maqueta.getByRole('button', { name: /^DC01 · Infraestructura TI · comprometido/ })
  await expect(dc).toBeVisible()
  await dc.click()
  await expect(page.getByRole('dialog', { name: /DC01/ })).toBeVisible()
  await page.keyboard.press('Escape')
  if (info.project.name === '1440') {
    for (const tema of ['claro', 'oscuro'] as const) {
      await page.evaluate((t) => localStorage.setItem('tfg-tema', t), tema)
      await page.goto('/conciencia?org=helios&t=62')
      await expect(page.getByRole('region', { name: 'Maqueta 3D de Helios Farmacéutica' }).locator('canvas')).toBeVisible()
      await page.waitForTimeout(800)
      await page.screenshot({ path: `capturas/1440/${tema}/conciencia-3d.png` })
    }
  } else {
    // sin ?vista=, se recuerda la última elegida
    await page.goto('/conciencia?org=dmevals')
    await expect(page.getByRole('region', { name: 'Maqueta 3D de DMEVALS' }).locator('canvas')).toBeVisible()
  }
  expect(errores).toEqual([])
})

test('maqueta 3D: sin WebGL no se ofrece y la página se queda en 2D', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, tipo: string, ...resto: unknown[]) {
      return /webgl/.test(tipo) ? null : (original as (...a: unknown[]) => RenderingContext | null).call(this, tipo, ...resto)
    } as typeof original
  })
  await page.goto('/conciencia?org=helios&vista=3d')
  await expect(page.getByRole('region', { name: 'Grafo de Helios Farmacéutica' })).toBeVisible()
  await expect(page.getByRole('radio', { name: '3D' })).toBeDisabled()
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

test('peso de la primera carga: la portada no descarga Recharts, React Flow ni las 741 alertas, y pesa menos de 500 kB', async ({ page }, info) => {
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
  // ronda 3: los agregados se calculan al sincronizar; la portada ya no baja las 741 alertas y vuelve a < 500 kB
  expect(portada.some(([ruta]) => /\/alertas-apt29-day1-/.test(ruta))).toBe(false)
  expect(total).toBeLessThan(500_000)

  scripts.clear()
  await menu(page).getByRole('link', { name: /^Grafo de ataque/ }).click()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  const ataque = [...scripts.entries()]
  console.log(`JS añadido al abrir el grafo de ataque: ${(ataque.reduce((s, [, b]) => s + b, 0) / 1000).toFixed(2)} kB (${ataque.map(([r]) => r.split('/').pop()).join(', ')})`)
  expect(ataque.some(([ruta]) => /\/flujo-/.test(ruta))).toBe(true)
  expect(ataque.some(([ruta]) => /\/graficos-/.test(ruta))).toBe(false)
  // three.js solo llega con la maqueta 3D: ni en la portada ni en el grafo de ataque
  expect([...portada, ...ataque].some(([ruta]) => /\/tresd-/.test(ruta))).toBe(false)
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

// --- Ronda 3, §1: pruebas que habrían detectado los fallos visuales del 21-10 ---

test('ninguna tabla desborda su contenedor (incidentes con su panel, línea temporal, portada, asistente, evaluación, observabilidad)', async ({ page }) => {
  for (const ruta of ['/incidentes?id=p2-scranton-nashua', '/incidentes?id=p1-lsass_campaign_02', '/cronologia?sel=al-0309-remota', '/', '/respuesta?caso=p2-scranton-nashua', '/evaluacion', '/observabilidad?cuadro=tfg-data-quality']) {
    await page.goto(ruta)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('[role="status"][aria-label^="Cargando"]')).toHaveCount(0)
    await page.waitForTimeout(500)
    const desbordes = await page.evaluate(() =>
      [...document.querySelectorAll('table')].flatMap((tabla) => {
        const c = tabla.parentElement!
        return c.scrollWidth > c.clientWidth + 1 ? [`${tabla.querySelector('th')?.textContent ?? 'tabla'}: ${c.scrollWidth} > ${c.clientWidth}`] : []
      }),
    )
    expect(desbordes, ruta).toEqual([])
  }
})

test('línea temporal: las etiquetas del eje no se pisan', async ({ page }) => {
  for (const ruta of ['/cronologia', '/cronologia?desde=03:09&hasta=03:18', '/cronologia?desde=03:09&hasta=03:10']) {
    await page.goto(ruta)
    const etiquetas = page.locator('[data-etiqueta-eje]')
    await expect(etiquetas.first()).toBeVisible()
    const cajas = (await etiquetas.evaluateAll((ts) => ts.map((t) => t.getBoundingClientRect()).map((r) => ({ x: r.x, fin: r.right })))).sort((a, b) => a.x - b.x)
    for (let i = 1; i < cajas.length; i++) expect(cajas[i].x, `${ruta}: etiqueta ${i}`).toBeGreaterThanOrEqual(cajas[i - 1].fin)
  }
})

async function nodosDentroDelLienzo(page: Page) {
  return page.evaluate(() => {
    const lienzo = document.querySelector('.react-flow')!.getBoundingClientRect()
    const controles = document.querySelector('.react-flow__controls')!.getBoundingClientRect()
    const fallos: string[] = []
    for (const n of document.querySelectorAll<HTMLElement>('.react-flow__node')) {
      const r = n.getBoundingClientRect()
      const id = n.dataset.id ?? '?'
      if (r.left < lienzo.left - 1 || r.right > lienzo.right + 1 || r.top < lienzo.top - 1 || r.bottom > lienzo.bottom + 1) fallos.push(`${id} fuera del lienzo`)
      const pisa = r.left < controles.right && r.right > controles.left && r.top < controles.bottom && r.bottom > controles.top
      if (pisa && !n.classList.contains('react-flow__node-host')) fallos.push(`${id} bajo los controles`)
    }
    return fallos
  })
}

test('grafo de ataque: al cargar y tras redimensionar, todo queda dentro del lienzo y nada bajo los controles', async ({ page }) => {
  await page.goto('/ataque')
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await page.waitForTimeout(700)
  expect(await nodosDentroDelLienzo(page)).toEqual([])
  // los nombres de los carriles se ven
  for (const host of ['SCRANTON', 'NASHUA', 'NEWYORK', 'UTICA']) await expect(page.locator('.react-flow').getByText(host, { exact: true }).first()).toBeVisible()
  const tamano = page.viewportSize()!
  await page.setViewportSize({ width: tamano.width - 160, height: tamano.height - 80 })
  await page.waitForTimeout(800)
  expect(await nodosDentroDelLienzo(page)).toEqual([])
  await page.setViewportSize(tamano)
})

// --- Ronda 3, §4: modo presentación, y el panel del Copiloto sin estrechar el contenido ---

test('modo presentación: ocho pasos con ← →, el elemento del paso resaltado y Esc para salir', async ({ page }, info) => {
  const errores = vigilarErrores(page)
  await page.goto('/?presentacion=1')
  const tarjeta = page.getByRole('region', { name: 'Presentación' })
  const rutas = ['/', '/cronologia', '/ataque', '/incidentes', '/respuesta', '/incidentes', '/evaluacion', '/conciencia']
  for (let n = 1; n <= 8; n++) {
    await expect(tarjeta).toContainText(`paso ${n} de 8`)
    await expect(page).toHaveURL(new RegExp(`${rutas[n - 1].replace('/', '\\/')}(\\?|$).*presentacion=${n}`))
    await expect(page.locator('.presentacion-foco')).toHaveCount(1)
    if (info.project.name === '1440') await page.screenshot({ path: `capturas/presentacion/paso-${n}.png` })
    if (n === 6) await expect(page.getByRole('complementary', { name: 'Copiloto' })).toBeVisible()
    if (n < 8) await page.keyboard.press('ArrowRight')
  }
  await page.keyboard.press('Escape')
  await expect(tarjeta).toHaveCount(0)
  await expect(page).toHaveURL(/\/conciencia\?org=helios&t=62$/)
  expect(errores).toEqual([])
})

test('el Copiloto empuja el contenido solo si le deja al menos 1000 px; si no, se superpone y la tabla no se corta', async ({ page }, info) => {
  await page.goto('/incidentes')
  await expect(page.getByRole('heading', { name: 'Incidentes', level: 1 })).toBeVisible()
  const anchoAntes = await page.locator('#contenido').evaluate((e) => e.getBoundingClientRect().width)
  await page.keyboard.press('Control+i')
  await expect(page.getByRole('complementary', { name: 'Copiloto' })).toBeVisible()
  const anchoDespues = await page.locator('#contenido').evaluate((e) => e.getBoundingClientRect().width)
  if (anchoDespues < anchoAntes) expect(anchoDespues).toBeGreaterThanOrEqual(1000 - 48) // empuja: queda sitio (menos el relleno de main)
  else expect(info.project.name).not.toBe('1920') // a 1920 px siempre hay sitio para empujar
  const desborda = await page.locator('#contenido [data-contenedor-tabla]').evaluateAll((els) => els.some((e) => e.scrollWidth > e.clientWidth + 1))
  expect(desborda).toBe(false)
})
