/**
 * Disposición en CARRILES del grafo de ataque: un carril por host, en el orden del ataque, y el tiempo de izquierda a
 * derecha. Función pura y determinista; no hace falta elkjs ni dagre porque la estructura es conocida.
 *
 * El eje NO es lineal en minutos. Con un eje lineal, lo que ocurre en el mismo minuto se amontona y los minutos en
 * que no pasa nada ocupan medio lienzo. Aquí cada momento con evidencia es una COLUMNA, en orden: más tarde, más a la
 * derecha, siempre; lo simultáneo (menos de un segundo, mismo host) se apila en la misma columna; y lo que ocurre a la
 * vez en hosts distintos comparte columna. La hora real va escrita en la cabecera de cada columna, y entre columnas
 * separadas por un minuto o más se indica el hueco («+4 min»).
 *
 * Las bandas de campaña y las asas de las conexiones se colocan con una interpolación lineal a trozos entre las horas
 * de las columnas, así que respetan el orden aunque su hora no coincida con la de ninguna tarjeta.
 *
 * Hay un segundo eje, «tiempo real» (`eje = 'tiempo'`, el de la versión anterior del explorador): la posición es
 * proporcional a la hora (`PX_POR_MINUTO`), con una marca cada dos minutos; lo que se solapa en un carril baja a otra
 * fila. Enseña los huecos reales del ataque a escala; el de columnas, el orden sin amontonar. El usuario elige.
 *
 * Coordenadas: los carriles (nodos host) en absoluto; el resto, relativas a su carril (`parentId` de React Flow).
 */
import type { AristaAtaque, NodoAtaque } from '@/api/ataque'

export const CARRILES = ['SCRANTON', 'NASHUA', 'NEWYORK', 'UTICA'] as const

export const MEDIDAS = {
  /** Columna de la izquierda con el nombre y la IP del host. */
  etiqueta: 112,
  /** Hueco entre la etiqueta y la primera columna (ahí empiezan las bandas que abren antes que la primera tarjeta). */
  inicio: 28,
  tarjeta: { ancho: 152, alto: 58 },
  /** Paso horizontal entre columnas: la tarjeta y su aire. */
  columna: 184,
  banda: { alto: 26, minimo: 96 },
  /** Separación vertical entre filas y horizontal mínima entre bandas de una fila. */
  fila: 10,
  hueco: 12,
  margen: 14,
  minimoCarril: 58,
  entreCarriles: 18,
  /** Lo que ocurre en el mismo host con menos de esta diferencia se apila en la misma columna. */
  simultaneo: 1000,
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

/** Una columna del eje: su posición, su ancho de franja y la hora (UTC del dataset) de su primer evento. */
export interface Columna {
  x: number
  ancho: number
  ms: number
  texto: string
}

/** Indicación de un hueco de tiempo entre dos columnas («+4 min»). */
export interface Salto {
  x: number
  texto: string
}

export interface Disposicion {
  cajas: Record<string, Caja>
  /**
   * Asas propias de algunas aristas, que mandan sobre las del dato: la evidencia llega a su banda justo encima de la
   * tarjeta de la que sale (una flecha corta y vertical, en vez de converger todas en el centro de la banda).
   */
  asasArista: Record<string, { origen?: string; destino?: string }>
  /** Nodo → id de su carril (`host-scranton`…). */
  padres: Record<string, string>
  asas: Record<string, Asa[]>
  columnas: Columna[]
  saltos: Salto[]
  ancho: number
  alto: number
}

export const idCarril = (host: string) => `host-${host.toLowerCase()}`

/** Eje horizontal: por momentos con evidencia (columnas) o a escala de tiempo real. */
export type Eje = 'momentos' | 'tiempo'
/** Escala del eje de tiempo real. */
export const PX_POR_MINUTO = 40
/** En el eje de tiempo real, una marca de hora cada tantos minutos. */
const MINUTOS_POR_MARCA = 2

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

export interface Ubicacion {
  columna: number
  /** Fila dentro de su columna y su carril (lo simultáneo se apila). */
  fila: number
}

/**
 * Columna de cada tarjeta, en orden de hora. Una tarjeta nunca va a la izquierda de otra anterior; en su carril, a la
 * derecha de la anterior salvo que sea simultánea (entonces se apila debajo); y en carriles distintos puede compartir
 * columna con la anterior.
 */
export function asignarColumnas(tarjetas: readonly { id: string; ms: number; carril: string }[], simultaneo: number = MEDIDAS.simultaneo): Map<string, Ubicacion> {
  const ordenadas = [...tarjetas].sort((a, b) => a.ms - b.ms)
  const ultima = new Map<string, { columna: number; ms: number; filas: number }>()
  const resultado = new Map<string, Ubicacion>()
  let columnaGlobal = 0
  for (const t of ordenadas) {
    const previa = ultima.get(t.carril)
    if (previa && t.ms - previa.ms < simultaneo) {
      resultado.set(t.id, { columna: previa.columna, fila: previa.filas })
      previa.filas += 1
      continue
    }
    const columna = previa ? Math.max(columnaGlobal, previa.columna + 1) : columnaGlobal
    columnaGlobal = columna
    ultima.set(t.carril, { columna, ms: t.ms, filas: 1 })
    resultado.set(t.id, { columna, fila: 0 })
  }
  return resultado
}

/** Interpolación lineal a trozos de la hora a la posición, por puntos (ms, x) crecientes en ms. */
export function interpolar(puntos: readonly { ms: number; x: number }[], ms: number): number {
  if (ms <= puntos[0].ms) return puntos[0].x
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1]
    const b = puntos[i]
    if (ms <= b.ms) return b.ms === a.ms ? b.x : a.x + ((ms - a.ms) / (b.ms - a.ms)) * (b.x - a.x)
  }
  return puntos.at(-1)!.x
}

