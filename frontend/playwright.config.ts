/**
 * Pruebas de extremo a extremo (Playwright) contra el build de producción servido con `vite preview`.
 *
 *   npm run build && npm run e2e
 *
 * Tres anchos de pantalla (1280, 1440 y 1920 px) con Chromium. `@playwright/test` va fijado a 1.63.0 porque usa el
 * Chromium 1243, el que ya está en `~/.cache/ms-playwright`: así no hace falta descargar ningún navegador.
 * Las capturas de cada pantalla en los dos temas se escriben en `capturas/` (ignorado por git).
 */
import { defineConfig, devices } from '@playwright/test'

const PUERTO = 4173

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PUERTO}`,
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    { name: '1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: '1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: '1920', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PUERTO} --strictPort`,
    url: `http://127.0.0.1:${PUERTO}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
