/**
 * Asistente de respuesta: para cada caso (una campaña real o una organización de la demo) arma la situación, los
 * HECHOS OBSERVADOS, las INFERENCIAS DEL SISTEMA y las RECOMENDACIONES priorizadas. Lógica pura y determinista.
 *
 * Campañas reales: motor de reglas «técnica ATT&CK observada → acción por fase de NIST SP 800-61 y táctica de MITRE
 * D3FEND», con la evidencia medida (alertas de day1, aristas de P2, evidencia por etapa del oráculo). Demo: las mismas
 * funciones puras que `/conciencia` (`evaluar`, `rutaProbable`, `puntuar`, `recomendar`, `redactorPlantillas`).
 *
 * NADA SE EJECUTA: una propuesta no tiene efecto, solo texto para un analista. El LLM (F6) solo redactará; nunca decide.
 */
import type { FactorConfianza } from '@/api/ataque'
import type { AlertaDay1, AristaP2 } from '@/api/exportaciones'
import type { Incidente } from '@/api/incidentes'
import type { Procedencia } from '@/api/observabilidad'
import type { NivelRegla } from '@/api/tipos'
import { formatearHora, milisegundosDelDia } from '@/componentes/datos/hora'
import { puntuar } from '@/paginas/conciencia/asistente/puntuacion'
import { redactorPlantillas } from '@/paginas/conciencia/asistente/redactor'
import { recomendar, type FaseRespuesta, type TacticaD3fend } from '@/paginas/conciencia/asistente/reglas'
import type { Organizacion } from '@/paginas/conciencia/modelo'
import { rutaProbable } from '@/paginas/conciencia/razonamiento'
import { duracionEscenario, evaluar } from '@/paginas/conciencia/simulacion'

const DAY1 = 'SDWIN-200501225525'

export interface Propuesta {
  clave: string
  titulo: string
  detalle: string
  /** Evidencias que la justifican, una por línea. */
  porque: string[]
  fase: FaseRespuesta
  d3fend: TacticaD3fend
  /** 0–100: solo ordena la lista; no es la prioridad del Pilar C. */
  prioridad: number
  impactoNegocio?: string
}

export interface Hecho {
  hora?: string
  texto: string
  detalle?: string
}

export interface CasoRespuesta {
  id: string
  tipo: 'campana' | 'demo'
  titulo: string
  subtitulo: string
  situacion: string[]
  hechos: Hecho[]
  procedenciaHechos: { procedencia: Procedencia; fuente: string }
  inferencias: string[]
  confianza?: { total: number; factores: FactorConfianza[] }
  propuestas: Propuesta[]
  enlaces: { texto: string; a: string }[]
}

const coma = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const conTecnica = (alertas: readonly AlertaDay1[], prefijo: string) =>
  alertas.filter((a) => a.tecnicas.some((t) => t === prefijo || t.startsWith(`${prefijo}.`)))
const ventana = (inc: Incidente) => `${inc.inicio ? formatearHora(inc.inicio) : '—'} → ${inc.fin ? formatearHora(inc.fin) : '—'}`
const deA = (inc: Incidente) => `de ${inc.inicio ? formatearHora(inc.inicio) : '—'} a ${inc.fin ? formatearHora(inc.fin) : '—'}`
/** «Bloquear WinRM…» → «bloquear WinRM…»: solo la inicial, para no tocar nombres de host ni siglas. */
const inicialMinuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** Alertas de day1 del host de la campaña (el destino en P2) dentro de su ventana; vacío fuera de apt29 day1. */
export function alertasDeCampana(inc: Incidente, alertas: readonly AlertaDay1[]): AlertaDay1[] {
  if (inc.dataset !== DAY1 || !inc.inicio || !inc.fin) return []
  const host = inc.patron === 'P2' ? inc.hosts[1] : inc.hosts[0]
  const desde = milisegundosDelDia(inc.inicio)
  const hasta = milisegundosDelDia(inc.fin)
  return alertas.filter((a) => a.host === host && a.ms >= desde && a.ms <= hasta)
}

