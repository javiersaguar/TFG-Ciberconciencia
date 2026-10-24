/**
 * Colores de la maqueta 3D: los tokens del tema activo (`globales.css`), leídos del documento para pasárselos a
 * three.js, que no entiende variables CSS. Se releen al cambiar de tema. Ningún color está escrito aquí.
 */
import type { EstadoPieza } from './maqueta'

export const TOKENS_3D = [
  'superficie', 'texto-suave', 'linea-red', 'linea-bloqueada', 'borde-discontinuo',
  'sev-critica', 'sev-media', 'acento', 'ok', 'atacante-fondo', 'fam-ambar-linea',
  'maqueta-plataforma', 'maqueta-suelo', 'maqueta-base', 'maqueta-pieza', 'maqueta-metal', 'maqueta-metal-claro',
  'maqueta-mueble', 'maqueta-pantalla', 'maqueta-led', 'maqueta-industrial', 'maqueta-cristal',
] as const

export type Paleta3D = Record<(typeof TOKENS_3D)[number], string>

export function leerPaleta3D(): Paleta3D {
  const estilo = getComputedStyle(document.documentElement)
  return Object.fromEntries(TOKENS_3D.map((t) => [t, estilo.getPropertyValue(`--${t}`).trim() || '#8a94a2'])) as Paleta3D
}

/** Color de los LED, halos y bandas de estado de una pieza. */
export function colorEstado(estado: EstadoPieza, p: Paleta3D): string {
  switch (estado) {
    case 'comprometido':
    case 'atacante':
      return p['sev-critica']
    case 'riesgo':
      return p['sev-media']
    case 'aislado':
      return p.acento
    case 'protegido':
      return p.ok
    default:
      return p['maqueta-led']
  }
}

/** Color de las pantallas: el azul de una pantalla encendida si no pasa nada; si no, el del estado. */
export function colorPantalla(estado: EstadoPieza, p: Paleta3D): string {
  return estado === 'normal' ? p['maqueta-pantalla'] : colorEstado(estado, p)
}
