/**
 * Detectores de SEÑALES DÉBILES: patrones que la capa determinista (Sigma + CEP) aún no clasifica como amenaza y que
 * conviene vigilar. Funciones puras, con umbrales declarados (`UMBRALES`) y explicables.
 *
 * Una señal débil nunca es una alerta (coherente con ML-1: la anomalía no genera alerta). Es «conviene vigilar X
 * porque Y», con su evidencia citada, un NIVEL DE ATENCIÓN (no de severidad: no cambia la de nada) y una forma de
 * descartarla. Un patrón que no salga de los datos no se enseña: si ningún detector lo encuentra, no hay aviso.
 *
 * Los ids de las citas son los mismos que los de la evidencia del Copiloto (`nucleo.ts`), así que una señal pasa la
 * misma verificación de citas que cualquier respuesta.
 */
import type { AlertaDay1, AristaP2 } from '@/api/exportaciones'
import type { Incidente } from '@/api/incidentes'
import { formatearHora } from '@/componentes/datos/hora'
import type { Organizacion } from '@/paginas/conciencia/modelo'
import type { Evaluacion } from '@/paginas/conciencia/simulacion'

import { FUENTE_ALERTAS, FUENTE_ARISTAS, FUENTE_CAMPANAS, type Cita, type SenalContexto } from './nucleo'

export type Atencion = 'alta' | 'media'

export interface Senal extends SenalContexto {
  organizacion: string
  detector: 'impacto-previo' | 'sin-tecnica' | 'p1-a-medias' | 'pasos-sin-patron'
  atencion: Atencion
  /** El umbral que la ha disparado, en palabras. */
  umbral: string
  /** Cuándo es razonable descartarla. */
  descartar: string
  procedencia: 'documentada' | 'ilustrativa'
}

/** Umbrales declarados: se documentan en el README y se enseñan en cada aviso. */
export const UMBRALES = {
  impactoPrevio: { minimoAlertas: 2, antelacionMinutos: 5 },
  sinTecnica: { ventanaMinutos: 5, minimo: 20 },
  p1AMedias: { etapasMaximas: 1 },
  pasosSinPatron: { minimoPasos: 2 },
} as const

const MINUTO = 60_000
const DATASET_DAY1 = 'SDWIN-200501225525'
const dos = (n: number) => String(n).padStart(2, '0')
const hhmm = (ms: number) => `${dos(Math.floor(ms / 3_600_000))}:${dos(Math.floor(ms / MINUTO) % 60)}`
const duracion = (ms: number) => `${Math.floor(ms / MINUTO)} min ${Math.round((ms % MINUTO) / 1000)} s`

const citaAlerta = (a: AlertaDay1): Cita => ({ id: `alerta:${a.id}`, etiqueta: `${formatearHora(a.hora)} · ${a.host} · ${a.regla}`, fuente: FUENTE_ALERTAS, enlace: `/cronologia?sel=${a.id}` })
const citaArista = (r: AristaP2, i: number): Cita => ({ id: `arista:${i + 1}`, etiqueta: `${formatearHora(r.hora)} · ${r.host} · ${r.proceso} → ${r.ipDestino}:${r.puerto}`, fuente: FUENTE_ARISTAS, enlace: `/cronologia?sel=arista-${i + 1}` })

/**
 * Alertas de la táctica `impact` en un host ANTES de que un salto lateral (P2) llegue a él. Caso real: NASHUA, con dos
 * alertas a las 02:59:37, casi diez minutos antes de la primera conexión desde SCRANTON. Ningún patrón cubre `impact`.
 */
export function detectarImpactoPrevio(alertas: readonly AlertaDay1[], aristas: readonly AristaP2[], incidentes: readonly Incidente[], organizacion = 'dmevals', u = UMBRALES.impactoPrevio): Senal[] {
  if (aristas.length === 0) return []
  const primera = aristas.reduce((min, r, i) => (r.ms < aristas[min].ms ? i : min), 0)
  const salto = aristas[primera]
  return incidentes
    .filter((i) => i.patron === 'P2' && i.hosts.length === 2)
    .flatMap((i): Senal[] => {
      const destino = i.hosts[1]
      const impactos = alertas.filter((a) => a.host === destino && a.tacticas.includes('impact')).sort((a, b) => a.ms - b.ms)
      const previos = impactos.filter((a) => a.ms <= salto.ms - u.antelacionMinutos * MINUTO)
      if (previos.length < u.minimoAlertas) return []
      return [{
        id: `impacto-previo:${destino}`,
        organizacion,
        detector: 'impacto-previo',
        atencion: 'alta',
        host: destino,
        titulo: `Conviene vigilar ${destino}`,
        porque: `${previos.length} alertas de impact («${previos[0].regla}») desde las ${formatearHora(previos[0].hora)}, ${duracion(salto.ms - previos[0].ms)} antes de la primera conexión lateral hacia ${destino} (${formatearHora(salto.hora)}). Ningún patrón (P1, P2) cubre la táctica impact; en todo el día son ${impactos.length}.`,
        citas: [...previos.map(citaAlerta), citaArista(salto, primera)],
        vigilar: { texto: `${destino} en la línea temporal`, a: `/cronologia?host=${destino}&desde=${hhmm(previos[0].ms - MINUTO)}&hasta=${hhmm(salto.ms + MINUTO)}` },
        umbral: `≥ ${u.minimoAlertas} alertas de impact en un host, al menos ${u.antelacionMinutos} min antes del primer salto lateral hacia él`,
        descartar: 'Descártala si ese cambio en el almacén de certificados lo hizo el equipo de sistemas.',
        procedencia: 'documentada',
      }]
    })
}

