// Genera la cabecera Content-Security-Policy con la que Caddy sirve el portal (ver Dockerfile y Caddyfile).
//
// El único script en línea es el del tema de index.html (se aplica antes del primer pintado para que no parpadee): en
// vez de permitir 'unsafe-inline' para scripts, la política lleva su huella SHA-256, calculada sobre el index.html ya
// compilado. Si alguien cambia ese script, la huella cambia sola en la siguiente compilación de la imagen.
//
// Uso: node scripts/csp-caddy.mjs dist/index.html csp.caddy
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const [entrada = 'dist/index.html', salida = 'csp.caddy'] = process.argv.slice(2)
const html = readFileSync(entrada, 'utf8')

// scripts sin `src` (los módulos de Vite llevan src y quedan cubiertos por 'self')
const enLinea = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
const huellas = enLinea.map((s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`)

const politica = [
  "default-src 'self'",
  `script-src 'self' ${huellas.join(' ')}`.trim(),
  // Radix y React Flow insertan estilos en tiempo de ejecución; los atributos style de React van por CSSOM
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // hoy la SPA no hace llamadas de red; cuando exista la API de F6.3 irá por el mismo origen (/api, /ws)
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

writeFileSync(salida, `header Content-Security-Policy "${politica}"\n`)
console.log(`CSP con ${huellas.length} script(s) en línea → ${salida}`)
