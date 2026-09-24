/**
 * Motor de reglas del asistente de respuesta: a partir de lo que ya ha ocurrido (nunca de lo que va a ocurrir), qué
 * tiene que hacer la organización **ahora**, ordenado por prioridad y con su porqué. Lógica pura y determinista.
 *
 * Cada regla parte de una evidencia —una técnica ATT&CK observada en un activo— y propone acciones clasificadas por
 * fase de respuesta (NIST SP 800-61: contención, erradicación, recuperación; más protección preventiva y
 * comunicación) y por táctica de MITRE D3FEND (Isolate, Evict, Harden, Restore, Detect). La prioridad combina la
 * fase, la criticidad del activo, lo reciente de la evidencia y si el activo está en la ruta probable del atacante;
 * y cuando una acción tiene un coste de negocio (aislar el DC, parar la línea), el asistente lo dice.
 *
 * Por qué reglas y no un modelo: la recomendación tiene que poder auditarse y defenderse paso a paso. El LLM tiene
 * su sitio en `redactor.ts`, redactando la explicación, no decidiendo la acción.
 */
import { porId, type AccionAplicada, type Efecto, type Organizacion, type PasoAtaque } from '../modelo'
import type { RutaProbable } from '../razonamiento'
import type { Evaluacion } from '../simulacion'

export type FaseRespuesta = 'Contención' | 'Protección preventiva' | 'Erradicación' | 'Recuperación' | 'Comunicación'
export type TacticaD3fend = 'Isolate' | 'Evict' | 'Harden' | 'Restore' | 'Detect'

export interface Recomendacion {
  clave: string
  titulo: string
  detalle: string
  /** Evidencias que la justifican, una por línea. */
  porque: string[]
  fase: FaseRespuesta
  d3fend: TacticaD3fend
  efecto: Efecto
  /** 0 – 100. */
  prioridad: number
  impactoNegocio?: string
  activo?: string
}

type Candidata = Omit<Recomendacion, 'prioridad' | 'porque'> & { ajuste?: number }

const BASE: Record<FaseRespuesta, number> = {
  Contención: 70,
  'Protección preventiva': 50,
  Erradicación: 42,
  Comunicación: 40,
  Recuperación: 36,
}

const INFO: Efecto = { tipo: 'informativa' }

function evidencia(paso: PasoAtaque): string {
  return `${paso.hora} · ${paso.titulo} (${paso.tecnica}${paso.patron ? `, reconocido por ${paso.patron}` : ''})`
}

