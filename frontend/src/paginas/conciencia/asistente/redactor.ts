/**
 * Quién redacta la explicación de la situación. **El hueco para el LLM está aquí, y solo aquí.**
 *
 * Reparto de papeles, deliberado:
 *   - las **reglas** (`reglas.ts`) deciden qué hacer y con qué prioridad: deterministas, auditables, defendibles;
 *   - el **redactor** convierte la situación y esas decisiones en un texto que un analista lee de un vistazo.
 *
 * Hoy el redactor son plantillas. Cuando exista la API (F6), un `Redactor` basado en LLM con RAG sobre ATT&CK,
 * D3FEND y los playbooks de la organización recibirá exactamente el mismo `ContextoRedaccion` (serializable a
 * JSON) y devolverá los mismos párrafos. Solo inferencia, como fija AGENTS.md. El LLM nunca inventa acciones ni
 * cifras: todo lo que menciona sale del contexto, y si falla, se vuelve a las plantillas.
 */
import { NOMBRE_TACTICA, porId, type Organizacion } from '../modelo'
import type { RutaProbable } from '../razonamiento'
import { comprometidosActivos, type Evaluacion } from '../simulacion'
import type { Puntuacion } from './puntuacion'
import type { Recomendacion } from './reglas'

export interface ContextoRedaccion {
  org: Organizacion
  ev: Evaluacion
  ruta: RutaProbable | null
  puntuacion: Puntuacion
  recomendaciones: Recomendacion[]
}

export interface Redactor {
  id: string
  nombre: string
  disponible: boolean
  redactar(contexto: ContextoRedaccion): string[]
}

function lista(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join('')
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`
}

export const redactorPlantillas: Redactor = {
  id: 'plantillas',
  nombre: 'Plantillas',
  disponible: true,
  redactar({ org, ev, ruta, puntuacion, recomendaciones }) {
    if (ev.ocurridos.length === 0) {
      return [`Sin actividad sospechosa en ${org.nombre}. El asistente empezará a razonar con la primera evidencia.`]
    }
    const activos = porId(org.activos)
    const nombre = (id: string) => activos.get(id)?.nombre ?? id
    const ultima = ev.ocurridos.at(-1)!
    const activosAtacante = comprometidosActivos(ev)
    const areas = [...new Set(activosAtacante.map((id) => activos.get(id)?.area).filter((a): a is string => !!a))]
    const parrafos: string[] = []

    parrafos.push(
      `Fase actual: ${NOMBRE_TACTICA[ultima.tactica]?.toLowerCase() ?? ultima.tactica}. ` +
        (activosAtacante.length
          ? `El atacante controla ${lista(activosAtacante.map(nombre))} (${lista(areas)}).`
          : 'Todo lo que llegó a comprometer está aislado: ahora mismo no controla ningún activo.') +
        ` Gravedad ${puntuacion.nivel.toLowerCase()} (${puntuacion.total}/100).`,
    )
    if (ruta) {
      const joya = activos.get(ruta.joya)!
      parrafos.push(
        `La ruta más probable lleva a ${joya.nombre} (${joya.area}) en ${ruta.saltos} ${ruta.saltos === 1 ? 'salto' : 'saltos'}: ${ruta.camino.map(nombre).join(' → ')}.`,
      )
    } else if (activosAtacante.length) {
      parrafos.push('Desde lo que controla no tiene camino hacia ninguna joya de la corona.')
    }
    if (ev.impactos.length) parrafos.push(`Objetivos ya cumplidos: ${ev.impactos.map((p) => p.impacto).join('; ')}.`)
    if (recomendaciones[0]) {
      parrafos.push(`Lo más urgente: ${recomendaciones[0].titulo.charAt(0).toLowerCase()}${recomendaciones[0].titulo.slice(1)}.`)
    }
    if (ev.bloqueados.length) {
      parrafos.push(`La respuesta ya ha impedido ${ev.bloqueados.length} ${ev.bloqueados.length === 1 ? 'paso' : 'pasos'} del ataque.`)
    }
    return parrafos
  },
}

/** El redactor con LLM: declarado para que la interfaz tenga su sitio, no disponible hasta F6. */
export const redactorLLM: Redactor = {
  id: 'llm',
  nombre: 'LLM + RAG (F6)',
  disponible: false,
  redactar: (contexto) => redactorPlantillas.redactar(contexto),
}
