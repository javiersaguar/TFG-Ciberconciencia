/**
 * Las secciones del portal: ruta, título, descripción e icono. Es la única lista; la usan la barra lateral, las rutas
 * y las páginas «próximamente».
 *
 * `SECCIONES` son las que ya tienen página. `SECCIONES_FUTURAS` fijan desde la base la navegación final (ROADMAP
 * F8.3): cada una dice en qué fase se construye y qué enseñará, para que el menú no cambie de forma cuando lleguen.
 */
import { Grid3x3, LayoutDashboard, LineChart, Network, Radar, Siren, type LucideIcon } from 'lucide-react'

export interface Seccion {
  ruta: string
  titulo: string
  descripcion: string
  icono: LucideIcon
}

export interface SeccionFutura extends Seccion {
  /** Fase del ROADMAP en la que se construye. */
  fase: string
  /** Qué enseñará, en viñetas cortas. */
  contenido: string[]
  /** De dónde saldrán sus datos cuando exista la API. */
  origen: string
}

export const SECCIONES: readonly Seccion[] = [
  {
    ruta: '/',
    titulo: 'Situación',
    descripcion: 'Cifras del corpus, campañas detectadas y avance de las fases.',
    icono: LayoutDashboard,
  },
  {
    ruta: '/conciencia',
    titulo: 'Conciencia situacional',
    descripcion: 'Demo: qué parte de cada organización se ataca, hacia dónde va el atacante y qué hacer ya.',
    icono: Radar,
  },
  {
    ruta: '/grafo',
    titulo: 'Grafo del pipeline',
    descripcion: 'Por dónde pasan los datos: qué hace cada pieza, qué está construido y qué falta.',
    icono: Network,
  },
  {
    ruta: '/observabilidad',
    titulo: 'Observabilidad',
    descripcion: 'Los cuatro cuadros de Grafana: salud del pipeline, seguridad, calidad de datos y movimiento lateral.',
    icono: LineChart,
  },
]

export const SECCIONES_FUTURAS: readonly SeccionFutura[] = [
  {
    ruta: '/incidentes',
    titulo: 'Incidentes',
    descripcion: 'Cola de incidentes priorizados y su detalle.',
    icono: Siren,
    fase: 'F6 · F8.3',
    contenido: [
      'Cola de incidentes ordenada por la puntuación explicable del Pilar C.',
      'Detalle de incidente: línea de tiempo de la campaña, desglose de la puntuación y ruta de ataque.',
      'Cada puntuación con su «por qué» legible, factor a factor.',
    ],
    origen: 'det.campaigns + scoring (F6) a través de la API FastAPI (F6.3).',
  },
  {
    ruta: '/attack',
    titulo: 'Matriz ATT&CK',
    descripcion: 'Cobertura de técnicas: potencial, observada y detectada.',
    icono: Grid3x3,
    fase: 'F8.3',
    contenido: [
      'Matriz de tácticas y técnicas coloreada por cobertura.',
      'Potencial (reglas Sigma disponibles) frente a observada (reglas que dispararon).',
      'Enlace de cada técnica a sus alertas y campañas.',
    ],
    origen: 'eval/attack-coverage/*.json (F2) y tfg.alerts.',
  },
]

export const TODAS_LAS_SECCIONES: readonly Seccion[] = [...SECCIONES, ...SECCIONES_FUTURAS]

/** La sección a la que pertenece una ruta (`/grafo/…` → Grafo del pipeline); `undefined` si no es ninguna. */
export function seccionDe(pathname: string): Seccion | undefined {
  if (pathname === '/') return SECCIONES[0]
  return TODAS_LAS_SECCIONES.find((s) => s.ruta !== '/' && (pathname === s.ruta || pathname.startsWith(`${s.ruta}/`)))
}
