/**
 * Modelo de la demo de conciencia cibersituacional: una organización (activos, zonas de red, áreas de negocio y
 * alcanzabilidad), un escenario de ataque (pasos en el tiempo) y las acciones de respuesta que se le pueden aplicar.
 *
 * Todo es declarativo: las organizaciones de `organizaciones/` son datos, y la simulación (`simulacion.ts`), el
 * razonamiento de rutas (`razonamiento.ts`) y el asistente (`asistente/`) son funciones puras sobre estos tipos.
 */
import type { Procedencia } from '@/api/observabilidad'

/** Tamaño de la tarjeta de un activo en el lienzo; `x` e `y` de cada activo son su centro. */
export const TARJETA = { ancho: 176, alto: 66 } as const

export type TipoActivo = 'atacante' | 'estacion' | 'servidor' | 'dc' | 'datos' | 'backup' | 'web' | 'vpn' | 'correo' | 'ot'

export interface Zona {
  id: string
  titulo: string
  /** Columna del lienzo (0 = izquierda). */
  columna: number
}

export interface Activo {
  id: string
  nombre: string
  tipo: TipoActivo
  zona: string
  /** Área de negocio a la que sirve: es lo que se enseña como «qué parte de la organización» se ataca. */
  area: string
  /** 1 (bajo) – 5 (vital para el negocio). */
  criticidad: number
  /** Joya de la corona: el objetivo que una organización no se puede permitir perder. */
  joya?: boolean
  ip?: string
  /** Posición del centro de la tarjeta en el lienzo. */
  x: number
  y: number
}

/** Alcanzabilidad de red: desde qué activo se puede llegar a cuál y por qué servicio. Es la materia prima del grafo de ataque. */
export interface Enlace {
  desde: string
  hasta: string
  servicio: string
}

export type Canal = 'correo' | 'c2' | 'salida'

export interface PasoAtaque {
  id: string
  /** Segundo de la demo (a velocidad ×1) en que ocurre. */
  t: number
  /** Hora del escenario, para la cronología. */
  hora: string
  desde: string
  hasta: string
  tactica: string
  tecnica: string
  titulo: string
  detalle: string
  /** Pasos que tienen que haber ocurrido antes; si alguno se bloqueó, este tampoco ocurre. */
  requiere?: string[]
  /** Cuenta que usa el atacante: bloquearla impide el paso. */
  cuenta?: string
  /** Canal que usa: bloquear el correo malicioso, el C2 o la salida lo impide. */
  canal?: Canal
  /**
   * ¿Deja el destino en manos del atacante? Por defecto sí; no en el reconocimiento contra un servidor, en el tráfico
   * de mando y control ni en la exfiltración (cuyo destino es el propio atacante).
   */
  compromete?: boolean
  /** Cuenta cuyas credenciales quedan expuestas con este paso (volcados de LSASS, DCSync…). */
  expone?: string
  /** Patrón CEP que lo reconoce (P1, P2…), si alguno. */
  patron?: string
  /** El paso cumple el objetivo del atacante (exfiltrar, cifrar…). */
  impacto?: string
  alertas?: number
  procedencia: Procedencia
  fuente?: string
}

export interface Organizacion {
  id: string
  nombre: string
  sector: string
  descripcion: string
  /** Procedencia del escenario en conjunto, para la tarjeta del selector. */
  procedenciaEscenario: string
  zonas: Zona[]
  activos: Activo[]
  enlaces: Enlace[]
  pasos: PasoAtaque[]
  /** Cuentas que existen en el escenario (para describir las acciones). */
  cuentas: Record<string, string>
  lienzo: { ancho: number; alto: number }
}

/** Qué hace una acción de respuesta sobre la simulación. `informativa` no cambia el curso del ataque. */
export type Efecto =
  | { tipo: 'aislar'; activo: string }
  | { tipo: 'proteger'; activo: string }
  | { tipo: 'bloquear-cuenta'; cuenta: string }
  | { tipo: 'bloquear-canal'; canal: Canal }
  | { tipo: 'informativa' }

export interface AccionAplicada {
  clave: string
  titulo: string
  efecto: Efecto
  /** Segundo de la demo en que se aplicó: solo afecta a los pasos posteriores. */
  t: number
}

/** Orden de las tácticas en la kill chain, para saber «cuánto ha avanzado» un ataque. */
export const ORDEN_TACTICAS = [
  'initial-access',
  'execution',
  'persistence',
  'privilege-escalation',
  'defense-evasion',
  'credential-access',
  'discovery',
  'lateral-movement',
  'collection',
  'command-and-control',
  'exfiltration',
  'impact',
] as const

export const NOMBRE_TACTICA: Record<string, string> = {
  'initial-access': 'Acceso inicial',
  execution: 'Ejecución',
  persistence: 'Persistencia',
  'privilege-escalation': 'Escalada de privilegios',
  'defense-evasion': 'Evasión de defensas',
  'credential-access': 'Robo de credenciales',
  discovery: 'Reconocimiento interno',
  'lateral-movement': 'Movimiento lateral',
  collection: 'Recolección',
  'command-and-control': 'Mando y control',
  exfiltration: 'Exfiltración',
  impact: 'Impacto',
}

export function porId<T extends { id: string }>(elementos: readonly T[]): Map<string, T> {
  return new Map(elementos.map((e) => [e.id, e]))
}
