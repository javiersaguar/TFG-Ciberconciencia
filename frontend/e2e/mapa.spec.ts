import { expect, test } from '@playwright/test'

test('mapa: partículas en movimiento, pausa real y reanudación sin saltos', async ({ page }) => {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/mapa')
  await expect(page.getByText('Demo geográfica ilustrativa.')).toBeVisible()
  const particula = page.locator('.mapa-ruta').first().locator('circle').first()
  await expect(particula).toHaveAttribute('opacity', '1')
  const antes = await particula.getAttribute('transform')
  await expect.poll(() => particula.getAttribute('transform')).not.toBe(antes)
  await page.getByRole('button', { name: 'Pausar demo' }).click()
  const reloj = page.getByLabel('Reloj de la simulación')
  const detenido = await reloj.textContent()
  const posicion = await particula.getAttribute('transform')
  await page.waitForTimeout(600)
  expect(await reloj.textContent()).toBe(detenido)
  expect(await particula.getAttribute('transform')).toBe(posicion)
  await page.getByRole('button', { name: 'Reanudar demo' }).click()
  await expect.poll(() => particula.getAttribute('transform')).not.toBe(posicion)
  await page.getByRole('combobox', { name: 'Velocidad de reproducción' }).selectOption('4')
  await expect(page.getByRole('combobox', { name: 'Velocidad de reproducción' })).toHaveValue('4')
  expect(errores).toEqual([])
})

test('mapa: filtros, detalle estable, zoom, temas y geometría del diseño', async ({ page }, info) => {
  const externas: string[] = []
  const recursos: string[] = []
  page.on('request', (r) => recursos.push(r.url()))
  page.on('request', (r) => { if (/^https?:/.test(r.url()) && !r.url().startsWith('http://127.0.0.1:4173')) externas.push(r.url()) })
  await page.goto('/mapa')
  const tabla = page.getByRole('table', { name: 'Alertas geográficas recientes' })
  await expect(tabla).toBeVisible()
  await page.getByRole('button', { name: 'Pausar demo' }).click()
  await tabla.getByRole('button').first().click()
  const detalle = page.getByRole('complementary', { name: 'Detalle de la alerta geográfica' })
  await expect(detalle.getByText('ORIGEN', { exact: true })).toBeVisible()
  await expect(detalle.getByText('DESTINO', { exact: true })).toBeVisible()
  const fijado = await detalle.textContent()
  await page.getByRole('button', { name: 'Reanudar demo' }).click()
  await page.waitForTimeout(1600)
  expect(await detalle.textContent()).toBe(fijado)
  await page.getByRole('button', { name: 'Pausar demo' }).click()
  await page.getByRole('button', { name: 'Acercar el mapa' }).click()
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveText('1.5×')
  await page.getByRole('button', { name: 'Ver todo el mundo' }).click()
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveText('1.0×')
  for (const tema of ['claro', 'oscuro']) {
    if (tema === 'oscuro') await page.getByRole('button', { name: 'Cambiar a modo oscuro' }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const desborde = await tabla.evaluate((t) => t.scrollWidth > t.parentElement!.clientWidth + 1)
    expect(desborde).toBe(false)
    await page.screenshot({ path: 'capturas/mapa/' + info.project.name + '-' + tema + '.png', fullPage: true })
  }
  await page.getByRole('combobox', { name: 'Filtrar por severidad' }).selectOption('critical')
  const filas = tabla.locator('tbody tr')
  await expect(filas.first()).toContainText('nivel crítico')
  await page.getByRole('combobox', { name: 'Filtrar por país' }).selectOption('CAN')
  await expect(tabla).toContainText('Sin alertas para la selección actual.')
  expect(externas).toEqual([])
  expect(recursos.some((url) => /\/assets\/(graficos|flujo)-/.test(url))).toBe(false)
})

test('mapa: movimiento reducido, selección con teclado y navegación desde el menú', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Secciones del portal' }).getByRole('link', { name: /^Mapa mundial/ }).click()
  await expect(page.getByRole('heading', { name: 'Mapa mundial de alertas', level: 1 })).toBeVisible()
  await expect(page.getByText('Movimiento reducido: rutas estáticas')).toBeVisible()
  await page.getByRole('button', { name: 'Pausar demo' }).click()
  const ruta = page.locator('.mapa-ruta').first()
  await ruta.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('detalle-geografico')).toBeVisible()
  for (const circulo of await page.locator('.mapa-ruta circle').all()) await expect(circulo).toHaveAttribute('opacity', '0')
  await page.getByRole('button', { name: 'Reiniciar demo geográfica' }).click()
  await expect(page.getByRole('table', { name: 'Alertas geográficas recientes' }).getByRole('button')).toHaveCount(1)
})

