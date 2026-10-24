/**
 * La vista del MUNDO (globo 3D y mapa 2D): qué pasos del ataque cruzan la frontera de la organización (el correo que
 * entra, las balizas de mando y control que salen, la exfiltración) y entre qué dos sitios del mapa. Lógica pura, con
 * tests; las dos vistas solo la dibujan.
 *
 * Las ubicaciones son las de `Organizacion.geografia`: ILUSTRATIVAS (ver `modelo.ts`). Cuando la API dé IP públicas
 * geolocalizadas, `conexiones` recibirá los lugares reales y las vistas no cambiarán.
 */
import type { Vec3 } from './maqueta'
import { NOMBRE_TACTICA, type Canal, type Lugar, type Organizacion, type PasoAtaque } from './modelo'
import type { Evaluacion } from './simulacion'

export interface Conexion {
  id: string
  paso: PasoAtaque
  /** De dónde a dónde va el tráfico (entrada: del atacante a la sede; salida: de la sede al atacante). */
  desde: Lugar
  hasta: Lugar
  sentido: 'entrada' | 'salida'
  /** El sitio de fuera y lo que es (servidor de mando y control, almacenamiento…). */
  fuera: Lugar & { papel: string }
  ocurrido: boolean
  /** Es el último paso ocurrido que cruza la frontera: el que se anima. */
  ultimo: boolean
}

/**
 * Qué sitio del mapa corresponde a un paso que cruza la frontera: por su canal (correo, c2, salida); la exfiltración
 * por el propio canal de mando y control (T1041) va al servidor de C2; lo que entra sin canal, al de entrada (o al C2).
 */
function claveDe(paso: PasoAtaque): Canal | 'entrada' {
  if (paso.tecnica === 'T1041') return 'c2'
  if (paso.canal) return paso.canal
  return paso.desde === 'atacante' ? 'entrada' : 'c2'
}

/** Los pasos que ya llegaron y que cruzan la frontera, con sus dos extremos en el mapa. */
export function conexiones(org: Organizacion, ev: Evaluacion): Conexion[] {
  const geo = org.geografia
  if (!geo) return []
  const ultimoFuera = [...ev.ocurridos].reverse().find((p) => p.desde === 'atacante' || p.hasta === 'atacante')
  const salida: Conexion[] = []
  for (const { paso, ocurrido } of ev.pasos) {
    if (paso.desde !== 'atacante' && paso.hasta !== 'atacante') continue
    const clave = claveDe(paso)
    const fuera = geo.infraestructura[clave] ?? geo.infraestructura.c2 ?? geo.infraestructura.entrada
    if (!fuera) continue
    const sentido = paso.desde === 'atacante' ? 'entrada' : 'salida'
    salida.push({
      id: paso.id,
      paso,
      desde: sentido === 'entrada' ? fuera : geo.sede,
      hasta: sentido === 'entrada' ? geo.sede : fuera,
      sentido,
      fuera,
      ocurrido,
      ultimo: ocurrido && paso === ultimoFuera,
    })
  }
  return salida
}

/** Los sitios de fuera distintos que aparecen en unas conexiones (cada uno una vez, con todos sus papeles). */
export function sitiosDeFuera(cs: readonly Conexion[]): (Lugar & { papeles: string[] })[] {
  const porClave = new Map<string, Lugar & { papeles: string[] }>()
  for (const c of cs) {
    const clave = `${c.fuera.lat},${c.fuera.lon}`
    const sitio = porClave.get(clave) ?? { ...c.fuera, papeles: [] }
    if (!sitio.papeles.includes(c.fuera.papel)) sitio.papeles.push(c.fuera.papel)
    porClave.set(clave, sitio)
  }
  return [...porClave.values()]
}

const rad = (g: number) => (g * Math.PI) / 180

/** Un punto de la Tierra en la escena del globo: radio `r`, el meridiano 0 hacia +z y el norte hacia +y. */
export function aEsfera(lat: number, lon: number, r = 1): Vec3 {
  const la = rad(lat)
  const lo = rad(lon)
  return [r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo)]
}

/**
 * Arco por el círculo máximo entre dos sitios, levantado sobre la superficie (`altura` en la mitad, en radios de la
 * Tierra), como los vuelos en un mapa: interpolación esférica de los dos vectores y una joroba de seno.
 */
