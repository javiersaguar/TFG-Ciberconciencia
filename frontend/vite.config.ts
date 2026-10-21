import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/ · https://vitest.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Cuando exista la API de F6.3 (FastAPI), `/api` se reenviará a ella. Hoy la SPA no hace ninguna llamada de red:
    // los datos salen de `src/api/simulado` (ver README).
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        // Proveedores estables (cacheables entre despliegues) separados del código de la aplicación. Recharts y React
        // Flow van en grupos distintos para que la ruta del grafo de ataque no descargue Recharts ni al revés; los
        // módulos d3 que usan los dos (color, ease, interpolate, timer) van en un grupo pequeño común.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules\/(react|react-dom|scheduler|react-router|use-sync-external-store)\//, priority: 40 },
            { name: 'consultas', test: /node_modules\/@tanstack\//, priority: 40 },
            // Utilidades que usan a la vez los componentes del portal y Recharts/React Flow: sin este grupo, `clsx`
            // acababa dentro de `graficos` (los grupos arrastran las dependencias de sus módulos) y cualquier botón
            // obligaba a descargar Recharts entero en la portada.
            { name: 'utilidades', test: /node_modules\/(clsx|tailwind-merge|class-variance-authority)\//, priority: 35 },
            { name: 'd3-comun', test: /node_modules\/(d3-color|d3-ease|d3-interpolate|d3-timer)\//, priority: 30 },
            { name: 'flujo', test: /node_modules\/(@xyflow|d3-zoom|d3-drag|d3-selection|d3-transition|d3-dispatch|classcat|zustand)\//, priority: 20 },
            { name: 'graficos', test: /node_modules\/(recharts|recharts-scale|react-smooth|victory-vendor|d3-[a-z-]+|internmap|@reduxjs|redux|react-redux|immer|reselect)\//, priority: 10 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/pruebas/configuracion.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    unstubGlobals: true,
  },
})
