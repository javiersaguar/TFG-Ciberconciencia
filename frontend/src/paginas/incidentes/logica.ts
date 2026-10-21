/**
 * Lógica pura del explorador de incidentes: búsqueda, filtros, orden y validación de `?id=`.
 */
import type { Incidente } from '@/api/incidentes'
import { milisegundosDelDia } from '@/componentes/datos/hora'

export type GrupoDataset = 'todos' | 'apt29' | 'lsass' | 'atomico'
export type CampoOrden = 'inicio' | 'alertas' | 'confianza' | 'patron' | 'dataset'

export interface CriteriosIncidentes {
  texto: string
  patrones: ('P1' | 'P2')[]
  grupo: GrupoDataset
}

export interface Orden {
  campo: CampoOrden
  sentido: 'asc' | 'desc'
}

export const CRITERIOS_INICIALES: CriteriosIncidentes = { texto: '', patrones: ['P1', 'P2'], grupo: 'todos' }
export const ORDEN_INICIAL: Orden = { campo: 'alertas', sentido: 'desc' }

export function grupoDe(dataset: string): Exclude<GrupoDataset, 'todos'> {
  if (dataset === 'SDWIN-200501225525') return 'apt29'
  return dataset.startsWith('LSASS') ? 'lsass' : 'atomico'
}

/** Búsqueda sin distinguir mayúsculas ni tildes en id, dataset, hosts, técnicas y notas. */
export function filtrarIncidentes(lista: readonly Incidente[], c: CriteriosIncidentes): Incidente[] {
  const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const buscado = normalizar(c.texto.trim())
  return lista.filter((i) => {
    if (!c.patrones.includes(i.patron)) return false
    if (c.grupo !== 'todos' && grupoDe(i.dataset) !== c.grupo) return false
    if (!buscado) return true
    return normalizar([i.id, i.dataset, i.descripcionDataset, ...i.hosts, ...i.tecnicas, ...i.notas].join(' ')).includes(buscado)
  })
}

/** Orden estable; los valores no documentados (`null`) van siempre al final. */
export function ordenarIncidentes(lista: readonly Incidente[], orden: Orden): Incidente[] {
  const valor = (i: Incidente): number | string | null => {
    switch (orden.campo) {
      case 'inicio':
        return i.inicio ? milisegundosDelDia(i.inicio) : null
      case 'alertas':
        return i.alertas
      case 'confianza':
        return i.confianza
      case 'patron':
        return i.patron
      case 'dataset':
        return i.dataset
    }
  }
  const signo = orden.sentido === 'asc' ? 1 : -1
  return [...lista]
    .map((i, indice) => ({ i, indice, v: valor(i) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.indice - b.indice
      if (a.v === null) return 1
      if (b.v === null) return -1
      const comparacion = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v))
      return comparacion * signo || a.indice - b.indice
    })
    .map((x) => x.i)
}

export function leerIncidente(id: string | null, lista: readonly Incidente[]): Incidente | undefined {
  return id ? lista.find((i) => i.id === id) : undefined
}
