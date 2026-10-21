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

import { cargarAlertasDay1, cargarTecnicasObservadas } from './exportaciones'
import { desdeSimulado } from './fuente'
import type { Procedencia } from './observabilidad'
import { alertasPorMinuto, mapaTacticaHost, repartoPorNivel, type MapaTacticaHost, type MinutoActividad } from './simulado/actividad'
import { CAMPANAS, CORPUS, CRONOLOGIA_DAY1, DAY1, REF, type Campana, type NivelRegla } from './simulado/corpus'

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

export interface EtapaPipeline {
  etapa: string
  /** Lo medido de esa etapa, con su fuente. */
  medida: string
  fuente: string
}

export interface Situacion {
  cifras: Cifra[]
  campanas: readonly Campana[]
  fases: Fase[]
  /** Primera alerta y recuento por táctica y host en apt29 day1 (escenario §4). */
  reparto: typeof CRONOLOGIA_DAY1
  /** Etapas del pipeline con su cifra documentada. El estado EN VIVO no existe sin backend. */
  pipeline: EtapaPipeline[]
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
        detalle: `Solo en el alcance de P1 (${formatearEntero(CORPUS.alertasAbsorbidas)} alertas absorbidas): no es comparable con la línea base 741 → 87 (88,3 %)`,
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
    reparto: CRONOLOGIA_DAY1,
    pipeline: [
      { etapa: 'Replay → raw.host.windows', medida: `${formatearEntero(CORPUS.lineasConsumidas)} líneas del corpus de F3`, fuente: REF.recarga },
      { etapa: 'Normalización OCSF → norm.events', medida: `${formatearEntero(CORPUS.eventosNormalizados)} eventos (96,4 %); ${formatearEntero(CORPUS.eventosDlq)} a la DLQ, todos sin mapeador`, fuente: REF.recarga },
      { etapa: 'Detección Sigma → det.alerts', medida: `${formatearEntero(CORPUS.alertas)} alertas; ~630 eventos/s con 6 instancias`, fuente: REF.alertas741 },
      { etapa: 'CEP (P1 en Flink, P2 en batch) → det.campaigns', medida: `${CORPUS.campanasP1} campañas P1 y ${CORPUS.campanasP2} de P2`, fuente: `${REF.p1Revalidado} · ${REF.p2Revalidado}` },
    ],
  }
}

export function useSituacion() {
  return useQuery({
    queryKey: ['situacion'],
    queryFn: () => desdeSimulado(construirSituacion),
    staleTime: 5 * 60_000,
  })
}

/** Actividad de APT29 day1 a partir de sus 741 alertas (exportación del 21-10-2026): se procesa una vez, aquí. */
export interface ActividadDay1 {
  porMinuto: MinutoActividad[]
  porNivel: { nivel: NivelRegla; alertas: number }[]
  mapa: MapaTacticaHost
  total: number
  /** Técnicas con alertas: en el corpus actual (21-10) y en la capa de F2 (28-07). Las dos, cada una con su fecha. */
  tecnicas: { hoy: number; f2: number }
  fuente: string
}

export function useActividadDay1() {
  return useQuery({
    queryKey: ['actividad-day1'],
    queryFn: async (): Promise<ActividadDay1> => {
      const [alertas, tecnicas, capaF2] = await Promise.all([cargarAlertasDay1(), cargarTecnicasObservadas(), import('./datos/cobertura-observada.json')])
      return {
        porMinuto: alertasPorMinuto(alertas),
        porNivel: repartoPorNivel(alertas),
        mapa: mapaTacticaHost(alertas),
        total: alertas.length,
        tecnicas: { hoy: tecnicas.length, f2: capaF2.default.techniques.length },
        fuente: REF.alertasDay1,
      }
    },
    staleTime: Infinity,
  })
}
