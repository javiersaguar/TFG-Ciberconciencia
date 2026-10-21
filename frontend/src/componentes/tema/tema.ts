/**
 * Tema del portal: CLARO (el gris de baja luminancia, por defecto) u OSCURO.
 *
 * La única fuente de verdad es la clase `dark` de <html>: la pone el script en línea de `index.html` antes del primer
 * pintado (para que no parpadee) y la cambia `fijarTema`. Los componentes no cambian de clases: todos los colores
 * salen de los tokens de `estilos/globales.css`, que se redefinen bajo `.dark`.
 *
 * La elección se recuerda en `localStorage` con la misma clave y los mismos valores que usa el script de
 * `index.html` (lo comprueba `tema.test.ts`). Todo acceso al almacenamiento va en try/catch: un navegador que lo
 * bloquee (modo privado estricto, cookies desactivadas) deja el portal en claro, nunca roto.
 */
export type Tema = 'claro' | 'oscuro'

export const CLAVE_TEMA = 'tfg-tema'

/** `theme-color` de cada tema: el color de fondo de la aplicación, para que la barra del navegador no desentone. */
export const COLOR_NAVEGADOR: Record<Tema, string> = { claro: '#dde2e8', oscuro: '#0e131a' }

type Lectura = Pick<Storage, 'getItem'>
type Escritura = Pick<Storage, 'setItem'>

export function esTema(valor: unknown): valor is Tema {
  return valor === 'claro' || valor === 'oscuro'
}

function almacenPorDefecto(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    // acceder a `localStorage` ya puede lanzar (SecurityError) si el navegador lo bloquea
    return undefined
  }
}

/** El tema guardado; sin elección guardada, o si el almacenamiento falla o trae basura, el claro. */
export function leerTemaGuardado(almacen: Lectura | undefined = almacenPorDefecto()): Tema {
  try {
    const valor = almacen?.getItem(CLAVE_TEMA)
    return esTema(valor) ? valor : 'claro'
  } catch {
    return 'claro'
  }
}

export function guardarTema(tema: Tema, almacen: Escritura | undefined = almacenPorDefecto()): void {
  try {
    almacen?.setItem(CLAVE_TEMA, tema)
  } catch {
    // el tema sigue cambiando aunque el navegador no deje recordarlo
  }
}

export function alternarTema(tema: Tema): Tema {
  return tema === 'oscuro' ? 'claro' : 'oscuro'
}

/** Aplica el tema al documento: clase `dark`, `color-scheme` y las metas `theme-color` y `color-scheme`. */
export function aplicarTema(tema: Tema, documento: Document = document): void {
  const raiz = documento.documentElement
  const oscuro = tema === 'oscuro'
  raiz.classList.toggle('dark', oscuro)
  raiz.style.colorScheme = oscuro ? 'dark' : 'light'
  documento.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_NAVEGADOR[tema])
  documento.querySelector('meta[name="color-scheme"]')?.setAttribute('content', oscuro ? 'dark' : 'light')
}

/** El tema que se ve ahora mismo (lo dice el documento, no una variable aparte que pudiera desincronizarse). */
export function temaActual(documento: Document = document): Tema {
  return documento.documentElement.classList.contains('dark') ? 'oscuro' : 'claro'
}

const oyentes = new Set<() => void>()

/** Cambia el tema, lo recuerda y avisa a quien lo esté mostrando (botón, grafo de React Flow…). */
export function fijarTema(tema: Tema): void {
  aplicarTema(tema)
  guardarTema(tema)
  for (const oyente of oyentes) oyente()
}

export function suscribirTema(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}
