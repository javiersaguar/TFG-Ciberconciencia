/**
 * Incidentes a partir de las campañas documentadas (`CAMPANAS`, con sus notas) y de sus filas MEDIDAS en las
 * exportaciones de los oráculos (`p1-campanas.jsonl` y `p2-campanas.jsonl`, 21-10-2026): host, ventana, alertas,
 * evidencia por etapa y confianza de las 12. Hasta F6 un incidente es una campaña; no hay puntuación de prioridad
 * (el Pilar C no existe para datos reales, solo en la demo).
 */
import type { Incidente } from '../incidentes'
import { horaCorta, type CampanaP1Medida, type CampanaP2Medida } from '../exportaciones'
import { campanaMedida, factoresP1 } from './campanas'
import { BLOQUE_P1, CAMPANAS, DATASETS, P2, P2_DETALLE, REF, type HoraDataset } from './corpus'

const DAY1 = 'SDWIN-200501225525'

/** Inicios que abre un evento de Security o PowerShell (milisegundos a cero): hora reconstruida (BITÁCORA 15-09). */
const INICIO_RECONSTRUIDO = new Set(['p1-scranton-1', 'p1-scranton-2'])

const TECNICAS: Record<string, { tecnicas: string[]; nota?: string }> = {
  'p1-nashua': {
    tecnicas: ['T1003.001', 'T1059.001', 'T1021.006', 'T1070.003'],
    nota: 'Refuerzo de limpieza: dos alertas «RunMRU Registry Key Deletion» (T1070.003), documentadas el 31-07.',
  },
  'p2-scranton-nashua': { tecnicas: ['T1021.006', 'T1569.002', 'T1003.001'] },
  'p1-lsass_campaign_01': {
    tecnicas: [],
    nota: 'Ninguna alerta T1003.001: Meterpreter ejecuta Mimikatz dentro de su propio proceso, sin acceso externo a lsass.exe.',
  },
}

/** `2020-05-02 02:56:14.000` → hora del dataset con su resolución. */
function horaCampana(fecha: string, reconstruida: boolean): HoraDataset {
  const hora = fecha.slice(11)
  if (reconstruida) return { hora: hora.split('.')[0], resolucion: 'reconstruida' }
  return { hora, resolucion: hora.includes('.') ? 'ms' : 'segundo' }
}

export function construirIncidentes(medidasP1: readonly CampanaP1Medida[], p2: CampanaP2Medida): Incidente[] {
  return CAMPANAS.map((c) => {
    const esP2 = c.patron === 'P2'
    const day1 = c.dataset === DAY1
    const medida = esP2 ? undefined : campanaMedida(c, medidasP1)
    const evidencia = BLOQUE_P1.filter((a) => a.campana === c.id)
    const tecnicas = TECNICAS[c.id] ?? { tecnicas: day1 ? [...new Set(evidencia.flatMap((a) => a.tecnicas))] : ['T1003.001'] }
    const inicio = esP2 ? p2.inicio : medida?.inicio
    const fin = esP2 ? p2.fin : medida?.fin
    return {
      id: c.id,
      patron: c.patron,
      dataset: c.dataset,
      descripcionDataset: DATASETS.find((d) => d.id === c.dataset)?.descripcion ?? c.dataset,
      hosts: esP2 ? [p2.origen, p2.destino] : medida ? [medida.host] : c.hosts === '—' ? [] : [c.hosts],
      fecha: inicio ? inicio.slice(0, 10) : null,
      inicio: inicio ? horaCampana(inicio, INICIO_RECONSTRUIDO.has(c.id)) : null,
      fin: fin ? horaCampana(fin, false) : null,
      alertas: esP2 ? p2.alertas : (medida?.alertas ?? c.alertas),
      confianza: esP2 ? p2.confianza : (medida?.confianza ?? null),
      fuenteConfianza: esP2 ? REF.p2Campanas : medida ? REF.p1Campanas : undefined,
      factores: esP2 ? P2_DETALLE.confianza.map((f) => ({ ...f, presente: true })) : medida ? factoresP1(medida) : [],
      etapas: medida?.evidencia,
      tecnicas: tecnicas.tecnicas,
      notas: [c.nota, tecnicas.nota].filter((n): n is string => !!n),
      evidencia,
      aristasP2: esP2 ? P2.porPuerto.map((p) => ({ ...p, proceso: P2_DETALLE.procesoPorPuerto.find((x) => x.puerto === p.puerto)?.proceso ?? '—' })) : [],
      fuente: esP2 ? `${REF.p2Revalidado} · ${REF.p2Campanas}` : `${REF.p1Revalidado} · ${REF.p1Campanas}`,
      nodoGrafo: day1 ? `camp-${c.id}` : undefined,
      eventoCronologia: day1 ? (esP2 ? 'red-winrm' : evidencia[0]?.id) : undefined,
    }
  })
}

/** Para mostrar: `02:56:14 → 03:14:42` en apt29, o con fecha en los demás datasets. */
export const ventanaCorta = (inicio: string, fin: string) => `${horaCorta(inicio)} → ${horaCorta(fin)}`
