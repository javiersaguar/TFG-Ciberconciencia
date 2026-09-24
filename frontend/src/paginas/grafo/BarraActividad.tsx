/**
 * Barra sobre el lienzo: qué está haciendo la plataforma ahora y el botón que lanza el replay simulado. Es la
 * explicación de los tramos que se iluminan, y deja claro que la actividad es simulada.
 */
import { Play, Square } from 'lucide-react'

import { Button } from '@/componentes/ui/button'
import { cn } from '@/lib/utils'

import { describirReplay, type EstadoReplay } from './actividad'

interface Props {
  replay: EstadoReplay
  alIniciar: () => void
  alDetener: () => void
  className?: string
}

export function BarraActividad({ replay, alIniciar, alDetener, className }: Props) {
  return (
    <div
      role="status"
      aria-label="Actividad del pipeline"
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-borde bg-superficie px-4 py-2.5 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.05)]', className)}
    >
      <span className="flex items-center gap-2 font-semibold text-texto">
        <span className="relative flex size-2.5" aria-hidden>
          {replay.enMarcha && <span className="punto-vivo absolute inset-0 rounded-full bg-ok/60" />}
          <span className={cn('relative size-2.5 rounded-full', replay.enMarcha ? 'bg-ok' : 'bg-superficie-hundida')} />
        </span>
        {describirReplay(replay)}
      </span>

      {replay.enMarcha && (
        <span className="h-1.5 w-40 overflow-hidden rounded-full bg-superficie-hundida" aria-hidden>
          <span className="block h-full rounded-full bg-ok transition-[width] duration-200" style={{ width: `${replay.progreso * 100}%` }} />
        </span>
      )}

      <span className="ml-auto flex items-center gap-3">
        <span className="hidden text-xs text-texto-suave lg:inline">
          {replay.enMarcha ? 'Los tramos iluminados son los que están trabajando' : 'Progreso simulado; los totales finales son los medidos'}
        </span>
        {replay.enMarcha ? (
          <Button variant="outline" size="sm" onClick={alDetener}>
            <Square aria-hidden />
            Detener
          </Button>
        ) : (
          <Button size="sm" onClick={alIniciar}>
            <Play aria-hidden />
            Simular replay de apt29 day1
          </Button>
        )}
      </span>
    </div>
  )
}