function reglasDePaso(org: Organizacion, paso: PasoAtaque): Candidata[] {
  const activos = porId(org.activos)
  const victima = activos.get(paso.hasta === 'atacante' ? paso.desde : paso.hasta)
  const cuenta = (id: string) => org.cuentas[id] ?? id
  const candidatas: Candidata[] = []

  if (paso.canal === 'correo') {
    candidatas.push({
      clave: 'canal:correo', titulo: 'Retirar el correo malicioso y bloquear al remitente',
      detalle: 'Purgar el mensaje de todos los buzones y bloquear en la pasarela al remitente y los adjuntos con macro.',
      fase: 'Contención', d3fend: 'Isolate', efecto: { tipo: 'bloquear-canal', canal: 'correo' },
    })
    if (victima) {
      candidatas.push({
        clave: `info:avisar-${victima.area}`, titulo: `Avisar a ${victima.area} de que no abra el adjunto`,
        detalle: 'Un aviso corto y directo al área que lo ha recibido; es probable que no sea la única destinataria.',
        fase: 'Comunicación', d3fend: 'Detect', efecto: INFO, activo: victima.id,
      })
    }
  }

  const comprometeAlgo = paso.hasta !== 'atacante' && paso.compromete !== false
  if (victima && victima.tipo !== 'atacante' && (comprometeAlgo || paso.desde === paso.hasta)) {
    const esDc = victima.tipo === 'dc'
    candidatas.push({
      clave: `aislar:${victima.id}`, titulo: `Aislar ${victima.nombre} de la red`,
      detalle: esDc
        ? 'Último recurso: desconectar el controlador de dominio corta el acceso del atacante… y el de todos los demás.'
        : 'Aislamiento desde el EDR: el equipo solo habla con la consola de seguridad y se conserva para el análisis forense.',
      fase: 'Contención', d3fend: 'Isolate', efecto: { tipo: 'aislar', activo: victima.id }, activo: victima.id,
      impactoNegocio: esDc
        ? 'Nadie en la organización podrá iniciar sesión mientras esté aislado.'
        : victima.tipo === 'ot'
          ? 'La planta pierde la supervisión remota: hay que operar en local.'
          : `${victima.area} pierde ${victima.nombre} mientras dure la investigación.`,
      ajuste: esDc ? -30 : 0,
    })
  }

  if (paso.canal === 'c2' || paso.tactica === 'command-and-control') {
    candidatas.push({
      clave: 'canal:c2', titulo: 'Cortar el canal de mando y control',
      detalle: 'Bloquear el dominio y la IP del servidor de mando en el cortafuegos, el proxy y el DNS. El implante queda sordo.',
      fase: 'Contención', d3fend: 'Isolate', efecto: { tipo: 'bloquear-canal', canal: 'c2' }, ajuste: 6,
    })
  }

  for (const id of [paso.expone, paso.tactica === 'lateral-movement' ? paso.cuenta : undefined]) {
    if (!id) continue
    if (id === 'dominio') {
      candidatas.push({
        clave: 'cuenta:dominio', titulo: 'Restablecer krbtgt dos veces y las cuentas privilegiadas',
        detalle: 'Invalida los tickets Kerberos forjados con el hash robado (Golden Ticket). Dos veces, dejando replicar entre medias.',
        fase: 'Contención', d3fend: 'Evict', efecto: { tipo: 'bloquear-cuenta', cuenta: id },
        impactoNegocio: 'Todos los usuarios tendrán que volver a iniciar sesión.', ajuste: 20,
      })
    } else {
      candidatas.push({
        clave: `cuenta:${id}`, titulo: `Deshabilitar y restablecer ${cuenta(id)}`,
        detalle: paso.expone === id
          ? `Sus credenciales estaban en memoria de ${victima?.nombre ?? paso.desde} cuando se volcaron: hay que darlas por robadas.`
          : 'El atacante la está usando para moverse entre equipos.',
        fase: 'Contención', d3fend: 'Evict', efecto: { tipo: 'bloquear-cuenta', cuenta: id }, ajuste: 4,
      })
    }
  }

  if (paso.tecnica.startsWith('T1003.006')) {
    candidatas.push({
      clave: 'info:replicacion', titulo: 'Quitar permisos de replicación a cuentas que no son DC',
      detalle: 'La causa raíz del DCSync: ninguna cuenta de servicio necesita «Replicating Directory Changes All».',
      fase: 'Erradicación', d3fend: 'Harden', efecto: INFO,
    })
  }

  if (paso.tactica === 'persistence' && victima) {
    candidatas.push({
      clave: `info:persistencia-${victima.id}`, titulo: `Eliminar la persistencia en ${victima.nombre}`,
      detalle: 'Borrar la tarea o la clave de arranque y comprobar que no queda otra antes de devolver el equipo.',
      fase: 'Erradicación', d3fend: 'Evict', efecto: INFO, activo: victima.id,
    })
  }

  if (paso.tactica === 'exfiltration' || paso.tactica === 'collection') {
    candidatas.push({
      clave: 'canal:salida', titulo: 'Bloquear la salida de datos al exterior',
      detalle: 'Cortar las conexiones salientes no autorizadas y activar la prevención de fuga de datos (DLP) en el perímetro.',
      fase: 'Contención', d3fend: 'Isolate', efecto: { tipo: 'bloquear-canal', canal: 'salida' }, ajuste: paso.tactica === 'exfiltration' ? 8 : 0,
    })
  }
  if (paso.tactica === 'exfiltration') {
    candidatas.push({
      clave: 'info:brecha', titulo: 'Activar el protocolo de brecha de datos',
      detalle: 'Evaluar si hay datos personales afectados: si los hay, notificación a la autoridad de control en 72 h (RGPD, art. 33).',
      fase: 'Comunicación', d3fend: 'Detect', efecto: INFO, ajuste: 10,
    })
  }

  if (paso.tecnica === 'T1490') {
    candidatas.push({
      clave: 'info:copias', titulo: 'Recuperar desde la copia inmutable fuera de línea',
      detalle: 'Las copias en línea ya no son fiables. Verificar la última copia inmutable antes de restaurar nada.',
      fase: 'Recuperación', d3fend: 'Restore', efecto: INFO,
    })
  }
  if (paso.tecnica === 'T1486') {
    candidatas.push({
      clave: 'info:restaurar', titulo: 'Restaurar los servidores cifrados desde copias limpias',
      detalle: 'Reconstruir, no descifrar: pagar no garantiza nada y financia el siguiente ataque.',
      fase: 'Recuperación', d3fend: 'Restore', efecto: INFO,
    })
  }
  if (victima?.tipo === 'ot') {
    candidatas.push({
      clave: 'info:modo-manual', titulo: 'Pasar la línea a operación manual segura',
      detalle: 'Cortar el control remoto del PLC y operar en local hasta verificar las consignas una a una.',
      fase: 'Contención', d3fend: 'Isolate', efecto: INFO, ajuste: 12,
      impactoNegocio: 'La producción baja al ritmo de la operación manual.',
    })
  }

  if (paso.tactica === 'discovery') {
    const objetivo = activos.get(paso.hasta)
    if (objetivo && objetivo.tipo !== 'atacante') {
      candidatas.push({
        clave: `info:vigilar-${objetivo.id}`, titulo: `Reforzar la vigilancia de ${objetivo.nombre}`,
        detalle: 'El atacante lo acaba de reconocer: es un objetivo probable. Subir el nivel de registro y las alertas.',
        fase: 'Protección preventiva', d3fend: 'Detect', efecto: INFO, activo: objetivo.id, ajuste: -12,
      })
    }
  }
  return candidatas
}

