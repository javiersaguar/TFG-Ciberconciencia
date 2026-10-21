/**
 * Índice de la paleta de comandos (Ctrl/Cmd + K): secciones, hosts, campañas y técnicas ATT&CK, cada uno con su
 * destino. Búsqueda sin distinguir tildes ni mayúsculas: todas las palabras deben aparecer; primero lo que empieza
 * por lo buscado. Funciones puras.
 */
import type { CatalogoAttack, TecnicaObservada } from '@/api/exportaciones'
import type { Incidente } from '@/api/incidentes'

import { TODAS_LAS_SECCIONES } from './navegacion'

export type TipoComando = 'accion' | 'seccion' | 'host' | 'campana' | 'tecnica'

export interface Comando {
  id: string
  tipo: TipoComando
  titulo: string
  detalle?: string
  /** Destino: una ruta o, si empieza por `#`, una acción del shell (abrir el Copiloto…). */
  a: string
  /** Texto extra por el que también se encuentra (dataset, tácticas…). */
  claves?: string
}

export const TITULO_TIPO: Record<TipoComando, string> = { accion: 'Acciones', seccion: 'Secciones', host: 'Hosts', campana: 'Campañas', tecnica: 'Técnicas ATT&CK' }
const ORDEN_TIPO: TipoComando[] = ['accion', 'seccion', 'host', 'campana', 'tecnica']

/** Acciones del shell: abrir el Copiloto e iniciar la presentación. */
export const ACCIONES: readonly Comando[] = [
  { id: 'accion:copiloto', tipo: 'accion', titulo: 'Preguntar al Copiloto…', detalle: 'Abre el panel del Copiloto (Ctrl + I)', a: '#copiloto', claves: 'chat asistente pregunta' },
  { id: 'accion:presentacion', tipo: 'accion', titulo: 'Iniciar presentación', detalle: 'Recorrido guiado de 8 pasos por el TFG (← → y Esc)', a: '#presentacion', claves: 'demo tutora tour guiado modo' },
]

const HOSTS: readonly { host: string; papel: string }[] = [
  { host: 'SCRANTON', papel: 'Víctima inicial' },
  { host: 'NASHUA', papel: 'Destino del salto lateral' },
  { host: 'NEWYORK', papel: 'Controlador de dominio' },
  { host: 'UTICA', papel: 'Equipo del dominio' },
]

export function comandosBase(): Comando[] {
  return [
    ...ACCIONES,
    ...TODAS_LAS_SECCIONES.map((s) => ({ id: `seccion:${s.ruta}`, tipo: 'seccion' as const, titulo: s.titulo, detalle: s.descripcion, a: s.ruta })),
    ...HOSTS.map((h) => ({ id: `host:${h.host}`, tipo: 'host' as const, titulo: h.host, detalle: `${h.papel} · en el grafo de ataque`, a: `/ataque?sel=host-${h.host.toLowerCase()}` })),
  ]
}

export function comandosCampanas(incidentes: readonly Incidente[]): Comando[] {
  return incidentes.map((i) => ({
    id: `campana:${i.id}`,
    tipo: 'campana',
    titulo: `${i.patron} · ${i.hosts.join(' → ') || i.dataset}`,
    detalle: `${i.descripcionDataset} · ${i.alertas} alertas`,
    a: `/incidentes?id=${encodeURIComponent(i.id)}`,
    claves: `${i.dataset} ${i.tecnicas.join(' ')}`,
  }))
}

export function comandosTecnicas(tecnicas: readonly TecnicaObservada[], catalogo?: CatalogoAttack): Comando[] {
  return tecnicas.map((t) => {
    const oficial = catalogo?.tecnicas[t.id]
    return {
      id: `tecnica:${t.id}`,
      tipo: 'tecnica',
      titulo: oficial ? `${t.id} · ${oficial.nombre}` : t.id,
      detalle: `${t.alertas} alertas en el corpus actual`,
      a: `/attack?tecnica=${encodeURIComponent(t.id)}`,
      claves: oficial?.tacticas.join(' '),
    }
  })
}

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Sin consulta: secciones y hosts. Con consulta: todo lo que contiene todas las palabras, agrupado por tipo. */
export function buscarComandos(comandos: readonly Comando[], consulta: string, limite = 40): Comando[] {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return comandos.filter((c) => c.tipo === 'accion' || c.tipo === 'seccion' || c.tipo === 'host').slice(0, limite)
  const puntuados = comandos.flatMap((c, orden) => {
    const titulo = normalizar(c.titulo)
    const todo = `${titulo} ${normalizar(c.detalle ?? '')} ${normalizar(c.claves ?? '')}`
    if (!palabras.every((p) => todo.includes(p))) return []
    const puntos = titulo.startsWith(palabras[0]) ? 0 : titulo.split(/[\s·→-]+/).some((w) => w.startsWith(palabras[0])) ? 1 : 2
    return [{ c, puntos, orden }]
  })
  return puntuados
    .sort((a, b) => ORDEN_TIPO.indexOf(a.c.tipo) - ORDEN_TIPO.indexOf(b.c.tipo) || a.puntos - b.puntos || a.orden - b.orden)
    .slice(0, limite)
    .map((p) => p.c)
}
