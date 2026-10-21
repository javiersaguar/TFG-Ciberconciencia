/**
 * Densidad: las filas de un cuadro formadas SOLO por paneles de un número («stat» con un valor) bajan a
 * `ALTO_COMPACTO` filas de rejilla, y todo lo de debajo sube lo mismo. Si otro panel (una serie alta al lado) ocupa
 * esas filas, la banda baja igual pero la altura que sobra se la queda el panel que tiene justo debajo en sus mismas
 * columnas, de modo que la columna mide lo mismo y la disposición del cuadro de Grafana se conserva. Si no hay ese
 * panel, la banda no se toca. Dentro de una banda compactada todos los paneles quedan con la misma altura.
 */
import type { PanelCuadro } from '@/api/observabilidad'

export const ALTO_COMPACTO = 3

const esUnNumero = (p: PanelCuadro) => p.tipo === 'stat' && (p.valores?.length ?? 0) <= 1
const seSolapan = (a: { y: number; alto: number }, b: { y: number; alto: number }) => a.y < b.y + b.alto && b.y < a.y + a.alto

export function compactarFilasDeUnNumero(paneles: readonly PanelCuadro[], alto = ALTO_COMPACTO): PanelCuadro[] {
  const contenido = paneles.filter((p) => p.tipo !== 'fila')
  // bandas candidatas: mismos `y`, todos de un número, y nadie más en sus filas
  const recortes: { desde: number; delta: number; ids: Set<string | number> }[] = []
  const cesiones: { banda: Set<string | number>; receptor: string | number; delta: number }[] = []
  for (const y of [...new Set(contenido.map((p) => p.y))].sort((a, b) => a - b)) {
    // la banda son los paneles de un número que empiezan en esta fila; lo demás que empiece aquí cuenta como vecino
    const banda = contenido.filter((p) => p.y === y && esUnNumero(p))
    if (banda.length === 0) continue
    const altoBanda = Math.max(...banda.map((p) => p.alto))
    if (altoBanda <= alto) continue
    const caja = { y, alto: altoBanda }
    if (contenido.some((p) => !banda.includes(p) && seSolapan(p, caja))) {
      // con vecinos al lado: la altura sobrante pasa al panel de debajo que cubre justo las mismas columnas
      const x0 = Math.min(...banda.map((p) => p.x))
      const x1 = Math.max(...banda.map((p) => p.x + p.ancho))
      const debajo = contenido.find((p) => p.y === y + altoBanda && p.x === x0 && p.x + p.ancho === x1 && !esUnNumero(p))
      const cubre = banda.reduce((s, p) => s + p.ancho, 0) === x1 - x0 && banda.every((p) => p.alto === altoBanda)
      if (debajo && cubre) cesiones.push({ banda: new Set(banda.map((p) => p.id)), receptor: debajo.id, delta: altoBanda - alto })
      continue
    }
    recortes.push({ desde: y + altoBanda, delta: altoBanda - alto, ids: new Set(banda.map((p) => p.id)) })
  }
  if (recortes.length === 0 && cesiones.length === 0) return [...paneles]
  return paneles.map((p) => {
    const cesion = cesiones.find((c) => c.banda.has(p.id) || c.receptor === p.id)
    if (cesion && p.tipo !== 'fila') {
      return cesion.receptor === p.id ? { ...p, y: p.y - cesion.delta, alto: p.alto + cesion.delta } : { ...p, alto: p.alto - cesion.delta }
    }
    const subida = recortes.filter((r) => p.y >= r.desde).reduce((s, r) => s + r.delta, 0)
    const enBanda = recortes.some((r) => r.ids.has(p.id) && p.tipo !== 'fila')
    return { ...p, y: p.y - subida, alto: enBanda ? alto : p.alto }
  })
}
