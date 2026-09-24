/**
 * Los cuatro cuadros de `infra/grafana/dashboards`, con la misma estructura (filas, paneles, rejilla de 24 columnas)
 * y datos simulados. Cada panel declara su procedencia:
 *
 *   - `documentada`: la cifra sale de `corpus.ts` (medida y escrita en la bitácora o en el repo);
 *   - `ilustrativa`: métricas de Prometheus (tráfico, memoria, CPU…) que no se han guardado nunca, generadas con
 *     azar determinista para que la gráfica tenga forma y se mueva al refrescar.
 *
 * Donde el cuadro de Grafana consulta algo que el corpus documentado no da (p. ej. «Hosts monitorizados»), el panel
 * se sustituye por uno equivalente que sí está documentado en vez de inventar la cifra. Esas sustituciones son
 * provisionales: con la API, cada panel volverá a ser el de Grafana, con su consulta.
 */
import { formatearEntero, formatearPorcentaje } from '@/componentes/datos/formato'

import type { Cuadro, PanelCuadro, ResumenCuadro } from '../observabilidad'
import { serieIlustrativa } from './aleatorio'
import { CAMPANAS, CORPUS, CRONOLOGIA_DAY1, DATASETS, DAY1, DLQ_POR_TIPO, FLINK, MAPA_IP, P2, REF, TOPICS } from './corpus'

export const RESUMENES: readonly ResumenCuadro[] = [
  { uid: 'tfg-pipeline-health', titulo: 'Salud del pipeline', periodo: '30m' },
  { uid: 'tfg-security-overview', titulo: 'Panel de seguridad', periodo: 'corpus F3' },
  { uid: 'tfg-data-quality', titulo: 'Cobertura y calidad', periodo: 'corpus F3' },
  { uid: 'tfg-lateral-movement', titulo: 'Movimiento lateral', periodo: 'apt29 day1' },
]

export function listarCuadros(): ResumenCuadro[] {
  return [...RESUMENES]
}

// --- Piezas ------------------------------------------------------------------------------------------------------

type Base = Pick<PanelCuadro, 'id' | 'titulo' | 'x' | 'y' | 'ancho' | 'alto'>
type Extra = Partial<Omit<PanelCuadro, keyof Base | 'tipo'>>

function panel(tipo: PanelCuadro['tipo'], base: Base, extra: Extra = {}): PanelCuadro {
  return { tipo, descripcion: '', unidad: 'short', color: null, umbrales: [], ...base, ...extra }
}

const fila = (id: number, titulo: string, y: number) => panel('fila', { id, titulo, x: 0, y, ancho: 24, alto: 1 })

const documentada = (fuente: string): Extra => ({ procedencia: 'documentada', fuente })
const ILUSTRATIVA: Extra = { procedencia: 'ilustrativa' }

/** Serie ilustrativa de los últimos 30 min, un punto cada 30 s, que avanza con el reloj. */
function ultimaMediaHora(ahora: number, semilla: string, base: number, onda: number, ruido: number) {
  return serieIlustrativa({ semilla, hasta: ahora / 1000, paso: 30, puntos: 61, base, onda, ruido })
}

// --- 1 · Salud del pipeline -----------------------------------------------------------------------------------------

