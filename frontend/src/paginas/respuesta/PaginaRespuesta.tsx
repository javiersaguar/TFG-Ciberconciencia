/**
 * Asistente de respuesta: aconseja mitigaciones para un incidente SIN ejecutarlas. Tres bloques visualmente distintos,
 * con la procedencia marcada por bloque: HECHOS OBSERVADOS / INFERENCIAS DEL SISTEMA / RECOMENDACIONES. No hay botón
 * «Aplicar»: como mucho se copia el plan como texto plano y, en la demo, se enlaza a la simulación para ver su efecto.
 */
import { ArrowRight, ClipboardCopy, Eye, GitMerge, Info, ListChecks, ShieldAlert, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import type { Procedencia } from '@/api/observabilidad'
import { useDatosRespuesta } from '@/api/respuesta'
import { ChipProcedencia } from '@/componentes/datos/Chips'
import { EncabezadoPagina, EstadoError } from '@/componentes/shell'
import { Button } from '@/componentes/ui/button'
import { Skeleton } from '@/componentes/ui/skeleton'
import { cn } from '@/lib/utils'
import { urgencia } from '@/paginas/conciencia/asistente/reglas'
import { ORGANIZACIONES } from '@/paginas/conciencia/organizaciones'

import { casoDeDemo, casoDeIncidente, planComoTexto, type CasoRespuesta } from './plan'

const COLOR_URGENCIA = { Inmediata: 'border-l-sev-critica', Alta: 'border-l-sev-alta', Media: 'border-l-sev-media' } as const
const CHIP_URGENCIA = { Inmediata: 'bg-sev-critica', Alta: 'bg-sev-alta', Media: 'bg-sev-media' } as const

function Bloque({ titulo, icono: Icono, color, procedencia, fuente, children }: { titulo: string; icono: typeof Eye; color: string; procedencia?: Procedencia; fuente?: string; children: React.ReactNode }) {
  return (
    <section aria-label={titulo} className={cn('rounded-2xl border border-l-4 border-borde bg-superficie p-4', color)}>
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-texto-suave uppercase">
          <Icono className="size-3.5" aria-hidden />
          {titulo}
        </h2>
        {procedencia && <ChipProcedencia procedencia={procedencia} fuente={fuente} />}
        {!procedencia && fuente && <span className="text-[10.5px] text-texto-suave">{fuente}</span>}
      </header>
      {children}
    </section>
  )
}

function Caso({ caso }: { caso: CasoRespuesta }) {
  const [copiado, setCopiado] = useState<'si' | 'no' | null>(null)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(planComoTexto(caso))
      setCopiado('si')
    } catch {
      setCopiado('no')
    }
  }
  return (
    <div className="grid min-w-0 gap-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg break-words">{caso.titulo}</h2>
          <p className="text-xs text-texto-suave">{caso.subtitulo}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void copiar()}>
            <ClipboardCopy aria-hidden />
            Copiar como plan de respuesta
          </Button>
          {caso.enlaces.map((e) => (
            <Link key={e.a} to={e.a} className="inline-flex items-center gap-1 text-xs font-medium text-acento hover:underline">
              {e.texto} <ArrowRight className="size-3" aria-hidden />
            </Link>
          ))}
        </div>
      </header>
      {copiado && (
        <p role="status" className="text-xs text-texto-suave">
          {copiado === 'si' ? 'Plan copiado como texto plano.' : 'El navegador no deja copiar: el plan está en el bloque de recomendaciones.'}
        </p>
      )}

      <section aria-label="Situación" className="rounded-2xl border border-borde bg-superficie p-4 text-[13.5px] leading-relaxed text-texto">
        {caso.situacion.map((p) => <p key={p}>{p}</p>)}
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <Bloque titulo="Hechos observados" icono={Eye} color="border-l-fund-observado" procedencia={caso.procedenciaHechos.procedencia} fuente={caso.procedenciaHechos.fuente}>
          <ul className="space-y-1">
            {caso.hechos.map((h) => (
              <li key={`${h.hora ?? ''}${h.texto}`} className="text-xs">
                {h.hora && <span className="mr-1.5 font-mono text-texto-suave tabular-nums">{h.hora}</span>}
                <span className="text-texto">{h.texto}</span>
                {h.detalle && <span className="block text-[11px] text-texto-suave">{h.detalle}</span>}
              </li>
            ))}
          </ul>
        </Bloque>

        <Bloque titulo="Inferencias del sistema" icono={GitMerge} color="border-l-fund-inferido" procedencia={caso.tipo === 'demo' ? 'ilustrativa' : 'documentada'} fuente={caso.tipo === 'demo' ? 'Razonamiento de la demo sobre el escenario' : 'Detectores P1 y P2 en lote (exportación del 21-10-2026)'}>
          <ul className="space-y-1 text-xs text-texto">
            {caso.inferencias.map((l) => <li key={l}>{l}</li>)}
          </ul>
          {caso.confianza && (
            <div className="mt-2 rounded-lg bg-superficie-alterna p-2.5">
              <p className="flex items-baseline justify-between text-xs">
                <span className="font-semibold text-texto">Confianza</span>
                <span className="font-semibold text-texto tabular-nums">{caso.confianza.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
              </p>
              <ul className="mt-1 space-y-0.5" aria-label="Factores de la confianza">
                {caso.confianza.factores.map((f) => (
                  <li key={f.factor} className={cn('flex justify-between gap-2 text-[11px]', f.presente ? 'text-texto' : 'text-texto-suave line-through')}>
                    <span>
                      <span className="sr-only">{f.presente ? 'Presente: ' : 'Ausente: '}</span>
                      {f.factor}
                    </span>
                    <span className="tabular-nums">+{f.peso.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Bloque>
      </div>

      <Bloque titulo="Recomendaciones" icono={ListChecks} color="border-l-acento" fuente="Motor de reglas · NIST SP 800-61 y MITRE D3FEND">
        <ol className="space-y-2" aria-label="Acciones propuestas">
          {caso.propuestas.map((p) => {
            const nivel = urgencia(p.prioridad)
            return (
              <li key={p.clave} className={cn('rounded-xl border border-l-4 border-borde bg-superficie p-3', COLOR_URGENCIA[nivel])}>
                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10.5px] font-semibold">
                  <span className={cn('rounded-full px-1.5 py-px text-sobre-intenso', CHIP_URGENCIA[nivel])}>{nivel}</span>
                  <span className="rounded-full bg-superficie-hundida px-1.5 py-px text-texto-suave">{p.fase}</span>
                  <span className="rounded-full bg-acento-suave px-1.5 py-px text-acento">D3FEND · {p.d3fend}</span>
                </div>
                <p className="text-[13.5px] font-semibold text-texto">{p.titulo}</p>
                <p className="text-xs text-texto-suave">{p.detalle}</p>
                <ul className="mt-1 space-y-0.5" aria-label="Por qué">
                  {p.porque.map((l) => <li key={l} className="text-[11px] text-texto"><span className="text-texto-suave">Por qué: </span>{l}</li>)}
                </ul>
                {p.impactoNegocio && (
                  <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-aviso/10 px-2 py-1 text-[11px] text-aviso">
                    <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                    Coste: {p.impactoNegocio}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      </Bloque>

      <p className="flex items-center gap-1.5 rounded-xl border border-dashed border-borde-discontinuo px-3 py-2 text-[11px] text-texto-suave">
        <Sparkles className="size-3.5 shrink-0" aria-hidden />
        Redacción con LLM: pendiente (F6). Las reglas deciden; el LLM solo redactará la explicación, sin inventar acciones ni cifras.
      </p>
    </div>
  )
}

export default function PaginaRespuesta() {
  const consulta = useDatosRespuesta()
  const [parametros, setParametros] = useSearchParams()
  const pedido = parametros.get('caso')
  const t = Number(parametros.get('t'))
  const datos = consulta.data
  const casos = useMemo(() => {
    if (!datos) return []
    return [
      ...datos.incidentes.map((i) => ({ id: i.id, grupo: 'Campañas detectadas', texto: `${i.patron} · ${i.hosts.join(' → ') || i.dataset}`, detalle: i.descripcionDataset })),
      ...ORGANIZACIONES.map((o) => ({ id: o.id, grupo: 'Demo', texto: o.nombre, detalle: o.sector })),
    ]
  }, [datos])
  const elegido = casos.find((c) => c.id === pedido)?.id ?? casos[0]?.id
  const caso = useMemo<CasoRespuesta | undefined>(() => {
    if (!datos || !elegido) return undefined
    const org = ORGANIZACIONES.find((o) => o.id === elegido)
    if (org) return casoDeDemo(org, Number.isFinite(t) && t > 0 ? t : undefined)
    const inc = datos.incidentes.find((i) => i.id === elegido)
    return inc ? casoDeIncidente(inc, datos.alertas, datos.aristas) : undefined
  }, [datos, elegido, t])

  return (
    <>
      <EncabezadoPagina
        titulo="Asistente de respuesta"
        descripcion="Qué hacer ante cada incidente, por qué y a qué coste."
        comoLeer={
          <>
            <p>Hechos: lo que se ha visto (alertas, conexiones). Inferencias: lo que deduce el sistema (patrones, confianza). Recomendaciones: lo que propone el motor de reglas (NIST SP 800-61 y MITRE D3FEND), con su porqué y su coste.</p>
            <p>Nada se ejecuta. Un modelo de lenguaje, cuando exista (fase F6, con la API), solo redactará la explicación; nunca decidirá.</p>
          </>
        }
      />
      <p role="note" className="mb-4 flex items-center gap-1.5 text-xs font-medium text-texto-suave">
        <Info className="size-3.5" aria-hidden />
        El asistente propone; no ejecuta acciones.
      </p>
      {consulta.isError ? (
        <EstadoError error={consulta.error} alReintentar={() => void consulta.refetch()} reintentando={consulta.isFetching} />
      ) : !datos ? (
        <div role="status" aria-label="Cargando el asistente"><Skeleton className="h-96 rounded-2xl" /></div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav aria-label="Casos" className="grid gap-3 rounded-2xl border border-borde bg-superficie p-2">
            {['Campañas detectadas', 'Demo'].map((grupo) => (
              <div key={grupo}>
                <p className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-texto-suave uppercase">{grupo}</p>
                <ul className="space-y-0.5">
                  {casos.filter((c) => c.grupo === grupo).map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        aria-current={c.id === elegido ? 'true' : undefined}
                        onClick={() => setParametros({ caso: c.id }, { replace: true })}
                        className={cn('w-full rounded-lg px-2 py-1 text-left text-xs', c.id === elegido ? 'bg-acento-suave text-acento' : 'text-texto hover:bg-superficie-alterna')}
                      >
                        <span className="block truncate font-medium">{c.texto}</span>
                        <span className="block truncate text-[10.5px] text-texto-suave">{c.detalle}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          {caso && <Caso caso={caso} />}
        </div>
      )}
    </>
  )
}
