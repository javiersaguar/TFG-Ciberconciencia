/**
 * Disposición en CARRILES del grafo de ataque: un carril por host, en el orden del ataque, y el tiempo de izquierda a
 * derecha. Función pura y determinista, calculada desde la hora de cada nodo; no hace falta elkjs ni dagre porque la
 * estructura es conocida. Dentro de cada carril van arriba las campañas, como bandas que ocupan su ventana, y debajo
 * las tarjetas (cuenta, procesos, alertas), repartidas en filas para que no se monten.
 *
 * Coordenadas: los carriles (nodos host) en absoluto; el resto, relativas a su carril (`parentId` de React Flow).
 */
import type { AristaAtaque, NodoAtaque } from '@/api/ataque'

export const CARRILES = ['SCRANTON', 'NASHUA', 'NEWYORK', 'UTICA'] as const

export const MEDIDAS = {
  /** Columna de la izquierda con el nombre, la IP y el papel del host. */
  etiqueta: 172,
  pxPorMinuto: 46,
  tarjeta: { ancho: 158, alto: 64 },
  banda: { alto: 30, minimo: 128 },
  /** Separación vertical entre filas y horizontal mínima dentro de una fila. */
  fila: 8,
  hueco: 12,
  margen: 12,
  minimoCarril: 76,
  entreCarriles: 14,
} as const

export interface Caja {
  x: number
  y: number
  ancho: number
  alto: number
}

export interface Asa {
  id: string
  tipo: 'source' | 'target'
  lado: 'arriba' | 'abajo'
  /** Posición horizontal relativa al carril. */
  x: number
}

export interface MarcaTiempo {
  ms: number
  x: number
  texto: string
}

export interface Disposicion {
  cajas: Record<string, Caja>
  /** Nodo → id de su carril (`host-scranton`…). */
  padres: Record<string, string>
  asas: Record<string, Asa[]>
  marcas: MarcaTiempo[]
  ancho: number
  alto: number
}

export const idCarril = (host: string) => `host-${host.toLowerCase()}`

/** Carril de un nodo: en P2 la banda va al destino (donde se ejecuta el salto); el resto, a su host. */
export function carrilDe(n: NodoAtaque): string | undefined {
  if (n.tipo === 'host') return n.hosts[0]
  return n.tipo === 'campana' ? n.hosts.at(-1) : n.hosts[0]
}

/** Reparte elementos ordenados por `x` en filas sin que se solapen (voraz: la primera fila donde quepa). */
export function repartirEnFilas(items: readonly { id: string; x: number; ancho: number }[], hueco: number): Map<string, number> {
  const finDeFila: number[] = []
  const filas = new Map<string, number>()
  for (const it of items) {
    let fila = finDeFila.findIndex((fin) => it.x >= fin + hueco)
    if (fila === -1) fila = finDeFila.push(0) - 1
    finDeFila[fila] = it.x + it.ancho
    filas.set(it.id, fila)
  }
  return filas
}

const MINUTO = 60_000
const dosCifras = (n: number) => String(n).padStart(2, '0')
const textoHora = (ms: number) => `${dosCifras(Math.floor(ms / 3_600_000))}:${dosCifras(Math.floor(ms / MINUTO) % 60)}`

