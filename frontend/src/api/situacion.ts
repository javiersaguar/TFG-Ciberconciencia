/**
 * Situación: lo que un analista mira primero. Cifras del corpus, las campañas detectadas y el avance del proyecto.
 *
 *   const situacion = useSituacion()   // {cifras, campanas, fases}
 *
 * Hoy sale entera de `simulado/corpus.ts` (cifras documentadas) y del ROADMAP. Con la API, `cifras` y `campanas`
 * vendrán de ClickHouse y `fases` desaparecerá de aquí: es contexto del TFG, no del producto.
 */
import { useQuery } from '@tanstack/react-query'

import { formatearEntero, formatearPorcentaje } from '@/componentes/datos/formato'

import { desdeSimulado } from './fuente'
import type { Procedencia } from './observabilidad'
import { CAMPANAS, CORPUS, DAY1, REF, type Campana } from './simulado/corpus'

export type { Campana }

export interface Cifra {
  clave: string
  titulo: string
  valor: number
  unidad: 'entero' | 'porcentaje' | 'fraccion'
  /** Texto corto bajo la cifra. */
  detalle: string
  procedencia: Procedencia
  fuente: string
}

export interface Fase {
  id: string
  titulo: string
  estado: 'hecha' | 'en-curso' | 'pendiente'
  /** Qué hay hecho y qué falta, en una línea. */
  nota: string
}

export interface Situacion {
  cifras: Cifra[]
  campanas: readonly Campana[]
  fases: Fase[]
}

/** Estado de las fases a 23-09-2026 (ROADMAP rev. 3 + BITÁCORA hasta el 15-09). */
const FASES: Fase[] = [
  { id: 'F0', titulo: 'Entorno e infraestructura base', estado: 'hecha', nota: 'WSL2, Docker Engine, repositorios y hook de autoría.' },
  { id: 'F1', titulo: 'Ingesta, OCSF, persistencia y observabilidad', estado: 'hecha', nota: 'Redpanda, normalizador, ClickHouse, Prometheus y Grafana.' },
  { id: 'F2', titulo: 'Detección con reglas Sigma + ML-1', estado: 'hecha', nota: 'Pipeline Sigma → OCSF propia; cerrada el 30-07.' },
  { id: 'F3', titulo: 'Pilar A — detección multi-etapa (CEP)', estado: 'en-curso', nota: 'P1 en batch y en Flink; P2 en batch. Falta P2 en Flink, P3/P4 y falsos positivos.' },
  { id: 'F4', titulo: 'Plano CTI + extracción de TTPs', estado: 'pendiente', nota: 'OpenCTI, ATT&CK y ML-2.' },
  { id: 'F5', titulo: 'Pilar B — grafo de ataque razonado', estado: 'pendiente', nota: 'Neo4j + GDS y Datalog sobre Soufflé.' },
  { id: 'F6', titulo: 'Pilar C — priorización explicable + API', estado: 'pendiente', nota: 'Puntuación descompuesta y FastAPI.' },
  { id: 'F7', titulo: 'Evaluación cuantitativa', estado: 'pendiente', nota: 'Protocolo, líneas base B1–B5 y métricas.' },
  { id: 'F8', titulo: 'Frontend', estado: 'en-curso', nota: 'Base del portal con datos simulados (esta aplicación).' },
  { id: 'F9', titulo: 'Despliegue, memoria y defensa', estado: 'pendiente', nota: 'minikube, memoria y presentación.' },
]

function construirSituacion(): Situacion {
  return {
    cifras: [
      {
        clave: 'eventos',
        titulo: 'Eventos normalizados',
        valor: CORPUS.eventosNormalizados,
        unidad: 'entero',
        detalle: `9 datasets · ${formatearPorcentaje((CORPUS.eventosNormalizados / CORPUS.lineasConsumidas) * 100)} del crudo`,
        procedencia: 'documentada',
        fuente: REF.recarga,
      },
      {
        clave: 'alertas',
        titulo: 'Alertas Sigma',
        valor: CORPUS.alertas,
        unidad: 'entero',
        detalle: `${DAY1.alertas} en apt29 day1`,
        procedencia: 'documentada',
        fuente: REF.alertas741,
      },
      {
        clave: 'campanas',
        titulo: 'Campañas',
        valor: CORPUS.campanasP1 + CORPUS.campanasP2,
        unidad: 'entero',
        detalle: `${CORPUS.campanasP1} de P1 · ${CORPUS.campanasP2} de P2`,
        procedencia: 'documentada',
        fuente: `${REF.p1Revalidado} · ${REF.p2Revalidado}`,
      },
      {
        clave: 'reduccion',
        titulo: 'Reducción de alertas',
        valor: CORPUS.ratioReduccion * 100,
        unidad: 'porcentaje',
        detalle: `${formatearEntero(CORPUS.alertasAbsorbidas)} alertas agrupadas en campañas`,
        procedencia: 'documentada',
        fuente: REF.p1Revalidado,
      },
      {
        clave: 'variantes',
        titulo: 'Variantes LSASS detectadas',
        valor: 7,
        unidad: 'fraccion',
        detalle: 'de 7, en batch y en Flink',
        procedencia: 'documentada',
        fuente: REF.p1Revalidado,
      },
    ],
    campanas: CAMPANAS,
    fases: FASES,
  }
}

export function useSituacion() {
  return useQuery({
    queryKey: ['situacion'],
    queryFn: () => desdeSimulado(construirSituacion),
    staleTime: 5 * 60_000,
  })
}
