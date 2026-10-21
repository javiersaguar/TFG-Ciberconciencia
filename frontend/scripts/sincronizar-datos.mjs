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
 * Además DERIVA de `alertas-apt29-day1.jsonl` los tres agregados que enseña la portada, para que no tenga que
 * descargar y sumar las 741 alertas en el navegador: `actividad-por-minuto.json` (02:56–03:23, por nivel),
 * `severidad.json` y `tacticas-por-host.json`. Repiten EXACTAMENTE la normalización de `src/api/exportaciones.ts` y
 * los agregados de `src/api/simulado/actividad.ts` (un test compara los dos resultados). Su procedencia es la del
 * original: `procedencia.json` los anota en `derivados`, con la huella del fichero del que salen.
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

// --- Agregados derivados para la portada -----------------------------------------------------------------------

const NIVELES = ['informational', 'low', 'medium', 'high', 'critical']
const HOSTS = ['SCRANTON', 'NASHUA', 'NEWYORK', 'UTICA']
const textoDe = (v) => (typeof v === 'string' ? v : '')
const textosDe = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
const numeroDe = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const msDelDia = (fecha) => {
  const [hms, milis = '0'] = fecha.slice(11).split('.')
  const [h, m, s] = hms.split(':').map(Number)
  return ((h * 60 + m) * 60 + s) * 1000 + Number(milis.padEnd(3, '0'))
}
/** La misma normalización que `normalizarAlerta` (solo los campos que usan los agregados). */
function alertaDe(f) {
  const fecha = textoDe(f.hora)
  const origen = numeroDe(f.src_event_id)
  const reconstruida = origen !== null && origen >= 1000
  const nivel = textoDe(f.rule_level)
  return {
    ms: reconstruida ? Math.floor(msDelDia(fecha) / 1000) * 1000 : msDelDia(fecha),
    nivel: NIVELES.includes(nivel) ? nivel : 'informational',
    tacticas: textosDe(f.tactic_ids),
    host: textoDe(f.device_hostname).split('.')[0].toUpperCase(),
  }
}
const vacio = () => Object.fromEntries(NIVELES.map((n) => [n, 0]))
const dos = (n) => String(n).padStart(2, '0')

function alertasPorMinuto(alertas, desde = 2 * 60 + 56, hasta = 3 * 60 + 23) {
  const minutos = Array.from({ length: hasta - desde + 1 }, (_, i) => ({ minuto: `${dos(Math.floor((desde + i) / 60))}:${dos((desde + i) % 60)}`, total: 0, porNivel: vacio() }))
  for (const a of alertas) {
    const m = minutos[Math.floor(a.ms / 60000) - desde]
    if (!m) continue
    m.total += 1
    m.porNivel[a.nivel] += 1
  }
  return minutos
}

function repartoPorNivel(alertas) {
  const cuenta = vacio()
  for (const a of alertas) cuenta[a.nivel] += 1
  return [...NIVELES].reverse().filter((n) => cuenta[n] > 0).map((nivel) => ({ nivel, alertas: cuenta[nivel] }))
}

function mapaTacticaHost(alertas) {
  const porTactica = new Map()
  const sinTactica = HOSTS.map(() => 0)
  for (const a of alertas) {
    const h = HOSTS.indexOf(a.host)
    if (h < 0) continue
    if (a.tacticas.length === 0) sinTactica[h] += 1
    for (const t of a.tacticas) {
      const fila = porTactica.get(t) ?? HOSTS.map(() => 0)
      fila[h] += 1
      porTactica.set(t, fila)
    }
  }
  const suma = (fila) => fila.reduce((s, x) => s + x, 0)
  const filas = [...porTactica.entries()].sort((a, b) => suma(b[1]) - suma(a[1]) || a[0].localeCompare(b[0]))
  const celdas = filas.map(([, fila]) => fila)
  return { tacticas: filas.map(([t]) => t), hosts: HOSTS, celdas, maximo: Math.max(0, ...celdas.flat(), ...sinTactica), sinTactica }
}

const fuenteAlertas = leidos.find((l) => l.copia === 'alertas-apt29-day1.jsonl')
const alertas = fuenteAlertas.contenido.toString('utf8').split('\n').filter((l) => l.trim() !== '').map((l) => alertaDe(JSON.parse(l)))
const derivados = [
  ['actividad-por-minuto.json', alertasPorMinuto(alertas)],
  ['severidad.json', repartoPorNivel(alertas)],
  ['tacticas-por-host.json', mapaTacticaHost(alertas)],
].map(([fichero, datos]) => {
  const contenido = `${JSON.stringify(datos, null, 2)}\n`
  writeFileSync(join(DESTINO, fichero), contenido)
  console.log(`derivado de ${fuenteAlertas.origen} → ${relative(FRONTEND, join(DESTINO, fichero))}`)
  return { fichero, derivadoDe: fuenteAlertas.origen, sha256Origen: huella(fuenteAlertas.contenido), sha256: huella(contenido), bytes: Buffer.byteLength(contenido) }
})
procedencia.derivados = derivados
writeFileSync(join(DESTINO, 'procedencia.json'), `${JSON.stringify(procedencia, null, 2)}\n`)