test('la portada no descarga la cartografía ni el código del mapa', async ({ page }) => {
  const recursos: string[] = []
  page.on('request', (r) => recursos.push(r.url()))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Situación', level: 1 })).toBeVisible()
  expect(recursos.some((url) => /PaginaMapaMundial|tierra\.json/.test(url))).toBe(false)
})

test('mapa: el globo 3D enseña el mismo flujo, se elige una alerta y se recuerda la vista', async ({ page }, info) => {
  // sin GPU (Chromium de las pruebas), el globo tarda unos segundos en pintar la primera vez
  test.setTimeout(90_000)
  // sin movimiento reducido (la configuración lo reduce por defecto), que es cuando el globo gira
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.goto('/mapa')
  const vista = page.getByRole('radiogroup', { name: 'Vista del mapa' })
  await expect(vista.getByRole('radio', { name: '3D' })).toBeEnabled()
  await vista.getByRole('radio', { name: '3D' }).click()
  await expect(page).toHaveURL(/vista=3d/)
  const globo = page.getByRole('region', { name: 'Globo de rutas geográficas' })
  await expect(globo.locator('canvas')).toBeVisible({ timeout: 20_000 })
  await expect(globo.getByRole('img', { name: /Globo con \d+ rutas? de origen a destino/ })).toBeAttached()
  // gira solo mientras no hay nada que mirar; no hay botón de giro (el giro lo deciden la elección y el filtro)
  await expect(globo).toHaveAttribute('data-modo', 'girando')
  await expect(globo.getByRole('button', { name: /Girar/ })).toHaveCount(0)
  // la misma selección que en 2D: desde la tabla, con su detalle y el globo resaltándola
  await page.getByRole('button', { name: 'Pausar demo' }).click()
  const tabla = page.getByRole('table', { name: 'Alertas geográficas recientes' })
  const primera = tabla.getByRole('button').first()
  const ruta = (await primera.getAttribute('aria-label'))!.replace(/^Ver /, '').split(' · ')[0]
  const [origen, destino] = ruta.split(' a ')
  await primera.click()
  await expect(page.getByTestId('detalle-geografico')).toBeVisible()
  await expect(globo.getByRole('img', { name: new RegExp(`Elegida: de ${origen} a ${destino}, .*se ilumina`) })).toBeAttached()
  await expect(globo.getByRole('button', { name: 'Ver todo el mundo' })).toBeVisible()
  // con una traza elegida se para y la encuadra
  await expect(globo).toHaveAttribute('data-modo', 'traza')
  const flechas = globo.getByRole('group', { name: 'Mover la vista del globo' })
  for (const sentido of ['arriba', 'izquierda', 'derecha', 'abajo']) await flechas.getByRole('button', { name: new RegExp(sentido) }).click()
  // al cerrarla vuelve a girar; con un país filtrado se centra en él; sin filtro, a girar otra vez
  await page.getByRole('button', { name: 'Cerrar detalle de la alerta' }).click()
  await expect(globo).toHaveAttribute('data-modo', 'girando')
  await page.getByLabel('Filtrar por país').selectOption({ label: 'Japón' })
  await expect(globo).toHaveAttribute('data-modo', 'pais')
  await page.getByLabel('Filtrar por país').selectOption({ label: 'Todo el mundo' })
  await expect(globo).toHaveAttribute('data-modo', 'girando')
  if (info.project.name === '1440') {
    for (const tema of ['claro', 'oscuro'] as const) {
      await page.evaluate((t) => localStorage.setItem('tfg-tema', t), tema)
      await page.goto('/mapa?vista=3d')
      await expect(page.getByRole('region', { name: 'Globo de rutas geográficas' }).locator('canvas')).toBeVisible({ timeout: 20_000 })
      await page.waitForTimeout(1500)
      await page.screenshot({ path: 'capturas/mapa/globo-' + tema + '.png', fullPage: true })
    }
  }
  // sin ?vista=, se recuerda el globo
  await page.goto('/mapa')
  await expect(page.getByRole('region', { name: 'Globo de rutas geográficas' }).locator('canvas')).toBeVisible({ timeout: 20_000 })
  expect(errores).toEqual([])
})
