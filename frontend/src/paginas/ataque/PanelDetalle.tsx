/**
 * Detalle del nodo o la arista seleccionados: qué es, su fundamento (observado / inferido / hipótesis), su procedencia
 * con la fuente, los hechos documentados, las técnicas ATT&CK que vienen en los datos y, para las campañas, la
 * confianza descompuesta. Enlaza con el incidente y con la línea temporal.
 *
 * Todo el contenido es texto plano: procesos, reglas y cuentas vienen de telemetría que escribe el atacante.
 */
import { ArrowRight, ListTree } from 'lucide-react'
import { Link } from 'react-router'

import type { AristaAtaque, GrafoAtaque, NodoAtaque } from '@/api/ataque'
import { ChipProcedencia } from '@/componentes/datos/Chips'
import { cn } from '@/lib/utils'
import { BotonPreguntar } from '@/copiloto/BotonPreguntar'

import { ESTILO_FUNDAMENTO } from './estilo'
import { DESCRIPCION_FUNDAMENTO, ETIQUETA_FUNDAMENTO, ETIQUETA_RELACION, esArista } from './logica'

const TIPO: Record<NodoAtaque['tipo'], string> = { host: 'Host', cuenta: 'Cuenta', proceso: 'Proceso', alerta: 'Alerta Sigma', campana: 'Campaña (incidente)' }

function nombre(grafo: GrafoAtaque, id: string) {
  return grafo.nodos.find((n) => n.id === id)?.etiqueta ?? id
}

export function PanelDetalle({ grafo, elemento }: { grafo: GrafoAtaque; elemento: NodoAtaque | AristaAtaque | undefined }) {
  if (!elemento) {
    return (
      <section aria-label="Detalle" className="rounded-xl border border-dashed border-borde-discontinuo p-3 text-xs text-texto-suave">
        <p className="flex items-center gap-1.5 font-medium text-texto">
          <ListTree className="size-3.5" aria-hidden />
          Nada seleccionado
        </p>
        <p className="mt-1">Elige un nodo o una relación en el grafo (ratón, o Tab y Enter) o en la lista de elementos.</p>
      </section>
    )
  }
  const arista = esArista(elemento)
  const estilo = ESTILO_FUNDAMENTO[elemento.fundamento]
  const Icono = estilo.icono
  const { detalle } = elemento
  return (
    <section aria-label="Detalle" aria-live="polite" className="space-y-3 rounded-xl border border-borde bg-superficie p-3">
      <header className="space-y-1">
        <p className="text-[10.5px] font-semibold tracking-wide text-texto-suave uppercase">
          {arista ? `Relación · ${ETIQUETA_RELACION[elemento.relacion]}` : TIPO[elemento.tipo]}
        </p>
        <h2 className="text-[15px] leading-snug break-words">
          {arista ? `${nombre(grafo, elemento.origen)} → ${nombre(grafo, elemento.destino)}` : elemento.etiqueta}
        </h2>
        {arista && <p className="text-xs text-texto">{elemento.etiqueta}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10.5px] font-semibold', estilo.claseTexto)} style={{ borderColor: estilo.color }}>
            <Icono className="size-3" aria-hidden />
            {ETIQUETA_FUNDAMENTO[elemento.fundamento]}
          </span>
          <ChipProcedencia procedencia={elemento.procedencia} fuente={elemento.fuente} />
        </div>
        <p className="text-[11px] text-texto-suave">{DESCRIPCION_FUNDAMENTO[elemento.fundamento]}</p>
      </header>

      {detalle.hechos.length > 0 && (
        <dl className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
          {detalle.hechos.map((h) => (
            <div key={h.etiqueta} className="contents">
              <dt className="text-texto-suave">{h.etiqueta}</dt>
              <dd className={cn('break-words text-texto', h.mono && 'font-mono text-[11.5px]')}>{h.valor}</dd>
            </div>
          ))}
        </dl>
      )}

      {detalle.tecnicas.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold text-texto-suave">Técnicas ATT&CK (de los datos)</p>
          <ul className="flex flex-wrap gap-1">
            {detalle.tecnicas.map((t) => (
              <li key={t} className="rounded-md bg-superficie-alterna px-1.5 py-0.5 font-mono text-[11px] text-texto">
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {detalle.confianza && (
        <div className="rounded-lg bg-superficie-alterna p-2.5">
          <p className="flex items-baseline justify-between text-xs">
            <span className="font-semibold text-texto">Confianza descompuesta</span>
            <span className="font-semibold text-texto tabular-nums">
              {detalle.confianza.total == null ? 'no documentada' : detalle.confianza.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
            </span>
          </p>
          <ul className="mt-1.5 space-y-1" aria-label="Factores de la confianza">
            {detalle.confianza.factores.map((f) => (
              <li key={f.factor} className="flex items-start justify-between gap-2 text-[11px]">
                <span className="text-texto">
                  {f.presente === true ? '✓ ' : f.presente === false ? '✗ ' : ''}
                  {f.factor}
                </span>
                <span className="shrink-0 text-texto-suave tabular-nums">+{f.peso.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
              </li>
            ))}
          </ul>
          {detalle.confianza.nota && <p className="mt-1.5 text-[11px] text-aviso">{detalle.confianza.nota}</p>}
          <p className="mt-1 text-[10.5px] text-texto-suave">Fuente: {detalle.confianza.fuente}</p>
        </div>
      )}

      {detalle.notas.map((nota) => (
        <p key={nota} className="text-xs text-texto-suave">
          {nota}
        </p>
      ))}

      <nav aria-label="Ir a" className="flex flex-wrap gap-2 border-t border-borde pt-2 text-xs">
          <BotonPreguntar {...preguntaSobre(elemento, arista)} />
          {detalle.incidente && (
            <Link to={`/incidentes?id=${encodeURIComponent(detalle.incidente)}`} className="inline-flex items-center gap-1 font-medium text-acento hover:underline">
              Ver incidente <ArrowRight className="size-3" aria-hidden />
            </Link>
          )}
          {detalle.cronologia && (
            <Link to={`/cronologia?sel=${encodeURIComponent(detalle.cronologia)}`} className="inline-flex items-center gap-1 font-medium text-acento hover:underline">
              Ver en la línea temporal <ArrowRight className="size-3" aria-hidden />
            </Link>
          )}
      </nav>
    </section>
  )
}

/** La pregunta que tiene sentido para cada elemento del grafo (siempre una que el Copiloto sabe responder). */
function preguntaSobre(elemento: NodoAtaque | AristaAtaque, arista: boolean) {
  const seleccion = { tipo: 'nodo' as const, id: elemento.id, etiqueta: elemento.etiqueta }
  if (arista) return { pregunta: '¿Hubo movimiento lateral?', seleccion }
  const nodo = elemento as NodoAtaque
  if (nodo.tipo === 'campana' && nodo.detalle.incidente) return { pregunta: 'Explícame esta campaña', seleccion: { tipo: 'incidente' as const, id: nodo.detalle.incidente, etiqueta: nodo.etiqueta } }
  const host = nodo.hosts[0]
  return { pregunta: host ? `¿Qué pasó en ${host}?` : '¿Qué está pasando?', seleccion }
}
