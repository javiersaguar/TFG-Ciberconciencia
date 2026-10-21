/// <reference types="node" />
/**
 * Las copias de `src/api/datos/` son las de `npm run sincronizar-datos`: su SHA-256 coincide con el anotado en
 * `procedencia.json` (una copia editada a mano o a medias se detecta aquí) y su origen está fuera de `frontend/`.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const DATOS = resolve(process.cwd(), 'src/api/datos')
const procedencia = JSON.parse(readFileSync(resolve(DATOS, 'procedencia.json'), 'utf8')) as {
  ficheros: { copia: string; origen: string; sha256: string; bytes: number; filas?: number }[]
}

describe('datos sincronizados', () => {
  it.each(procedencia.ficheros.map((f) => [f.copia, f] as const))('%s coincide con la huella de su origen', (_copia, f) => {
    const contenido = readFileSync(resolve(DATOS, f.copia))
    expect(createHash('sha256').update(contenido).digest('hex')).toBe(f.sha256)
    expect(contenido.byteLength).toBe(f.bytes)
    expect(f.origen.startsWith('frontend/')).toBe(false)
  })

  it('incluye las seis exportaciones del 21-10 de eval/portal/', () => {
    const origenes = procedencia.ficheros.map((f) => f.origen)
    for (const nombre of ['alertas-apt29-day1.jsonl', 'aristas-p2.jsonl', 'p1-campanas.jsonl', 'p2-campanas.jsonl', 'tecnicas-observadas.jsonl', 'attack-catalogo-v19.json']) {
      expect(origenes).toContain(`eval/portal/${nombre}`)
    }
  })

  it.each(procedencia.ficheros.filter((f) => f.copia.endsWith('.jsonl')).map((f) => [f.copia, f] as const))(
    '%s: cada línea es un objeto JSON y hay tantas filas como anota la procedencia',
    (_copia, f) => {
      const lineas = readFileSync(resolve(DATOS, f.copia), 'utf8').split('\n').filter((l) => l.trim() !== '')
      for (const linea of lineas) expect(typeof JSON.parse(linea)).toBe('object')
      expect(lineas).toHaveLength(f.filas!)
    },
  )

  it('las filas medidas cuadran con las cifras documentadas (741 alertas, 17 aristas, 11 + 1 campañas, 47 técnicas)', () => {
    const filas = Object.fromEntries(procedencia.ficheros.map((f) => [f.copia, f.filas]))
    expect(filas).toMatchObject({ 'alertas-apt29-day1.jsonl': 741, 'aristas-p2.jsonl': 17, 'p1-campanas.jsonl': 11, 'p2-campanas.jsonl': 1, 'tecnicas-observadas.jsonl': 47 })
  })
})
