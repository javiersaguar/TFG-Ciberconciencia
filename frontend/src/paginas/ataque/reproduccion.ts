/**
 * Reproducción del ataque en el grafo: recorre la secuencia temporal paso a paso, sola o a mano. Lógica pura (un
 * reductor) para poder probarla sin reloj; el hook `useReproduccion` solo añade el temporizador.
 *
 * Con movimiento reducido la reproducción sigue avanzando de paso (es contenido, no adorno), pero la página no anima
 * el trazo de las aristas ni el pulso de los nodos.
 */
import { useCallback, useEffect, useReducer } from 'react'

export type Velocidad = 1 | 2 | 4

export interface EstadoReproduccion {
  /** Paso actual (índice de hito) o `null` para ver todo el grafo sin atenuar. */
  paso: number | null
  enMarcha: boolean
  velocidad: Velocidad
}

export type AccionReproduccion =
  | { tipo: 'reproducir' }
  | { tipo: 'pausar' }
  | { tipo: 'siguiente' }
  | { tipo: 'anterior' }
  | { tipo: 'verTodo' }
  | { tipo: 'tic' }
  | { tipo: 'velocidad'; velocidad: Velocidad }
  | { tipo: 'ir'; paso: number }

/** El trazo que avanza y el pulso solo se animan en el paso actual y si el usuario no pidió menos movimiento. */
export function debeAnimar(enPasoActual: boolean, movimientoReducido: boolean): boolean {
  return enPasoActual && !movimientoReducido
}

export const INICIAL: EstadoReproduccion = { paso: null, enMarcha: false, velocidad: 1 }

/** Duración de cada paso a velocidad ×1. */
export const MS_POR_PASO = 1800

export function reproducir(estado: EstadoReproduccion, accion: AccionReproduccion, total: number): EstadoReproduccion {
  const ultimo = total - 1
  switch (accion.tipo) {
    case 'reproducir':
      // si ya estaba al final (o viendo todo), empieza desde el principio
      return { ...estado, enMarcha: true, paso: estado.paso == null || estado.paso >= ultimo ? 0 : estado.paso }
    case 'pausar':
      return { ...estado, enMarcha: false }
    case 'siguiente':
      return { ...estado, enMarcha: false, paso: estado.paso == null ? 0 : Math.min(ultimo, estado.paso + 1) }
    case 'anterior':
      return { ...estado, enMarcha: false, paso: estado.paso == null ? 0 : Math.max(0, estado.paso - 1) }
    case 'verTodo':
      return { ...estado, enMarcha: false, paso: null }
    case 'tic': {
      if (!estado.enMarcha || estado.paso == null) return estado
      // al llegar al último paso se para ahí: nada se queda girando en bucle
      return estado.paso >= ultimo ? { ...estado, enMarcha: false } : { ...estado, paso: estado.paso + 1 }
    }
    case 'velocidad':
      return { ...estado, velocidad: accion.velocidad }
    case 'ir':
      // saltar a un paso concreto desde la lista de pasos: se para ahí, como «anterior» y «siguiente»
      return { ...estado, enMarcha: false, paso: Math.min(ultimo, Math.max(0, Math.trunc(accion.paso))) }
  }
}

export function useReproduccion(total: number) {
  const [estado, despachar] = useReducer((e: EstadoReproduccion, a: AccionReproduccion) => reproducir(e, a, total), INICIAL)
  useEffect(() => {
    if (!estado.enMarcha) return
    const id = window.setTimeout(() => despachar({ tipo: 'tic' }), MS_POR_PASO / estado.velocidad)
    return () => window.clearTimeout(id)
  }, [estado.enMarcha, estado.paso, estado.velocidad])
  const accion = useCallback((a: AccionReproduccion) => despachar(a), [])
  return { ...estado, accion }
}
