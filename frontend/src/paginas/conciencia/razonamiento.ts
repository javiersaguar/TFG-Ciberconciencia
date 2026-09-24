/**
 * Razonamiento sobre el grafo de la organización (anticipo del Pilar B): hacia dónde puede ir el atacante desde lo que
 * ya controla. Lógica pura.
 *
 * Aquí es una búsqueda en anchura sobre la alcanzabilidad de red (`enlaces`), que salta los activos aislados o
 * protegidos. En F5 lo hará Datalog al estilo MulVAL sobre Soufflé, con vulnerabilidades, privilegios y reglas de
 * interacción, y cada paso de la ruta vendrá con la regla y los hechos que lo justifican. La interfaz que consume
 * este módulo (`RutaProbable`) no tendrá que cambiar.
 */
import { porId, type Organizacion } from './modelo'
import { comprometidosActivos, type Evaluacion } from './simulacion'

export interface RutaProbable {
  /** Activos de la ruta, desde el comprometido de partida hasta la joya. */
  camino: string[]
  joya: string
  saltos: number
}

function transitable(ev: Evaluacion, id: string): boolean {
  const estado = ev.estado.get(id)
  return estado !== 'aislado' && estado !== 'protegido'
}

/**
 * La ruta más corta desde cualquier activo comprometido (y no aislado) hasta una joya de la corona que aún no esté
 * comprometida. A igual número de saltos gana la joya más crítica. `null` si no hay atacante dentro o si todas las
 * joyas están fuera de alcance.
 */
export function rutaProbable(org: Organizacion, ev: Evaluacion): RutaProbable | null {
  const origenes = comprometidosActivos(ev)
  if (origenes.length === 0) return null
  const activos = porId(org.activos)
  const vecinos = new Map<string, string[]>()
  for (const enlace of org.enlaces) vecinos.set(enlace.desde, [...(vecinos.get(enlace.desde) ?? []), enlace.hasta])

  const previo = new Map<string, string | null>(origenes.map((id) => [id, null]))
  let frontera = origenes
  const candidatas: string[] = []
  while (frontera.length && candidatas.length === 0) {
    const siguiente: string[] = []
    for (const actual of frontera) {
      for (const vecino of vecinos.get(actual) ?? []) {
        if (previo.has(vecino) || vecino === 'atacante' || !transitable(ev, vecino)) continue
        previo.set(vecino, actual)
        if (activos.get(vecino)?.joya && !ev.comprometidos.has(vecino)) candidatas.push(vecino)
        siguiente.push(vecino)
      }
    }
    frontera = siguiente
  }
  if (candidatas.length === 0) return null

  const joya = [...candidatas].sort((a, b) => (activos.get(b)?.criticidad ?? 0) - (activos.get(a)?.criticidad ?? 0))[0]
  const camino = [joya]
  for (let paso = previo.get(joya); paso != null; paso = previo.get(paso)) camino.unshift(paso)
  return { camino, joya, saltos: camino.length - 1 }
}

/** Activos a un salto de lo que controla el atacante: los siguientes que puede tocar. */
export function enRiesgo(org: Organizacion, ev: Evaluacion): Set<string> {
  const origenes = new Set(comprometidosActivos(ev))
  const riesgo = new Set<string>()
  for (const enlace of org.enlaces) {
    if (!origenes.has(enlace.desde) || enlace.hasta === 'atacante') continue
    if (ev.estado.get(enlace.hasta) === 'normal') riesgo.add(enlace.hasta)
  }
  return riesgo
}

/** Áreas de negocio tocadas: las de los activos comprometidos y, aparte, las de los que están en riesgo. */
export function areasAfectadas(org: Organizacion, ev: Evaluacion): { atacadas: string[]; enRiesgo: string[] } {
  const activos = porId(org.activos)
  const areaDe = (id: string) => activos.get(id)?.area
  const atacadas = [...new Set([...ev.comprometidos].map(areaDe).filter((a): a is string => !!a))]
  const riesgo = [...new Set([...enRiesgo(org, ev)].map(areaDe).filter((a): a is string => !!a && !atacadas.includes(a)))]
  return { atacadas, enRiesgo: riesgo }
}
