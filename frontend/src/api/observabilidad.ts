/**
 * Observabilidad: los cuadros de Grafana con sus datos, para dibujarlos en el portal.
 *
 *   const lista = useCuadros()                        // [{uid, titulo, periodo}]
 *   const cuadro = useCuadro('tfg-pipeline-health')   // el cuadro con sus paneles, cada 30 s como Grafana
 *
 * Mismo contrato que el portal de PIDS (la SPA pide un uid, nunca una consulta), ampliado con los tipos de panel que
 * usan los cuadros del TFG (tabla, indicador y grafo de nodos) y con la **procedencia** de cada panel: si su cifra
 * está documentada (bitácora o fichero del repo) o es ilustrativa. Cuando exista la API, será el backend quien
 * ejecute las consultas de los JSON de `infra/grafana/dashboards` y la procedencia pasará a ser siempre «medida».
 *
 * Al cambiar de cuadro o refrescar se conserva el anterior mientras llega el nuevo, para que los números y las
 * gráficas se deslicen hacia los valores nuevos en lugar de parpadear.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { desdeSimulado } from './fuente'
import { construirCuadro, listarCuadros } from './simulado/cuadros'

export const REFRESCO_CUADRO_MS = 30_000

export interface ResumenCuadro {
  uid: string
  titulo: string
  /** Periodo del cuadro: `30m`, `6h`… o un texto (`corpus F3`) cuando no es una ventana deslizante. */
  periodo: string
}

export interface ValorPanel {
  nombre: string
  valor: number | null
}

export interface SeriePanel {
  nombre: string
  /** `[segundos desde la época, valor]`. */
  puntos: [number, number | null][]
}

export interface ColumnaTabla {
  clave: string
  titulo: string
  /** Unidad de la columna (mismos nombres que `unidad` del panel); sin unidad, el valor se pinta tal cual. */
  unidad?: string
}

export interface TablaPanel {
  columnas: ColumnaTabla[]
  filas: Record<string, string | number | null>[]
}

export interface NodoGrafo {
  id: string
  titulo: string
  subtitulo?: string
  rol: 'origen' | 'destino' | 'dc' | 'otro'
}

export interface AristaGrafo {
  desde: string
  hasta: string
  etiqueta: string
  /** `ataque`: arista que forma parte de la campaña; `contexto`: tráfico observado que no lo es. */
  tipo: 'ataque' | 'contexto'
}

/**
 * `documentada`: la cifra está medida y escrita (entrada de la bitácora, escenario o fichero del repo), `fuente` dice
 * dónde. `ilustrativa`: la cifra se ha inventado para dar forma al panel hasta conectar Prometheus o ClickHouse.
 */
export type Procedencia = 'documentada' | 'ilustrativa'

export interface PanelCuadro {
  id: number
  tipo: 'fila' | 'stat' | 'serie' | 'barras' | 'tarta' | 'tabla' | 'indicador' | 'grafo'
  titulo: string
  descripcion: string
  /** Posición en la rejilla de 24 columnas de Grafana. */
  x: number
  y: number
  ancho: number
  alto: number
  unidad: string
  color: string | null
  umbrales: { color: string; desde: number | null }[]
  procedencia?: Procedencia
  fuente?: string
  valores?: ValorPanel[]
  chispa?: number[]
  series?: SeriePanel[]
  tabla?: TablaPanel
  grafo?: { nodos: NodoGrafo[]; aristas: AristaGrafo[] }
  error?: string
}

export interface Cuadro extends ResumenCuadro {
  /** Segundos desde la época de cuando se construyó. */
  actualizado: number
  disponible: boolean
  paneles: PanelCuadro[]
}

export function useCuadros() {
  return useQuery({
    queryKey: ['observabilidad', 'cuadros'],
    queryFn: () => desdeSimulado(listarCuadros),
    staleTime: 10 * 60_000,
  })
}

export function useCuadro(uid: string) {
  return useQuery({
    queryKey: ['observabilidad', 'cuadro', uid],
    queryFn: () => desdeSimulado(() => construirCuadro(uid, Date.now())),
    refetchInterval: REFRESCO_CUADRO_MS,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  })
}