function saludPipeline(ahora: number): PanelCuadro[] {
  const s = (semilla: string, base: number, onda: number, ruido: number) => ultimaMediaHora(ahora, `salud|${semilla}`, base, onda, ruido)
  const heap = s('heap', 612e6, 110e6, 14e6)
  return [
    fila(1, 'Bus de eventos (Redpanda)', 0),
    panel('stat', { id: 2, titulo: 'Particiones', x: 0, y: 1, ancho: 6, alto: 4 }, {
      descripcion: 'Particiones de los seis topics del pipeline.',
      valores: [{ nombre: 'particiones', valor: TOPICS.reduce((t, x) => t + x.particiones, 0) }],
      ...documentada(REF.topics),
    }),
    panel('stat', { id: 3, titulo: 'Topics', x: 6, y: 1, ancho: 6, alto: 4 }, {
      descripcion: 'raw → norm → det, más las dos colas de mensajes no procesables (dlq.*).',
      valores: [{ nombre: 'topics', valor: TOPICS.length }],
      ...documentada(REF.topics),
    }),
    panel('serie', { id: 4, titulo: 'Tráfico Kafka (bytes/s)', x: 12, y: 1, ancho: 12, alto: 9 }, {
      descripcion: 'Bytes por segundo de las peticiones de producción y de lectura.',
      unidad: 'Bps',
      series: [
        { nombre: 'produce', puntos: s('produce', 180e3, 70e3, 12e3) },
        { nombre: 'fetch', puntos: s('fetch', 260e3, 90e3, 15e3) },
      ],
      ...ILUSTRATIVA,
    }),
    panel('barras', { id: 5, titulo: 'Mensajes publicados por topic', x: 0, y: 5, ancho: 12, alto: 5 }, {
      descripcion: 'Offset final de cada topic tras cargar el corpus completo (11-09 y 14-09).',
      valores: TOPICS.filter((t) => t.mensajes != null).map((t) => ({ nombre: t.nombre, valor: t.mensajes })),
      ...documentada(`${REF.recarga} · ${REF.alertas741}`),
    }),

    fila(6, 'Procesado (Apache Flink)', 10),
    panel('stat', { id: 7, titulo: 'TaskManagers', x: 0, y: 11, ancho: 4, alto: 4 }, {
      valores: [{ nombre: 'taskmanagers', valor: FLINK.taskManagers }],
      ...documentada(REF.flink),
    }),
    panel('stat', { id: 8, titulo: 'Slots totales', x: 4, y: 11, ancho: 4, alto: 4 }, {
      descripcion: `taskmanager.numberOfTaskSlots = ${FLINK.slots}.`,
      valores: [{ nombre: 'slots', valor: FLINK.slots }],
      ...documentada(REF.flink),
    }),
    panel('stat', { id: 9, titulo: 'Jobs en ejecución', x: 8, y: 11, ancho: 4, alto: 4 }, {
      valores: [{ nombre: 'jobs', valor: 1 }],
      umbrales: [{ color: 'orange', desde: null }, { color: 'green', desde: 1 }],
      ...ILUSTRATIVA,
    }),
    panel('serie', { id: 10, titulo: 'Memoria heap de Flink', x: 12, y: 11, ancho: 12, alto: 10 }, {
      unidad: 'bytes',
      series: [{ nombre: 'heap usado', puntos: heap }],
      ...ILUSTRATIVA,
    }),
    panel('serie', { id: 11, titulo: 'CPU de Flink', x: 0, y: 15, ancho: 12, alto: 6 }, {
      unidad: 'percentunit',
      series: [{ nombre: 'jobmanager', puntos: s('cpu', 0.18, 0.08, 0.015) }],
      ...ILUSTRATIVA,
    }),

    fila(12, 'Almacén analítico (ClickHouse)', 21),
    panel('serie', { id: 13, titulo: 'Consultas por segundo', x: 0, y: 22, ancho: 12, alto: 7 }, {
      unidad: 'reqps',
      series: [{ nombre: 'consultas', puntos: s('qps', 2.4, 1.1, 0.25) }],
      ...ILUSTRATIVA,
    }),
    panel('serie', { id: 14, titulo: 'Memoria de ClickHouse', x: 12, y: 22, ancho: 12, alto: 7 }, {
      unidad: 'bytes',
      series: [{ nombre: 'residente', puntos: s('chmem', 1.9e9, 0.25e9, 0.03e9) }],
      ...ILUSTRATIVA,
    }),
  ]
}

// --- 2 · Panel de seguridad -----------------------------------------------------------------------------------------

