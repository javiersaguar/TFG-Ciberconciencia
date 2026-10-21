/**
 * Las secciones del portal: ruta, título, descripción, icono y grupo. Es la única lista; la usan la barra lateral, las
 * rutas y las páginas «próximamente».
 *
 * `SECCIONES` son las que ya tienen página, agrupadas por para qué sirven: investigar un ataque, ver cómo está la
 * plataforma y la demo. `SECCIONES_FUTURAS` fijan desde la base la navegación final (ROADMAP F8.3): cada una dice en
 * qué fase se construye y qué enseñará, para que el menú no cambie de forma cuando lleguen.
 */
import { BookOpenText, Clock3, Gauge, Grid3x3, LayoutDashboard, LifeBuoy, LineChart, MessagesSquare, Milestone, Network, Radar, Share2, Siren, type LucideIcon } from 'lucide-react'

export type GrupoSeccion = 'investigacion' | 'respuesta' | 'plataforma' | 'demo'

export const TITULO_GRUPO: Record<GrupoSeccion, string> = {
  investigacion: 'Investigación',
  respuesta: 'Respuesta',
  plataforma: 'Plataforma',
  demo: 'Demo',
}

export interface Seccion {
  ruta: string
  titulo: string
  descripcion: string
  icono: LucideIcon
  grupo?: GrupoSeccion
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
    grupo: 'investigacion',
  },
  {
    ruta: '/incidentes',
    titulo: 'Incidentes',
    descripcion: 'Las 12 campañas detectadas como incidentes: búsqueda, filtros, orden y su evidencia documentada.',
    icono: Siren,
    grupo: 'investigacion',
  },
  {
    ruta: '/ataque',
    titulo: 'Grafo de ataque',
    descripcion: 'APT29 day1 como grafo: hosts, cuentas, procesos, alertas y campañas, distinguiendo lo observado, lo inferido y las hipótesis.',
    icono: Share2,
    grupo: 'investigacion',
  },
  {
    ruta: '/cronologia',
    titulo: 'Línea temporal',
    descripcion: 'APT29 day1 en orden, con la resolución real de cada hora: filtros por táctica, host, nivel y tipo.',
    icono: Clock3,
    grupo: 'investigacion',
  },
  {
    ruta: '/attack',
    titulo: 'Matriz ATT&CK',
    descripcion: 'Cobertura de técnicas con las capas Navigator reales: potencial (reglas Sigma) frente a observada (alertas).',
    icono: Grid3x3,
    grupo: 'investigacion',
  },
  {
    ruta: '/respuesta',
    titulo: 'Asistente de respuesta',
    descripcion: 'Qué hacer ante cada incidente, por qué y a qué coste. Propone; no ejecuta nada.',
    icono: LifeBuoy,
    grupo: 'respuesta',
  },
  {
    ruta: '/copiloto',
    titulo: 'Copiloto',
    descripcion: 'Preguntas sobre la evidencia de una organización, con una cita en cada afirmación. No ejecuta nada.',
    icono: MessagesSquare,
    grupo: 'respuesta',
  },
  {
    ruta: '/evaluacion',
    titulo: 'Evaluación',
    descripcion: 'Solo lo medido: ML-1 con sus controles, P1, la línea base, la cobertura y el rendimiento; lo pendiente de F7, sin números.',
    icono: Gauge,
    grupo: 'plataforma',
  },
  {
    ruta: '/grafo',
    titulo: 'Grafo del pipeline',
    descripcion: 'Por dónde pasan los datos: qué hace cada pieza, qué está construido y qué falta.',
    icono: Network,
    grupo: 'plataforma',
  },
  {
    ruta: '/observabilidad',
    titulo: 'Observabilidad',
    descripcion: 'Los cuatro cuadros de Grafana: salud del pipeline, seguridad, calidad de datos y movimiento lateral.',
    icono: LineChart,
    grupo: 'plataforma',
  },
  {
    ruta: '/proyecto',
    titulo: 'Proyecto',
    descripcion: 'Avance de las fases del TFG y estado documentado del pipeline.',
    icono: Milestone,
    grupo: 'plataforma',
  },
  {
    ruta: '/conciencia',
    titulo: 'Conciencia situacional',
    descripcion: 'Demo: qué parte de cada organización se ataca, hacia dónde va el atacante y qué hacer ya.',
    icono: Radar,
    grupo: 'demo',
  },
]

export const SECCIONES_FUTURAS: readonly SeccionFutura[] = [
  {
    ruta: '/inteligencia',
    titulo: 'Inteligencia de amenazas',
    descripcion: 'Actores, campañas e indicadores en STIX 2.1, y técnicas extraídas de informes.',
    icono: BookOpenText,
    fase: 'F4 · F8.3',
    contenido: [
      'ATT&CK y feeds de indicadores cargados en OpenCTI (o directamente en Neo4j, plan B).',
      'Técnicas extraídas de informes en lenguaje natural con un modelo afinado (ML-2).',
      'Cruce de cada campaña con los actores que usan sus técnicas.',
    ],
    origen: 'OpenCTI (STIX 2.1) a través de la API FastAPI (F6.3).',
  },
]

export const TODAS_LAS_SECCIONES: readonly Seccion[] = [...SECCIONES, ...SECCIONES_FUTURAS]

/** La sección a la que pertenece una ruta (`/grafo/…` → Grafo del pipeline); `undefined` si no es ninguna. */
export function seccionDe(pathname: string): Seccion | undefined {
  if (pathname === '/') return SECCIONES[0]
  return TODAS_LAS_SECCIONES.find((s) => s.ruta !== '/' && (pathname === s.ruta || pathname.startsWith(`${s.ruta}/`)))
}
