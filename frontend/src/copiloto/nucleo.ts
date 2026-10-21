/**
 * Copiloto: preguntas en lenguaje natural sobre la evidencia de UNA organización, con cita en cada afirmación.
 * Módulo compartido por el panel lateral y por la vista ampliada (`/copiloto`).
 *
 * Mismo patrón que el redactor del asistente: una interfaz (`ProveedorCopiloto`) y dos proveedores.
 *
 *   proveedorLocal    el de hoy: determinista. Reconoce un conjunto CERRADO de intenciones (`INTENCIONES`) y redacta
 *                     con plantillas sobre los datos del portal. No finge ser un modelo de lenguaje.
 *   proveedorLlmRag   LLM con RAG, declarado pero NO disponible: vivirá en el servidor (F6). El navegador nunca
 *                     llama a un LLM; solo recibirá fragmentos de su respuesta por streaming.
 *
 * Cada respuesta se ordena en cuatro bloques: HECHOS OBSERVADOS (con citas), INFERENCIAS DEL SISTEMA (patrones y
 * confianza), SEÑALES DÉBILES / HIPÓTESIS (lo que aún no es detección) y RECOMENDACIONES (vigilar, revisar, ir a
 * `/respuesta`). Reglas que este módulo hace cumplir, sea cual sea el proveedor:
 *   - No ejecuta acciones: las recomendaciones solo navegan a evidencia del portal o a `/respuesta`.
 *   - Toda afirmación lleva cita a su evidencia: `verificarFragmento` descarta la que no la lleve o cite algo ajeno.
 *   - Cada conversación pertenece a una sola organización (`preguntar` lo comprueba).
 *   - La evidencia (reglas, procesos, usuarios) la escribe el atacante: es DATO citado, nunca instrucción.
 */
import type { AlertaDay1, AristaP2 } from '@/api/exportaciones'
import type { Incidente } from '@/api/incidentes'
import { formatearHora } from '@/componentes/datos/hora'
import type { AccionAplicada, Organizacion } from '@/paginas/conciencia/modelo'
import { duracionEscenario, evaluar } from '@/paginas/conciencia/simulacion'

export interface Cita {
  /** Identificador estable del registro citado (alert_id, arista, campaña, paso) o de un filtro reproducible. */
  id: string
  etiqueta: string
  /** Fichero o fuente donde se puede comprobar. */
  fuente: string
  enlace?: string
}

export type Bloque = 'hechos' | 'inferencias' | 'senales' | 'recomendaciones'

export const TITULO_BLOQUE: Record<Bloque, string> = {
  hechos: 'Hechos observados',
  inferencias: 'Inferencias del sistema',
  senales: 'Señales débiles / hipótesis',
  recomendaciones: 'Recomendaciones',
}

export type Fragmento =
  /** Una afirmación con su base. Sin `bloque` cuenta como hecho observado. */
  | { tipo: 'texto'; texto: string; citas: Cita[]; bloque?: Bloque }
  /** Recomendación que solo navega: a `/respuesta` o a la evidencia de esta misma organización. */
  | { tipo: 'remision'; texto: string; a: string; etiqueta?: string }
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

/** Lo que el Copiloto sabe del sitio desde el que se le pregunta. Serializable: es lo que recibirá el servidor. */
export interface SeleccionContexto {
  tipo: 'incidente' | 'nodo' | 'evento'
  id: string
  etiqueta: string
}

/** Señal débil ya evaluada por un detector (ver `senales.ts`): avisa, no alerta. */
export interface SenalContexto {
  id: string
  host: string
  titulo: string
  porque: string
  citas: Cita[]
  vigilar: { texto: string; a: string }
}

export interface ContextoCopiloto {
  organizacion: { id: string; nombre: string; procedencia: 'documentada' | 'ilustrativa' }
  evidencias: Evidencia[]
  hosts: string[]
  /** Caso de `/respuesta` al que remitir las preguntas de mitigación. */
  casoRespuesta: string
  pagina?: string
  seleccion?: SeleccionContexto
  /** Segundo de la simulación (organizaciones de la demo), para responder sobre «ahora». */
  instante?: number
  /** Últimas preguntas de la conversación (historial corto). */
  historial?: string[]
  senales?: SenalContexto[]
}

