/**
 * ¿Puede este navegador pintar WebGL? Sin WebGL (o con la aceleración bloqueada) la vista 3D no se ofrece y la
 * página se queda en 2D. Se comprueba una vez, creando un contexto de prueba que se libera enseguida.
 */
export function hayWebGL(): boolean {
  if (typeof window === 'undefined' || typeof WebGLRenderingContext === 'undefined') return false
  try {
    const lienzo = document.createElement('canvas')
    const contexto = (lienzo.getContext('webgl2') ?? lienzo.getContext('webgl')) as WebGLRenderingContext | null
    contexto?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!contexto
  } catch {
    return false
  }
}