function reglasDeRuta(org: Organizacion, ev: Evaluacion, ruta: RutaProbable | null): Candidata[] {
  if (!ruta) return []
  const activos = porId(org.activos)
  const joya = activos.get(ruta.joya)!
  const candidatas: Candidata[] = []
  const siguiente = activos.get(ruta.camino[1])
  if (siguiente && siguiente.id !== joya.id && ev.estado.get(siguiente.id) === 'normal') {
    candidatas.push({
      clave: `proteger:${siguiente.id}`, titulo: `Proteger preventivamente ${siguiente.nombre}`,
      detalle: `Restringir el acceso entrante y exigir MFA a las cuentas administrativas: es el siguiente salto de la ruta más probable hacia ${joya.nombre}.`,
      fase: 'Protección preventiva', d3fend: 'Harden', efecto: { tipo: 'proteger', activo: siguiente.id }, activo: siguiente.id,
    })
  }
  if (ev.estado.get(joya.id) === 'normal') {
    candidatas.push({
      clave: `proteger:${joya.id}`, titulo: `Blindar ${joya.nombre} (${joya.area})`,
      detalle: 'Limitar el acceso a las cuentas de servicio imprescindibles y alertar ante cualquier acceso masivo.',
      fase: 'Protección preventiva', d3fend: 'Harden', efecto: { tipo: 'proteger', activo: joya.id }, activo: joya.id,
      ajuste: ruta.saltos <= 2 ? 6 : 0,
    })
  }
  return candidatas
}

/** ¿Sigue teniendo sentido la acción en el estado actual? */
function vigente(c: Candidata, ev: Evaluacion, aplicadas: ReadonlySet<string>): boolean {
  if (aplicadas.has(c.clave)) return false
  if (c.efecto.tipo === 'aislar') return ev.estado.get(c.efecto.activo) === 'comprometido'
  if (c.efecto.tipo === 'proteger') return ev.estado.get(c.efecto.activo) === 'normal'
  return true
}

export function recomendar(
  org: Organizacion,
  ev: Evaluacion,
  ruta: RutaProbable | null,
  acciones: readonly AccionAplicada[] = [],
): Recomendacion[] {
  const activos = porId(org.activos)
  const aplicadas = new Set(acciones.map((a) => a.clave))
  const enRuta = new Set(ruta?.camino ?? [])
  const ultimo = ev.ocurridos.at(-1)
  const porClave = new Map<string, Recomendacion>()

  const anadir = (c: Candidata, paso?: PasoAtaque) => {
    if (!vigente(c, ev, aplicadas)) return
    const { ajuste = 0, ...resto } = c
    const criticidad = c.activo ? (activos.get(c.activo)?.criticidad ?? 0) : 0
    const prioridad = Math.max(5, Math.min(99,
      BASE[c.fase] + criticidad * 4 + ajuste + (paso && paso === ultimo ? 8 : 0) + (c.activo && enRuta.has(c.activo) ? 8 : 0),
    ))
    const porque = paso ? [evidencia(paso)] : [`Ruta más probable: ${ruta!.camino.map((id) => activos.get(id)?.nombre ?? id).join(' → ')}`]
    const previa = porClave.get(c.clave)
    if (previa) {
      previa.prioridad = Math.max(previa.prioridad, prioridad)
      for (const linea of porque) if (!previa.porque.includes(linea)) previa.porque.push(linea)
    } else {
      porClave.set(c.clave, { ...resto, prioridad, porque })
    }
  }

  for (const paso of ev.ocurridos) for (const c of reglasDePaso(org, paso)) anadir(c, paso)
  for (const c of reglasDeRuta(org, ev, ruta)) anadir(c)

  return [...porClave.values()].sort((a, b) => b.prioridad - a.prioridad || a.titulo.localeCompare(b.titulo))
}

export function urgencia(prioridad: number): 'Inmediata' | 'Alta' | 'Media' {
  return prioridad >= 80 ? 'Inmediata' : prioridad >= 60 ? 'Alta' : 'Media'
}
