/**
 * Lista de las conexiones con el exterior (la misma en el globo 3D y en el mapa 2D): qué paso cruzó la frontera, cuándo,
 * desde o hacia dónde, y si ocurrió o lo impidió la respuesta. Es también la alternativa en texto del dibujo. Lleva su
 * procedencia: las ubicaciones son ilustrativas.
 */
import { ArrowDownLeft, ArrowUpRight, Ban, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { ChipProcedencia } from '@/componentes/datos/Chips'
import { cn } from '@/lib/utils'

import type { Conexion } from './globo'
import type { Organizacion } from './modelo'

export function PanelConexiones({ org, conexiones, className }: { org: Organizacion; conexiones: readonly Conexion[]; className?: string }) {
  const geo = org.geografia
  // plegada de entrada (solo la cabecera, con el número): así no tapa el mapa; se despliega con un clic
  const [abierto, setAbierto] = useState(false)
  return (
    <section aria-label="Conexiones con el exterior" className={cn('rounded-lg border border-borde bg-superficie px-3 py-2 shadow-sm', className)}>
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-texto">
          <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} className="flex items-center gap-1 hover:text-acento">
            <ChevronDown className={cn('size-3.5 transition-transform', !abierto && '-rotate-90')} aria-hidden />
            Conexiones con el exterior{conexiones.length ? ` · ${conexiones.length}` : ''}
          </button>
        </h3>
        {geo && <ChipProcedencia procedencia={geo.procedencia} fuente={geo.nota} />}
      </header>
      {!abierto ? null : conexiones.length === 0 ? (
        <p className="mt-1 text-xs text-texto-suave">Ningún paso ha cruzado todavía la frontera de {org.nombre}{geo ? ` (sede: ${geo.sede.nombre})` : ''}.</p>
      ) : (
        <ol className="mt-1.5 max-h-36 space-y-1 overflow-y-auto pr-1">
          {conexiones.map((c) => {
            const Icono = !c.ocurrido ? Ban : c.sentido === 'entrada' ? ArrowDownLeft : ArrowUpRight
            return (
              <li key={c.id} className={cn('flex items-start gap-1.5 text-xs leading-snug', c.ultimo && 'font-semibold')}>
                <Icono className={cn('mt-0.5 size-3.5 shrink-0', c.ocurrido ? 'text-sev-critica' : 'text-texto-suave')} aria-hidden />
                <span className="min-w-0">
                  <span className="font-mono text-texto-suave tabular-nums">{c.paso.hora}</span> <span className="text-texto">{c.ocurrido ? c.paso.titulo : `Impedido: ${c.paso.titulo}`}</span>
                  <span className="block text-[11px] font-normal text-texto-suave">
                    {c.sentido === 'entrada' ? `desde ${c.fuera.nombre} (${c.fuera.pais})` : `hacia ${c.fuera.nombre} (${c.fuera.pais})`} · {c.fuera.papel}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      )}
      {abierto && <p className="mt-1.5 border-t border-separador pt-1 text-[10.5px] leading-snug text-texto-suave">Ubicación de la IP, no del atacante. Con IP públicas y GeoIP en el servidor (F6.3) se pintarán las reales.</p>}
      {/* La otra vista geográfica: aquí, los pasos de UN ataque; en /mapa, el flujo continuo de alertas */}
      <Link to="/mapa" className="mt-1 inline-block text-[11px] font-medium text-acento hover:underline">Flujo de alertas en el mapa mundial →</Link>
    </section>
  )
}
