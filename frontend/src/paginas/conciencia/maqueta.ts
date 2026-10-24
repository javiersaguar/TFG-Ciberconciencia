/**
 * Maqueta 3D de una organización: la traducción de (organización, instante del ataque, ruta probable) a una escena
 * que `Maqueta3D.tsx` solo tiene que dibujar. Lógica pura, sin three.js ni WebGL, para poder probarla entera.
 *
 *   plataformas   una por zona de red, escalonadas: Internet abajo y los activos críticos arriba, que es también el
 *                 sentido en que sube el atacante
 *   piezas        un volumen por activo, con forma según su tipo y color según su estado (el mismo que en 2D)
 *   arcos         pasos del ataque (ocurridos o impedidos), ruta probable y enlaces de red
 *   marcas        pasos locales (abrir un adjunto, volcar LSASS en el propio equipo): un anillo sobre la pieza
 *
 * Coordenadas: el lienzo 2D de la organización (px) pasa a unidades de escena dividiendo entre 100; `x` del lienzo es
 * `x` de la escena y su `y` es la profundidad `z`. El eje vertical `y` es la altura.
 */
import { porId, type Activo, type Organizacion, type TipoActivo } from './modelo'
import type { RutaProbable } from './razonamiento'
import type { EstadoActivo, Evaluacion } from './simulacion'

export type Vec3 = readonly [number, number, number]

export const ESCALA = 1 / 100
/** Altura de la primera plataforma y lo que sube cada zona respecto a la anterior. */
export const ALTURA_BASE = 0.2
export const ESCALON = 0.45
const ANCHO_PLATAFORMA = 2.2
const MARGEN_FONDO = 0.5

export type Forma = 'caja' | 'cilindro' | 'octaedro'
export type EstadoPieza = EstadoActivo | 'riesgo' | 'atacante'

export interface Plataforma {
  id: string
  titulo: string
  centro: Vec3
  /** Ancho (x), alto (y, desde el suelo) y fondo (z). */
  medidas: Vec3
}

export interface Pieza {
  id: string
  nombre: string
  tipo: TipoActivo
  forma: Forma
  /** Centro de la base de la pieza, sobre su plataforma. */
  base: Vec3
  medidas: Vec3
  estado: EstadoPieza
  joya: boolean
  /** Destino de la ruta probable: la joya hacia la que va el atacante. */
  objetivo: boolean
  /** Lo acaba de alcanzar el último paso ocurrido. */
  golpeado: boolean
}

export type TipoArco = 'ataque' | 'impedido' | 'ruta' | 'red'

export interface Arco {
  id: string
  tipo: TipoArco
  desde: Vec3
  hasta: Vec3
  /** Altura máxima de la curva sobre el más alto de sus extremos. */
  elevacion: number
  /** Es el último paso ocurrido (el que se anima mientras la simulación avanza). */
  ultimo: boolean
  /** Títulos de los pasos que recorre (varios pasos pueden compartir origen y destino). */
  pasos: string[]
}

export interface MarcaLocal {
  activo: string
  tipo: 'ataque' | 'impedido'
}

export interface Escena {
  plataformas: Plataforma[]
  piezas: Pieza[]
  arcos: Arco[]
  marcas: MarcaLocal[]
  /** Caja que lo contiene todo (para encuadrar la cámara). */
  extension: { min: Vec3; max: Vec3 }
}

const FORMA: Record<TipoActivo, { forma: Forma; medidas: Vec3 }> = {
  atacante: { forma: 'octaedro', medidas: [0.9, 0.9, 0.9] },
  estacion: { forma: 'caja', medidas: [0.72, 0.42, 0.5] },
  servidor: { forma: 'caja', medidas: [0.6, 0.95, 0.6] },
  dc: { forma: 'caja', medidas: [0.7, 1.15, 0.7] },
  datos: { forma: 'cilindro', medidas: [0.78, 0.72, 0.78] },
  backup: { forma: 'cilindro', medidas: [0.86, 0.5, 0.86] },
  web: { forma: 'caja', medidas: [0.78, 0.5, 0.6] },
  vpn: { forma: 'caja', medidas: [0.78, 0.36, 0.6] },
  correo: { forma: 'caja', medidas: [0.78, 0.44, 0.6] },
  ot: { forma: 'caja', medidas: [0.7, 0.7, 0.7] },
}

