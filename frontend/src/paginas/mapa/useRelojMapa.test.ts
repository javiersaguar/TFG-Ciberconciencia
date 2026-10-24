import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { INICIO_MS } from './modelo'
import { useRelojMapa } from './useRelojMapa'

describe('reloj de la demo geográfica', () => {
  afterEach(() => vi.useRealTimers())

  it('pausa sin avanzar, cambia el ritmo, reinicia y libera su reloj al desmontar', () => {
    vi.useFakeTimers()
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const { result, unmount } = renderHook(() => useRelojMapa())
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.reloj.current).toBeGreaterThan(INICIO_MS + 900)
    act(() => result.current.pausar())
    const detenido = result.current.reloj.current
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.reloj.current).toBe(detenido)
    act(() => { result.current.setVelocidad(4); result.current.pausar() })
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.reloj.current - detenido).toBeGreaterThan(3500)
    act(() => result.current.reiniciar())
    expect(result.current.reloj.current).toBe(0)
    const reloj = result.current.reloj
    unmount()
    act(() => vi.advanceTimersByTime(1000))
    expect(reloj.current).toBe(0)
    hidden.mockRestore()
  })

  it('no acumula actividad mientras la pestaña está oculta', () => {
    vi.useFakeTimers()
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    const { result, unmount } = renderHook(() => useRelojMapa())
    act(() => vi.advanceTimersByTime(10_000))
    expect(result.current.reloj.current).toBe(INICIO_MS)
    hidden.mockReturnValue(false)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.reloj.current).toBeLessThan(INICIO_MS + 1100)
    unmount()
    hidden.mockRestore()
  })
})
