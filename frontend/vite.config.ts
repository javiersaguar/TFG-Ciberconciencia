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
        // Proveedores estables (cacheables entre despliegues) separados del código de la aplicación.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules\/(react|react-dom|scheduler|react-router)\// },
            { name: 'consultas', test: /node_modules\/@tanstack\// },
            { name: 'graficos', test: /node_modules\/(recharts|recharts-scale|react-smooth|victory-vendor|d3-[a-z-]+|@reduxjs|redux|react-redux|immer|reselect)\// },
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
