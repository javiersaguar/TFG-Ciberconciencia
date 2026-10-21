/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { alternarTema, aplicarTema, CLAVE_TEMA, COLOR_NAVEGADOR, fijarTema, guardarTema, leerTemaGuardado, suscribirTema, temaActual } from './tema'

function almacen(valores: Record<string, string> = {}) {
  return {
    getItem: (clave: string) => valores[clave] ?? null,
    setItem: (clave: string, valor: string) => {
      valores[clave] = valor
    },
  }
}

const roto = {
  getItem: () => {
    throw new DOMException('bloqueado', 'SecurityError')
  },
  setItem: () => {
    throw new DOMException('bloqueado', 'SecurityError')
  },
}

afterEach(() => {
  document.documentElement.classList.remove('dark')
  document.documentElement.style.colorScheme = ''
  localStorage.clear()
})

describe('tema', () => {
  it('sin elección guardada es el claro', () => {
    expect(leerTemaGuardado(almacen())).toBe('claro')
    expect(temaActual()).toBe('claro')
  })

  it('ignora valores guardados que no son un tema', () => {
    expect(leerTemaGuardado(almacen({ [CLAVE_TEMA]: '<img onerror=alert(1)>' }))).toBe('claro')
    expect(leerTemaGuardado(almacen({ [CLAVE_TEMA]: 'oscuro' }))).toBe('oscuro')
  })

  it('alterna entre claro y oscuro', () => {
    expect(alternarTema('claro')).toBe('oscuro')
    expect(alternarTema('oscuro')).toBe('claro')
  })

  it('persiste la elección y la recupera', () => {
    const memoria = almacen()
    guardarTema('oscuro', memoria)
    expect(leerTemaGuardado(memoria)).toBe('oscuro')
  })

  it('sobrevive a un localStorage que lanza al leer y al escribir', () => {
    expect(leerTemaGuardado(roto)).toBe('claro')
    expect(() => guardarTema('oscuro', roto)).not.toThrow()
  })

  it('aplica la clase, el color-scheme y las metas del documento', () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)
    aplicarTema('oscuro')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(meta.content).toBe(COLOR_NAVEGADOR.oscuro)
    aplicarTema('claro')
    expect(document.documentElement).not.toHaveClass('dark')
    expect(meta.content).toBe(COLOR_NAVEGADOR.claro)
    meta.remove()
  })

  it('fijarTema aplica, guarda y avisa a los suscriptores', () => {
    const oyente = vi.fn()
    const baja = suscribirTema(oyente)
    fijarTema('oscuro')
    expect(temaActual()).toBe('oscuro')
    expect(localStorage.getItem(CLAVE_TEMA)).toBe('oscuro')
    expect(oyente).toHaveBeenCalledTimes(1)
    baja()
    fijarTema('claro')
    expect(oyente).toHaveBeenCalledTimes(1)
  })

  it('el script anti-parpadeo de index.html usa la misma clave, valores y colores', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
    expect(html).toContain(`localStorage.getItem('${CLAVE_TEMA}') === 'oscuro'`)
    expect(html).toContain(`'${COLOR_NAVEGADOR.oscuro}'`)
    expect(html).toContain(`'${COLOR_NAVEGADOR.claro}'`)
  })
})
