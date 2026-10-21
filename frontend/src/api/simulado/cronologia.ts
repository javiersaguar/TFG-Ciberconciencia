/**
 * Construye la línea temporal de APT29 day1 solo con lo documentado en `corpus.ts`. Las horas conservan su resolución:
 * la tabla por táctica del escenario §4 va al segundo (y con † las reconstruidas), las alertas del bloque de P1 y los
 * hitos de P2 llevan milisegundos.
 */
import type { EventoCronologia } from '../cronologia'
import { BLOQUE_P1, CAMPANAS, CRONOLOGIA_DAY1, P2, P2_DETALLE, REF } from './corpus'

const NODO_DE_ALERTA: Record<string, string> = {
  'al-0300-drop': 'alerta-al-0300-drop',
  'al-0300-drop-2': 'alerta-al-0300-drop',
  'al-0305-lsass': 'alerta-al-0305-lsass',
  'al-0309-remota': 'alerta-al-0309-remota',
  'al-0319-lsass': 'alerta-al-0319-lsass',
}

/** Horas de inicio de campaña que abre un evento con hora reconstruida (milisegundos a cero, BITÁCORA 15-09). */
const INICIO_RECONSTRUIDO = new Set(['p1-scranton-1', 'p1-scranton-2'])

export function construirCronologia(): EventoCronologia[] {
  const tacticas: EventoCronologia[] = CRONOLOGIA_DAY1.map((f) => ({
    id: `tac-${f.tactica}-${f.host.toLowerCase()}`,
    tipo: 'tactica',
    hora: { hora: f.primera.replace(' †', ''), resolucion: f.primera.includes('†') ? 'reconstruida' : 'segundo' },
    hosts: [f.host],
    titulo: `Primera alerta de ${f.tactica} en ${f.host}`,
    detalle: `${f.alertas} alertas de esa táctica en ${f.duracionMin.toLocaleString('es-ES')} min. Una alerta con varias tácticas cuenta en cada una.`,
    tacticas: [f.tactica],
    tecnicas: [],
    nivel: null,
    alertas: f.alertas,
    duracionMin: f.duracionMin,
    fuente: REF.ventanas,
    enGrafo: `host-${f.host.toLowerCase()}`,
  }))

  const alertas: EventoCronologia[] = BLOQUE_P1.map((a) => ({
    id: a.id,
    tipo: 'alerta',
    hora: a.hora,
    hosts: [a.host],
    titulo: a.veces > 1 ? `${a.regla} (×${a.veces})` : a.regla,
    detalle: a.nota,
    tacticas: a.tecnicas.some((t) => t.startsWith('T1003')) ? ['credential-access'] : [],
    tecnicas: a.tecnicas,
    nivel: a.nivel,
    alertas: a.veces,
    fuente: a.fuente,
    enGrafo: NODO_DE_ALERTA[a.id],
    incidente: a.campana,
  }))

  const red: EventoCronologia[] = [
    {
      id: 'red-winrm',
      tipo: 'red',
      hora: P2_DETALLE.conexionWinrm.hora,
      hosts: ['SCRANTON', 'NASHUA'],
      titulo: 'Conexión WinRM SCRANTON → NASHUA:5985 (powershell.exe, DMEVALS\\pbeesly)',
      detalle: 'Primera arista de P2 (Sysmon EID 3), confirmada desde los dos extremos.',
      tacticas: ['lateral-movement'],
      tecnicas: [],
      nivel: null,
      fuente: P2_DETALLE.conexionWinrm.fuente,
      enGrafo: 'e-winrm',
      incidente: 'p2-scranton-nashua',
    },
    {
      id: 'al-0309-wsm',
      tipo: 'alerta',
      hora: P2_DETALLE.wsmprovhost.hora,
      hosts: ['NASHUA'],
      titulo: P2_DETALLE.wsmprovhost.regla,
      detalle: P2_DETALLE.wsmprovhost.nota,
      tacticas: ['lateral-movement'],
      tecnicas: [...P2_DETALLE.wsmprovhost.tecnicas],
      nivel: P2_DETALLE.wsmprovhost.nivel,
      fuente: P2_DETALLE.wsmprovhost.fuente,
      enGrafo: 'proc-wsmprovhost',
      incidente: 'p2-scranton-nashua',
    },
    {
      id: 'red-ultima',
      tipo: 'red',
      hora: P2_DETALLE.ultimaArista.hora,
      hosts: ['SCRANTON', 'NASHUA'],
      titulo: `Última arista de P2 (${P2.aristas} en total: ${P2.porPuerto.map((p) => `${p.puerto} ×${p.conexiones}`).join(', ')})`,
      detalle: 'Las horas de las 17 aristas una a una no están documentadas; esta es la última.',
      tacticas: ['lateral-movement'],
      tecnicas: [],
      nivel: null,
      fuente: P2_DETALLE.ultimaArista.fuente,
      enGrafo: 'camp-p2-scranton-nashua',
      incidente: 'p2-scranton-nashua',
    },
  ]

  const campanas: EventoCronologia[] = CAMPANAS.filter((c) => c.dataset === 'SDWIN-200501225525' && c.patron === 'P1').flatMap((c) => {
    const eventos: EventoCronologia[] = []
    if (c.inicio) {
      eventos.push({
        id: `camp-ini-${c.id}`,
        tipo: 'campana',
        hora: { hora: c.inicio, resolucion: INICIO_RECONSTRUIDO.has(c.id) ? 'reconstruida' : 'segundo' },
        hosts: [c.hosts],
        titulo: `Empieza la campaña P1 de ${c.hosts}`,
        detalle: `${c.alertas} alertas absorbidas (ancla ± 10 min).${c.nota ? ` ${c.nota}.` : ''}`,
        tacticas: [],
        tecnicas: [],
        nivel: null,
        fuente: REF.p1Revalidado,
        enGrafo: `camp-${c.id}`,
        incidente: c.id,
      })
    }
    if (c.fin) {
      eventos.push({
        id: `camp-fin-${c.id}`,
        tipo: 'campana',
        hora: { hora: c.fin, resolucion: 'segundo' },
        hosts: [c.hosts],
        titulo: `Termina la campaña P1 de ${c.hosts}`,
        tacticas: [],
        tecnicas: [],
        nivel: null,
        fuente: REF.p1Revalidado,
        enGrafo: `camp-${c.id}`,
        incidente: c.id,
      })
    }
    return eventos
  })

  return [...tacticas, ...alertas, ...red, ...campanas]
}
