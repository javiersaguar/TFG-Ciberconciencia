/**
 * Descarga la cartografía pública de Natural Earth y conserva únicamente la geometría.
 * Uso: node scripts/actualizar-cartografia.mjs
 * No se ejecuta al abrir la página ni durante el build.
 */
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

const url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
const respuesta = await fetch(url)
if (!respuesta.ok) throw new Error('No se pudo descargar Natural Earth: ' + respuesta.status)
const original = await respuesta.text()
const geojson = JSON.parse(original)
const redondear = (n) => typeof n === 'number' ? Math.round(n * 1000) / 1000 : n.map(redondear)
const contenido = {
  type: 'FeatureCollection',
  fuente: url,
  licencia: 'Dominio público · https://www.naturalearthdata.com/about/terms-of-use/',
  sha256: createHash('sha256').update(original).digest('hex'),
  features: geojson.features.map((f) => ({
    type: 'Feature',
    properties: { nombre: f.properties.NAME_ES || f.properties.ADMIN, codigo: f.properties.ADM0_A3 },
    geometry: { type: f.geometry.type, coordinates: redondear(f.geometry.coordinates) },
  })),
}
const carpeta = new URL('../src/paginas/mapa/', import.meta.url)
await mkdir(carpeta, { recursive: true })
await writeFile(new URL('tierra.json', carpeta), JSON.stringify(contenido) + '\n')
console.log('Cartografía local: ' + contenido.features.length + ' geometrías, SHA-256 ' + contenido.sha256)