/**
 * Concentración de alertas SIN técnica ATT&CK en un host y una ventana: P1 y P2 solo correlacionan alertas con técnica,
 * así que estas les son invisibles. Caso real: SCRANTON, con cientos entre las 03:00 y las 03:10.
 */
export function detectarSinTecnica(alertas: readonly AlertaDay1[], organizacion = 'dmevals', u = UMBRALES.sinTecnica): Senal[] {
  const ventana = u.ventanaMinutos * MINUTO
  const porHost = new Map<string, AlertaDay1[]>()
  for (const a of alertas) if (a.tecnicas.length === 0) porHost.set(a.host, [...(porHost.get(a.host) ?? []), a])
  return [...porHost.entries()].flatMap(([host, lista]): Senal[] => {
    const orden = [...lista].sort((a, b) => a.ms - b.ms)
    // ventana deslizante: la de más alertas sin técnica
    let mejor = { ini: 0, fin: -1 }
    for (let ini = 0, fin = 0; ini < orden.length; ini++) {
      while (fin + 1 < orden.length && orden[fin + 1].ms - orden[ini].ms < ventana) fin++
      if (fin - ini > mejor.fin - mejor.ini) mejor = { ini, fin }
    }
    const tramo = orden.slice(mejor.ini, mejor.fin + 1)
    if (tramo.length < u.minimo) return []
    const reglas = new Map<string, number>()
    for (const a of tramo) reglas.set(a.regla, (reglas.get(a.regla) ?? 0) + 1)
    const [regla, veces] = [...reglas.entries()].sort((a, b) => b[1] - a[1])[0]
    const desde = formatearHora(tramo[0].hora)
    const hasta = formatearHora(tramo.at(-1)!.hora)
    return [{
      id: `sin-tecnica:${host}`,
      organizacion,
      detector: 'sin-tecnica',
      atencion: 'media',
      host,
      titulo: `Conviene vigilar ${host}`,
      porque: `${tramo.length} alertas sin técnica ATT&CK entre las ${desde} y las ${hasta} (la más repetida, «${regla}», ${veces} veces). P1 y P2 solo correlacionan alertas con técnica: estas les son invisibles.`,
      citas: [{ id: `filtro:host = ${host}, sin técnica, ${desde}–${hasta}`, etiqueta: `${FUENTE_ALERTAS} filtrado por host = ${host} y sin técnica`, fuente: FUENTE_ALERTAS }, citaAlerta(tramo[0]), citaAlerta(tramo.at(-1)!)],
      vigilar: { texto: `${host} en la línea temporal`, a: `/cronologia?host=${host}&desde=${hhmm(tramo[0].ms)}&hasta=${hhmm(tramo.at(-1)!.ms + MINUTO)}` },
      umbral: `≥ ${u.minimo} alertas sin técnica en un host en ${u.ventanaMinutos} min`,
      descartar: 'Descártala si esas reglas son ruido conocido de ese equipo (scripts de administración, por ejemplo).',
      procedencia: 'documentada',
    }]
  })
}

const ETAPAS = [['lsass', 'accesos a LSASS'], ['fichero', 'volcados a disco'], ['herramienta', 'ejecuciones de herramienta'], ['limpieza', 'limpiezas de rastro']] as const

/**
 * Campaña P1 a medio formar: con una sola etapa de refuerzo además del ancla. Caso real: SCRANTON desde las 03:10:22,
 * con solo accesos a LSASS (confianza 0,65). Si llega la siguiente etapa, la campaña se completará.
 */
