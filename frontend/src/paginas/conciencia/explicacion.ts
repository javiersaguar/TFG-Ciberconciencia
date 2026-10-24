/**
 * Por qué un activo está como está: la respuesta a «¿por qué está amenazado?» o «¿por qué hay alerta aquí?» al pinchar
 * una pieza de la maqueta. Lógica pura sobre lo que ya calcula la simulación; no añade hechos, los ordena y los cuenta.
 *
 *   ataque      pasos del atacante que lo alcanzaron (o que ocurrieron en él), con hora, técnica y desde dónde
 *   deteccion   qué lo detectó: el patrón CEP que reconoce el paso (P1, P2) y las alertas Sigma del paso
 *   riesgo      qué activo comprometido llega a él por la red, y por qué servicio
 *   ruta        si está en la ruta más probable del atacante hacia una joya, o si es esa joya
 *   respuesta   la acción de respuesta que se le aplicó (aislar, proteger) y lo que impidió
 *   impedido    pasos contra él que no llegaron a ocurrir, con el motivo
 *   contexto    área de negocio, criticidad y si es joya de la corona
 *
 * Cada motivo lleva la procedencia de su paso (documentado en DMEVALS hasta las 03:19; ilustrativo en el resto), así que
 * el panel puede enseñar el mismo chip que el resto del portal.
 */
import type { Procedencia } from '@/api/observabilidad'

import type { EstadoPieza } from './maqueta'
import { NOMBRE_TACTICA, porId, type AccionAplicada, type Activo, type Organizacion } from './modelo'
import type { RutaProbable } from './razonamiento'
import type { Evaluacion } from './simulacion'

export type TonoMotivo = 'ataque' | 'deteccion' | 'riesgo' | 'ruta' | 'respuesta' | 'impedido' | 'contexto'

export interface Motivo {
  tono: TonoMotivo
  titulo: string
  detalle?: string
  /** Hora del escenario. */
  hora?: string
  tecnica?: string
  procedencia?: Procedencia
  fuente?: string
}

export interface Explicacion {
  activo: Activo
  estado: EstadoPieza
  /** Una frase con lo esencial, para leer de un vistazo. */
  titular: string
  motivos: Motivo[]
}

