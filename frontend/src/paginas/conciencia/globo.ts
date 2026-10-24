/**
 * La vista del MUNDO (globo 3D y mapa 2D): qué pasos del ataque cruzan la frontera de la organización (el correo que
 * entra, las balizas de mando y control que salen, la exfiltración) y entre qué dos sitios del mapa. Lógica pura, con
 * tests; las dos vistas solo la dibujan.
 *
 * Las ubicaciones son las de `Organizacion.geografia`: ILUSTRATIVAS (ver `modelo.ts`). Cuando la API dé IP públicas
 * geolocalizadas, `conexiones` recibirá los lugares reales y las vistas no cambiarán.
 */
import { aEsfera, arcoGeodesico, direccionDeVista, reticula, segmentosEnEsfera } from '@/componentes/tierra/esfera'

import { NOMBRE_TACTICA, type Canal, type Lugar, type Organizacion, type PasoAtaque } from './modelo'
import type { Evaluacion } from './simulacion'

// la geometría de la esfera vive en `componentes/tierra/esfera.ts` (la comparte el mapa mundial); se reexporta aquí
export { aEsfera, arcoGeodesico, direccionDeVista, reticula, segmentosEnEsfera }

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
