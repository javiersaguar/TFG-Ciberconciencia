/**
 * npm run generar-mapamundi
 *
 * Genera `src/paginas/conciencia/globo/mapamundi.json`, el mapa del globo de la demo: las tierras emergidas (para
 * colorear los continentes) y las fronteras entre países (para dibujarlas como líneas), a partir de Natural Earth
 * 1:110m (dominio público) en la redistribución TopoJSON del paquete `world-atlas` (licencia ISC).
 *
 * Las coordenadas se redondean a 0,1° (unos 11 km: medio píxel en un globo de 600 px) y se guardan como listas planas
 * [lon, lat, lon, lat, …] por anillo o por línea. El fichero anota su origen y la huella SHA-256 del TopoJSON del que
 * sale, como `sincronizar-datos` con los datos medidos. Volver a ejecutarlo es seguro.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { feature, mesh } from 'topojson-client'

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const ORIGEN = require.resolve('world-atlas/countries-110m.json')
const DESTINO = join(FRONTEND, 'src', 'paginas', 'conciencia', 'globo', 'mapamundi.json')

const bruto = readFileSync(ORIGEN)
const mundo = JSON.parse(bruto.toString('utf8'))
const version = JSON.parse(readFileSync(require.resolve('world-atlas/package.json'), 'utf8')).version

const r = (x) => Math.round(x * 10) / 10

/** Una línea o anillo como lista plana, sin puntos repetidos tras redondear. */
function plana(puntos) {
  const salida = []
  for (const [lon, lat] of puntos) {
    const x = r(lon)
    const y = r(lat)
    if (salida.length && salida.at(-2) === x && salida.at(-1) === y) continue
    salida.push(x, y)
  }
  return salida
}

const tierra = feature(mundo, mundo.objects.land)
const poligonos = (tierra.type === 'FeatureCollection' ? tierra.features : [tierra]).flatMap((f) =>
  f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates,
)
const tierras = poligonos.map((anillos) => anillos.map(plana).filter((a) => a.length >= 8))
const fronteras = mesh(mundo, mundo.objects.countries, (a, b) => a !== b).coordinates.map(plana).filter((l) => l.length >= 4)

const salida = {
  origen: `Natural Earth 1:110m (dominio público), vía world-atlas ${version} (ISC): countries-110m.json`,
  sha256: createHash('sha256').update(bruto).digest('hex'),
  precision: '0,1°',
  tierras,
  fronteras,
}
writeFileSync(DESTINO, JSON.stringify(salida))
const puntos = tierras.flat(2).length / 2 + fronteras.flat().length / 2
console.log(`mapamundi.json: ${tierras.length} tierras, ${fronteras.length} fronteras, ${puntos} puntos, ${(JSON.stringify(salida).length / 1024).toFixed(1)} kB`)