export function disponerEnCarriles(nodos: readonly NodoAtaque[], aristas: readonly AristaAtaque[], m = MEDIDAS): Disposicion {
  const conHora = nodos.filter((n) => n.ms != null)
  const inicio = Math.floor(Math.min(...conHora.map((n) => n.ms!)) / MINUTO) * MINUTO
  const fin = Math.ceil(Math.max(...conHora.map((n) => n.msFin ?? n.ms!)) / MINUTO) * MINUTO + MINUTO
  const xDe = (ms: number) => m.etiqueta + ((ms - inicio) / MINUTO) * m.pxPorMinuto
  const ancho = Math.round(xDe(fin) + m.tarjeta.ancho)

  const cajas: Record<string, Caja> = {}
  const padres: Record<string, string> = {}
  const indice = new Map<string, number>()
  let y = 0

  CARRILES.forEach((host, i) => {
    const carril = idCarril(host)
    indice.set(host, i)
    const propios = nodos.filter((n) => n.tipo !== 'host' && carrilDe(n) === host && n.ms != null).sort((a, b) => a.ms! - b.ms!)
    const bandas = propios.filter((n) => n.tipo === 'campana').map((n) => ({ id: n.id, x: xDe(n.ms!), ancho: Math.max(m.banda.minimo, xDe(n.msFin ?? n.ms!) - xDe(n.ms!)) }))
    const tarjetas = propios.filter((n) => n.tipo !== 'campana').map((n) => ({ id: n.id, x: xDe(n.ms!), ancho: m.tarjeta.ancho }))
    const filasBanda = repartirEnFilas(bandas, m.hueco)
    const filasTarjeta = repartirEnFilas(tarjetas, m.hueco)
    const nBandas = bandas.length ? Math.max(...filasBanda.values()) + 1 : 0
    const nTarjetas = tarjetas.length ? Math.max(...filasTarjeta.values()) + 1 : 0
    const altoBandas = nBandas * (m.banda.alto + m.fila)
    for (const b of bandas) {
      cajas[b.id] = { x: b.x, y: m.margen + filasBanda.get(b.id)! * (m.banda.alto + m.fila), ancho: b.ancho, alto: m.banda.alto }
      padres[b.id] = carril
    }
    for (const t of tarjetas) {
      cajas[t.id] = { x: t.x, y: m.margen + altoBandas + filasTarjeta.get(t.id)! * (m.tarjeta.alto + m.fila), ancho: t.ancho, alto: m.tarjeta.alto }
      padres[t.id] = carril
    }
    const alto = Math.max(m.minimoCarril, 2 * m.margen + altoBandas + nTarjetas * (m.tarjeta.alto + m.fila) - (nBandas + nTarjetas > 0 ? m.fila : 0))
    cajas[carril] = { x: 0, y, ancho, alto }
    y += alto + m.entreCarriles
  })

  // Asas de los carriles: cada arista que sale o llega a un carril se ancla a la hora de su primer evento; las que no
  // tienen hora (tráfico de fondo), en la columna de la etiqueta; las extrapoladas, al final del eje.
  const asas: Record<string, Asa[]> = Object.fromEntries(CARRILES.map((h) => [idCarril(h), []]))
  const enEtiqueta = new Map<string, number>()
  const carrilDeId = (id: string) => carrilDe(nodos.find((n) => n.id === id)!)
  for (const a of aristas) {
    const io = indice.get(carrilDeId(a.origen) ?? '') ?? 0
    const id = indice.get(carrilDeId(a.destino) ?? '') ?? 0
    const xAsa = (carril: string) => {
      if (a.alFinal) return ancho - 72
      if (a.ms != null) return xDe(a.ms)
      const k = enEtiqueta.get(carril) ?? 0
      enEtiqueta.set(carril, k + 1)
      return 36 + k * 26
    }
    if (a.destino.startsWith('host-') && a.asaDestino) asas[a.destino]?.push({ id: a.asaDestino, tipo: 'target', lado: io <= id ? 'arriba' : 'abajo', x: xAsa(a.destino) })
    if (a.origen.startsWith('host-') && a.asaOrigen) asas[a.origen]?.push({ id: a.asaOrigen, tipo: 'source', lado: io < id ? 'abajo' : 'arriba', x: xAsa(a.origen) })
  }

  const marcas: MarcaTiempo[] = []
  for (let ms = inicio; ms <= fin; ms += 2 * MINUTO) marcas.push({ ms, x: xDe(ms), texto: textoHora(ms) })

  return { cajas, padres, asas, marcas, ancho, alto: y - m.entreCarriles }
}

/** Posición absoluta de un nodo (para cuando su carril está oculto por un filtro). */
export function absoluta(id: string, d: Disposicion): Caja {
  const caja = d.cajas[id]
  const padre = d.padres[id]
  return padre ? { ...caja, x: caja.x + d.cajas[padre].x, y: caja.y + d.cajas[padre].y } : caja
}