export function detectarP1AMedias(incidentes: readonly Incidente[], organizacion = 'dmevals', u = UMBRALES.p1AMedias): Senal[] {
  return incidentes
    .filter((i) => i.patron === 'P1' && i.dataset === DATASET_DAY1 && i.etapas)
    .flatMap((i): Senal[] => {
      const presentes = ETAPAS.filter(([k]) => (i.etapas![k] ?? 0) > 0)
      if (presentes.length > u.etapasMaximas) return []
      const host = i.hosts[0]
      const ventana = `${i.inicio ? formatearHora(i.inicio) : '—'} → ${i.fin ? formatearHora(i.fin) : '—'}`
      const confianza = i.confianza?.toLocaleString('es-ES', { minimumFractionDigits: 2 }) ?? 'no documentada'
      const hay = presentes.map(([k, texto]) => `${i.etapas![k]} ${texto}`).join(', ') || 'ninguna'
      return [{
        id: `p1-a-medias:${i.id}`,
        organizacion,
        detector: 'p1-a-medias',
        atencion: 'media',
        host,
        titulo: `Conviene vigilar ${host}`,
        porque: `La campaña P1 de ${host} (${ventana}) solo tiene ${presentes.length === 1 ? 'una etapa' : 'ninguna etapa'} de refuerzo (${hay}) y confianza ${confianza}: si aparece la siguiente (volcado, herramienta o limpieza), se completará.`,
        citas: [{ id: `campana:${i.id}`, etiqueta: `${i.patron} · ${i.hosts.join(' → ')} · confianza ${confianza}`, fuente: FUENTE_CAMPANAS, enlace: `/incidentes?id=${encodeURIComponent(i.id)}` }],
        vigilar: { texto: 'La campaña en incidentes', a: `/incidentes?id=${encodeURIComponent(i.id)}` },
        umbral: `campaña P1 con ≤ ${u.etapasMaximas} etapa de refuerzo además del ancla`,
        descartar: 'Descártala si ese acceso a LSASS es de una herramienta legítima (antivirus, copia de seguridad).',
        procedencia: 'documentada',
      }]
    })
}

/**
 * Demo: un activo con varios pasos del ataque que NINGÚN patrón de correlación ha confirmado todavía. Es la «señal
 * antes de la detección» de la simulación, en tiempo real; desaparece cuando un patrón confirma ese activo.
 */
export function detectarPasosSinPatron(org: Organizacion, ev: Evaluacion, u = UMBRALES.pasosSinPatron): Senal[] {
  const nombre = (id: string) => org.activos.find((a) => a.id === id)?.nombre ?? id
  const porActivo = new Map<string, typeof ev.ocurridos>()
  for (const p of ev.ocurridos) {
    const activo = p.hasta === 'atacante' ? p.desde : p.hasta
    if (activo === 'atacante') continue
    porActivo.set(activo, [...(porActivo.get(activo) ?? []), p])
  }
  return [...porActivo.entries()].flatMap(([activo, pasos]): Senal[] => {
    if (pasos.some((p) => p.patron) || pasos.length < u.minimoPasos) return []
    const tacticas = [...new Set(pasos.map((p) => p.tactica))].join(', ')
    return [{
      id: `pasos-sin-patron:${org.id}:${activo}`,
      organizacion: org.id,
      detector: 'pasos-sin-patron',
      atencion: pasos.length >= 3 ? 'alta' : 'media',
      host: nombre(activo),
      titulo: `Conviene vigilar ${nombre(activo)}`,
      porque: `${pasos.length} pasos del escenario (${tacticas}) en ${nombre(activo)} desde las ${pasos[0].hora}, y ningún patrón de correlación los ha confirmado todavía.`,
      citas: pasos.map((p) => ({ id: `paso:${p.id}`, etiqueta: `${p.hora} · ${nombre(activo)} · ${p.titulo}`, fuente: org.procedenciaEscenario, enlace: `/conciencia?org=${org.id}&t=${p.t}` })),
      vigilar: { texto: `${nombre(activo)} en la demo`, a: `/conciencia?org=${org.id}` },
      umbral: `≥ ${u.minimoPasos} pasos en un activo sin ningún patrón que los confirme`,
      descartar: 'Descártala si esa actividad es la esperada en ese equipo.',
      procedencia: 'ilustrativa',
    }]
  })
}

/** Todas las señales de DMEVALS (APT29 day1), sobre los datos medidos. */
export function senalesDmevals(datos: { alertas: readonly AlertaDay1[]; aristas: readonly AristaP2[]; incidentes: readonly Incidente[] }): Senal[] {
  return [...detectarImpactoPrevio(datos.alertas, datos.aristas, datos.incidentes), ...detectarSinTecnica(datos.alertas), ...detectarP1AMedias(datos.incidentes)]
}
