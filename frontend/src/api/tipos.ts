/**
 * Tipos del CONTRATO FUTURO con la API (F6.3), copiados de los esquemas reales del pipeline. Hoy ninguna página los usa:
 * existen para que, cuando la API exista, los hooks de `src/api/*.ts` cambien su `queryFn` por un `fetch('/api/…')`
 * tipado con ellos sin reinventar nada. Si cambia un esquema del pipeline, se cambia aquí con la misma referencia.
 *
 *   Alerta      → `build_alert()` de `pipeline/jobs/detect_job.py` (topic `det.alerts`, tabla `tfg.alerts`)
 *   CampanaP1   → tabla `det_campaigns` de `infra/flink/jobs/p1_05_emision.sql`
 *   CampanaP2   → vista de `detection/patterns/p2_lateral_movement.sql` (oráculo en batch sobre ClickHouse)
 *
 * Los nombres de campo se dejan como en el pipeline (inglés y snake_case): son el contrato, no código del portal.
 * Todo texto que viene de estos tipos (reglas, procesos, usuarios, `matched_fields`) es ENTRADA HOSTIL: se pinta
 * siempre como texto.
 */

/** Tipos comunes de los datos documentados, para que la UI no importe nada de `simulado/` (ni siquiera tipos). */
export type { HoraDataset, NivelRegla, Resolucion } from './simulado/corpus'

/** Alerta Sigma tal como la emite el detector (`build_alert`). */
export interface Alerta {
  /** SHA-1 de `event_hash|rule_id`: determinista, permite deduplicar en destino. */
  alert_id: string
  event_hash: string
  /** Hora del evento (ms desde la época), no la de recogida. */
  time: number
  detected_at: number
  rule_id: string | null
  rule_title: string | null
  rule_level: 'informational' | 'low' | 'medium' | 'high' | 'critical'
  rule_status: string | null
  attack: {
    /** Técnicas ATT&CK de la regla (T1003.001…). Puede ir vacío: el 27,1 % de las alertas no lleva ninguna. */
    technique_ids: string[]
    /** Tácticas con su NOMBRE (credential-access…), nunca TAxxxx. */
    tactic_ids: string[]
  }
  device: { hostname: string | null }
  actor: { user_name: string | null; process_name: string | null }
  source_event: {
    class_uid: number | null
    type_uid: number | null
    type_name: string | null
    channel: string | null
    event_id: number | null
  }
  /** Condiciones que casaron (semilla de la explicabilidad); cada valor recortado a 300 caracteres. */
  matched_fields: Record<string, string>
  tfg: { dataset_id: string; detector: 'sigma-evaluator' }
}

/** Campaña P1 (robo de credenciales) emitida por Flink. `stages[]` sigue pendiente en el pipeline. */
export interface CampanaP1 {
  /** MD5 de `dataset|host|primer instante`. */
  campaign_id: string
  pattern_id: 'P1'
  dataset_id: string
  device_hostname: string
  first_seen: number
  last_seen: number
  duration_s: number
  /** Ojo: cuenta TRANSICIONES del patrón, no alertas. */
  n_transiciones: number
  trans_acceso_lsass: number
  trans_ejecucion_util: number
  trans_fichero: number
  trans_limpieza: number
  /** Confianza descompuesta: 0,40 base + 0,25 LSASS + 0,20 fichero + 0,10 herramienta + 0,15 limpieza (tope 1). */
  confidence: number
}

/** Campaña P2 (movimiento lateral) del oráculo en batch. */
export interface CampanaP2 {
  campaign_id: string
  pattern_id: 'P2'
  dataset: string
  host_origen: string
  host_destino: string
  first_seen: string
  last_seen: string
  duration_s: number
  devices: string[]
  users: string[]
  aristas: number
  puertos: number[]
  procesos_origen: string[]
  arista_confirmada_por_ambos_extremos: number
  alertas_absorbidas: number
  eventos_distintos: number
  ev_ejecucion_remota: number
  ev_servicio: number
  ev_credenciales: number
  evidencia_p2: number
  reglas_evidencia: string[]
  /** 0,30 arista + 0,15 bilateral + 0,10 proceso interactivo + 0,20 T1021 + 0,15 T1569.002 + 0,10 T1003 (tope 1). */
  confidence: number
}
