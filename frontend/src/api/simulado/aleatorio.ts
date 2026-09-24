/**
 * Azar determinista para las series ilustrativas: la misma semilla da siempre la misma serie, así que los tests son
 * estables y la gráfica no «tiembla» entre dos refrescos del mismo instante. Lógica pura.
 */

/** Hash FNV-1a de 32 bits de un texto: convierte `uid|panel|ventana` en una semilla. */
export function semillaDe(texto: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Generador mulberry32: números en [0, 1) a partir de una semilla de 32 bits. */
export function generador(semilla: number): () => number {
  let estado = semilla >>> 0
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let t = estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface OpcionesSerie {
  semilla: string
  /** Instante final de la serie, en segundos desde la época. */
  hasta: number
  /** Segundos entre puntos. */
  paso: number
  puntos: number
  base: number
  /** Amplitud de la onda lenta, en unidades del valor. */
  onda: number
  /** Amplitud del ruido, en unidades del valor. */
  ruido: number
  minimo?: number
}

/**
 * Una serie temporal verosímil: nivel base + una onda lenta + ruido. Cada punto se calcula a partir de su propio
 * instante, así que al desplazar la ventana los puntos que se repiten conservan su valor y la gráfica se desliza.
 */
export function serieIlustrativa({ semilla, hasta, paso, puntos, base, onda, ruido, minimo = 0 }: OpcionesSerie): [number, number][] {
  const final = Math.floor(hasta / paso) * paso
  return Array.from({ length: puntos }, (_, i) => {
    const t = final - (puntos - 1 - i) * paso
    const azar = generador(semillaDe(`${semilla}|${t}`))()
    const valor = base + onda * Math.sin(t / (paso * 9)) + ruido * (azar * 2 - 1)
    return [t, Math.max(minimo, valor)]
  })
}