function panelSeguridad(): PanelCuadro[] {
  return [
    fila(1, 'Resumen', 0),
    panel('stat', { id: 2, titulo: 'Eventos normalizados', x: 0, y: 1, ancho: 5, alto: 4 }, {
      descripcion: 'tfg.events con FINAL tras la recarga verificada contra el origen.',
      valores: [{ nombre: 'eventos', valor: CORPUS.eventosNormalizados }],
      ...documentada(REF.recarga),
    }),
    panel('stat', { id: 3, titulo: 'Alertas', x: 5, y: 1, ancho: 5, alto: 4 }, {
      descripcion: 'tfg.alerts con FINAL: alert_id determinista, sin duplicados.',
      valores: [{ nombre: 'alertas', valor: CORPUS.alertas }],
      ...documentada(REF.alertas741),
    }),
    panel('stat', { id: 4, titulo: 'Campañas P1', x: 10, y: 1, ancho: 4, alto: 4 }, {
      descripcion: 'Robo de credenciales: 7 de 7 variantes de LSASS_campaign, más SCRANTON ×2, NASHUA y el atómico.',
      valores: [{ nombre: 'campañas', valor: CORPUS.campanasP1 }],
      ...documentada(REF.p1Revalidado),
    }),
    panel('stat', { id: 5, titulo: 'Campañas P2', x: 14, y: 1, ancho: 4, alto: 4 }, {
      descripcion: 'Movimiento lateral: SCRANTON → NASHUA.',
      valores: [{ nombre: 'campañas', valor: CORPUS.campanasP2 }],
      ...documentada(REF.p2Revalidado),
    }),
    panel('stat', { id: 6, titulo: 'Reducción de alertas', x: 18, y: 1, ancho: 6, alto: 4 }, {
      descripcion: 'La métrica estrella: 1 − campañas / alertas individuales, contando alertas distintas.',
      unidad: 'percent',
      valores: [{ nombre: 'reducción', valor: CORPUS.ratioReduccion * 100 }],
      umbrales: [{ color: 'orange', desde: null }, { color: 'green', desde: 90 }],
      ...documentada(REF.p1Revalidado),
    }),

    fila(7, 'Alertas y campañas', 5),
    panel('barras', { id: 8, titulo: 'Alertas por dataset', x: 0, y: 6, ancho: 10, alto: 10 }, {
      valores: DATASETS.map((d) => ({ nombre: d.id, valor: d.alertas })),
      ...documentada(REF.alertas741),
    }),
    panel('tabla', { id: 9, titulo: 'Cronología de apt29 day1 por táctica', x: 10, y: 6, ancho: 14, alto: 10 }, {
      descripcion: 'Primera alerta por táctica y host, con la hora del evento. † = hora reconstruida con resolución de segundo.',
      tabla: {
        columnas: [
          { clave: 'primera', titulo: 'Primera' },
          { clave: 'tactica', titulo: 'Táctica' },
          { clave: 'host', titulo: 'Host' },
          { clave: 'alertas', titulo: 'Alertas', unidad: 'short' },
          { clave: 'duracionMin', titulo: 'Duración (min)', unidad: 'decimal1' },
        ],
        filas: CRONOLOGIA_DAY1.map((f) => ({ ...f })),
      },
      ...documentada(REF.ventanas),
    }),

    fila(10, 'Movimiento lateral y etiquetado', 16),
    panel('tarta', { id: 11, titulo: 'Alertas con etiqueta ATT&CK', x: 0, y: 17, ancho: 8, alto: 8 }, {
      descripcion: 'Una alerta sin etiqueta es invisible para P1 y P2 por construcción (medido sobre 1.168 alertas).',
      unidad: 'percent',
      valores: [
        { nombre: 'Con etiqueta', valor: 100 - CORPUS.alertasSinEtiquetaPct },
        { nombre: 'Sin etiqueta', valor: CORPUS.alertasSinEtiquetaPct },
      ],
      ...documentada(REF.p2),
    }),
    panel('barras', { id: 12, titulo: 'Aristas de P2 por servicio', x: 8, y: 17, ancho: 8, alto: 8 }, {
      valores: P2.porPuerto.map((p) => ({ nombre: `${p.servicio} · ${p.puerto}`, valor: p.conexiones })),
      ...documentada(REF.p2),
    }),
    panel('barras', { id: 13, titulo: 'Evidencia de P2 en el destino', x: 16, y: 17, ancho: 8, alto: 8 }, {
      descripcion: 'Las clases no son disjuntas: 4 + 4 + 1 = 9 sobre 8 alertas distintas.',
      valores: P2.evidencia.map((e) => ({ nombre: e.clase, valor: e.alertas })),
      ...documentada(REF.p2),
    }),
  ]
}