/** El atacante flota sobre Internet: no está dentro de la red. */
const FLOTACION_ATACANTE = 0.55

export function alturaPlataforma(columna: number): number {
  return ALTURA_BASE + columna * ESCALON
}

/** Punto más alto de una pieza, donde nacen y mueren los arcos. */
export function cima(p: Pieza): Vec3 {
  return [p.base[0], p.base[1] + p.medidas[1], p.base[2]]
}

/**
 * Punto de la curva de un arco en `t` ∈ [0, 1]: una parábola en el plano vertical que une los extremos, con la cima
 * a `elevacion` sobre el más alto de los dos. Sirve para dibujar el arco y para mover el punto que lo recorre.
 */
export function puntoDelArco(a: Pick<Arco, 'desde' | 'hasta' | 'elevacion'>, t: number): Vec3 {
  const [x0, y0, z0] = a.desde
  const [x1, y1, z1] = a.hasta
  const pico = Math.max(y0, y1) + a.elevacion
  // Bézier cuadrática con el punto de control a la altura que deja la cima en `pico`.
  const yc = 2 * pico - (y0 + y1) / 2
  const u = 1 - t
  return [u * u * x0 + 2 * u * t * ((x0 + x1) / 2) + t * t * x1, u * u * y0 + 2 * u * t * yc + t * t * y1, u * u * z0 + 2 * u * t * ((z0 + z1) / 2) + t * t * z1]
}

function centroZona(org: Organizacion, zona: string): number {
  const xs = org.activos.filter((a) => a.zona === zona).map((a) => a.x)
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0
}

