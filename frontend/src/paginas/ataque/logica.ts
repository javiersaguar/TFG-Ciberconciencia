/**
 * Lógica pura del explorador del grafo de ataque: filtros, secuencia temporal y validación de los parámetros de la URL.
 * Sin React ni React Flow, para poder probarla entera (`logica.test.ts`).
 */
import type { AristaAtaque, Fundamento, GrafoAtaque, NodoAtaque, TipoRelacion } from '@/api/ataque'

export const RELACIONES: readonly TipoRelacion[] = ['conexion', 'cuenta', 'alerta', 'evidencia', 'dominio', 'hipotesis']
export const FUNDAMENTOS: readonly Fundamento[] = ['observado', 'inferido', 'hipotesis']

export const ETIQUETA_RELACION: Record<TipoRelacion, string> = {
  conexion: 'Conexión de red',
  cuenta: 'Cuenta que ejecuta',
  alerta: 'Proceso → alerta',
  evidencia: 'Evidencia de campaña',
  dominio: 'Tráfico de dominio (fondo)',
  hipotesis: 'Hipótesis',
}

export const ETIQUETA_FUNDAMENTO: Record<Fundamento, string> = { observado: 'Observado', inferido: 'Inferido', hipotesis: 'Hipótesis' }

export const DESCRIPCION_FUNDAMENTO: Record<Fundamento, string> = {
  observado: 'Telemetría directa: aristas de Sysmon EID 3 y alertas Sigma.',
  inferido: 'Correlación del sistema: campañas P1/P2 y su evidencia, con su confianza descompuesta.',
  hipotesis: 'Ruta probable, lecturas del escenario y extrapolaciones de la demo: nadie lo ha observado.',
}

export interface Filtros {
  /** Campaña elegida (id de `CAMPANAS`), o `null` para todas. */
  campana: string | null
  /** Hosts cortos (SCRANTON…); vacío = todos. */
  hosts: string[]
  relaciones: TipoRelacion[]
  fundamentos: Fundamento[]
}

export const FILTROS_INICIALES: Filtros = { campana: null, hosts: [], relaciones: [...RELACIONES], fundamentos: [...FUNDAMENTOS] }

/**
 * Lo que queda visible con unos filtros. Un nodo contenido (proceso, alerta) solo se ve si se ve su host; una arista,
 * si se ven sus dos extremos y pasa los filtros de relación, fundamento y campaña. Ocultar lo inferido oculta también
 * las campañas, que son inferencias.
 */
export function filtrarGrafo(grafo: GrafoAtaque, filtros: Filtros): { nodos: NodoAtaque[]; aristas: AristaAtaque[] } {
  const campana = filtros.campana ? grafo.nodos.find((n) => n.id === `camp-${filtros.campana}`) : undefined
  const pasaHost = (n: NodoAtaque) => filtros.hosts.length === 0 || n.hosts.some((h) => filtros.hosts.includes(h))
  const pasaCampana = (n: NodoAtaque) =>
    !filtros.campana || n.campanas.includes(filtros.campana) || (n.tipo === 'host' && !!campana?.hosts.some((h) => n.hosts.includes(h)))
  const pasaFundamento = (n: NodoAtaque) => n.tipo !== 'campana' || filtros.fundamentos.includes('inferido')

  const candidatos = grafo.nodos.filter((n) => pasaHost(n) && pasaCampana(n) && pasaFundamento(n))
  const ids = new Set(candidatos.map((n) => n.id))
  const nodos = candidatos.filter((n) => !n.padre || ids.has(n.padre))
  const visibles = new Set(nodos.map((n) => n.id))
  const aristas = grafo.aristas.filter(
    (a) =>
      filtros.relaciones.includes(a.relacion) &&
      filtros.fundamentos.includes(a.fundamento) &&
      (!filtros.campana || a.campanas.includes(filtros.campana)) &&
      visibles.has(a.origen) &&
      visibles.has(a.destino),
  )
  return { nodos, aristas }
}

/** Nodos y aristas alcanzados hasta el hito `indice` (incluido) de la secuencia temporal. */
export function recorridoHasta(grafo: GrafoAtaque, indice: number): { nodos: Set<string>; aristas: Set<string> } {
  const nodos = new Set<string>()
  const aristas = new Set<string>()
  for (const hito of grafo.hitos.slice(0, indice + 1)) {
    hito.nodos.forEach((id) => nodos.add(id))
    hito.aristas.forEach((id) => aristas.add(id))
  }
  return { nodos, aristas }
}

/** Alterna un valor en una lista (los conmutadores de filtro). */
export function alternar<T>(lista: readonly T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]
}

/** `?sel=`: solo se acepta el id de un nodo o arista que exista. Cualquier otra cosa se ignora. */
export function leerSeleccion(valor: string | null, grafo: GrafoAtaque): string | null {
  if (!valor) return null
  return grafo.nodos.some((n) => n.id === valor) || grafo.aristas.some((a) => a.id === valor) ? valor : null
}

/** `?campana=`: solo una campaña que esté en el grafo. */
export function leerCampana(valor: string | null, grafo: GrafoAtaque): string | null {
  if (!valor) return null
  return grafo.nodos.some((n) => n.tipo === 'campana' && n.id === `camp-${valor}`) ? valor : null
}

export function buscarElemento(grafo: GrafoAtaque, id: string | null): NodoAtaque | AristaAtaque | undefined {
  if (!id) return undefined
  return grafo.nodos.find((n) => n.id === id) ?? grafo.aristas.find((a) => a.id === id)
}

export function esArista(e: NodoAtaque | AristaAtaque): e is AristaAtaque {
  return 'origen' in e
}
