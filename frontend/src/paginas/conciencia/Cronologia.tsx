/**
 * Cronología en vivo: los pasos del ataque según aparecen (lo más reciente arriba), los que la respuesta impidió con
 * su motivo, y las acciones aplicadas intercaladas en su momento. Cada paso dice si está documentado o es ilustrativo.
 */
import { CheckCircle2, CircleSlash, Siren } from 'lucide-react'

import { cn } from '@/lib/utils'

import { NOMBRE_TACTICA, porId, type AccionAplicada, type Organizacion } from './modelo'
import type { Evaluacion } from './simulacion'

type Entrada =
  | { tipo: 'paso'; t: number; clave: string; ev: Evaluacion['pasos'][number] }
  | { tipo: 'accion'; t: number; clave: string; accion: AccionAplicada }

export function Cronologia({ org, ev, acciones }: { org: Organizacion; ev: Evaluacion; acciones: AccionAplicada[] }) {
  const activos = porId(org.activos)
  const nombre = (id: string) => activos.get(id)?.nombre ?? id
  const entradas: Entrada[] = [
    ...ev.pasos.map((p) => ({ tipo: 'paso' as const, t: p.paso.t, clave: p.paso.id, ev: p })),
    ...acciones.map((a) => ({ tipo: 'accion' as const, t: a.t, clave: `accion-${a.clave}`, accion: a })),
  ].sort((a, b) => b.t - a.t || (a.tipo === 'accion' ? -1 : 1))

  return (
    <section aria-label="Cronología del ataque" className="flex min-h-0 flex-col rounded-2xl border border-borde bg-superficie">
      <h2 className="border-b border-borde px-4 py-2 text-sm">
        Cronología en vivo <span className="font-normal text-texto-suave">· {ev.ocurridos.length} pasos, {ev.bloqueados.length} impedidos</span>
      </h2>
      {entradas.length === 0 ? (
        <p className="px-4 py-3 text-xs text-texto-suave">Sin eventos. Lanza la simulación para ver el ataque paso a paso.</p>
      ) : (
        <ol className="min-h-0 flex-1 divide-y divide-borde/60 overflow-y-auto">
          {entradas.map((e) =>
            e.tipo === 'accion' ? (
              <li key={e.clave} className="flex items-start gap-2 bg-ok/8 px-4 py-1.5 text-xs">
                <CheckCircle2 className="mt-px size-3.5 shrink-0 text-ok" aria-hidden />
                <span className="text-texto"><span className="font-semibold text-ok">Respuesta:</span> {e.accion.titulo}</span>
              </li>
            ) : (
              <li key={e.clave} className={cn('flex items-start gap-2 px-4 py-1.5 text-xs', !e.ev.ocurrido && 'opacity-75')}>
                {e.ev.ocurrido ? (
                  <Siren className="mt-px size-3.5 shrink-0 text-sev-critica" aria-hidden />
                ) : (
                  <CircleSlash className="mt-px size-3.5 shrink-0 text-texto-suave" aria-hidden />
                )}
                <span className="w-24 shrink-0 font-medium text-texto tabular-nums">{e.ev.paso.hora}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn('font-medium', e.ev.ocurrido ? 'text-texto' : 'text-texto-suave line-through')}>{e.ev.paso.titulo}</span>
                  <span className="block text-[11px] text-texto-suave">
                    {NOMBRE_TACTICA[e.ev.paso.tactica]} · {e.ev.paso.tecnica}
                    {e.ev.paso.desde !== e.ev.paso.hasta && ` · ${nombre(e.ev.paso.desde)} → ${nombre(e.ev.paso.hasta)}`}
                    {e.ev.paso.patron && ` · ${e.ev.paso.patron}`}
                    {e.ev.ocurrido ? '' : ` · impedido: ${e.ev.motivo}`}
                  </span>
                </span>
                <span
                  className={cn('shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold', e.ev.paso.procedencia === 'documentada' ? 'bg-ok/12 text-ok' : 'bg-aviso/12 text-aviso')}
                  title={e.ev.paso.fuente}
                >
                  {e.ev.paso.procedencia === 'documentada' ? 'documentado' : 'ilustrativo'}
                </span>
              </li>
            ),
          )}
        </ol>
      )}
    </section>
  )
}
