/**
 * Copiloto: preguntas en lenguaje natural sobre la evidencia de UNA organización, con cita en cada afirmación.
 *
 * Mismo patrón que el redactor del asistente: una interfaz (`ProveedorCopiloto`) y dos proveedores.
 *
 *   proveedorLocal    el de hoy: determinista, recupera de los datos del portal y redacta con plantillas
 *   proveedorLlmRag   LLM con RAG, declarado pero NO disponible: vivirá en el servidor (F6). El navegador nunca
 *                     llama a un LLM; solo recibirá fragmentos de su respuesta por streaming.
 *
 * Reglas que no se rompen (y que este módulo hace cumplir, sea cual sea el proveedor):
 *   - No ejecuta acciones. Para mitigaciones remite a `/respuesta`.
 *   - Toda afirmación lleva cita a su evidencia: `verificarFragmento` descarta la que no la lleve o cite algo ajeno.
 *   - Cada conversación pertenece a una sola organización (`preguntar` lo comprueba).
 *   - La evidencia (reglas, procesos, usuarios) la escribe el atacante: es DATO citado, nunca instrucción.
 */
import type { AlertaDay1, AristaP2 } from '@/api/exportaciones'
import type { Incidente } from '@/api/incidentes'
import { formatearHora } from '@/componentes/datos/hora'
import type { Organizacion } from '@/paginas/conciencia/modelo'
import { duracionEscenario, evaluar } from '@/paginas/conciencia/simulacion'

export interface Cita {
  /** Identificador estable del registro citado (alert_id, arista, campaña, paso) o de un filtro reproducible. */
  id: string
  etiqueta: string
  /** Fichero o fuente donde se puede comprobar. */
  fuente: string
  enlace?: string
}

export type Fragmento =
  | { tipo: 'texto'; texto: string; citas: Cita[] }
  | { tipo: 'remision'; texto: string; a: string }
  | { tipo: 'aviso'; texto: string }

export interface Evidencia {
  id: string
  tipo: 'alerta' | 'arista' | 'campana' | 'paso'
  hora: string
  ms: number
  host: string
  tecnicas: string[]
  tacticas: string[]
  titulo: string
  fuente: string
  enlace?: string
}

export interface ContextoCopiloto {
  organizacion: { id: string; nombre: string; procedencia: 'documentada' | 'ilustrativa' }
  evidencias: Evidencia[]
  hosts: string[]
  /** Caso de `/respuesta` al que remitir las preguntas de mitigación. */
  casoRespuesta: string
}

export interface Pregunta {
  organizacion: string
  texto: string
}

export interface ProveedorCopiloto {
  id: string
  nombre: string
  disponible: boolean
  descripcion: string
  responder(pregunta: Pregunta, contexto: ContextoCopiloto, opciones?: { retardoMs?: number; senal?: AbortSignal }): AsyncIterable<Fragmento>
}

export type Mensaje = { rol: 'usuario'; texto: string } | { rol: 'copiloto'; fragmentos: Fragmento[]; completo: boolean }

export interface Conversacion {
  organizacion: string
  mensajes: Mensaje[]
}

/* --- Contexto por organización ---------------------------------------------------------------------------------- */

const FUENTE_ALERTAS = 'eval/portal/alertas-apt29-day1.jsonl'
const FUENTE_ARISTAS = 'eval/portal/aristas-p2.jsonl'
const FUENTE_CAMPANAS = 'eval/portal/p1-campanas.jsonl · p2-campanas.jsonl'

/** DMEVALS (APT29 day1): evidencia medida y documentada. */
export function contextoDmevals(alertas: readonly AlertaDay1[], aristas: readonly AristaP2[], incidentes: readonly Incidente[]): ContextoCopiloto {
  const evidencias: Evidencia[] = [
    ...alertas.map((a) => ({
      id: `alerta:${a.id}`, tipo: 'alerta' as const, hora: formatearHora(a.hora), ms: a.ms, host: a.host, tecnicas: a.tecnicas, tacticas: a.tacticas,
      titulo: a.regla, fuente: FUENTE_ALERTAS, enlace: '/cronologia',
    })),
    ...aristas.map((r, i) => ({
      id: `arista:${i + 1}`, tipo: 'arista' as const, hora: formatearHora(r.hora), ms: r.ms, host: r.host, tecnicas: [], tacticas: ['lateral-movement'],
      titulo: `${r.proceso} → ${r.ipDestino}:${r.puerto}`, fuente: FUENTE_ARISTAS, enlace: '/ataque?sel=e-winrm',
    })),
    ...incidentes.filter((i) => i.dataset === 'SDWIN-200501225525').map((i) => ({
      id: `campana:${i.id}`, tipo: 'campana' as const, hora: i.inicio ? formatearHora(i.inicio) : '', ms: 0, host: i.hosts.join(' → '),
      tecnicas: i.tecnicas, tacticas: i.patron === 'P2' ? ['lateral-movement'] : ['credential-access'],
      titulo: `${i.patron} · ${i.hosts.join(' → ')} · confianza ${i.confianza?.toLocaleString('es-ES', { minimumFractionDigits: 2 }) ?? 'no documentada'}`,
      fuente: FUENTE_CAMPANAS, enlace: `/incidentes?id=${encodeURIComponent(i.id)}`,
    })),
  ]
  return { organizacion: { id: 'dmevals', nombre: 'DMEVALS (APT29 day1)', procedencia: 'documentada' }, evidencias, hosts: ['SCRANTON', 'NASHUA', 'NEWYORK', 'UTICA'], casoRespuesta: 'p2-scranton-nashua' }
}