// --- 3 · Cobertura y calidad de datos -------------------------------------------------------------------------------

function calidadDatos(): PanelCuadro[] {
  const campanasPorDataset = new Map<string, number>()
  for (const c of CAMPANAS) campanasPorDataset.set(c.dataset, (campanasPorDataset.get(c.dataset) ?? 0) + 1)
  return [
    fila(1, 'Cobertura de normalización', 0),
    panel('indicador', { id: 2, titulo: 'Cobertura OCSF de apt29 day1', x: 0, y: 1, ancho: 6, alto: 8 }, {
      descripcion: `${formatearEntero(DAY1.eventos)} de ${formatearEntero(DAY1.lineas)} eventos normalizados; el resto es cola larga de tipos sin mapear.`,
      unidad: 'percent',
      valores: [{ nombre: 'cobertura', valor: DAY1.coberturaPct }],
      umbrales: [{ color: 'red', desde: null }, { color: 'orange', desde: 90 }, { color: 'green', desde: 97 }],
      ...documentada(REF.tiempo),
    }),
    panel('stat', { id: 3, titulo: 'Líneas consumidas', x: 6, y: 1, ancho: 6, alto: 4 }, {
      valores: [{ nombre: 'líneas', valor: CORPUS.lineasConsumidas }],
      ...documentada(REF.tiempo),
    }),
    panel('stat', { id: 4, titulo: 'Eventos normalizados', x: 12, y: 1, ancho: 6, alto: 4 }, {
      valores: [{ nombre: 'eventos', valor: CORPUS.eventosNormalizados }],
      ...documentada(REF.recarga),
    }),
    panel('stat', { id: 5, titulo: 'A la DLQ', x: 18, y: 1, ancho: 6, alto: 4 }, {
      descripcion: 'Nada se descarta en silencio: cada evento no procesable va a dlq.normalize con su motivo.',
      valores: [{ nombre: 'dlq', valor: CORPUS.eventosDlq }],
      color: 'orange',
      ...documentada(REF.tiempo),
    }),
    panel('stat', { id: 6, titulo: 'Cobertura del corpus', x: 6, y: 5, ancho: 6, alto: 4 }, {
      descripcion: 'Por debajo del 99,4 % de day1 porque incluye las campañas LSASS, que traen PowerShell operacional.',
      unidad: 'percent',
      valores: [{ nombre: 'cobertura', valor: (CORPUS.eventosNormalizados / CORPUS.lineasConsumidas) * 100 }],
      ...documentada(REF.tiempo),
    }),
    panel('stat', { id: 7, titulo: 'Excepciones del normalizador', x: 12, y: 5, ancho: 6, alto: 4 }, {
      descripcion: 'Los 20.093 de la DLQ son UnmappedEvent: tipos sin mapeador, no fallos.',
      valores: [{ nombre: 'excepciones', valor: CORPUS.excepcionesNormalizador }],
      umbrales: [{ color: 'green', desde: null }, { color: 'red', desde: 1 }],
      ...documentada(REF.tiempo),
    }),
    panel('stat', { id: 8, titulo: 'Ternas de identidad repetidas', x: 18, y: 5, ancho: 6, alto: 4 }, {
      descripcion: '(host, canal, record_number) sobre day1: 194.829 eventos, 194.829 ternas distintas.',
      valores: [{ nombre: 'repetidas', valor: 0 }],
      umbrales: [{ color: 'green', desde: null }, { color: 'red', desde: 1 }],
      ...documentada(REF.identidad),
    }),

    fila(9, 'Datasets y origen del tiempo', 9),
    panel('tabla', { id: 10, titulo: 'Datasets del corpus F3', x: 0, y: 10, ancho: 14, alto: 10 }, {
      descripcion: 'Los eventos de cada campaña LSASS no están repartidos en la bitácora: suman 335.388.',
      tabla: {
        columnas: [
          { clave: 'id', titulo: 'Dataset' },
          { clave: 'descripcion', titulo: 'Contenido' },
          { clave: 'eventos', titulo: 'Eventos', unidad: 'short' },
          { clave: 'alertas', titulo: 'Alertas', unidad: 'short' },
          { clave: 'campanas', titulo: 'Campañas', unidad: 'short' },
        ],
        filas: DATASETS.map((d) => ({ ...d, campanas: campanasPorDataset.get(d.id) ?? 0 })),
      },
      ...documentada(`${REF.recarga} · ${REF.alertas741}`),
    }),
    panel('tabla', { id: 11, titulo: 'Cadena de origen del tiempo', x: 14, y: 10, ancho: 10, alto: 10 }, {
      descripcion: 'Por fiabilidad decreciente y medida. apt29 no trae TimeCreated; las campañas LSASS sí.',
      tabla: {
        columnas: [
          { clave: 'eslabon', titulo: 'Eslabón' },
          { clave: 'uso', titulo: 'Dónde se usa' },
          { clave: 'resolucion', titulo: 'Resolución' },
        ],
        filas: [
          { eslabon: '1 · TimeCreated', uso: 'LSASS_campaign y atómico', resolucion: 'ms' },
          { eslabon: '2 · UtcTime', uso: `apt29, Sysmon (${formatearPorcentaje(DAY1.tiempoUtcTimePct)})`, resolucion: 'ms' },
          { eslabon: '3 · EventTime + desfase', uso: `apt29, Security y PowerShell (${formatearPorcentaje(DAY1.tiempoEventTimePct)})`, resolucion: '1 s' },
          { eslabon: '4 · @timestamp', uso: 'Último recurso, marcado', resolucion: 'hora de recogida' },
        ],
      },
      ...documentada(REF.tiempo),
    }),

    fila(12, 'Lo que falta por mapear', 20),
    panel('barras', { id: 13, titulo: 'Eventos a la DLQ por tipo', x: 0, y: 21, ancho: 14, alto: 8 }, {
      descripcion: 'La lista de trabajo para ampliar el normalizador.',
      valores: DLQ_POR_TIPO.map((t) => ({ nombre: t.tipo, valor: t.eventos })),
      ...documentada(REF.tiempo),
    }),
    panel('tarta', { id: 14, titulo: 'Origen de la hora en apt29 day1', x: 14, y: 21, ancho: 10, alto: 8 }, {
      unidad: 'percent',
      valores: [
        { nombre: 'UtcTime (ms)', valor: DAY1.tiempoUtcTimePct },
        { nombre: 'EventTime + desfase (1 s)', valor: DAY1.tiempoEventTimePct },
      ],
      ...documentada(REF.tiempo),
    }),
  ]
}

