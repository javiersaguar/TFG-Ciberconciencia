import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { debeAnimar, INICIAL, MS_POR_PASO, reproducir, useReproduccion } from './reproduccion'

afterEach(() => vi.useRealTimers())

describe('reproducción del ataque (reductor)', () => {
  it('reproducir empieza por el primer paso y cada tic avanza uno', () => {
    let e = reproducir(INICIAL, { tipo: 'reproducir' }, 8)
    expect(e).toMatchObject({ paso: 0, enMarcha: true })
    e = reproducir(e, { tipo: 'tic' }, 8)
    expect(e.paso).toBe(1)
  })

  it('al llegar al último paso se para ahí: nada gira en bucle', () => {
    const e = reproducir({ paso: 7, enMarcha: true, velocidad: 1 }, { tipo: 'tic' }, 8)
    expect(e).toMatchObject({ paso: 7, enMarcha: false })
    // y volver a reproducir desde el final empieza de nuevo
    expect(reproducir(e, { tipo: 'reproducir' }, 8).paso).toBe(0)
  })

  it('paso a paso, anterior y ver todo paran la reproducción', () => {
    const enMarcha = { paso: 3, enMarcha: true, velocidad: 2 as const }
    expect(reproducir(enMarcha, { tipo: 'siguiente' }, 8)).toMatchObject({ paso: 4, enMarcha: false })
    expect(reproducir(enMarcha, { tipo: 'anterior' }, 8)).toMatchObject({ paso: 2, enMarcha: false })
    expect(reproducir(enMarcha, { tipo: 'verTodo' }, 8)).toMatchObject({ paso: null, enMarcha: false })
    expect(reproducir({ ...enMarcha, paso: 0 }, { tipo: 'anterior' }, 8).paso).toBe(0)
  })

  it('un tic en pausa no cambia nada', () => {
    const e = { paso: 2, enMarcha: false, velocidad: 1 as const }
    expect(reproducir(e, { tipo: 'tic' }, 8)).toBe(e)
  })

  it('con movimiento reducido no se anima el trazo ni el pulso (pero el paso sigue resaltado)', () => {
    expect(debeAnimar(true, false)).toBe(true)
    expect(debeAnimar(true, true)).toBe(false)
    expect(debeAnimar(false, false)).toBe(false)
  })
})

describe('useReproduccion', () => {
  it('avanza solo con el reloj, más rápido a ×4, y se para al final', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useReproduccion(3))
    act(() => result.current.accion({ tipo: 'velocidad', velocidad: 4 }))
    act(() => result.current.accion({ tipo: 'reproducir' }))
    expect(result.current.paso).toBe(0)
    act(() => vi.advanceTimersByTime(MS_POR_PASO / 4))
    expect(result.current.paso).toBe(1)
    act(() => vi.advanceTimersByTime(MS_POR_PASO / 4))
    expect(result.current.paso).toBe(2)
    act(() => vi.advanceTimersByTime(MS_POR_PASO))
    expect(result.current).toMatchObject({ paso: 2, enMarcha: false })
  })
})
