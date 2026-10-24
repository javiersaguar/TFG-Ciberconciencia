/** Ventanas acotadas y reproducibles del flujo ilustrativo. No se acumulan eventos sin límite. */
import type { EscenarioMapa, RutaMapa, UbicacionMapa } from '@/api/mapa'
import type { NivelRegla } from '@/api/tipos'

export const VENTANA_MS = 60_000
export const VUELO_MS = 3600
export const RASTRO_MS = 9000
export const INICIO_MS = 8100
export const MAX_RECIENTES = 8
export const NIVELES: NivelRegla[] = ['critical', 'high', 'medium', 'low', 'informational']
export const TEXTO_NIVEL: Record<NivelRegla, string> = {
  critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo', informational: 'Informativo',
}
export const COLOR_NIVEL: Record<NivelRegla, string> = {
  critical: 'var(--sev-critica)', high: 'var(--sev-alta)', medium: 'var(--sev-media)',
  low: 'var(--sev-baja)', informational: 'var(--sev-info)',
}
export type FiltroNivel = NivelRegla | 'todos'

export interface AlertaMapa extends RutaMapa {
  id: string
  rutaId: string
  instanteMs: number
  desde: UbicacionMapa
  hasta: UbicacionMapa
}

export function alertasEnVentana(escenario: EscenarioMapa, tiempo: number): AlertaMapa[] {
  if (!Number.isFinite(tiempo) || tiempo < 0 || escenario.intervaloMs <= 0 || !escenario.rutas.length) return []
  const ultimo = Math.floor(tiempo / escenario.intervaloMs)
  const primero = Math.max(0, Math.floor((tiempo - VENTANA_MS) / escenario.intervaloMs) + 1)
  const lugares = new Map(escenario.ubicaciones.map((u) => [u.id, u]))
  const resultado: AlertaMapa[] = []
  for (let i = ultimo; i >= primero; i--) {
    // El salto de siete recorre todas las rutas del escenario antes de repetirlas.
    const ruta = escenario.rutas[(i * 7) % escenario.rutas.length]
    const desde = lugares.get(ruta.origen)
    const hasta = lugares.get(ruta.destino)
    if (desde && hasta) resultado.push({ ...ruta, rutaId: ruta.id, id: 'geo-demo-' + i, instanteMs: i * escenario.intervaloMs, desde, hasta })
  }
  return resultado
}

export function filtrarAlertas(alertas: AlertaMapa[], nivel: FiltroNivel, pais: string): AlertaMapa[] {
  return alertas.filter((a) => (nivel === 'todos' || a.nivel === nivel) && (!pais || a.desde.codigoPais === pais || a.hasta.codigoPais === pais))
}

export function resumirAlertas(alertas: AlertaMapa[]) {
  return {
    total: alertas.length,
    prioritarias: alertas.filter((a) => a.nivel === 'critical' || a.nivel === 'high').length,
    origenes: new Set(alertas.map((a) => a.desde.codigoPais)).size,
    destinos: new Set(alertas.map((a) => a.hasta.codigoPais)).size,
  }
}

/** Normaliza parámetros de la vista: la URL nunca elige una organización o coordenadas arbitrarias. */
export function nivelValido(valor: string | null): FiltroNivel {
  return NIVELES.includes(valor as NivelRegla) ? valor as NivelRegla : 'todos'
}
