/**
 * Lógica pura de la línea temporal de APT29 day1: escala de tiempo, marcas del eje, selector de rango (brush),
 * filtros, lectura de la URL y resolución de la selección. Las horas son milisegundos del día (UTC del dataset).
 */
import type { EventoCronologia } from '@/api/cronologia'
import type { AlertaDay1, AristaP2 } from '@/api/exportaciones'
import type { Incidente } from '@/api/incidentes'
import type { NivelRegla } from '@/api/tipos'

export const HOSTS = ['SCRANTON', 'NASHUA', 'NEWYORK', 'UTICA'] as const

export interface Rango {
  desde: number
  hasta: number
}

const SEGUNDO = 1000
const MINUTO = 60 * SEGUNDO
const dos = (n: number) => String(n).padStart(2, '0')

/** `03:09` o `03:09:23` → milisegundos del día; `null` si no tiene ese formato. */
export function msDeTexto(texto: string | null | undefined): number | null {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(texto ?? '')
  if (!m) return null
  const [h, mi, s = '0'] = m.slice(1).map((x) => x ?? '0')
  if (+h > 23 || +mi > 59 || +s > 59) return null
  return ((+h * 60 + +mi) * 60 + +s) * SEGUNDO
}

/** Milisegundos del día → `03:09:23` (o `03:09` si `conSegundos` es falso). */
export function textoDeMs(ms: number, conSegundos = true): string {
  const s = Math.floor(ms / SEGUNDO)
  const base = `${dos(Math.floor(s / 3600))}:${dos(Math.floor(s / 60) % 60)}`
  return conSegundos ? `${base}:${dos(s % 60)}` : base
}

/** Todo day1: de la primera alerta (02:56:14) a la última (03:23:14), con margen hasta el minuto. */
export const DIA: Rango = { desde: msDeTexto('02:56')!, hasta: msDeTexto('03:24')! }

export const PRESETS: readonly { id: string; texto: string; rango: Rango }[] = [
  { id: 'todo', texto: 'Todo day1', rango: DIA },
  { id: 'robo', texto: 'Robo en SCRANTON', rango: { desde: msDeTexto('02:56')!, hasta: msDeTexto('03:06')! } },
  { id: 'salto', texto: 'Salto a NASHUA', rango: { desde: msDeTexto('03:09')!, hasta: msDeTexto('03:18')! } },
  { id: 'final', texto: 'Segundo volcado', rango: { desde: msDeTexto('03:18')!, hasta: msDeTexto('03:24')! } },
]

/** Rango mínimo del brush: por debajo, la resolución de segundo de los eventos reconstruidos no permite más. */
export const RANGO_MINIMO = 10 * SEGUNDO

export function escala(rango: Rango, ancho: number) {
  const span = Math.max(1, rango.hasta - rango.desde)
  return {
    x: (ms: number) => ((ms - rango.desde) / span) * ancho,
    ms: (x: number) => rango.desde + (x / ancho) * span,
  }
}

/** Marcas del eje con un paso que se adapta al rango: 30 s, 1 min, 2 min o 5 min. */
export function marcas(rango: Rango): { ms: number; texto: string }[] {
  const span = rango.hasta - rango.desde
  const paso = span <= 4 * MINUTO ? 30 * SEGUNDO : span <= 12 * MINUTO ? MINUTO : span <= 30 * MINUTO ? 2 * MINUTO : 5 * MINUTO
  const lista: { ms: number; texto: string }[] = []
  for (let ms = Math.ceil(rango.desde / paso) * paso; ms <= rango.hasta; ms += paso) lista.push({ ms, texto: textoDeMs(ms, paso < MINUTO) })
  return lista
}

/** Del arrastre (dos x en píxeles) a un rango: ordenado, dentro de day1 y de al menos `RANGO_MINIMO`. Un clic no es un rango. */
export function rangoDeArrastre(x0: number, x1: number, actual: Rango, ancho: number): Rango | null {
  if (Math.abs(x1 - x0) < 4) return null
  const e = escala(actual, ancho)
  let desde = Math.max(DIA.desde, Math.min(e.ms(x0), e.ms(x1)))
  let hasta = Math.min(DIA.hasta, Math.max(e.ms(x0), e.ms(x1)))
  if (hasta - desde < RANGO_MINIMO) {
    const centro = (desde + hasta) / 2
    desde = Math.max(DIA.desde, centro - RANGO_MINIMO / 2)
    hasta = Math.min(DIA.hasta, desde + RANGO_MINIMO)
  }
  return { desde: Math.round(desde), hasta: Math.round(hasta) }
}

/** `?desde=03:09&hasta=03:18`: solo horas válidas, dentro de day1 y en orden; si no, todo el día. */
export function leerRango(desde: string | null, hasta: string | null): Rango {
  const d = msDeTexto(desde)
  const h = msDeTexto(hasta)
  if (d == null || h == null) return DIA
  const r = { desde: Math.max(DIA.desde, d), hasta: Math.min(DIA.hasta, h) }
  return r.hasta - r.desde >= RANGO_MINIMO ? r : DIA
}