export const NOMBRE_PATRON: Record<string, string> = {
  P1: 'robo de credenciales',
  P2: 'movimiento lateral',
  P3: 'descubrimiento y escalada',
  P4: 'exfiltración',
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export function explicarActivo(
  org: Organizacion,
  ev: Evaluacion,
  ruta: RutaProbable | null,
  riesgo: ReadonlySet<string>,
  acciones: readonly AccionAplicada[],
  id: string,
): Explicacion | null {
  const activos = porId(org.activos)
  const activo = activos.get(id)
  if (!activo) return null
  const nombre = (x: string) => (x === 'atacante' ? 'el atacante' : (activos.get(x)?.nombre ?? x))
  const estadoBase = ev.estado.get(id) ?? 'normal'
  const estado: EstadoPieza = activo.tipo === 'atacante' ? 'atacante' : estadoBase === 'normal' && riesgo.has(id) ? 'riesgo' : estadoBase
  const motivos: Motivo[] = []
  const delPaso = (p: (typeof ev.pasos)[number]['paso']) => ({ hora: p.hora, tecnica: p.tecnica, procedencia: p.procedencia, fuente: p.fuente })

  // 1. Lo que le hizo el atacante: pasos que llegaron a él o que ocurrieron en él, en orden.
  const recibidos = ev.pasos.filter(({ paso, ocurrido }) => ocurrido && paso.hasta === id)
  for (const { paso } of recibidos) {
    const local = paso.desde === paso.hasta
    const partes = [paso.detalle]
    if (!local) partes.push(`Desde ${nombre(paso.desde)}${paso.cuenta ? ` con la cuenta ${org.cuentas[paso.cuenta] ?? paso.cuenta}` : ''}.`)
    if (paso.expone) partes.push(`Quedan expuestas las credenciales de ${org.cuentas[paso.expone] ?? paso.expone}.`)
    motivos.push({ tono: 'ataque', titulo: `${NOMBRE_TACTICA[paso.tactica] ?? paso.tactica}: ${paso.titulo}`, detalle: partes.join(' '), ...delPaso(paso) })
  }

  // 2. Qué lo detectó: el patrón CEP de esos pasos y sus alertas Sigma.
  for (const { paso } of recibidos) {
    if (!paso.patron && paso.alertas == null) continue
    const alertas = paso.alertas != null ? plural(paso.alertas, 'alerta Sigma', 'alertas Sigma') : undefined
    motivos.push({
      tono: 'deteccion',
      titulo: paso.patron ? `Detectado por el patrón ${paso.patron} (${NOMBRE_PATRON[paso.patron] ?? 'correlación'})` : `${alertas} en este paso`,
      detalle: paso.patron
        ? `La correlación reconoce «${paso.titulo}» como parte de una campaña${alertas ? `, a partir de ${alertas}` : ''}.`
        : 'Alertas sueltas: ningún patrón de correlación las agrupa todavía.',
      ...delPaso(paso),
    })
  }

  // 3. Lo que hizo el atacante DESDE aquí (si es un punto de apoyo).
  for (const { paso } of ev.pasos.filter(({ paso, ocurrido }) => ocurrido && paso.desde === id && paso.hasta !== id)) {
    motivos.push({ tono: 'ataque', titulo: `Desde aquí: ${paso.titulo}`, detalle: `Hacia ${nombre(paso.hasta)}.`, ...delPaso(paso) })
  }

  // 4. Por qué está en riesgo: un vecino comprometido que llega a él por la red.
  if (estado === 'riesgo' || estado === 'normal') {
    for (const enlace of org.enlaces.filter((e) => e.hasta === id && ev.estado.get(e.desde) === 'comprometido')) {
      motivos.push({ tono: 'riesgo', titulo: `${nombre(enlace.desde)} está comprometido y llega a él`, detalle: `Por ${enlace.servicio}: es el siguiente salto posible.` })
    }
  }

  // 5. La ruta más probable del atacante.
  if (ruta?.camino.includes(id)) {
    const camino = ruta.camino.map(nombre).join(' → ')
    motivos.push(
      ruta.joya === id
        ? { tono: 'ruta', titulo: `Siguiente objetivo probable del atacante (${plural(ruta.saltos, 'salto', 'saltos')})`, detalle: `Ruta más corta desde lo que ya controla: ${camino}.` }
        : { tono: 'ruta', titulo: `En la ruta probable hacia ${nombre(ruta.joya)}`, detalle: `${camino}.` },
    )
  }

  // 6. La respuesta aplicada sobre él, y lo que impidió.
  for (const accion of acciones) {
    const e = accion.efecto
    if ((e.tipo === 'aislar' || e.tipo === 'proteger') && e.activo === id) {
      motivos.push({ tono: 'respuesta', titulo: accion.titulo, detalle: `Aplicada en el segundo ${Math.round(accion.t)} de la demo: solo afecta a lo que viene después.` })
    }
  }
  for (const { paso, motivo } of ev.bloqueados.filter(({ paso }) => paso.hasta === id || paso.desde === id)) {
    motivos.push({ tono: 'impedido', titulo: `Impedido: ${paso.titulo}`, detalle: motivo, ...delPaso(paso) })
  }

  // 7. Contexto de negocio.
  if (activo.tipo !== 'atacante') {
    motivos.push({
      tono: 'contexto',
      titulo: activo.joya ? 'Joya de la corona' : `Área: ${activo.area}`,
      detalle: `${activo.joya ? `${activo.area} · ` : ''}criticidad ${activo.criticidad}/5${activo.ip ? ` · ${activo.ip}` : ''}.`,
    })
  }

  const primero = recibidos.find(({ paso }) => paso.compromete !== false)?.paso
  const titular = (() => {
    switch (estado) {
      case 'atacante':
        return `Origen del ataque, fuera de la red: ${plural(ev.ocurridos.filter((p) => p.desde === 'atacante').length, 'paso lanzado', 'pasos lanzados')} desde aquí.`
      case 'comprometido':
        return `Comprometido${primero ? ` desde las ${primero.hora} («${primero.titulo}»)` : ''}: el atacante lo controla.`
      case 'riesgo':
        return 'En riesgo: un activo comprometido llega a él por la red.'
      case 'aislado':
        return 'Aislado por la respuesta: el atacante ya no puede usarlo ni llegar a él.'
      case 'protegido':
        return 'Protegido por la respuesta: el atacante no puede comprometerlo.'
      default:
        return ruta?.camino.includes(id) ? 'Sin compromiso todavía, pero en la ruta probable del atacante.' : 'Sin actividad del atacante.'
    }
  })()

  return { activo, estado, titular, motivos }
}
