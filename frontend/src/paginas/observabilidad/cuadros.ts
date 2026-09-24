/**
 * Los cuatro cuadros que aprovisiona Grafana (`infra/grafana/dashboards`). El uid es el de cada JSON. La lista de
 * verdad la da la fuente de datos; esta sirve para las pestañas mientras llega y para el subtítulo de cada una.
 */
export interface CuadroConocido {
  uid: string
  titulo: string
  texto: string
}

export const CUADROS: readonly CuadroConocido[] = [
  { uid: 'tfg-pipeline-health', titulo: 'Salud del pipeline', texto: 'Redpanda, Flink y ClickHouse' },
  { uid: 'tfg-security-overview', titulo: 'Panel de seguridad', texto: 'Alertas, campañas y cronología' },
  { uid: 'tfg-data-quality', titulo: 'Cobertura y calidad', texto: 'OCSF, DLQ y origen del tiempo' },
  { uid: 'tfg-lateral-movement', titulo: 'Movimiento lateral', texto: 'El salto SCRANTON → NASHUA' },
]

/** Grafana del docker compose (puerto publicado 3001). */
export const GRAFANA_LOCAL = 'http://localhost:3001'

/** El cuadro en Grafana, para abrirlo en otra pestaña (alertas, edición, cambiar el periodo). */
export function urlCuadro(uid: string, base = GRAFANA_LOCAL): string {
  return `${base.replace(/\/$/, '')}/d/${uid}`
}

const LOCALES = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * ¿Tiene sentido enlazar a Grafana desde aquí? Solo si el portal se está viendo en este mismo equipo: Grafana se
 * publica en localhost, así que desde otra máquina el enlace apuntaría al equipo de quien mira.
 */
export function grafanaAlcanzable(paginaHost: string = window.location.hostname): boolean {
  return LOCALES.has(paginaHost)
}
