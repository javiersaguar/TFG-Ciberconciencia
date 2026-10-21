/// <reference types="node" />
/**
 * Contraste WCAG 2.x de los dos temas, COMPROBADO y no a ojo: lee los tokens de `globales.css` (`:root` para el claro,
 * `:root` + `.dark` para el oscuro) y mide cada par texto/fondo (≥ 4,5:1) y elemento gráfico/fondo (≥ 3:1) que el
 * portal usa de verdad. Si alguien cambia un color y rompe AA en cualquiera de los dos temas, este test lo dice.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/estilos/globales.css'), 'utf8')

function bloque(selector: string): string {
  const inicio = css.indexOf(`${selector} {`)
  if (inicio < 0) throw new Error(`No está el bloque ${selector}`)
  return css.slice(inicio, css.indexOf('\n}', inicio))
}

function tokens(texto: string): Record<string, string> {
  const salida: Record<string, string> = {}
  for (const m of texto.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) salida[m[1]] = m[2].toLowerCase()
  return salida
}

const claro = tokens(bloque(':root'))
const oscuro = { ...claro, ...tokens(bloque('.dark')) }

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const lineal = (c: number) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminancia = (hex: string) => {
  const [r, g, b] = rgb(hex).map(lineal)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** Un tinte translúcido (`bg-aviso/10`) compuesto sobre su fondo real. */
const tinte = (color: string, fondo: string, opacidad: number) =>
  '#' + rgb(color).map((v, i) => Math.round(v * opacidad + rgb(fondo)[i] * (1 - opacidad)).toString(16).padStart(2, '0')).join('')

type Par = [delante: string, detras: string, minimo: number]
const FAMILIAS = ['verde', 'azul', 'ambar', 'violeta', 'cian', 'coral', 'pizarra']
const SEVERIDAD = ['sev-info', 'sev-baja', 'sev-media', 'sev-alta', 'sev-critica']

function pares(t: Record<string, string>): [string, string, string, number][] {
  const lista: Par[] = []
  const texto = (a: string, b: string) => lista.push([a, b, 4.5])
  const grafico = (a: string, b: string) => lista.push([a, b, 3])
  for (const fondo of ['fondo', 'superficie', 'superficie-alterna', 'lateral']) {
    texto('texto', fondo)
    texto('texto-suave', fondo)
  }
  texto('primario', 'superficie')
  texto('acento', 'superficie')
  texto('acento', 'acento-suave')
  texto('primary-foreground', 'acento')
  for (const estado of ['ok', 'aviso', 'peligro', ...SEVERIDAD]) texto(estado, 'superficie')
  for (const intenso of ['sev-critica', 'sev-alta', 'sev-media', 'acento', 'ok']) texto('sobre-intenso', intenso)
  for (const f of FAMILIAS) texto(`fam-${f}-texto`, `fam-${f}-fondo`)
  for (const e of ['estado-riesgo', 'estado-comprometido', 'estado-aislado', 'estado-protegido']) texto('texto', e)
  texto('atacante-texto', 'atacante-fondo')
  texto('atacante-suave', 'atacante-fondo')
  grafico('linea-red', 'lienzo')
  grafico('linea-red', 'zona')
  for (const f of FAMILIAS) grafico(`fam-${f}-linea`, 'lienzo')
  for (const fund of ['fund-observado', 'fund-inferido', 'fund-hipotesis']) {
    grafico(fund, 'lienzo')
    grafico(fund, 'superficie')
  }
  for (let i = 1; i <= 8; i++) grafico(`chart-${i}`, 'superficie')
  grafico('acento', 'superficie') // anillo de foco
  return lista.map(([a, b, min]) => {
    if (!t[a] || !t[b]) throw new Error(`Falta un token: ${t[a] ? b : a}`)
    return [a, b, `${t[a]} / ${t[b]}`, min]
  })
}

describe.each([
  ['claro', claro],
  ['oscuro', oscuro],
])('contraste AA del tema %s', (_nombre, t) => {
  it.each(pares(t))('%s sobre %s (%s) ≥ %d:1', (a, b, _colores, minimo) => {
    expect(contraste(t[a], t[b])).toBeGreaterThanOrEqual(minimo)
  })

  it('los chips con tinte (aviso 10 %, severidad 12 %) siguen legibles', () => {
    expect(contraste(t.aviso, tinte(t.aviso, t.superficie, 0.1))).toBeGreaterThanOrEqual(4.5)
    expect(contraste(t['sev-critica'], tinte(t['sev-critica'], t.superficie, 0.12))).toBeGreaterThanOrEqual(4.5)
    expect(contraste(t['sev-media'], tinte(t['sev-media'], t.superficie, 0.12))).toBeGreaterThanOrEqual(4.5)
  })

  it('el texto sigue legible sobre la celda más intensa de la matriz ATT&CK (chart-1 al 42 %)', () => {
    expect(contraste(t.texto, tinte(t['chart-1'], t.superficie, 0.42))).toBeGreaterThanOrEqual(4.5)
  })
})

it('el tema oscuro redefine todos los planos y textos (ninguno se hereda del claro por descuido)', () => {
  const propios = tokens(bloque('.dark'))
  for (const clave of ['fondo', 'superficie', 'superficie-alterna', 'lateral', 'borde', 'texto', 'texto-suave', 'primario', 'acento', 'lienzo']) {
    expect(propios[clave], clave).toBeDefined()
  }
})
