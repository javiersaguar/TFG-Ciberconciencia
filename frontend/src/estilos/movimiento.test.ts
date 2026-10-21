/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/estilos/globales.css'), 'utf8')
/** Bloques `@media (prefers-reduced-motion: reduce) { … }` con su contenido. */
const reducidos = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1])

describe('movimiento con significado', () => {
  it.each(['.trazo-avance', '.pulso-nodo', '.entrada-pagina', '.entrada-escalonada', '.entrada-panel', '.entrada-mensaje'])('%s se desactiva con movimiento reducido', (clase) => {
    expect(reducidos.some((bloque) => bloque.includes(clase) && /animation:\s*none/.test(bloque))).toBe(true)
  })

  it('las animaciones nuevas no giran en bucle: ninguna es infinita', () => {
    for (const clase of ['trazo-avance', 'pulso-nodo', 'entrada-pagina']) {
      const regla = css.match(new RegExp(`\\.${clase} \\{([^}]*)\\}`))![1]
      expect(regla, clase).not.toMatch(/infinite/)
    }
  })

  it('el fondo del lienzo del pipeline se queda quieto cuando no pasa nada', () => {
    expect(css).toMatch(/\.lienzo-quieto \.fondo-marea,[\s\S]*?animation-play-state: paused/)
  })
})
