/**
 * Guion del modo presentación (ROADMAP F8.4, «modo demo»): ocho pasos que cuentan el TFG con el propio portal, del
 * problema a la evaluación. Lógica pura.
 *
 * Ninguna cifra está escrita a mano: todas salen de `corpus.ts` y de los resultados sincronizados de ML-1, igual que en
 * el resto del portal. `guion.test.ts` lo comprueba: cualquier número que aparezca en un texto tiene que poder
 * reconstruirse desde esas fuentes.
 */
import ml1 from '@/api/datos/ml1-resultados.json'
import { CORPUS, CRONOLOGIA_DAY1, DATASETS, DAY1, P2 } from '@/api/simulado/corpus'
import { formatearDecimal, formatearEntero, formatearPorcentaje } from '@/componentes/datos/formato'

export interface PasoPresentacion {
  id: string
  /** Ruta a la que lleva el paso (con su consulta, si la necesita). */
  ruta: string
  titulo: string
  texto: string
  /** Selector CSS del elemento a resaltar; si no está en la página, el paso se enseña sin resalte. */
  foco?: string
  /** Acción del shell al entrar en el paso. */
  accion?: 'abrir-copiloto'
}

/** Parámetro de la URL que activa la presentación y dice en qué paso está (1 … n). */
export const PARAMETRO = 'presentacion'

const duracion = (s: number) => `${Math.floor(s / 60)} min ${s % 60} s`
const aucDe = (prefijo: string) => ml1.resultados.find((r) => r.estrategia.startsWith(prefijo))?.auc_roc

export function pasosPresentacion(): PasoPresentacion[] {
  const dominante = DAY1.reglaDominante
  const variantesLsass = DATASETS.filter((d) => d.id.startsWith('LSASS_campaign')).length
  const impactoNashua = CRONOLOGIA_DAY1.find((c) => c.tactica === 'impact' && c.host === 'NASHUA')?.alertas
  const servicios = P2.porPuerto.map((p) => p.servicio).join(', ')
  return [
    {
      id: 'problema',
      ruta: '/',
      titulo: 'El problema: demasiadas alertas y ningún contexto',
      texto:
        `El ataque de APT29 del primer día genera ${formatearEntero(DAY1.alertas)} alertas en ${duracion(DAY1.duracionS)}. ` +
        `Una sola regla, «${dominante.titulo}», produce ${formatearEntero(dominante.alertas)} ` +
        `(${formatearPorcentaje((dominante.alertas / DAY1.alertas) * 100, 0)}) por una única acción del atacante. ` +
        'Nadie puede revisar esto alerta a alerta.',
      foco: 'section[aria-label="Actividad de APT29 day1 por minuto"]',
    },
    {
      id: 'tiempo',
      ruta: '/cronologia',
      titulo: 'El ataque en el tiempo',
      texto:
        'Un carril por host y una marca por alerta. Las bandas son las campañas que reconocen los patrones de ' +
        `correlación (CEP), y el salto lateral de SCRANTON a NASHUA empieza a las ${P2.primera.slice(0, 8)}.`,
      foco: 'section[aria-label="Carriles por host"]',
    },
    {
      id: 'grafo',
      ruta: '/ataque',
      titulo: 'Quién atacó a quién',
      texto:
        `Pulsa «Reproducir ataque»: ${formatearEntero(P2.aristas)} conexiones de SCRANTON a NASHUA (${servicios}). ` +
        'Cada relación dice su fundamento: observada en la telemetría, inferida por los patrones o hipótesis.',
      foco: '[role="group"][aria-label="Secuencia del ataque"]',
    },
    {
      id: 'incidentes',
      ruta: '/incidentes',
      titulo: 'De alertas a incidentes',
      texto:
        `${formatearEntero(CORPUS.alertas)} alertas se agrupan en ${formatearEntero(CORPUS.campanasP1 + CORPUS.campanasP2)} campañas: ` +
        `${formatearEntero(CORPUS.campanasP1)} de robo de credenciales (P1) y ${formatearEntero(CORPUS.campanasP2)} de movimiento lateral (P2). ` +
        `P1 encuentra las ${formatearEntero(variantesLsass)} variantes de volcado de LSASS, cada una hecha con una herramienta distinta.`,
      foco: '#contenido [data-contenedor-tabla]',
    },
    {
      id: 'respuesta',
      ruta: '/respuesta',
      titulo: 'Qué hacer, por qué y a qué coste',
      texto:
        'Un motor de reglas propone acciones por fase de respuesta (NIST SP 800-61) y por táctica defensiva (D3FEND), ' +
        'cada una con la evidencia que la justifica y su coste para el negocio. Propone; no ejecuta nada.',
      foco: 'section[aria-label="Recomendaciones"]',
    },
    {
      id: 'copiloto',
      ruta: '/incidentes',
      titulo: 'Preguntar a la evidencia',
      texto:
        'El Copiloto responde con una cita en cada afirmación y avisa de lo que conviene vigilar antes de que un patrón ' +
        `lo confirme, como las ${formatearEntero(impactoNashua)} alertas de impact en NASHUA previas al salto lateral.`,
      foco: '#panel-copiloto',
      accion: 'abrir-copiloto',
    },
    {
      id: 'evaluacion',
      ruta: '/evaluacion',
      titulo: 'Lo medido y lo que falta',
      texto:
        `El detector de anomalías llega a un AUC de ${formatearDecimal(aucDe('A:'), 3)}, pero un control con solo el volumen ` +
        `de eventos ya da ${formatearDecimal(aucDe('E:'), 3)}: buena parte de la señal es volumen. Los falsos positivos y ` +
        'la latencia de los patrones aún no están medidos; son la evaluación final.',
      foco: 'section[aria-labelledby="titulo-ml1"]',
    },
    {
      id: 'conciencia',
      ruta: '/conciencia?org=helios&t=62',
      titulo: 'Hacia dónde va',
      texto:
        'Así se verá la conciencia situacional con el grafo razonado y la priorización: el ataque avanza paso a paso, se ' +
        've la ruta probable hacia los activos críticos y la respuesta cambia su curso. Organización ficticia: es ilustrativo.',
      foco: '[role="region"][aria-label^="Grafo de "]',
    },
  ]
}

/** Paso pedido en la URL (1 … n), o `null` si no hay presentación o el valor no es válido. */
export function pasoDeUrl(valor: string | null, total: number): number | null {
  if (valor === null || !/^\d{1,2}$/.test(valor)) return null
  const n = Number(valor)
  return n >= 1 && n <= total ? n : null
}

/** La ruta del paso con el parámetro de la presentación añadido a su propia consulta. */
export function rutaDePaso(paso: PasoPresentacion, numero: number): string {
  const [camino, consulta = ''] = paso.ruta.split('?')
  const parametros = new URLSearchParams(consulta)
  parametros.set(PARAMETRO, String(numero))
  return `${camino}?${parametros.toString()}`
}
