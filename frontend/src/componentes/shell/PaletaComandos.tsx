/**
 * Paleta de comandos (Ctrl/Cmd + K): saltar a una sección, un host, una campaña o una técnica ATT&CK escribiendo.
 * Patrón combobox + listbox de WAI-ARIA sobre el diálogo de Radix que ya usa el portal (sin `cmdk`: no hace falta
 * otra dependencia para una lista de un centenar de entradas). Flechas para moverse, Intro para ir, Esc para cerrar.
 */
import { CornerDownLeft, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { useIndiceBusqueda } from '@/api/busqueda'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/componentes/ui/dialog'
import { cn } from '@/lib/utils'

import { buscarComandos, comandosBase, comandosCampanas, comandosTecnicas, TITULO_TIPO, type Comando } from './comandos'

export function PaletaComandos({ abierta, alCambiar }: { abierta: boolean; alCambiar: (abierta: boolean) => void }) {
  const navegar = useNavigate()
  const [consulta, setConsulta] = useState('')
  const [activo, setActivo] = useState(0)
  const indice = useIndiceBusqueda(abierta)
  const comandos = useMemo<Comando[]>(
    () => [...comandosBase(), ...(indice.data ? [...comandosCampanas(indice.data.incidentes), ...comandosTecnicas(indice.data.tecnicas, indice.data.catalogo)] : [])],
    [indice.data],
  )
  const resultados = useMemo(() => buscarComandos(comandos, consulta), [comandos, consulta])
  const cerrar = (v: boolean) => {
    alCambiar(v)
    if (!v) {
      setConsulta('')
      setActivo(0)
    }
  }
  const ir = (c: Comando | undefined) => {
    if (!c) return
    cerrar(false)
    navegar(c.a)
  }
  const mover = (delta: number) => setActivo((a) => (resultados.length ? (a + delta + resultados.length) % resultados.length : 0))

  return (
    <Dialog open={abierta} onOpenChange={cerrar}>
      <DialogContent showCloseButton={false} className="top-[18%] max-w-xl translate-y-0 gap-0 p-0" aria-describedby="paleta-ayuda">
        <DialogTitle className="sr-only">Buscar en el portal</DialogTitle>
        <DialogDescription id="paleta-ayuda" className="sr-only">Escribe para buscar secciones, hosts, campañas o técnicas; flechas para elegir e Intro para ir.</DialogDescription>
        <div className="flex items-center gap-2 border-b border-borde px-3">
          <Search className="size-4 text-texto-suave" aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls="paleta-resultados"
            aria-activedescendant={resultados[activo] ? `paleta-${activo}` : undefined}
            aria-label="Buscar secciones, hosts, campañas o técnicas"
            value={consulta}
            maxLength={80}
            onChange={(e) => {
              setConsulta(e.target.value)
              setActivo(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); mover(1) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1) }
              else if (e.key === 'Enter') { e.preventDefault(); ir(resultados[activo]) }
            }}
            placeholder="Sección, host, campaña o técnica (T1003, lsass…)"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm text-texto outline-none placeholder:text-texto-suave"
          />
        </div>
        <ul id="paleta-resultados" role="listbox" aria-label="Resultados" className="max-h-80 overflow-y-auto p-1.5">
          {resultados.length === 0 && <li className="px-3 py-6 text-center text-xs text-texto-suave">{indice.isFetching ? 'Cargando campañas y técnicas…' : 'Nada coincide.'}</li>}
          {resultados.map((c, i) => (
            <li key={c.id} role="presentation">
              {(i === 0 || resultados[i - 1].tipo !== c.tipo) && <p className="px-2 pt-2 pb-1 text-[10.5px] font-semibold tracking-wide text-texto-suave uppercase" aria-hidden>{TITULO_TIPO[c.tipo]}</p>}
              <div
                id={`paleta-${i}`}
                role="option"
                aria-selected={i === activo}
                onMouseMove={() => setActivo(i)}
                onClick={() => ir(c)}
                className={cn('flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5', i === activo ? 'bg-acento-suave text-acento' : 'text-texto')}
              >
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-[13px] font-medium', c.tipo === 'tecnica' && 'font-mono')}>{c.titulo}</span>
                  {c.detalle && <span className="block truncate text-[11px] text-texto-suave">{c.detalle}</span>}
                </span>
                {i === activo && <CornerDownLeft className="size-3.5 shrink-0" aria-hidden />}
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
