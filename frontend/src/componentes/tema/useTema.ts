/**
 * El tema como estado de React: `const { tema, alternar } = useTema()`.
 *
 * Se apoya en `useSyncExternalStore` sobre `tema.ts`, así que todos los componentes que lo usan (el botón del shell,
 * el `colorMode` de React Flow) ven siempre el mismo valor, sin contexto ni proveedor.
 */
import { useCallback, useSyncExternalStore } from 'react'

import { alternarTema, fijarTema, suscribirTema, temaActual, type Tema } from './tema'

export function useTema(): { tema: Tema; alternar: () => void; fijar: (tema: Tema) => void } {
  const tema = useSyncExternalStore(suscribirTema, () => temaActual(), () => 'claro' as const)
  const alternar = useCallback(() => fijarTema(alternarTema(temaActual())), [])
  return { tema, alternar, fijar: fijarTema }
}