const MINUTO = 60_000
const dosCifras = (n: number) => String(n).padStart(2, '0')
const textoHora = (ms: number) => `${dosCifras(Math.floor(ms / 3_600_000))}:${dosCifras(Math.floor(ms / MINUTO) % 60)}:${dosCifras(Math.floor(ms / 1000) % 60)}`

export function disponerEnCarriles(nodos: readonly NodoAtaque[], aristas: readonly AristaAtaque[], m = MEDIDAS, eje: Eje = 'momentos'): Disposicion {
  const tarjetas = nodos
    .filter((n) => n.tipo !== 'host' && n.tipo !== 'campana' && n.ms != null)
    .map((n) => ({ id: n.id, ms: n.ms!, carril: carrilDe(n)! }))
  const ubicacion = asignarColumnas(tarjetas, m.simultaneo)
  const nColumnas = Math.max(0, ...[...ubicacion.values()].map((u) => u.columna + 1))
  const xColumna = (c: number) => m.etiqueta + m.inicio + c * m.columna

  // Hora de cada columna: la de su primer evento.
  const msColumna: number[] = Array.from({ length: nColumnas }, () => Infinity)
  for (const t of tarjetas) {
    const c = ubicacion.get(t.id)!.columna
    msColumna[c] = Math.min(msColumna[c], t.ms)
  }
  const conHora = nodos.filter((n) => n.ms != null)
  const msInicio = Math.min(...conHora.map((n) => n.ms!))
  const msFin = Math.max(...conHora.map((n) => n.msFin ?? n.ms!))
  const centro = (c: number) => xColumna(c) + m.tarjeta.ancho / 2
  const ultimaX = nColumnas ? centro(nColumnas - 1) + m.columna / 2 : m.etiqueta + m.inicio + m.columna
  const puntos = [
    { ms: msInicio, x: m.etiqueta + m.inicio / 2 },
    ...msColumna.map((ms, c) => ({ ms, x: centro(c) })).filter((p) => p.ms > msInicio && p.ms < msFin),
    { ms: msFin, x: ultimaX },
  ]
  // Si la primera columna coincide con el inicio, ancla el inicio en ella.
  if (nColumnas && msColumna[0] <= msInicio) puntos[0] = { ms: msInicio, x: centro(0) }
  const enTiempo = eje === 'tiempo'
  const xLineal = (ms: number) => m.etiqueta + m.inicio + m.tarjeta.ancho / 2 + ((ms - msInicio) / MINUTO) * PX_POR_MINUTO
  const xDe = (ms: number) => (enTiempo ? xLineal(ms) : interpolar(puntos, ms))
  const ancho = enTiempo
    ? Math.round(xLineal(msFin) + m.tarjeta.ancho / 2 + m.inicio)
    : Math.round(Math.max(ultimaX, xColumna(Math.max(0, nColumnas - 1)) + m.tarjeta.ancho) + m.inicio)
  // Tiempo real: cada tarjeta centrada en su hora; en su carril, las que se solapan bajan de fila.
  const enTiempoReal = new Map<string, { x: number; fila: number }>()
  if (enTiempo) {
    for (const host of CARRILES) {
      const items = tarjetas
        .filter((x) => x.carril === host)
        .sort((a, b) => a.ms - b.ms)
        .map((x) => ({ id: x.id, x: xLineal(x.ms) - m.tarjeta.ancho / 2, ancho: m.tarjeta.ancho }))
      const filas = repartirEnFilas(items, m.hueco)
      for (const it of items) enTiempoReal.set(it.id, { x: it.x, fila: filas.get(it.id)! })
    }
  }

  const cajas: Record<string, Caja> = {}
  const padres: Record<string, string> = {}
  const indice = new Map<string, number>()
  let y = 0

  CARRILES.forEach((host, i) => {
    const carril = idCarril(host)
    indice.set(host, i)
    const propios = nodos.filter((n) => n.tipo !== 'host' && carrilDe(n) === host && n.ms != null).sort((a, b) => a.ms! - b.ms!)
    const bandas = propios
      .filter((n) => n.tipo === 'campana')
      .map((n) => {
        const x0 = xDe(n.ms!)
        return { id: n.id, x: x0, ancho: Math.max(m.banda.minimo, xDe(n.msFin ?? n.ms!) - x0) }
      })
    const filasBanda = repartirEnFilas(bandas, m.hueco)
    const nBandas = bandas.length ? Math.max(...filasBanda.values()) + 1 : 0
    const altoBandas = nBandas * (m.banda.alto + m.fila)
    for (const b of bandas) {
      cajas[b.id] = { x: b.x, y: m.margen + filasBanda.get(b.id)! * (m.banda.alto + m.fila), ancho: b.ancho, alto: m.banda.alto }
      padres[b.id] = carril
    }
    let nFilas = 0
    for (const n of propios.filter((x) => x.tipo !== 'campana')) {
      const u = ubicacion.get(n.id)!
      const real = enTiempoReal.get(n.id)
      const fila = real ? real.fila : u.fila
      nFilas = Math.max(nFilas, fila + 1)
      cajas[n.id] = { x: real ? real.x : xColumna(u.columna), y: m.margen + altoBandas + fila * (m.tarjeta.alto + m.fila), ancho: m.tarjeta.ancho, alto: m.tarjeta.alto }
      padres[n.id] = carril
    }
    const contenido = altoBandas + nFilas * (m.tarjeta.alto + m.fila) - (nBandas + nFilas > 0 ? m.fila : 0)
    const alto = Math.max(m.minimoCarril, 2 * m.margen + contenido)
    cajas[carril] = { x: 0, y, ancho, alto }
    y += alto + m.entreCarriles
  })

  // Asas de los carriles: cada arista que sale o llega a un carril se ancla a la hora de su primer evento; las que no
  // tienen hora (tráfico de fondo), en la columna de la etiqueta; las extrapoladas, al final del eje.
  const asas: Record<string, Asa[]> = Object.fromEntries(CARRILES.map((h) => [idCarril(h), []]))
  const asasArista: Disposicion['asasArista'] = {}
  const enEtiqueta = new Map<string, number>()
  const centroDe = (id: string) => (ubicacion.has(id) ? cajas[id].x + cajas[id].ancho / 2 : undefined)
  const carrilDeId = (id: string) => carrilDe(nodos.find((n) => n.id === id)!)
  for (const a of aristas) {
    const io = indice.get(carrilDeId(a.origen) ?? '') ?? 0
    const id = indice.get(carrilDeId(a.destino) ?? '') ?? 0
    const xAsa = (carril: string) => {
      if (a.alFinal) return ancho - m.inicio
      // una conexión que sale de una tarjeta baja en vertical desde ella
      const desdeTarjeta = centroDe(a.origen)
      if (desdeTarjeta != null && a.relacion === 'conexion') return desdeTarjeta
      if (a.ms != null) return xDe(a.ms)
      const k = enEtiqueta.get(carril) ?? 0
      enEtiqueta.set(carril, k + 1)
      return 36 + k * 26
    }
    if (a.destino.startsWith('host-') && a.asaDestino) asas[a.destino]?.push({ id: a.asaDestino, tipo: 'target', lado: io <= id ? 'arriba' : 'abajo', x: xAsa(a.destino) })
    if (a.origen.startsWith('host-') && a.asaOrigen) asas[a.origen]?.push({ id: a.asaOrigen, tipo: 'source', lado: io < id ? 'abajo' : 'arriba', x: xAsa(a.origen) })
    // evidencia de una tarjeta hacia su banda de campaña: asa propia en la banda, a la altura de la tarjeta
    const cx = centroDe(a.origen)
    const banda = cajas[a.destino]
    if (a.relacion === 'evidencia' && cx != null && banda && a.destino.startsWith('camp-')) {
      const asa = `t-ev-${a.id}`
      ;(asas[a.destino] ??= []).push({ id: asa, tipo: 'target', lado: io >= id ? 'abajo' : 'arriba', x: Math.min(banda.ancho - 10, Math.max(10, cx - banda.x)) })
      asasArista[a.id] = { destino: asa }
    }
  }

  if (enTiempo) {
    // Una marca cada MINUTOS_POR_MARCA minutos, con su franja centrada en la hora (la cabecera cae sobre la marca).
    const paso = MINUTOS_POR_MARCA * MINUTO
    const marcas: Columna[] = []
    for (let ms = Math.ceil(msInicio / paso) * paso; ms <= msFin; ms += paso) {
      marcas.push({ x: xLineal(ms) - (MINUTOS_POR_MARCA * PX_POR_MINUTO) / 2, ancho: MINUTOS_POR_MARCA * PX_POR_MINUTO, ms, texto: textoHora(ms).slice(0, 5) })
    }
    return { cajas, padres, asas, asasArista, columnas: marcas, saltos: [], ancho, alto: y - m.entreCarriles }
  }

  const columnas: Columna[] = msColumna.map((ms, c) => ({ x: xColumna(c) - (m.columna - m.tarjeta.ancho) / 2, ancho: m.columna, ms, texto: textoHora(ms) }))
  const saltos: Salto[] = []
  for (let c = 1; c < nColumnas; c++) {
    const minutos = Math.round((msColumna[c] - msColumna[c - 1]) / MINUTO)
    if (minutos >= 1) saltos.push({ x: xColumna(c) - (m.columna - m.tarjeta.ancho) / 2, texto: `+${minutos} min` })
  }

  return { cajas, padres, asas, asasArista, columnas, saltos, ancho, alto: y - m.entreCarriles }
}

/** Posición absoluta de un nodo (para cuando su carril está oculto por un filtro). */
export function absoluta(id: string, d: Disposicion): Caja {
  const caja = d.cajas[id]
  const padre = d.padres[id]
  return padre ? { ...caja, x: caja.x + d.cajas[padre].x, y: caja.y + d.cajas[padre].y } : caja
}
