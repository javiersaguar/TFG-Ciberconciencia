/**
 * Grafo de ataque de APT29 day1: hosts, cuentas, procesos, alertas y campañas, con las relaciones que los unen.
 *
 *   const grafo = useGrafoAtaque()   // {nodos, aristas, hitos}
 *
 * Cada nodo y cada arista dicen su FUNDAMENTO, que es lo primero que un analista tiene que saber de una relación:
 *   - observado: telemetría directa (aristas de Sysmon EID 3, alertas Sigma);
 *   - inferido:  correlación del sistema (campañas P1/P2 y su evidencia, con su confianza descompuesta);
 *   - hipótesis: lecturas del escenario y extrapolaciones de la demo, que nadie ha observado.
 *
 * Hoy se construye desde `simulado/corpus.ts` (solo cifras documentadas). Con la API saldrá de `det.campaigns`,
 * de `tfg.events`/`tfg.alerts` y, en F5, de Neo4j; el contrato de tipos no cambia.
 */
import { useQuery } from '@tanstack/react-query'

import { cargarAristasP2, cargarCampanaP2, cargarCampanasP1 } from './exportaciones'
import type { Procedencia } from './observabilidad'
import type { HoraDataset, NivelRegla } from './simulado/corpus'
import { construirGrafoAtaque } from './simulado/grafoAtaque'

export type Fundamento = 'observado' | 'inferido' | 'hipotesis'
export type TipoNodoAtaque = 'host' | 'cuenta' | 'proceso' | 'alerta' | 'campana'
export type TipoRelacion = 'conexion' | 'dominio' | 'cuenta' | 'alerta' | 'evidencia' | 'hipotesis'

export interface Hecho {
  etiqueta: string
  valor: string
  /** IDs, IPs, rutas, procesos: se pintan en monoespaciada. */
  mono?: boolean
}

export interface FactorConfianza {
  factor: string
  peso: number
  /** `null` cuando no está documentado si el factor se cumple. */
  presente: boolean | null
}

export interface ConfianzaDescompuesta {
  /** `null` si el valor no está documentado (se enseña la fórmula, nunca un número inventado). */
  total: number | null
  factores: FactorConfianza[]
  nota?: string
  fuente: string
}

export interface DetalleElemento {
  hechos: Hecho[]
  /** Solo las técnicas que vienen en los datos (`technique_ids[]` de las alertas). */
  tecnicas: string[]
  notas: string[]
  confianza?: ConfianzaDescompuesta
  /** Incidente (campaña) relacionado, para enlazar con `/incidentes`. */
  incidente?: string
  /** Evento de la línea temporal relacionado, para enlazar con `/cronologia`. */
  cronologia?: string
}

interface ElementoAtaque {
  id: string
  etiqueta: string
  fundamento: Fundamento
  procedencia: Procedencia
  fuente: string
  /** Campañas a las que pertenece (para el filtro por campaña). Vacío = contexto de la red. */
  campanas: string[]
  detalle: DetalleElemento
}

export interface NodoAtaque extends ElementoAtaque {
  tipo: TipoNodoAtaque
  subtitulo?: string
  /** Host que lo contiene (procesos y alertas). */
  padre?: string
  /** Host corto al que pertenece (SCRANTON, NASHUA…), también para los propios hosts. */
  hosts: string[]
  nivel?: NivelRegla
  /** Milisegundos del día de su primer evento medido (eje de tiempo de los carriles); los hosts no lo llevan. */
  ms?: number
  /** Fin de la ventana (solo campañas). */
  msFin?: number
}

export interface AristaAtaque extends ElementoAtaque {
  origen: string
  destino: string
  relacion: TipoRelacion
  /** Asas de React Flow por las que entra y sale, para que las aristas paralelas no se monten. */
  asaOrigen?: string
  asaDestino?: string
  /** Hora de su primer evento medido: coloca su asa en el carril de destino. */
  ms?: number
  /** Se dibuja al final del eje (después de day1: extrapolaciones). */
  alFinal?: boolean
  /** Tráfico de fondo (dominio): se pinta más fino. */
  fondo?: boolean
  /** Recorrido en escalón por encima de los nodos (para no atravesar tarjetas). */
  escalon?: boolean
}

export interface HitoAtaque {
  id: string
  hora: HoraDataset
  titulo: string
  nodos: string[]
  aristas: string[]
  fuente: string
}

export interface GrafoAtaque {
  nodos: NodoAtaque[]
  aristas: AristaAtaque[]
  /** La secuencia del ataque en orden temporal, para resaltarla paso a paso. */
  hitos: HitoAtaque[]
}

export function useGrafoAtaque() {
  return useQuery({
    queryKey: ['grafo-ataque', 'apt29-day1'],
    queryFn: async () => {
      const [campanasP1, campanaP2, aristas] = await Promise.all([cargarCampanasP1(), cargarCampanaP2(), cargarAristasP2()])
      return construirGrafoAtaque({ campanasP1, campanaP2, aristas })
    },
    staleTime: Infinity,
  })
}