// --- 4 · Movimiento lateral -----------------------------------------------------------------------------------------

function movimientoLateral(): PanelCuadro[] {
  const ip = new Map(MAPA_IP.map((h) => [h.host, h.ip]))
  const puertos = P2.porPuerto.map((p) => `${p.puerto}×${p.conexiones}`).join(' · ')
  return [
    fila(1, 'Resumen de la red observada', 0),
    panel('stat', { id: 2, titulo: 'Conexiones de red (Sysmon 3)', x: 0, y: 1, ancho: 6, alto: 4 }, {
      valores: [{ nombre: 'conexiones', valor: DAY1.conexionesSysmon3 }],
      ...documentada(REF.p2),
    }),
    panel('stat', { id: 3, titulo: 'Hosts identificados por IP', x: 6, y: 1, ancho: 6, alto: 4 }, {
      valores: [{ nombre: 'hosts', valor: MAPA_IP.length }],
      ...documentada(REF.p2),
    }),
    panel('stat', { id: 4, titulo: 'Conexiones de admin. remota', x: 12, y: 1, ancho: 6, alto: 4 }, {
      descripcion: 'Tras excluir loopback y link-local del mapa IP → host.',
      valores: [{ nombre: 'conexiones', valor: P2.conexionesLaterales }],
      ...documentada(REF.recarga),
    }),
    panel('stat', { id: 5, titulo: 'Aristas de ataque (P2)', x: 18, y: 1, ancho: 6, alto: 4 }, {
      valores: [{ nombre: 'aristas', valor: P2.aristas }],
      color: 'red',
      ...documentada(REF.p2Revalidado),
    }),

    fila(6, 'Grafo de movimiento lateral', 5),
    panel('grafo', { id: 7, titulo: 'Quién se conecta con quién (puertos de administración remota)', x: 0, y: 6, ancho: 24, alto: 11 }, {
      descripcion:
        `Campaña P2: ${P2.primera} → ${P2.ultima} (${P2.duracionS} s), confianza ${P2.confianza}. ` +
        `Las ${P2.conexionesLaterales - P2.aristas} conexiones restantes son con el controlador de dominio; ` +
        'la bitácora no documenta su reparto por host, así que esas aristas van sin cifra.',
      grafo: {
        nodos: [
          { id: 'SCRANTON', titulo: 'SCRANTON', subtitulo: ip.get('SCRANTON'), rol: 'origen' },
          { id: 'NASHUA', titulo: 'NASHUA', subtitulo: ip.get('NASHUA'), rol: 'destino' },
          { id: 'NEWYORK', titulo: 'NEWYORK', subtitulo: `${ip.get('NEWYORK')} · DC`, rol: 'dc' },
          { id: 'UTICA', titulo: 'UTICA', subtitulo: ip.get('UTICA'), rol: 'otro' },
        ],
        aristas: [
          { desde: 'SCRANTON', hasta: 'NASHUA', etiqueta: `${P2.aristas} conexiones · ${puertos}`, tipo: 'ataque' },
          { desde: 'SCRANTON', hasta: 'NEWYORK', etiqueta: 'DC', tipo: 'contexto' },
          { desde: 'NASHUA', hasta: 'NEWYORK', etiqueta: 'DC', tipo: 'contexto' },
          { desde: 'UTICA', hasta: 'NEWYORK', etiqueta: 'DC', tipo: 'contexto' },
        ],
      },
      ...documentada(`${REF.p2} · ${REF.p2Revalidado}`),
    }),

    fila(8, 'Detalle de las aristas', 17),
    panel('tabla', { id: 9, titulo: 'Aristas de P2 por servicio', x: 0, y: 18, ancho: 12, alto: 7 }, {
      descripcion: `Procesos: ${P2.procesos.join(', ')}. Usuario: ${P2.usuario}.`,
      tabla: {
        columnas: [
          { clave: 'servicio', titulo: 'Servicio' },
          { clave: 'puerto', titulo: 'Puerto' },
          { clave: 'conexiones', titulo: 'Conexiones', unidad: 'short' },
        ],
        filas: P2.porPuerto.map((p) => ({ ...p })),
      },
      ...documentada(REF.p2),
    }),
    panel('tabla', { id: 10, titulo: 'Mapa IP → host, derivado de los datos', x: 12, y: 18, ancho: 12, alto: 7 }, {
      descripcion: 'Votos de las conexiones salientes: si yo inicié la conexión, el origen soy yo. Sin rivales.',
      tabla: {
        columnas: [
          { clave: 'host', titulo: 'Host' },
          { clave: 'ip', titulo: 'IP' },
          { clave: 'rol', titulo: 'Papel' },
          { clave: 'votos', titulo: 'Votos', unidad: 'short' },
        ],
        filas: MAPA_IP.map((h) => ({ ...h })),
      },
      ...documentada(`${REF.p2} · ${REF.escenario}`),
    }),
  ]
}

// --- Montaje ---------------------------------------------------------------------------------------------------

const CONSTRUCTORES: Record<string, (ahora: number) => PanelCuadro[]> = {
  'tfg-pipeline-health': saludPipeline,
  'tfg-security-overview': panelSeguridad,
  'tfg-data-quality': calidadDatos,
  'tfg-lateral-movement': movimientoLateral,
}

export function construirCuadro(uid: string, ahora: number): Cuadro {
  const resumen = RESUMENES.find((r) => r.uid === uid)
  const constructor = CONSTRUCTORES[uid]
  if (!resumen || !constructor) throw new Error(`No existe el cuadro «${uid}»`)
  return { ...resumen, actualizado: Math.floor(ahora / 1000), disponible: true, paneles: constructor(ahora) }
}
