/**
 * Estado que sobrevive a ir y volver entre páginas (filtros, grupos plegados…): se guarda en `sessionStorage`, solo
 * para esta pestaña. Lo leído se valida antes de usarlo (si alguien lo toca a mano, se ignora) y cualquier fallo del
 * almacenamiento (navegador que lo bloquea, cuota) deja el estado en memoria sin romper la página.
 *
 *   const [filtros, setFiltros] = useEstadoSesion('incidentes:filtros', INICIALES, esFiltro)
 */
import { useEffect, useState } from 'react'

const PREFIJO = 'tfg:'

export function leerSesion<T>(clave: string, valido: (v: unknown) => v is T): T | undefined {
  try {
    const crudo = globalThis.sessionStorage?.getItem(PREFIJO + clave)
    if (crudo == null) return undefined
    const valor: unknown = JSON.parse(crudo)
    return valido(valor) ? valor : undefined
  } catch {
    return undefined
  }
}

export function useEstadoSesion<T>(clave: string, inicial: T | (() => T), valido: (v: unknown) => v is T) {
  const [valor, setValor] = useState<T>(() => leerSesion(clave, valido) ?? (typeof inicial === 'function' ? (inicial as () => T)() : inicial))
  useEffect(() => {
    try {
      globalThis.sessionStorage?.setItem(PREFIJO + clave, JSON.stringify(valor))
    } catch {
      // sin almacenamiento: el estado sigue en memoria
    }
  }, [clave, valor])
  return [valor, setValor] as const
}

/** Validadores pequeños para los estados guardados. */
export const esListaDeTextos = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')
export const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
