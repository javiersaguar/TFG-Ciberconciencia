/**
 * La única puerta de datos de la SPA.
 *
 * Hoy no hay backend: `desdeSimulado` resuelve contra `src/api/simulado` con una latencia ficticia, para que las
 * páginas pasen por sus estados de carga igual que lo harán con red. Cuando exista la API de F6.3 (FastAPI), cada
 * hook cambiará su `queryFn` por un `fetch('/api/…')` con el mismo tipo de respuesta, y ninguna página se enterará:
 * todas consumen los hooks de `src/api/*.ts`, nunca el simulador directamente.
 */

/** Latencia ficticia de cada «petición». En los tests es 0 para no esperar. */
export const LATENCIA_SIMULADA_MS = import.meta.env.MODE === 'test' ? 0 : 250

export function desdeSimulado<T>(producir: () => T, latenciaMs = LATENCIA_SIMULADA_MS): Promise<T> {
  return new Promise((resolver, rechazar) => {
    setTimeout(() => {
      try {
        resolver(producir())
      } catch (error) {
        rechazar(error)
      }
    }, latenciaMs)
  })
}