export function arcoGeodesico(a: Lugar, b: Lugar, n = 48, altura?: number): Vec3[] {
  const p = aEsfera(a.lat, a.lon)
  const q = aEsfera(b.lat, b.lon)
  const coseno = Math.min(1, Math.max(-1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]))
  const angulo = Math.acos(coseno)
  const alto = altura ?? Math.min(0.35, 0.06 + angulo * 0.12)
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const sa = angulo < 1e-6 ? 1 - t : Math.sin((1 - t) * angulo) / Math.sin(angulo)
    const sb = angulo < 1e-6 ? t : Math.sin(t * angulo) / Math.sin(angulo)
    const r = 1 + Math.sin(Math.PI * t) * alto
    return [(sa * p[0] + sb * q[0]) * r, (sa * p[1] + sb * q[1]) * r, (sa * p[2] + sb * q[2]) * r] as Vec3
  })
}

/** Dirección desde la que mirar el globo para ver a la vez la sede y los sitios de fuera (su media en la esfera). */
export function direccionDeVista(lugares: readonly Lugar[]): Vec3 {
  const suma = lugares.map((l) => aEsfera(l.lat, l.lon)).reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]] as Vec3, [0, 0, 0] as Vec3)
  const n = Math.hypot(...suma)
  if (n < 1e-6) return lugares[0] ? aEsfera(lugares[0].lat, lugares[0].lon) : [0, 0, 1]
  // un poco desde el norte, para que los arcos se vean en curva y no de canto
  const v: Vec3 = [suma[0] / n, suma[1] / n + 0.12, suma[2] / n]
  const m = Math.hypot(...v)
  return [v[0] / m, v[1] / m, v[2] / m]
}

/** Coordenadas del mapamundi (listas planas lon, lat) como segmentos sobre la esfera, a radio `r`. */
export function segmentosEnEsfera(lineas: readonly (readonly number[])[], r = 1.0015): Float32Array {
  const salida: number[] = []
  for (const l of lineas) {
    for (let i = 2; i + 1 < l.length; i += 2) salida.push(...aEsfera(l[i - 1], l[i - 2], r), ...aEsfera(l[i + 1], l[i], r))
  }
  return new Float32Array(salida)
}

/** Paralelos y meridianos cada `paso` grados, como segmentos sobre la esfera. */
export function reticula(paso = 15, r = 1.001): Float32Array {
  const lineas: number[][] = []
  for (let lat = -90 + paso; lat < 90; lat += paso) lineas.push(Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]).flat())
  for (let lon = -180; lon < 180; lon += paso) lineas.push(Array.from({ length: 37 }, (_, i) => [lon, -90 + i * 5]).flat())
  return segmentosEnEsfera(lineas, r)
}

/** Frase para lectores de pantalla: qué cruza la frontera y entre dónde. */
export function resumenMundo(org: Organizacion, cs: readonly Conexion[]): string {
  const geo = org.geografia
  if (!geo) return `Sin ubicaciones para ${org.nombre}.`
  const partes = [`Mapa del mundo de ${org.nombre} (ubicaciones ilustrativas). Sede en ${geo.sede.nombre}.`]
  if (cs.length === 0) partes.push('Todavía ningún paso del ataque ha cruzado la frontera de la organización.')
  for (const c of cs) {
    const verbo = c.ocurrido ? '' : 'impedido: '
    partes.push(`${c.paso.hora}, ${verbo}${c.paso.titulo} (${NOMBRE_TACTICA[c.paso.tactica] ?? c.paso.tactica}), ${c.sentido === 'entrada' ? `desde ${c.desde.nombre}` : `hacia ${c.hasta.nombre}`}.`)
  }
  return partes.join(' ')
}

/**
 * A qué lado de su punto va la etiqueta de cada sitio, para que dos ciudades cercanas (Ámsterdam y Fráncfort) no se
 * pisen: de oeste a este, a la derecha salvo que un sitio ya rotulado a la derecha esté a menos de `cerca` grados.
 */
export function ladosDeEtiqueta(sitios: readonly Pick<Lugar, 'lat' | 'lon'>[], cerca = 9): ('derecha' | 'izquierda')[] {
  const orden = sitios.map((s, i) => ({ s, i })).sort((a, b) => a.s.lon - b.s.lon)
  const lados: ('derecha' | 'izquierda')[] = sitios.map(() => 'derecha')
  const hechos: { s: Pick<Lugar, 'lat' | 'lon'>; lado: 'derecha' | 'izquierda' }[] = []
  for (const { s, i } of orden) {
    const choca = hechos.some((h) => h.lado === 'derecha' && Math.abs(h.s.lon - s.lon) < cerca && Math.abs(h.s.lat - s.lat) < cerca)
    lados[i] = choca ? 'izquierda' : 'derecha'
    hechos.push({ s, lado: lados[i] })
  }
  return lados
}