/** Organización de la demo: los pasos del escenario (ilustrativos salvo donde el escenario diga lo contrario). */
export function contextoDemo(org: Organizacion): ContextoCopiloto {
  const ev = evaluar(org, duracionEscenario(org), [])
  const nombre = (id: string) => (id === 'atacante' ? 'atacante' : (org.activos.find((a) => a.id === id)?.nombre ?? id))
  return {
    organizacion: { id: org.id, nombre: org.nombre, procedencia: 'ilustrativa' },
    evidencias: ev.ocurridos.map((p) => ({
      id: `paso:${p.id}`, tipo: 'paso' as const, hora: p.hora, ms: p.t * 1000, host: nombre(p.hasta === 'atacante' ? p.desde : p.hasta),
      tecnicas: [p.tecnica], tacticas: [p.tactica], titulo: p.titulo, fuente: org.procedenciaEscenario, enlace: `/conciencia?org=${org.id}&t=${p.t}`,
    })),
    hosts: org.activos.map((a) => a.nombre),
    casoRespuesta: org.id,
  }
}

/* --- Reglas que se cumplen con cualquier proveedor ---------------------------------------------------------------- */

export function nuevaConversacion(organizacion: string): Conversacion {
  return { organizacion, mensajes: [] }
}

/** Una conversación es de una sola organización: preguntar por otra es un error, no un cambio silencioso. */
export function preguntar(conversacion: Conversacion, pregunta: Pregunta): Conversacion {
  if (pregunta.organizacion !== conversacion.organizacion) {
    throw new Error(`Esta conversación es de ${conversacion.organizacion}; la pregunta es de ${pregunta.organizacion}`)
  }
  return { ...conversacion, mensajes: [...conversacion.mensajes, { rol: 'usuario', texto: pregunta.texto }] }
}

/**
 * Guarda del cliente: un fragmento de texto sin cita, o con una cita que no pertenece a la evidencia de ESTA
 * organización, se descarta y se avisa. El servidor (F6) será la autoridad; esto es una segunda barrera.
 */
export function verificarFragmento(f: Fragmento, contexto: ContextoCopiloto): Fragmento {
  if (f.tipo === 'remision') return f.a.startsWith('/respuesta') ? f : { tipo: 'aviso', texto: 'Se ha descartado una remisión que no lleva al asistente de respuesta.' }
  if (f.tipo !== 'texto') return f
  const ids = new Set(contexto.evidencias.map((e) => e.id))
  const fuentes = new Set(contexto.evidencias.map((e) => e.fuente))
  const valida = (c: Cita) => ids.has(c.id) || (c.id.startsWith('filtro:') && fuentes.has(c.fuente))
  if (f.citas.length === 0 || !f.citas.every(valida)) return { tipo: 'aviso', texto: 'Se ha descartado una afirmación sin cita verificable en los datos de esta organización.' }
  return f
}

/* --- Proveedor local (hoy) -------------------------------------------------------------------------------------- */

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const MITIGACION = /(mitig|que hago|que hacer|bloque|aisl|conten|remedi|respond|parar|frenar)/
const LATERAL = /(lateral|salto|p2|movimiento|winrm|psexec)/
const CREDENCIALES = /(credencial|lsass|p1|mimikatz|volcado|contrasen)/
const TECNICA = /\bt\d{4}(\.\d{3})?\b/i
const NIVEL_TEXTO: Record<string, string> = { alerta: 'alertas', arista: 'conexiones', campana: 'campañas', paso: 'pasos' }

const cita = (e: Evidencia): Cita => ({ id: e.id, etiqueta: `${e.hora} · ${e.host} · ${e.titulo}`, fuente: e.fuente, enlace: e.enlace })
const filtro = (descripcion: string, fuente: string): Cita => ({ id: `filtro:${descripcion}`, etiqueta: `${fuente} filtrado por ${descripcion}`, fuente })