function propuestasDeCampana(inc: Incidente, alertas: readonly AlertaDay1[], aristas: readonly AristaP2[]): Propuesta[] {
  const lista: Propuesta[] = []
  const host = inc.patron === 'P2' ? inc.hosts[1] : inc.hosts[0]
  const credenciales = conTecnica(alertas, 'T1003')
  const etapas = inc.etapas

  const pruebaCredenciales = credenciales.length
    ? `${credenciales.length} alertas de acceso a credenciales (T1003.*) en ${host}, la primera a las ${formatearHora(credenciales[0].hora)}`
    : etapas && etapas.lsass + etapas.fichero + etapas.herramienta > 0
      ? `Evidencia del detector P1 en ${host}: ${etapas.lsass} accesos a LSASS, ${etapas.fichero} volcados a disco, ${etapas.herramienta} ejecuciones de la herramienta`
      : null

  if (inc.patron === 'P2' && aristas.length) {
    const [origen, destino] = inc.hosts
    const winrm = aristas.filter((a) => a.puerto === 5985)
    const smb = aristas.filter((a) => a.puerto === 445 || a.puerto === 135)
    if (winrm.length) {
      lista.push({
        clave: 'bloquear-winrm', titulo: `Bloquear WinRM (5985) de ${origen} a ${destino}`,
        detalle: 'Regla de cortafuegos en el destino y en la red entre los dos equipos.',
        porque: [`${winrm.length} conexiones 5985 de ${[...new Set(winrm.map((a) => a.proceso))].join(', ')} entre ${formatearHora(winrm[0].hora)} y ${formatearHora(winrm.at(-1)!.hora)}`],
        fase: 'Contención', d3fend: 'Isolate', prioridad: 92, impactoNegocio: 'Se pierde la administración remota por WinRM entre esos equipos.',
      })
    }
    if (smb.length) {
      const n445 = smb.filter((a) => a.puerto === 445).length
      const n135 = smb.length - n445
      lista.push({
        clave: 'bloquear-smb-rpc', titulo: `Bloquear SMB (445) y RPC (135) de ${origen} a ${destino}`,
        detalle: 'Y retirar del destino el servicio que instala PsExec.',
        porque: [`${n445} conexiones 445 y ${n135} conexiones 135 entre ${formatearHora(smb[0].hora)} y ${formatearHora(smb.at(-1)!.hora)}`],
        fase: 'Contención', d3fend: 'Isolate', prioridad: 90, impactoNegocio: 'Se cortan las carpetas compartidas y la administración por RPC entre esos equipos.',
      })
    }
    const humanas = [...new Set(aristas.map((a) => a.usuario))].filter((u) => u && !/SYSTEM$/i.test(u))
    for (const usuario of humanas) {
      const suyas = aristas.filter((a) => a.usuario === usuario)
      lista.push({
        clave: `cuenta-${usuario}`, titulo: `Deshabilitar y restablecer la cuenta ${usuario}`,
        detalle: 'Cambio de contraseña y cierre de sus sesiones abiertas.',
        porque: [`Abre ${suyas.length} de las ${aristas.length} conexiones del salto (${[...new Set(suyas.map((a) => a.proceso))].join(', ')})`],
        fase: 'Erradicación', d3fend: 'Evict', prioridad: 82, impactoNegocio: 'La persona pierde el acceso hasta que se restablezca la cuenta.',
      })
    }
  }

  if (pruebaCredenciales) {
    lista.push({
      clave: `aislar-${host}`, titulo: `Aislar ${host} de la red`,
      detalle: 'Cortar todo su tráfico salvo el de la investigación forense hasta erradicar.',
      porque: [pruebaCredenciales], fase: 'Contención', d3fend: 'Isolate', prioridad: inc.patron === 'P2' ? 80 : 86,
      impactoNegocio: `${host} deja de prestar servicio mientras dure la investigación.`,
    })
    const cuentas = [...new Set(credenciales.map((a) => a.usuario).filter((u) => u))].slice(0, 4)
    lista.push({
      clave: `credenciales-${host}`, titulo: `Restablecer las credenciales con sesión en ${host}`,
      detalle: 'Contraseñas de las cuentas que han iniciado sesión en el equipo y, si alguna es de dominio, sus tickets Kerberos.',
      porque: [pruebaCredenciales, ...(cuentas.length ? [`Cuentas en esas alertas: ${cuentas.join(', ')}`] : [])],
      fase: 'Erradicación', d3fend: 'Evict', prioridad: 76, impactoNegocio: 'Las cuentas afectadas tendrán que volver a iniciar sesión.',
    })
  }

  const winrmEntrante = conTecnica(alertas, 'T1021.006')
  if (inc.patron === 'P1' && winrmEntrante.length) {
    lista.push({
      clave: `winrm-entrante-${host}`, titulo: `Limitar el acceso WinRM entrante a ${host}`,
      detalle: 'Solo desde los equipos de administración.',
      porque: [`${winrmEntrante.length} alertas de ejecución remota por WinRM (T1021.006) en ${host}`], fase: 'Contención', d3fend: 'Isolate', prioridad: 72,
    })
  }

  const limpieza = conTecnica(alertas, 'T1070')
  if (limpieza.length || (etapas && etapas.limpieza > 0)) {
    lista.push({
      clave: `registros-${host}`, titulo: `Preservar los registros de ${host} antes de que se borren`,
      detalle: 'Copiar y reenviar sus registros de eventos a un almacén que el atacante no controle.',
      porque: [limpieza.length ? `${limpieza.length} alertas de limpieza de rastro (T1070.*) en ${host}` : `${etapas!.limpieza} alertas de limpieza de rastro según el detector P1`],
      fase: 'Protección preventiva', d3fend: 'Detect', prioridad: 66,
    })
  }

  const herramientas = conTecnica(alertas, 'T1685')
  if (herramientas.length) {
    lista.push({
      clave: `herramientas-${host}`, titulo: `Restaurar las herramientas de seguridad de ${host}`,
      detalle: 'Comprobar que el antivirus y el registro de eventos siguen activos y sin exclusiones nuevas.',
      porque: [`${herramientas.length} alertas de T1685 (Disable or Modify Tools) en ${host}`], fase: 'Protección preventiva', d3fend: 'Harden', prioridad: 58,
    })
  }

  const powershell = conTecnica(alertas, 'T1059.001')
  if (powershell.length) {
    lista.push({
      clave: `powershell-${host}`, titulo: `Limitar PowerShell en ${host}`,
      detalle: 'Modo de lenguaje restringido y registro de bloques de script.',
      porque: [`${powershell.length} alertas de PowerShell (T1059.001) en ${host}`], fase: 'Protección preventiva', d3fend: 'Harden', prioridad: 52,
    })
  }

  lista.push({
    clave: 'comunicar', titulo: `Abrir el incidente y avisar al responsable de ${inc.hosts.join(' y ') || inc.dataset}`,
    detalle: 'Con esta evidencia y el plan acordado.',
    porque: [`Campaña ${inc.patron} con confianza ${inc.confianza == null ? 'no documentada' : coma(inc.confianza)}`], fase: 'Comunicación', d3fend: 'Detect', prioridad: 40,
  })

  return lista.sort((a, b) => b.prioridad - a.prioridad || a.titulo.localeCompare(b.titulo))
}

