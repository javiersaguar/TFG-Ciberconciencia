/**
 * Las organizaciones que vigila el portal. En la demo son dos; con la API (F8.2, multi-tenancy) saldrán del backend,
 * filtradas por el `tenant_id` del usuario, y cada una traerá sus activos y sus campañas reales en vez de un escenario.
 */
import type { Organizacion } from '../modelo'
import { DMEVALS } from './dmevals'
import { HELIOS } from './helios'

export const ORGANIZACIONES: readonly Organizacion[] = [HELIOS, DMEVALS]

export function organizacion(id: string | null | undefined): Organizacion {
  return ORGANIZACIONES.find((o) => o.id === id) ?? ORGANIZACIONES[0]
}