/** Arma las frases (cada una con sus citas) para un conjunto de evidencias ya filtrado. */
function resumir(seleccion: Evidencia[], ambito: string, descripcion: string): Fragmento[] {
  const ordenadas = [...seleccion].sort((a, b) => a.ms - b.ms)
  const porTipo = new Map<string, Evidencia[]>()
  for (const e of ordenadas) porTipo.set(e.tipo, [...(porTipo.get(e.tipo) ?? []), e])
  const frases: Fragmento[] = []
  // primero lo observado (alertas, conexiones, pasos) y al final lo inferido (campañas)
  for (const tipo of ['alerta', 'arista', 'paso', 'campana'] as const) {
    const lista = porTipo.get(tipo)
    if (!lista) continue
    const primera = lista[0]
    const ultima = lista.at(-1)!
    if (tipo === 'campana') {
      for (const c of lista) frases.push({ tipo: 'texto', texto: `Campaña ${c.titulo}.`, citas: [cita(c)] })
      continue
    }
    frases.push({
      tipo: 'texto',
      texto: lista.length === 1 ? `Hay 1 registro de ${NIVEL_TEXTO[tipo]} ${ambito}, a las ${primera.hora}.` : `Hay ${lista.length} ${NIVEL_TEXTO[tipo]} ${ambito}, de ${primera.hora} a ${ultima.hora}.`,
      citas: [filtro(descripcion, primera.fuente), cita(primera), ...(lista.length > 1 ? [cita(ultima)] : [])],
    })
    const repeticiones = new Map<string, Evidencia[]>()
    for (const e of lista) repeticiones.set(e.titulo, [...(repeticiones.get(e.titulo) ?? []), e])
    const [titulo, ejemplos] = [...repeticiones.entries()].sort((a, b) => b[1].length - a[1].length)[0]
    if (repeticiones.size > 1) frases.push({ tipo: 'texto', texto: `La más repetida es «${titulo}» (${ejemplos.length}).`, citas: [cita(ejemplos[0])] })
  }
  return frases
}

/** Decide QUÉ evidencia responde a la pregunta. Solo mira la pregunta del usuario: el texto de los registros nunca dirige. */
export function responderLocal(pregunta: Pregunta, contexto: ContextoCopiloto): Fragmento[] {
  const q = normalizar(pregunta.texto)
  const ev = contexto.evidencias
  if (MITIGACION.test(q)) {
    return [{ tipo: 'remision', texto: 'El copiloto no ejecuta ni propone acciones aquí: el plan de respuesta, con su porqué y su coste, está en el asistente de respuesta.', a: `/respuesta?caso=${encodeURIComponent(contexto.casoRespuesta)}` }]
  }
  const host = contexto.hosts.find((h) => q.includes(normalizar(h)))
  if (host) return resumir(ev.filter((e) => normalizar(e.host).split(' → ').includes(normalizar(host))), `en ${host}`, `host = ${host}`)
  const tecnica = TECNICA.exec(pregunta.texto)?.[0].toUpperCase()
  if (tecnica) return resumir(ev.filter((e) => e.tecnicas.some((t) => t === tecnica || t.startsWith(`${tecnica}.`))), `con ${tecnica}`, `técnica = ${tecnica}`)
  if (LATERAL.test(q)) return resumir(ev.filter((e) => e.tacticas.includes('lateral-movement')), 'de movimiento lateral', 'táctica = lateral-movement')
  if (CREDENCIALES.test(q)) return resumir(ev.filter((e) => e.tacticas.includes('credential-access') || e.tecnicas.some((t) => t.startsWith('T1003'))), 'de robo de credenciales', 'táctica = credential-access o técnica T1003.*')
  return [{ tipo: 'aviso', texto: `No encuentro evidencia en los datos de ${contexto.organizacion.nombre} que responda a eso. Prueba con un host, una técnica (T1003.001) o «movimiento lateral».` }]
}

const esperar = (ms: number, senal?: AbortSignal) =>
  new Promise<void>((resolver, rechazar) => {
    if (senal?.aborted) return rechazar(new DOMException('Cancelada', 'AbortError'))
    const id = setTimeout(resolver, ms)
    senal?.addEventListener('abort', () => { clearTimeout(id); rechazar(new DOMException('Cancelada', 'AbortError')) }, { once: true })
  })

export const proveedorLocal: ProveedorCopiloto = {
  id: 'local',
  nombre: 'Proveedor local',
  disponible: true,
  descripcion: 'Recupera de los datos del portal y redacta con plantillas, en el navegador y sin ningún modelo.',
  async *responder(pregunta, contexto, opciones = {}) {
    // por partes, como llegará el streaming del servidor
    for (const fragmento of responderLocal(pregunta, contexto)) {
      if (opciones.retardoMs) await esperar(opciones.retardoMs, opciones.senal)
      yield fragmento
    }
  },
}

/** Ruta del servidor que servirá el LLM con RAG (F6). Hoy no existe y el portal no la llama. */
export const RUTA_COPILOTO_SERVIDOR = '/api/organizaciones/{organizacion}/copiloto'

export const proveedorLlmRag: ProveedorCopiloto = {
  id: 'llm-rag',
  nombre: 'LLM con RAG (servidor, F6)',
  disponible: false,
  descripcion: 'Recuperación en la base vectorial de la organización y redacción con un LLM, siempre en el servidor. El navegador solo recibirá los fragmentos por streaming.',
  responder() {
    return {
      [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new Error('El copiloto con LLM y RAG no está disponible todavía (F6): vivirá en el servidor, nunca en el navegador.')) }),
    }
  },
}

export const PROVEEDORES: readonly ProveedorCopiloto[] = [proveedorLocal, proveedorLlmRag]