export interface FiltroLinea {
  rango: Rango
  hosts: readonly string[]
  niveles: readonly NivelRegla[]
}

export function filtrarAlertas(alertas: readonly AlertaDay1[], f: FiltroLinea): AlertaDay1[] {
  return alertas.filter((a) => a.ms >= f.rango.desde && a.ms <= f.rango.hasta && f.hosts.includes(a.host) && f.niveles.includes(a.nivel))
}

export type Seleccion = { tipo: 'alerta'; alerta: AlertaDay1 } | { tipo: 'arista'; arista: AristaP2; indice: number }

/**
 * `?sel=`: el `alert_id` de una alerta, `arista-N` (1–17) o un id de los eventos documentados de la ronda anterior
 * (`al-0309-remota`, `red-winrm`…), que se traduce a su alerta o conexión real para no romper los enlaces.
 */
export function resolverSeleccion(sel: string | null, alertas: readonly AlertaDay1[], aristas: readonly AristaP2[], legado: readonly EventoCronologia[]): Seleccion | undefined {
  if (!sel) return undefined
  if (/^[0-9a-f]{40}$/.test(sel)) {
    const alerta = alertas.find((a) => a.id === sel)
    return alerta ? { tipo: 'alerta', alerta } : undefined
  }
  const arista = /^arista-(\d{1,2})$/.exec(sel)
  if (arista) {
    const indice = Number(arista[1]) - 1
    return aristas[indice] ? { tipo: 'arista', arista: aristas[indice], indice } : undefined
  }
  const evento = legado.find((e) => e.id === sel)
  if (!evento) return undefined
  if (evento.tipo === 'red') {
    const indice = aristas.findIndex((a) => a.hora.hora === evento.hora.hora)
    return indice >= 0 ? { tipo: 'arista', arista: aristas[indice], indice } : aristas[0] ? { tipo: 'arista', arista: aristas[0], indice: 0 } : undefined
  }
  const alerta = alertas.find((a) => evento.hosts.includes(a.host) && a.hora.hora === evento.hora.hora && (a.regla === evento.titulo || evento.tipo !== 'alerta'))
    ?? alertas.find((a) => evento.hosts.includes(a.host) && a.hora.hora === evento.hora.hora)
  return alerta ? { tipo: 'alerta', alerta } : undefined
}

/** El id de la selección para la URL. */
export function idSeleccion(s: Seleccion): string {
  return s.tipo === 'alerta' ? s.alerta.id : `arista-${s.indice + 1}`
}

/** Campañas de day1 cuya ventana contiene la alerta, en su host. */
export function campanasDe(alerta: AlertaDay1, campanas: readonly Incidente[]): Incidente[] {
  return campanas.filter((c) => c.hosts.includes(alerta.host) && c.inicio && c.fin && alerta.ms >= msDeHora(c.inicio.hora) - SEGUNDO && alerta.ms <= msDeHora(c.fin.hora))
}

const msDeHora = (hora: string) => {
  const [hms, milis = '0'] = hora.split('.')
  return (msDeTexto(hms) ?? 0) + Number(milis.padEnd(3, '0'))
}

/** «Ver en el grafo»: su nodo si es una de las alertas dibujadas; si no, la campaña que la contiene; si no, su host. */
export function enlaceGrafo(alerta: AlertaDay1, legado: readonly EventoCronologia[], campanas: readonly Incidente[]): string {
  const evento = legado.find((e) => e.enGrafo && e.tipo === 'alerta' && e.hosts.includes(alerta.host) && e.hora.hora === alerta.hora.hora && e.titulo === alerta.regla)
  const destino = evento?.enGrafo ?? campanasDe(alerta, campanas)[0]?.nodoGrafo ?? `host-${alerta.host.toLowerCase()}`
  return `/ataque?sel=${encodeURIComponent(destino)}`
}

export interface EtiquetaEje {
  ms: number
  texto: string
  x: number
  ancla: 'start' | 'middle' | 'end'
}

/**
 * Etiquetas del eje sin solapes: cada una se ancla dentro del gráfico (a la izquierda en el borde izquierdo, a la
 * derecha en el derecho) y se descarta la que pisaría a la anterior. `anchoCaracter` aproxima la monoespaciada a 11 px.
 */
export function etiquetasEje(lista: readonly { ms: number; texto: string }[], x: (ms: number) => number, ancho: number, anchoCaracter = 6.8, hueco = 6): EtiquetaEje[] {
  const visibles: EtiquetaEje[] = []
  let finAnterior = -Infinity
  for (const m of lista) {
    const px = x(m.ms)
    const w = m.texto.length * anchoCaracter
    const ancla = px - w / 2 < 0 ? 'start' : px + w / 2 > ancho ? 'end' : 'middle'
    const inicio = ancla === 'start' ? px : ancla === 'end' ? px - w : px - w / 2
    if (inicio < finAnterior + hueco) continue
    visibles.push({ ...m, x: px, ancla })
    finAnterior = inicio + w
  }
  return visibles
}
