/**
 * Proveedor del estado del Copiloto (ver `estado.ts`): vive en el shell y es ligero, porque lo carga la portada.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'

import { acotarAncho, ANCHO_PANEL, CLAVE_ABIERTO, CLAVE_ANCHO, ContextoCopiloto, guardar, leer, leerDescartadas, ORGS_COPILOTO, type OrgCopiloto, type PeticionCopiloto, type ValorCopiloto } from './estado'

export function ProveedorEstadoCopiloto({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(() => leer(CLAVE_ABIERTO) === '1')
  const [ancho, setAncho] = useState(() => {
    const guardado = Number(leer(CLAVE_ANCHO))
    return Number.isFinite(guardado) && guardado > 0 ? acotarAncho(guardado) : ANCHO_PANEL.inicial
  })
  const [org, setOrg] = useState<OrgCopiloto>('dmevals')
  const [peticion, setPeticion] = useState<PeticionCopiloto | null>(null)
  const [avisos, setAvisos] = useState<Record<string, number>>({})
  const [descartadas, setDescartadas] = useState<Record<string, string[]>>(() => Object.fromEntries(ORGS_COPILOTO.map((o) => [o, leerDescartadas(o)])))
  const refBoton = useRef<HTMLButtonElement | null>(null)
  const contador = useRef(0)

  const fijarAbierto = useCallback((v: boolean) => {
    setAbierto(v)
    guardar(CLAVE_ABIERTO, v ? '1' : '0')
    // al cerrar, el foco vuelve al botón que lo abrió
    if (!v) requestAnimationFrame(() => refBoton.current?.focus())
  }, [])
  const abrir = useCallback<ValorCopiloto['abrir']>((opciones = {}) => {
    if (opciones.org) setOrg(opciones.org)
    if (opciones.pregunta) setPeticion({ id: ++contador.current, pregunta: opciones.pregunta, seleccion: opciones.seleccion })
    fijarAbierto(true)
  }, [fijarAbierto])
  const cerrar = useCallback(() => fijarAbierto(false), [fijarAbierto])
  const alternar = useCallback(() => setAbierto((v) => {
    guardar(CLAVE_ABIERTO, v ? '0' : '1')
    if (v) requestAnimationFrame(() => refBoton.current?.focus())
    return !v
  }), [])
  const fijarAncho = useCallback((px: number) => {
    const valor = acotarAncho(px)
    setAncho(valor)
    guardar(CLAVE_ANCHO, String(valor))
  }, [])
  const limpiarPeticion = useCallback(() => setPeticion(null), [])
  const fijarAvisos = useCallback((o: string, n: number) => setAvisos((a) => (a[o] === n ? a : { ...a, [o]: n })), [])
  const descartar = useCallback((o: string, id: string) => setDescartadas((d) => {
    const lista = [...new Set([...(d[o] ?? []), id])]
    try {
      globalThis.sessionStorage?.setItem(`tfg:copiloto:descartadas:${o}`, JSON.stringify(lista))
    } catch {
      // sin almacenamiento: se recuerda solo mientras la página siga abierta
    }
    return { ...d, [o]: lista }
  }), [])

  const valor = useMemo<ValorCopiloto>(
    () => ({ abierto, ancho, org, peticion, avisos, descartadas, descartar, refBoton, abrir, cerrar, alternar, fijarAncho, fijarOrg: setOrg, limpiarPeticion, fijarAvisos }),
    [abierto, ancho, org, peticion, avisos, descartadas, descartar, abrir, cerrar, alternar, fijarAncho, limpiarPeticion, fijarAvisos],
  )
  return <ContextoCopiloto.Provider value={valor}>{children}</ContextoCopiloto.Provider>
}
