/**
 * Colores de los globos 3D: los tokens del tema (`globales.css`), leídos del documento para pasárselos a three.js, que
 * no entiende variables CSS. Se releen al cambiar de tema. Ningún color está escrito aquí.
 */
export const TOKENS_GLOBO = [
  'globo-oceano', 'globo-tierra', 'globo-costa', 'globo-frontera', 'globo-reticula', 'maqueta-base', 'superficie',
  'sev-critica', 'sev-alta', 'sev-media', 'sev-baja', 'sev-info', 'linea-bloqueada', 'acento', 'texto-suave',
] as const

export type PaletaGlobo = Record<(typeof TOKENS_GLOBO)[number], string>

export function leerPaletaGlobo(): PaletaGlobo {
  const estilo = getComputedStyle(document.documentElement)
  return Object.fromEntries(TOKENS_GLOBO.map((t) => [t, estilo.getPropertyValue(`--${t}`).trim() || '#8a94a2'])) as PaletaGlobo
}
