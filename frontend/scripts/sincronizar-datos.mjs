/**
 * npm run sincronizar-datos
 *
 * Copia a `src/api/datos/` los ficheros de resultados MEDIDOS que viven fuera de `frontend/` y que el portal enseña:
 * las capas ATT&CK Navigator de F2, los resultados de ML-1 y las exportaciones de ClickHouse y del catálogo de
 * ATT&CK de `eval/portal/` (21-10-2026). Los originales no se tocan: solo se leen.
 *
 * Antes de copiar, cada fichero se valida: los `.json` enteros y los `.jsonl` LÍNEA A LÍNEA (una línea inválida
 * detiene el script diciendo cuál, sin copiar nada a medias). Se copian tal cual, byte a byte, así que la huella
 * de la copia es la del original.
 *
 * Deja constancia de la procedencia en `src/api/datos/procedencia.json`: ruta de origen (relativa al repositorio),
 * SHA-256, tamaño, filas (en los `.jsonl`) y fecha de modificación del original. Un test comprueba que cada copia
 * coincide con su huella, así que una copia editada a mano o desfasada se detecta. Volver a ejecutarlo es seguro.
 *
 * Sin dependencias: solo módulos de Node.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(FRONTEND, '..')
const DESTINO = join(FRONTEND, 'src', 'api', 'datos')

/** Origen (relativo al repositorio) → nombre de la copia. */
const FICHEROS = [
  ['eval/attack-coverage/cobertura-potencial.json', 'cobertura-potencial.json'],
  ['eval/attack-coverage/cobertura-observada.json', 'cobertura-observada.json'],
  ['ml/anomaly/resultados.json', 'ml1-resultados.json'],
  ['eval/portal/alertas-apt29-day1.jsonl', 'alertas-apt29-day1.jsonl'],
  ['eval/portal/aristas-p2.jsonl', 'aristas-p2.jsonl'],
  ['eval/portal/p1-campanas.jsonl', 'p1-campanas.jsonl'],
  ['eval/portal/p2-campanas.jsonl', 'p2-campanas.jsonl'],
  ['eval/portal/tecnicas-observadas.jsonl', 'tecnicas-observadas.jsonl'],
  ['eval/portal/attack-catalogo-v19.json', 'attack-catalogo-v19.json'],
]

const huella = (contenido) => createHash('sha256').update(contenido).digest('hex')

/** Valida el original y devuelve cuántas filas tiene (solo en `.jsonl`). Lanza con la línea exacta si algo falla. */
function validar(origen, texto) {
  if (!origen.endsWith('.jsonl')) {
    JSON.parse(texto)
    return undefined
  }
  const lineas = texto.split('\n')
  let filas = 0
  lineas.forEach((linea, i) => {
    if (linea.trim() === '') return
    try {
      const fila = JSON.parse(linea)
      if (fila === null || typeof fila !== 'object' || Array.isArray(fila)) throw new Error('no es un objeto')
      filas += 1
    } catch (error) {
      throw new Error(`${origen}, línea ${i + 1}: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
  return filas
}

// Primero se validan TODOS; solo si todos son válidos se copia.
const leidos = FICHEROS.map(([origen, copia]) => {
  const ruta = join(REPO, origen)
  const contenido = readFileSync(ruta)
  return { origen, copia, ruta, contenido, filas: validar(origen, contenido.toString('utf8')) }
})

mkdirSync(DESTINO, { recursive: true })
const procedencia = {
  nota: 'Copias generadas por `npm run sincronizar-datos`. No editar a mano: editar el original y volver a sincronizar.',
  ficheros: leidos.map(({ origen, copia, ruta, contenido, filas }) => {
    copyFileSync(ruta, join(DESTINO, copia))
    const datos = statSync(ruta)
    console.log(`${origen} → ${relative(FRONTEND, join(DESTINO, copia))}${filas === undefined ? '' : ` (${filas} filas)`}`)
    return { copia, origen, sha256: huella(contenido), bytes: datos.size, ...(filas === undefined ? {} : { filas }), modificado: datos.mtime.toISOString() }
  }),
}
writeFileSync(join(DESTINO, 'procedencia.json'), `${JSON.stringify(procedencia, null, 2)}\n`)
console.log(`Procedencia en ${relative(FRONTEND, join(DESTINO, 'procedencia.json'))}`)
