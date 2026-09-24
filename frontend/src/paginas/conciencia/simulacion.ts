/**
 * El curso del ataque en un instante: qué pasos han ocurrido, cuáles ha impedido la respuesta y en qué estado está
 * cada activo. Lógica pura y determinista: `evaluar(org, t, acciones)` da siempre lo mismo para lo mismo, así que
 * pausar, cambiar de organización o volver atrás es solo volver a evaluar.
 *
 * Un paso **ocurre** si llega su momento y nada lo impide. Lo impiden, con el motivo que se enseña en la cronología:
 *   - que dependa de un paso que no ocurrió (`requiere`);
 *   - que su origen no esté en manos del atacante;
 *   - que el origen o el destino estén aislados, o el destino protegido;
 *   - que use una cuenta bloqueada o un canal cortado (correo, mando y control, salida de datos).
 * Una acción solo afecta a los pasos **posteriores** a su aplicación: responder tarde no deshace lo ocurrido.
 */
import { porId, type AccionAplicada, type Organizacion, type PasoAtaque } from './modelo'

export type EstadoActivo = 'normal' | 'comprometido' | 'aislado' | 'protegido'

export interface PasoEvaluado {
  paso: PasoAtaque
  ocurrido: boolean
  /** Por qué no ocurrió. */
  motivo?: string
}

export interface Evaluacion {
  tiempo: number
  /** Pasos cuyo momento ya llegó, en orden. */
  pasos: PasoEvaluado[]
  ocurridos: PasoAtaque[]
  bloqueados: PasoEvaluado[]
  comprometidos: Set<string>
  estado: Map<string, EstadoActivo>
  /** Objetivos del atacante ya cumplidos (exfiltración, cifrado, sabotaje…). */
  impactos: PasoAtaque[]
  /** Tácticas observadas, sin repetir, en el orden en que aparecieron. */
  tacticas: string[]
  empezado: boolean
  terminado: boolean
  duracion: number
}

export function duracionEscenario(org: Organizacion): number {
  return Math.max(0, ...org.pasos.map((p) => p.t))
}

function comprometeDestino(paso: PasoAtaque): boolean {
  return paso.hasta !== 'atacante' && paso.compromete !== false
}

export function evaluar(org: Organizacion, tiempo: number, acciones: readonly AccionAplicada[] = []): Evaluacion {
  const activos = porId(org.activos)
  const nombre = (id: string) => activos.get(id)?.nombre ?? id
  const pasosPorId = porId(org.pasos)
  const resultado = new Map<string, PasoEvaluado>()
  const comprometidos = new Set<string>()
  const pasos: PasoEvaluado[] = []

  const vigentes = (t: number) => acciones.filter((a) => a.t <= t).map((a) => a.efecto)

  for (const paso of [...org.pasos].sort((a, b) => a.t - b.t)) {
    if (paso.t > tiempo) break
    const efectos = vigentes(paso.t)
    const aislado = (id: string) => efectos.some((e) => e.tipo === 'aislar' && e.activo === id)
    const protegido = (id: string) => efectos.some((e) => e.tipo === 'proteger' && e.activo === id)
    const requisitos = (paso.requiere ?? []).map((id) => resultado.get(id))

    let motivo: string | undefined
    if (requisitos.some((r) => !r?.ocurrido)) {
      motivo = 'Depende de un paso que no llegó a ocurrir'
    } else if (
      paso.desde !== 'atacante' &&
      !comprometidos.has(paso.desde) &&
      // un paso local sobre el destino de su requisito (abrir el adjunto que acaba de llegar) sí puede ocurrir
      !(paso.requiere ?? []).some((id) => pasosPorId.get(id)?.hasta === paso.desde)
    ) {
      motivo = `${nombre(paso.desde)} no está en manos del atacante`
    } else if (paso.desde !== 'atacante' && aislado(paso.desde)) {
      motivo = `${nombre(paso.desde)} está aislado`
    } else if (paso.hasta !== 'atacante' && paso.hasta !== paso.desde && aislado(paso.hasta)) {
      motivo = `${nombre(paso.hasta)} está aislado`
    } else if (paso.hasta !== 'atacante' && protegido(paso.hasta)) {
      motivo = `${nombre(paso.hasta)} está protegido`
    } else if (paso.cuenta && efectos.some((e) => e.tipo === 'bloquear-cuenta' && e.cuenta === paso.cuenta)) {
      motivo = `La cuenta ${org.cuentas[paso.cuenta] ?? paso.cuenta} está bloqueada`
    } else if (paso.canal && efectos.some((e) => e.tipo === 'bloquear-canal' && e.canal === paso.canal)) {
      motivo = { correo: 'El correo malicioso se retiró', c2: 'El canal de mando y control está cortado', salida: 'La salida de datos está bloqueada' }[paso.canal]
    }

    const evaluado: PasoEvaluado = motivo ? { paso, ocurrido: false, motivo } : { paso, ocurrido: true }
    if (evaluado.ocurrido) {
      if (comprometeDestino(paso)) comprometidos.add(paso.hasta)
      if (paso.desde === paso.hasta && paso.desde !== 'atacante') comprometidos.add(paso.desde)
    }
    resultado.set(paso.id, evaluado)
    pasos.push(evaluado)
  }

  const efectosAhora = vigentes(tiempo)
  const estado = new Map<string, EstadoActivo>()
  for (const activo of org.activos) {
    if (activo.tipo === 'atacante') continue
    if (efectosAhora.some((e) => e.tipo === 'aislar' && e.activo === activo.id)) estado.set(activo.id, 'aislado')
    else if (comprometidos.has(activo.id)) estado.set(activo.id, 'comprometido')
    else if (efectosAhora.some((e) => e.tipo === 'proteger' && e.activo === activo.id)) estado.set(activo.id, 'protegido')
    else estado.set(activo.id, 'normal')
  }

  const ocurridos = pasos.filter((p) => p.ocurrido).map((p) => p.paso)
  const duracion = duracionEscenario(org)
  return {
    tiempo,
    pasos,
    ocurridos,
    bloqueados: pasos.filter((p) => !p.ocurrido),
    comprometidos,
    estado,
    impactos: ocurridos.filter((p) => p.impacto),
    tacticas: [...new Set(ocurridos.map((p) => p.tactica))],
    empezado: tiempo > 0,
    terminado: tiempo >= duracion,
    duracion,
  }
}

/** Activos comprometidos que siguen activos (no aislados): desde ellos el atacante aún puede moverse. */
export function comprometidosActivos(ev: Evaluacion): string[] {
  return [...ev.comprometidos].filter((id) => ev.estado.get(id) === 'comprometido')
}

/** Resultado final en una frase, o `null` mientras el ataque sigue. */
export function desenlace(ev: Evaluacion): { tono: 'contenido' | 'impacto'; texto: string } | null {
  if (!ev.terminado) return null
  if (ev.impactos.length === 0) {
    return { tono: 'contenido', texto: `Ataque contenido: la respuesta impidió ${ev.bloqueados.length} de ${ev.pasos.length} pasos y el atacante no alcanzó ningún objetivo.` }
  }
  return {
    tono: 'impacto',
    texto: `El atacante alcanzó ${ev.impactos.length} ${ev.impactos.length === 1 ? 'objetivo' : 'objetivos'}: ${ev.impactos.map((p) => p.impacto).join(' · ')}.` +
      (ev.bloqueados.length ? ` La respuesta impidió ${ev.bloqueados.length} pasos.` : ''),
  }
}
