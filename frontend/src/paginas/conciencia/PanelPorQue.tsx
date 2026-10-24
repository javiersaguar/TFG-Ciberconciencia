/**
 * Panel «por qué» de la maqueta 3D: al pinchar un activo, por qué está amenazado o por qué ha saltado una alerta. El
 * contenido lo calcula `explicarActivo` (pura); aquí solo se ordena y se pinta, como texto (nombres y detalles pueden
 * venir de telemetría, que escribe el atacante).
 */
import { Ban, Bug, Crosshair, Info, Radar, Route, ShieldCheck, TriangleAlert, Unplug, X, type LucideIcon } from 'lucide-react'

import { ChipProcedencia } from '@/componentes/datos/Chips'
import { cn } from '@/lib/utils'

import type { Explicacion, TonoMotivo } from './explicacion'
import type { EstadoPieza } from './maqueta'

const TONO: Record<TonoMotivo, { etiqueta: string; icono: LucideIcon; clase: string }> = {
  ataque: { etiqueta: 'Ataque', icono: Crosshair, clase: 'text-sev-critica' },
  deteccion: { etiqueta: 'Detección', icono: Radar, clase: 'text-acento' },
  riesgo: { etiqueta: 'Riesgo', icono: TriangleAlert, clase: 'text-sev-media' },
  ruta: { etiqueta: 'Ruta probable', icono: Route, clase: 'text-sev-media' },
  respuesta: { etiqueta: 'Respuesta', icono: ShieldCheck, clase: 'text-ok' },
  impedido: { etiqueta: 'Impedido', icono: Ban, clase: 'text-texto-suave' },
  contexto: { etiqueta: 'Contexto', icono: Info, clase: 'text-texto-suave' },
}

const ESTADO: Record<EstadoPieza, { texto: string; icono?: LucideIcon; clase: string }> = {
  normal: { texto: 'Sin incidencias', clase: 'bg-superficie-alterna text-texto' },
  riesgo: { texto: 'En riesgo', icono: TriangleAlert, clase: 'bg-sev-media text-sobre-intenso' },
  comprometido: { texto: 'Comprometido', icono: Bug, clase: 'bg-sev-critica text-sobre-intenso' },
  aislado: { texto: 'Aislado', icono: Unplug, clase: 'bg-acento text-sobre-intenso' },
  protegido: { texto: 'Protegido', icono: ShieldCheck, clase: 'bg-ok text-sobre-intenso' },
  atacante: { texto: 'Atacante', icono: Crosshair, clase: 'bg-atacante-fondo text-atacante-texto' },
}

export function PanelPorQue({ explicacion, alCerrar, alVerFicha, className }: { explicacion: Explicacion; alCerrar: () => void; alVerFicha: () => void; className?: string }) {
  const { activo, estado, titular, motivos } = explicacion
  const chip = ESTADO[estado]
  return (
    <aside aria-label={`Por qué: ${activo.nombre}`} className={cn('flex flex-col overflow-hidden rounded-lg border border-borde bg-superficie shadow-lg', className)}>
      <header className="flex items-start gap-2 border-b border-borde px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="text-[15px] font-semibold text-primario">{activo.nombre}</span>
            <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-px text-[10.5px] font-semibold', chip.clase)}>
              {chip.icono && <chip.icono className="size-3" aria-hidden />}
              {chip.texto}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-texto">{titular}</p>
        </div>
        <button type="button" onClick={alCerrar} title="Cerrar" className="flex size-7 shrink-0 items-center justify-center rounded-md text-texto-suave hover:bg-superficie-alterna hover:text-texto">
          <X className="size-4" aria-hidden />
          <span className="sr-only">Cerrar el panel</span>
        </button>
      </header>
      <ol aria-label="Motivos" className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5">
        {motivos.map((m, i) => {
          const tono = TONO[m.tono]
          return (
            <li key={`${m.tono}-${i}`} className="flex gap-2">
              <tono.icono className={cn('mt-0.5 size-4 shrink-0', tono.clase)} aria-hidden />
              <div className="min-w-0 space-y-0.5">
                <p className="text-[10.5px] font-semibold tracking-wide text-texto-suave uppercase">{tono.etiqueta}</p>
                <p className="text-[13px] leading-snug font-semibold text-texto">{m.titulo}</p>
                {m.detalle && <p className="text-xs leading-snug text-texto-suave">{m.detalle}</p>}
                {(m.hora || m.tecnica || m.procedencia) && (
                  <p className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px] text-texto-suave">
                    {m.hora && <span className="font-mono tabular-nums">{m.hora}</span>}
                    {m.tecnica && <span className="rounded bg-superficie-alterna px-1 font-mono">{m.tecnica}</span>}
                    {m.procedencia && <ChipProcedencia procedencia={m.procedencia} fuente={m.fuente} />}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <footer className="border-t border-borde px-3 py-2">
        <button type="button" onClick={alVerFicha} className="text-xs font-medium text-acento hover:underline">
          Ficha completa y conexiones de red
        </button>
      </footer>
    </aside>
  )
}