export function construirEscena(org: Organizacion, ev: Evaluacion, ruta: RutaProbable | null, riesgo: ReadonlySet<string>): Escena {
  const { ancho, alto } = org.lienzo
  const aX = (x: number) => (x - ancho / 2) * ESCALA
  const aZ = (y: number) => (y - alto / 2) * ESCALA
  const fondo = alto * ESCALA - MARGEN_FONDO
  const columnaDe = new Map(org.zonas.map((z) => [z.id, z.columna]))

  const plataformas: Plataforma[] = [...org.zonas]
    .sort((a, b) => a.columna - b.columna)
    .map((z) => {
      const h = alturaPlataforma(z.columna)
      return { id: z.id, titulo: z.titulo, centro: [aX(centroZona(org, z.id)), h / 2, 0], medidas: [ANCHO_PLATAFORMA, h, fondo] }
    })

  const ultimo = ev.ocurridos.at(-1)
  const piezas: Pieza[] = org.activos.map((a: Activo) => {
    const { forma, medidas } = FORMA[a.tipo]
    const suelo = alturaPlataforma(columnaDe.get(a.zona) ?? 0)
    const estadoBase = ev.estado.get(a.id) ?? 'normal'
    const estado: EstadoPieza = a.tipo === 'atacante' ? 'atacante' : estadoBase === 'normal' && riesgo.has(a.id) ? 'riesgo' : estadoBase
    return {
      id: a.id,
      nombre: a.nombre,
      tipo: a.tipo,
      forma,
      base: [aX(a.x), suelo + (a.tipo === 'atacante' ? FLOTACION_ATACANTE : 0), aZ(a.y)],
      medidas,
      estado,
      joya: !!a.joya,
      objetivo: ruta?.joya === a.id,
      golpeado: !!ultimo && ultimo.hasta === a.id && ultimo.compromete !== false,
    }
  })
  const pieza = porId(piezas)

  const arcos: Arco[] = []
  // Enlaces de red: a ras de plataforma, para que se lean como la red sobre la que se mueve el ataque.
  for (const e of org.enlaces) {
    const a = pieza.get(e.desde)
    const b = pieza.get(e.hasta)
    if (!a || !b || a.tipo === 'atacante' || b.tipo === 'atacante') continue
    arcos.push({ id: `red-${e.desde}-${e.hasta}`, tipo: 'red', desde: [a.base[0], a.base[1] + 0.02, a.base[2]], hasta: [b.base[0], b.base[1] + 0.02, b.base[2]], elevacion: 0.05, ultimo: false, pasos: [e.servicio] })
  }

  // Pasos entre activos distintos: un arco por pareja (origen, destino). Si alguno de sus pasos ocurrió, es ataque.
  const porPareja = new Map<string, Arco>()
  for (const { paso, ocurrido } of ev.pasos) {
    if (paso.desde === paso.hasta) continue
    const a = pieza.get(paso.desde)
    const b = pieza.get(paso.hasta)
    if (!a || !b) continue
    const clave = `${paso.desde}>${paso.hasta}`
    const haciaFuera = b.tipo === 'atacante' || a.tipo === 'atacante'
    const largo = Math.hypot(b.base[0] - a.base[0], b.base[2] - a.base[2])
    const previo = porPareja.get(clave)
    const tipo: TipoArco = ocurrido || previo?.tipo === 'ataque' ? 'ataque' : 'impedido'
    porPareja.set(clave, {
      id: `paso-${clave}`,
      tipo,
      desde: cima(a),
      hasta: cima(b),
      // lo que sale a Internet (mando y control, exfiltración) o llega de ella, por arriba de todo
      elevacion: haciaFuera ? 1.4 + largo * 0.08 : 0.55 + largo * 0.1,
      ultimo: (previo?.ultimo ?? false) || (ocurrido && paso === ultimo),
      pasos: [...(previo?.pasos ?? []), paso.titulo],
    })
  }
  arcos.push(...porPareja.values())

  // Ruta probable hacia la siguiente joya: más baja que los pasos, para no taparlos.
  if (ruta) {
    ruta.camino.slice(1).forEach((hasta, i) => {
      const a = pieza.get(ruta.camino[i])
      const b = pieza.get(hasta)
      if (!a || !b) return
      arcos.push({ id: `ruta-${ruta.camino[i]}-${hasta}`, tipo: 'ruta', desde: cima(a), hasta: cima(b), elevacion: 0.3, ultimo: false, pasos: [`Ruta probable hacia ${pieza.get(ruta.joya)?.nombre ?? ruta.joya}`] })
    })
  }

  // Pasos locales (sobre el propio activo): basta con que uno haya ocurrido para que la marca sea de ataque.
  const locales = new Map<string, MarcaLocal['tipo']>()
  for (const { paso, ocurrido } of ev.pasos) {
    if (paso.desde !== paso.hasta || paso.desde === 'atacante') continue
    if (ocurrido) locales.set(paso.desde, 'ataque')
    else if (!locales.has(paso.desde)) locales.set(paso.desde, 'impedido')
  }
  const marcas: MarcaLocal[] = [...locales].map(([activo, tipo]) => ({ activo, tipo }))

  const puntos = [
    ...plataformas.flatMap((p) => [
      [p.centro[0] - p.medidas[0] / 2, 0, -p.medidas[2] / 2] as Vec3,
      [p.centro[0] + p.medidas[0] / 2, p.medidas[1], p.medidas[2] / 2] as Vec3,
    ]),
    ...piezas.map(cima),
    ...arcos.filter((a) => a.tipo !== 'red').map((a) => puntoDelArco(a, 0.5)),
  ]
  const min: Vec3 = [Math.min(...puntos.map((p) => p[0])), Math.min(...puntos.map((p) => p[1])), Math.min(...puntos.map((p) => p[2]))]
  const max: Vec3 = [Math.max(...puntos.map((p) => p[0])), Math.max(...puntos.map((p) => p[1])), Math.max(...puntos.map((p) => p[2]))]

  return { plataformas, piezas, arcos, marcas, extension: { min, max } }
}

/** Frase que resume la escena para lectores de pantalla (el lienzo 3D es una imagen; la alternativa es la vista 2D). */
export function resumenEscena(org: Organizacion, escena: Escena): string {
  const de = (estado: EstadoPieza) => escena.piezas.filter((p) => p.estado === estado).map((p) => p.nombre)
  const partes = [`Maqueta 3D de ${org.nombre}: ${escena.plataformas.length} zonas de red, de ${escena.plataformas[0]?.titulo ?? ''} a ${escena.plataformas.at(-1)?.titulo ?? ''}.`]
  const comprometidos = de('comprometido')
  partes.push(comprometidos.length ? `Comprometidos: ${comprometidos.join(', ')}.` : 'Ningún activo comprometido.')
  const aislados = de('aislado')
  if (aislados.length) partes.push(`Aislados: ${aislados.join(', ')}.`)
  const objetivo = escena.piezas.find((p) => p.objetivo)
  if (objetivo) partes.push(`Ruta probable hacia ${objetivo.nombre}.`)
  return partes.join(' ')
}