const NIVELES: NivelRegla[] = ['critical', 'high', 'medium', 'low', 'informational']
const TEXTO_NIVEL: Record<NivelRegla, string> = { critical: 'críticas', high: 'altas', medium: 'medias', low: 'bajas', informational: 'informativas' }

function hechosDeCampana(inc: Incidente, alertas: readonly AlertaDay1[], aristas: readonly AristaP2[]): Hecho[] {
  const hechos: Hecho[] = []
  if (alertas.length) {
    const porNivel = NIVELES.map((n) => [n, alertas.filter((a) => a.nivel === n).length] as const).filter(([, c]) => c > 0)
    hechos.push({ texto: `${alertas.length} alertas Sigma en ${alertas[0].host} dentro de la ventana de la campaña`, detalle: porNivel.map(([n, c]) => `${c} ${TEXTO_NIVEL[n]}`).join(' · ') })
    const reglas = new Map<string, number>()
    for (const a of alertas) reglas.set(a.regla, (reglas.get(a.regla) ?? 0) + 1)
    for (const [regla, n] of [...reglas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) hechos.push({ texto: regla, detalle: `${n} alertas` })
  }
  for (const a of inc.evidencia) hechos.push({ hora: formatearHora(a.hora), texto: a.regla, detalle: a.tecnicas.join(', ') })
  if (inc.patron === 'P2') {
    for (const puerto of [5985, 445, 135]) {
      const suyas = aristas.filter((a) => a.puerto === puerto)
      if (suyas.length) hechos.push({ hora: formatearHora(suyas[0].hora), texto: `${suyas.length} conexiones al puerto ${puerto} de ${suyas[0].ipOrigen} a ${suyas[0].ipDestino}`, detalle: `${[...new Set(suyas.map((a) => a.proceso))].join(', ')} · ${[...new Set(suyas.map((a) => a.usuario))].join(', ')}` })
    }
  }
  if (!alertas.length && inc.etapas) {
    hechos.push({ texto: `${inc.alertas} alertas absorbidas por la campaña`, detalle: `${inc.etapas.lsass} accesos a LSASS · ${inc.etapas.fichero} volcados a disco · ${inc.etapas.herramienta} ejecuciones de la herramienta · ${inc.etapas.limpieza} limpiezas` })
    hechos.push({ texto: 'Este dataset no tiene sus alertas exportadas una a una: se usa la evidencia por etapa del detector P1.' })
  }
  return hechos
}

export function casoDeIncidente(inc: Incidente, todas: readonly AlertaDay1[], aristas: readonly AristaP2[]): CasoRespuesta {
  const alertas = alertasDeCampana(inc, todas)
  const saltos = inc.patron === 'P2' ? aristas : []
  const titulo = inc.patron === 'P2' ? `Movimiento lateral ${inc.hosts.join(' → ')}` : `Robo de credenciales en ${inc.hosts[0] ?? inc.dataset}`
  const fecha = inc.dataset === DAY1 ? '' : ` del ${inc.fecha}`
  const situacion = [
    inc.patron === 'P2'
      ? `${inc.hosts[0]} salta a ${inc.hosts[1]} con ${saltos.length} conexiones de WinRM, SMB y RPC ${deA(inc)}. Lo confirma la ejecución remota en el destino.`
      : `Campaña de robo de credenciales en ${inc.hosts[0] ?? '—'}${fecha}, ${deA(inc)}: ${inc.alertas} alertas agrupadas en un solo incidente.`,
    `Confianza ${inc.confianza == null ? 'no documentada' : coma(inc.confianza)}. Lo más urgente: ${inicialMinuscula(propuestasDeCampana(inc, alertas, saltos)[0]?.titulo ?? 'Revisar la evidencia')}.`,
  ]
  return {
    id: inc.id,
    tipo: 'campana',
    titulo,
    subtitulo: `${inc.descripcionDataset} · ${inc.patron} · ${ventana(inc)}`,
    situacion,
    hechos: hechosDeCampana(inc, alertas, saltos),
    procedenciaHechos: { procedencia: 'documentada', fuente: inc.dataset === DAY1 ? 'eval/portal/alertas-apt29-day1.jsonl y aristas-p2.jsonl (21-10-2026)' : 'eval/portal/p1-campanas.jsonl (21-10-2026)' },
    inferencias: [
      inc.patron === 'P2' ? `Patrón P2 (movimiento lateral): ${inc.hosts.join(' → ')}` : 'Patrón P1 (robo de credenciales): ancla en T1003.* y refuerzos en los 10 minutos de alrededor',
      ...(inc.tecnicas.length ? [`Técnicas: ${inc.tecnicas.join(', ')}`] : []),
      ...inc.notas,
    ],
    confianza: inc.confianza == null ? undefined : { total: inc.confianza, factores: inc.factores },
    propuestas: propuestasDeCampana(inc, alertas, saltos),
    enlaces: [
      { texto: 'Incidente', a: `/incidentes?id=${encodeURIComponent(inc.id)}` },
      ...(inc.nodoGrafo ? [{ texto: 'Grafo de ataque', a: `/ataque?sel=${encodeURIComponent(inc.nodoGrafo)}` }] : []),
      ...(inc.eventoCronologia ? [{ texto: 'Línea temporal', a: `/cronologia?sel=${encodeURIComponent(inc.eventoCronologia)}` }] : []),
    ],
  }
}

/** La demo en el instante `t` (por defecto, el final del escenario, sin ninguna respuesta aplicada). */
export function casoDeDemo(org: Organizacion, t?: number): CasoRespuesta {
  const tiempo = Math.min(Math.max(0, t ?? duracionEscenario(org)), duracionEscenario(org))
  const ev = evaluar(org, tiempo, [])
  const ruta = rutaProbable(org, ev)
  const puntuacion = puntuar(org, ev, ruta)
  const recomendaciones = recomendar(org, ev, ruta, [])
  const nombre = (id: string) => org.activos.find((a) => a.id === id)?.nombre ?? id
  const ilustrativo = ev.ocurridos.some((p) => p.procedencia === 'ilustrativa')
  return {
    id: org.id,
    tipo: 'demo',
    titulo: org.nombre,
    subtitulo: `${org.sector} · demo, instante ${Math.round(tiempo)} s`,
    situacion: redactorPlantillas.redactar({ org, ev, ruta, puntuacion, recomendaciones }),
    hechos: ev.ocurridos.map((p) => ({ hora: p.hora, texto: p.titulo, detalle: `${p.tecnica}${p.patron ? ` · reconocido por ${p.patron}` : ''}` })),
    procedenciaHechos: ilustrativo
      ? { procedencia: 'ilustrativa', fuente: org.procedenciaEscenario }
      : { procedencia: 'documentada', fuente: org.procedenciaEscenario },
    inferencias: [
      `Patrones reconocidos: ${[...new Set(ev.ocurridos.map((p) => p.patron).filter(Boolean))].join(', ') || 'ninguno todavía'}`,
      ruta ? `Ruta probable: ${ruta.camino.map(nombre).join(' → ')}` : 'Sin camino hacia ninguna joya de la corona',
      `Gravedad ${puntuacion.total}/100 (${puntuacion.nivel})`,
    ],
    propuestas: recomendaciones.map(({ clave, titulo, detalle, porque, fase, d3fend, prioridad, impactoNegocio }) => ({ clave, titulo, detalle, porque, fase, d3fend, prioridad, impactoNegocio })),
    enlaces: [{ texto: 'Ver el efecto en la simulación', a: `/conciencia?org=${org.id}&t=${Math.round(tiempo)}` }],
  }
}

/** El plan como texto plano, para copiarlo (nunca HTML). */
export function planComoTexto(caso: CasoRespuesta): string {
  return [
    `Plan de respuesta · ${caso.titulo}`,
    caso.subtitulo,
    '',
    ...caso.situacion,
    '',
    'Acciones propuestas (el asistente propone; no ejecuta nada):',
    ...caso.propuestas.flatMap((p, i) => [
      `${i + 1}. ${p.titulo} [${p.fase} · D3FEND ${p.d3fend}]`,
      `   ${p.detalle}`,
      ...p.porque.map((l) => `   Por qué: ${l}`),
      ...(p.impactoNegocio ? [`   Coste: ${p.impactoNegocio}`] : []),
    ]),
  ].join('\n')
}