export interface Pregunta {
  organizacion: string
  texto: string
}

export interface ProveedorCopiloto {
  id: 'local' | 'llm-rag'
  nombre: string
  /** Texto corto para la cabecera del panel. */
  indicador: string
  disponible: boolean
  descripcion: string
  responder(pregunta: Pregunta, contexto: ContextoCopiloto, opciones?: { retardoMs?: number; senal?: AbortSignal }): AsyncIterable<Fragmento>
}

export type Mensaje = { rol: 'usuario'; texto: string } | { rol: 'copiloto'; fragmentos: Fragmento[]; completo: boolean }

export interface Conversacion {
  organizacion: string
  mensajes: Mensaje[]
}

/** Longitud máxima de una pregunta. */
export const MAX_PREGUNTA = 300

/* --- Contexto por organización ---------------------------------------------------------------------------------- */

export const FUENTE_ALERTAS = 'eval/portal/alertas-apt29-day1.jsonl'
export const FUENTE_ARISTAS = 'eval/portal/aristas-p2.jsonl'
export const FUENTE_CAMPANAS = 'eval/portal/p1-campanas.jsonl · p2-campanas.jsonl'

/** DMEVALS (APT29 day1): evidencia medida y documentada. */
export function contextoDmevals(alertas: readonly AlertaDay1[], aristas: readonly AristaP2[], incidentes: readonly Incidente[]): ContextoCopiloto {
  const evidencias: Evidencia[] = [
    ...alertas.map((a) => ({
      id: `alerta:${a.id}`, tipo: 'alerta' as const, hora: formatearHora(a.hora), ms: a.ms, host: a.host, tecnicas: a.tecnicas, tacticas: a.tacticas,
      titulo: a.regla, fuente: FUENTE_ALERTAS, enlace: `/cronologia?sel=${a.id}`,
    })),
    ...aristas.map((r, i) => ({
      id: `arista:${i + 1}`, tipo: 'arista' as const, hora: formatearHora(r.hora), ms: r.ms, host: r.host, tecnicas: [], tacticas: ['lateral-movement'],
      titulo: `${r.proceso} → ${r.ipDestino}:${r.puerto}`, fuente: FUENTE_ARISTAS, enlace: `/cronologia?sel=arista-${i + 1}`,
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

/**
 * Organización de la demo, EN SU INSTANTE ACTUAL: solo los pasos que ya han ocurrido en su simulación (ilustrativos
 * salvo donde el escenario diga lo contrario). Sin instante, el escenario entero.
 */
export function contextoDemo(org: Organizacion, instante = duracionEscenario(org), acciones: readonly AccionAplicada[] = []): ContextoCopiloto {
  const ev = evaluar(org, instante, acciones)
  const nombre = (id: string) => (id === 'atacante' ? 'atacante' : (org.activos.find((a) => a.id === id)?.nombre ?? id))
  return {
    organizacion: { id: org.id, nombre: org.nombre, procedencia: 'ilustrativa' },
    evidencias: ev.ocurridos.map((p) => ({
      id: `paso:${p.id}`, tipo: 'paso' as const, hora: p.hora, ms: p.t * 1000, host: nombre(p.hasta === 'atacante' ? p.desde : p.hasta),
      tecnicas: [p.tecnica], tacticas: [p.tactica], titulo: p.titulo, fuente: org.procedenciaEscenario, enlace: `/conciencia?org=${org.id}&t=${p.t}`,
    })),
    hosts: org.activos.map((a) => a.nombre),
    casoRespuesta: org.id,
    instante,
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
  return { ...conversacion, mensajes: [...conversacion.mensajes, { rol: 'usuario', texto: pregunta.texto.slice(0, MAX_PREGUNTA) }] }
}

/** Adónde puede llevar una recomendación: al asistente de respuesta o a la evidencia del portal. Nada más. */
const DESTINOS_PERMITIDOS = ['/respuesta', '/cronologia', '/incidentes', '/ataque', '/attack', '/conciencia']

/**
 * Guarda del cliente: un fragmento de texto sin cita, o con una cita que no pertenece a la evidencia de ESTA
 * organización, se descarta y se avisa. Una recomendación solo puede navegar dentro del portal. El servidor (F6) será
 * la autoridad; esto es una segunda barrera.
 */
export function verificarFragmento(f: Fragmento, contexto: ContextoCopiloto): Fragmento {
  if (f.tipo === 'remision') {
    const interna = f.a.startsWith('/') && !f.a.startsWith('//') && DESTINOS_PERMITIDOS.some((d) => f.a === d || f.a.startsWith(`${d}?`) || f.a.startsWith(`${d}/`))
    return interna ? f : { tipo: 'aviso', texto: 'Se ha descartado una recomendación que llevaba fuera de la evidencia del portal.' }
  }
  if (f.tipo !== 'texto') return f
  const ids = new Set(contexto.evidencias.map((e) => e.id))
  const fuentes = new Set(contexto.evidencias.map((e) => e.fuente))
  const valida = (c: Cita) => ids.has(c.id) || (c.id.startsWith('filtro:') && fuentes.has(c.fuente))
  if (f.citas.length === 0 || !f.citas.every(valida)) return { tipo: 'aviso', texto: 'Se ha descartado una afirmación sin cita verificable en los datos de esta organización.' }
  return f
}

/* --- Intenciones (proveedor local) ------------------------------------------------------------------------------ */

export type IdIntencion =
  | 'ayuda' | 'mitigacion' | 'host-rango' | 'tecnica' | 'hosts-activos' | 'patrones' | 'campana' | 'incidentes'
  | 'actividad' | 'host' | 'lateral' | 'credenciales' | 'desconocida'

export interface Intencion {
  id: IdIntencion
  host?: string
  tecnica?: string
  desde?: number
  hasta?: number
}

/** Las intenciones que entiende el proveedor local, para la ayuda y la documentación. Es una lista CERRADA. */
export const INTENCIONES: readonly { id: IdIntencion; ejemplo: string }[] = [
  { id: 'actividad', ejemplo: '¿Qué está pasando?' },
  { id: 'incidentes', ejemplo: '¿Qué incidentes hay?' },
  { id: 'host-rango', ejemplo: '¿Qué pasó en NASHUA entre 03:09 y 03:18?' },
  { id: 'host', ejemplo: '¿Qué pasó en NASHUA?' },
  { id: 'tecnica', ejemplo: 'T1003.001' },
  { id: 'hosts-activos', ejemplo: '¿Qué hosts tienen más actividad?' },
  { id: 'patrones', ejemplo: '¿Qué debería vigilar?' },
  { id: 'campana', ejemplo: 'Explícame esta campaña' },
  { id: 'lateral', ejemplo: '¿Hubo movimiento lateral?' },
  { id: 'credenciales', ejemplo: '¿Robaron credenciales?' },
  { id: 'mitigacion', ejemplo: '¿Cómo lo mitigo?' },
  { id: 'ayuda', ejemplo: 'Ayuda' },
]

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const AYUDA = /^(ayuda|help|\?|que (sabes|puedes)( hacer)?|que preguntas)\b/
const MITIGACION = /(mitig|que hago|que hacer|bloque|aisl|conten|remedi|respond|parar|frenar)/
const LATERAL = /(lateral|salto|p2|movimiento|winrm|psexec)/
const CREDENCIALES = /(credencial|lsass|p1|mimikatz|volcado|contrasen)/
const TECNICA = /\bt\d{4}(\.\d{3})?\b/i
const HORA = /\b(\d{2}):(\d{2})(?::(\d{2}))?\b/g
const ACTIVOS = /(mas activ|mas actividad|mas ruid|mas alertas|top)/
const PATRONES = /(patron|vigil|sospech|raro|inusual|anomal|rafaga|repeti|senal)/
const CAMPANA = /(explica|campana|incidente)/
const INCIDENTES = /(incidentes|campanas)/
const ACTIVIDAD = /(que (esta )?pas|actividad|resumen|situacion|ahora|novedad)/

const msDeHora = ([, h, m, s = '0']: RegExpMatchArray) => ((+h * 60 + +m) * 60 + +s) * 1000

/** Reconoce la intención. Solo mira la pregunta del usuario: el texto de los registros nunca dirige. */
export function reconocerIntencion(texto: string, contexto: ContextoCopiloto): Intencion {
  const q = normalizar(texto.slice(0, MAX_PREGUNTA)).trim()
  if (AYUDA.test(q)) return { id: 'ayuda' }
  if (MITIGACION.test(q)) return { id: 'mitigacion' }
  const host = contexto.hosts.find((h) => q.includes(normalizar(h)))
  const horas = [...texto.matchAll(HORA)]
  if (host && horas.length >= 2) {
    const [a, b] = [msDeHora(horas[0]), msDeHora(horas[1])]
    return { id: 'host-rango', host, desde: Math.min(a, b), hasta: Math.max(a, b) }
  }
  const tecnica = TECNICA.exec(texto)?.[0].toUpperCase()
  if (tecnica) return { id: 'tecnica', tecnica }
  if (ACTIVOS.test(q)) return { id: 'hosts-activos' }
  if (PATRONES.test(q)) return { id: 'patrones' }
  if (CAMPANA.test(q) && (contexto.seleccion?.tipo === 'incidente' || /esta|este/.test(q))) return { id: 'campana' }
  if (INCIDENTES.test(q)) return { id: 'incidentes' }
  if (host) return { id: 'host', host }
  if (LATERAL.test(q)) return { id: 'lateral' }
  if (CREDENCIALES.test(q)) return { id: 'credenciales' }
  if (ACTIVIDAD.test(q)) return { id: 'actividad' }
  return { id: 'desconocida' }
}

/* --- Proveedor local (hoy) -------------------------------------------------------------------------------------- */

const NIVEL_TEXTO: Record<string, string> = { alerta: 'alertas', arista: 'conexiones', campana: 'campañas', paso: 'pasos' }

const cita = (e: Evidencia): Cita => ({ id: e.id, etiqueta: `${e.hora} · ${e.host} · ${e.titulo}`, fuente: e.fuente, enlace: e.enlace })
const filtro = (descripcion: string, fuente: string): Cita => ({ id: `filtro:${descripcion}`, etiqueta: `${fuente} filtrado por ${descripcion}`, fuente })
const hecho = (texto: string, citas: Cita[]): Fragmento => ({ tipo: 'texto', bloque: 'hechos', texto, citas })
const sinDatos = (contexto: ContextoCopiloto): Fragmento => ({ tipo: 'aviso', texto: `No hay datos de ${contexto.organizacion.nombre} para responder a eso.` })

/** Arma las frases (cada una con sus citas) para un conjunto de evidencias ya filtrado. */
function resumir(seleccion: Evidencia[], ambito: string, descripcion: string, contexto: ContextoCopiloto): Fragmento[] {
  if (seleccion.length === 0) return [sinDatos(contexto)]
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
      for (const c of lista) frases.push({ tipo: 'texto', bloque: 'inferencias', texto: `Campaña ${c.titulo}.`, citas: [cita(c)] })
      continue
    }
    frases.push(hecho(
      lista.length === 1 ? `Hay 1 registro de ${NIVEL_TEXTO[tipo]} ${ambito}, a las ${primera.hora}.` : `Hay ${lista.length} ${NIVEL_TEXTO[tipo]} ${ambito}, de ${primera.hora} a ${ultima.hora}.`,
      [filtro(descripcion, primera.fuente), cita(primera), ...(lista.length > 1 ? [cita(ultima)] : [])],
    ))
    const repeticiones = new Map<string, Evidencia[]>()
    for (const e of lista) repeticiones.set(e.titulo, [...(repeticiones.get(e.titulo) ?? []), e])
    const [titulo, ejemplos] = [...repeticiones.entries()].sort((a, b) => b[1].length - a[1].length)[0]
    if (repeticiones.size > 1) frases.push(hecho(`La más repetida es «${titulo}» (${ejemplos.length}).`, [cita(ejemplos[0])]))
  }
  return frases
}

/** Las señales débiles del contexto como bloque propio, con la recomendación de vigilar cada una. */
function senales(contexto: ContextoCopiloto, host?: string): Fragmento[] {
  const lista = (contexto.senales ?? []).filter((s) => !host || s.host === host)
  return lista.flatMap((s): Fragmento[] => [
    { tipo: 'texto', bloque: 'senales', texto: `${s.titulo}: ${s.porque}`, citas: s.citas },
    { tipo: 'remision', texto: 'Conviene vigilar.', a: s.vigilar.a, etiqueta: s.vigilar.texto },
  ])
}

const remitirRespuesta = (contexto: ContextoCopiloto): Fragmento => ({
  tipo: 'remision',
  texto: 'Para decidir qué hacer, con su porqué y su coste, el asistente de respuesta.',
  a: `/respuesta?caso=${encodeURIComponent(contexto.casoRespuesta)}`,
  etiqueta: 'Asistente de respuesta',
})

/** Decide QUÉ evidencia responde a la pregunta y la ordena en los cuatro bloques. */
export function responderLocal(pregunta: Pregunta, contexto: ContextoCopiloto): Fragmento[] {
  const intencion = reconocerIntencion(pregunta.texto, contexto)
  const ev = contexto.evidencias
  const delHost = (h: string) => ev.filter((e) => normalizar(e.host).split(' → ').includes(normalizar(h)))
  switch (intencion.id) {
    case 'ayuda':
      return [{ tipo: 'aviso', texto: `Sé responder a: ${INTENCIONES.filter((i) => i.id !== 'ayuda').map((i) => `«${i.ejemplo}»`).join(', ')}. No soy un modelo de lenguaje: respondo con plantillas sobre los datos de ${contexto.organizacion.nombre}.` }]
    case 'mitigacion':
      return [{ tipo: 'remision', texto: 'El Copiloto no ejecuta ni propone acciones aquí: el plan de respuesta, con su porqué y su coste, está en el asistente de respuesta.', a: `/respuesta?caso=${encodeURIComponent(contexto.casoRespuesta)}`, etiqueta: 'Asistente de respuesta' }]
    case 'host-rango': {
      const enRango = delHost(intencion.host!).filter((e) => e.tipo !== 'campana' && e.ms >= intencion.desde! && e.ms <= intencion.hasta! + 999)
      const h = (ms: number) => new Date(ms).toISOString().slice(11, 19)
      return [...resumir(enRango, `en ${intencion.host} entre ${h(intencion.desde!)} y ${h(intencion.hasta!)}`, `host = ${intencion.host}, ${h(intencion.desde!)}–${h(intencion.hasta!)}`, contexto), ...senales(contexto, intencion.host)]
    }
    case 'tecnica': {
      const t = intencion.tecnica!
      return resumir(ev.filter((e) => e.tecnicas.some((x) => x === t || x.startsWith(`${t}.`))), `con ${t}`, `técnica = ${t}`, contexto)
    }
    case 'hosts-activos': {
      const cuenta = contexto.hosts.map((h) => ({ h, lista: delHost(h).filter((e) => e.tipo !== 'campana') })).filter((x) => x.lista.length > 0).sort((a, b) => b.lista.length - a.lista.length)
      if (cuenta.length === 0) return [sinDatos(contexto)]
      return cuenta.slice(0, 4).map(({ h, lista }) => hecho(`${h}: ${lista.length} registros.`, [filtro(`host = ${h}`, lista[0].fuente), cita(lista[0])]))
    }
    case 'patrones': {
      const lista = senales(contexto)
      return lista.length ? lista : [{ tipo: 'aviso', texto: `Con los umbrales actuales no hay señales débiles en ${contexto.organizacion.nombre}. Una señal solo se enseña si sale de los datos.` }]
    }
    case 'campana': {
      const id = contexto.seleccion?.tipo === 'incidente' ? `campana:${contexto.seleccion.id}` : undefined
      // la campaña elegida, si es de esta organización; sin elección, la primera. Nunca otra en su lugar.
      const campana = id ? ev.find((e) => e.id === id) : ev.find((e) => e.tipo === 'campana')
      if (!campana) return [sinDatos(contexto)]
      const hosts = campana.host.split(' → ')
      const observadas = ev.filter((e) => e.tipo !== 'campana' && hosts.includes(e.host) && e.tecnicas.some((t) => campana.tecnicas.includes(t)))
      return [
        { tipo: 'texto', bloque: 'inferencias', texto: `Campaña ${campana.titulo}: la reconoce un patrón de correlación, no una sola alerta.`, citas: [cita(campana)] },
        ...resumir(observadas, `con sus técnicas en ${campana.host}`, `host = ${campana.host}, técnicas de la campaña`, contexto).filter((f) => f.tipo !== 'aviso'),
        remitirRespuesta(contexto),
      ]
    }
    case 'incidentes': {
      const campanas = ev.filter((e) => e.tipo === 'campana')
      return campanas.length ? [...campanas.map((c): Fragmento => ({ tipo: 'texto', bloque: 'inferencias', texto: `Campaña ${c.titulo}.`, citas: [cita(c)] })), { tipo: 'remision', texto: 'Todas, con su evidencia.', a: '/incidentes', etiqueta: 'Incidentes' }] : [sinDatos(contexto)]
    }
    case 'host':
      return [...resumir(delHost(intencion.host!), `en ${intencion.host}`, `host = ${intencion.host}`, contexto), ...senales(contexto, intencion.host)]
    case 'lateral':
      return resumir(ev.filter((e) => e.tacticas.includes('lateral-movement')), 'de movimiento lateral', 'táctica = lateral-movement', contexto)
    case 'credenciales':
      return resumir(ev.filter((e) => e.tacticas.includes('credential-access') || e.tecnicas.some((t) => t.startsWith('T1003'))), 'de robo de credenciales', 'táctica = credential-access o técnica T1003.*', contexto)
    case 'actividad': {
      const observados = ev.filter((e) => e.tipo !== 'campana')
      if (observados.length === 0) return [{ tipo: 'aviso', texto: `Por ahora no hay actividad registrada en ${contexto.organizacion.nombre}.` }]
      return [...resumir(ev, contexto.instante != null ? 'hasta este instante' : 'en total', 'toda la organización', contexto), ...senales(contexto)]
    }
    default:
      return [{ tipo: 'aviso', texto: `No sé responder a eso con los datos de ${contexto.organizacion.nombre}. Prueba con un host, una técnica (T1003.001), «¿qué debería vigilar?» o «ayuda».` }]
  }
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
  indicador: 'Local · determinista',
  disponible: true,
  descripcion: 'Reconoce un conjunto cerrado de preguntas y responde con plantillas sobre los datos del portal, en el navegador y sin ningún modelo.',
  async *responder(pregunta, contexto, opciones = {}) {
    // por partes, como llegará el streaming del servidor
    for (const fragmento of responderLocal(pregunta, contexto)) {
      if (opciones.retardoMs) await esperar(opciones.retardoMs, opciones.senal)
      yield fragmento
    }
  },
}

/** Ruta del servidor que servirá el LLM con RAG (F6): `POST`, respuesta en SSE. Hoy no existe y el portal no la llama. */
export const RUTA_COPILOTO_SERVIDOR = '/api/copiloto/consultas'

export const proveedorLlmRag: ProveedorCopiloto = {
  id: 'llm-rag',
  nombre: 'LLM con RAG (servidor, F6)',
  indicador: 'LLM + RAG · F6, no disponible',
  disponible: false,
  descripcion: 'Recuperación en la base vectorial de la organización y redacción con un LLM, siempre en el servidor. El navegador solo recibirá los fragmentos por streaming.',
  responder() {
    return {
      [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new Error('El copiloto con LLM y RAG no está disponible todavía (F6): vivirá en el servidor, nunca en el navegador.')) }),
    }
  },
}

export const PROVEEDORES: readonly ProveedorCopiloto[] = [proveedorLocal, proveedorLlmRag]
