/**
 * Copiloto: preguntas sobre la evidencia de UNA organización. La respuesta llega por partes (streaming) y cada
 * afirmación lleva sus citas numeradas, que enlazan a la evidencia. No ejecuta nada: para mitigar remite a /respuesta.
 * Hoy responde el proveedor local; el de LLM con RAG está declarado y vivirá en el servidor (F6).
 */
import { ArrowRight, CircleStop, Info, MessagesSquare, Send, TriangleAlert } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useDatosRespuesta } from '@/api/respuesta'
import { ChipProcedencia } from '@/componentes/datos/Chips'
import { useMovimientoReducido } from '@/componentes/datos/useMovimientoReducido'
import { EncabezadoPagina, EstadoError } from '@/componentes/shell'
import { Button } from '@/componentes/ui/button'
import { Skeleton } from '@/componentes/ui/skeleton'
import { cn } from '@/lib/utils'
import { HELIOS } from '@/paginas/conciencia/organizaciones/helios'

import {
  contextoDemo,
  contextoDmevals,
  nuevaConversacion,
  preguntar,
  PROVEEDORES,
  proveedorLocal,
  verificarFragmento,
  type Cita,
  type ContextoCopiloto,
  type Conversacion,
  type Fragmento,
} from './copiloto'

const ORGS = ['dmevals', 'helios'] as const
type Org = (typeof ORGS)[number]
const SUGERENCIAS = ['¿Qué pasó en NASHUA?', '¿Hubo movimiento lateral?', 'T1003.001', '¿Cómo lo mitigo?']

function Respuesta({ fragmentos }: { fragmentos: Fragmento[] }) {
  // citas numeradas por orden de aparición; la misma cita conserva su número
  const citas: Cita[] = []
  const numero = (c: Cita) => {
    const i = citas.findIndex((x) => x.id === c.id)
    if (i >= 0) return i + 1
    citas.push(c)
    return citas.length
  }
  return (
    <div className="space-y-1.5">
      {fragmentos.map((f, i) =>
        f.tipo === 'texto' ? (
          <p key={i} className="text-[13px] leading-relaxed text-texto">
            {f.texto}
            {f.citas.map((c) => {
              const n = numero(c)
              return c.enlace ? (
                <Link key={c.id} to={c.enlace} title={c.etiqueta} className="ml-0.5 align-super text-[10px] font-semibold text-acento hover:underline">[{n}]</Link>
              ) : (
                <sup key={c.id} title={c.etiqueta} className="ml-0.5 text-[10px] font-semibold text-acento">[{n}]</sup>
              )
            })}
          </p>
        ) : f.tipo === 'remision' ? (
          <p key={i} className="rounded-lg bg-acento-suave px-2.5 py-1.5 text-xs text-texto">
            {f.texto}{' '}
            <Link to={f.a} className="inline-flex items-center gap-1 font-semibold text-acento hover:underline">Asistente de respuesta <ArrowRight className="size-3" aria-hidden /></Link>
          </p>
        ) : (
          <p key={i} className="flex items-start gap-1.5 text-xs text-texto-suave"><TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-aviso" aria-hidden />{f.texto}</p>
        ),
      )}
      {citas.length > 0 && (
        <ol aria-label="Fuentes" className="mt-1 space-y-0.5 border-t border-borde pt-1.5">
          {citas.map((c, i) => (
            <li key={c.id} className="text-[10.5px] text-texto-suave">
              <span className="font-semibold text-texto">[{i + 1}]</span> {c.etiqueta} · <span className="font-mono">{c.fuente}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function Panel({ contexto, conversacion, alCambiar }: { contexto: ContextoCopiloto; conversacion: Conversacion; alCambiar: (actualizar: (c: Conversacion) => Conversacion) => void }) {
  const [texto, setTexto] = useState('')
  const [enCurso, setEnCurso] = useState(false)
  const controlador = useRef<AbortController | null>(null)
  const reducido = useMovimientoReducido()

  const preguntarYEscuchar = async (pregunta: string) => {
    const limpia = pregunta.trim().slice(0, 300)
    if (!limpia || enCurso) return
    alCambiar((c) => {
      const conPregunta = preguntar(c, { organizacion: contexto.organizacion.id, texto: limpia })
      return { ...conPregunta, mensajes: [...conPregunta.mensajes, { rol: 'copiloto', fragmentos: [], completo: false }] }
    })
    const anadir = (f: Fragmento | null) =>
      alCambiar((c) => {
        const mensajes = [...c.mensajes]
        const ultimo = mensajes.at(-1)
        if (ultimo?.rol !== 'copiloto') return c
        mensajes[mensajes.length - 1] = f ? { ...ultimo, fragmentos: [...ultimo.fragmentos, f] } : { ...ultimo, completo: true }
        return { ...c, mensajes }
      })
    setTexto('')
    setEnCurso(true)
    controlador.current = new AbortController()
    try {
      const flujo = proveedorLocal.responder({ organizacion: contexto.organizacion.id, texto: limpia }, contexto, { retardoMs: reducido ? 0 : 140, senal: controlador.current.signal })
      for await (const f of flujo) anadir(verificarFragmento(f, contexto))
    } catch (error) {
      anadir({ tipo: 'aviso', texto: error instanceof DOMException && error.name === 'AbortError' ? 'Respuesta detenida.' : 'No se pudo responder.' })
    } finally {
      anadir(null)
      setEnCurso(false)
    }
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    void preguntarYEscuchar(texto)
  }

  return (
    <section aria-label={`Conversación con ${contexto.organizacion.nombre}`} className="flex min-h-[28rem] flex-col rounded-2xl border border-borde bg-superficie">
      <div role="log" aria-live="polite" aria-busy={enCurso} aria-label="Conversación" className="flex-1 space-y-3 overflow-y-auto p-4">
        {conversacion.mensajes.length === 0 && (
          <div className="space-y-2 text-xs text-texto-suave">
            <p>Pregunta por un host, una técnica o una fase del ataque. Cada afirmación llevará su cita.</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGERENCIAS.map((s) => (
                <button key={s} type="button" onClick={() => void preguntarYEscuchar(s)} className="rounded-full border border-borde px-2.5 py-1 text-texto hover:border-acento hover:text-acento">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {conversacion.mensajes.map((m, i) =>
          m.rol === 'usuario' ? (
            <p key={i} className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-acento-suave px-3 py-1.5 text-[13px] break-words text-texto">{m.texto}</p>
          ) : (
            <div key={i} className="max-w-[90%] rounded-2xl rounded-bl-sm border border-borde bg-superficie-alterna px-3 py-2">
              <Respuesta fragmentos={m.fragmentos} />
              {!m.completo && <span role="status" className="mt-1 block text-[10.5px] text-texto-suave">Respondiendo…</span>}
            </div>
          ),
        )}
      </div>
      <form onSubmit={enviar} className="flex items-center gap-2 border-t border-borde p-3">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={300}
          aria-label="Pregunta"
          placeholder={`Pregunta sobre ${contexto.organizacion.nombre}…`}
          className="min-w-0 flex-1 rounded-lg border border-borde bg-superficie px-3 py-1.5 text-sm text-texto placeholder:text-texto-suave focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
        />
        {enCurso ? (
          <Button type="button" size="sm" variant="outline" onClick={() => controlador.current?.abort()}><CircleStop aria-hidden />Detener</Button>
        ) : (
          <Button type="submit" size="sm" disabled={!texto.trim()}><Send aria-hidden />Preguntar</Button>
        )}
      </form>
    </section>
  )
}

export default function PaginaCopiloto() {
  const consulta = useDatosRespuesta()
  const [parametros, setParametros] = useSearchParams()
  const org: Org = ORGS.find((o) => o === parametros.get('org')) ?? 'dmevals'
  const [conversaciones, setConversaciones] = useState<Record<Org, Conversacion>>({ dmevals: nuevaConversacion('dmevals'), helios: nuevaConversacion('helios') })
  const datos = consulta.data
  const contextos = useMemo(() => (datos ? { dmevals: contextoDmevals(datos.alertas, datos.aristas, datos.incidentes), helios: contextoDemo(HELIOS) } : null), [datos])

  return (
    <>
      <EncabezadoPagina
        titulo="Copiloto"
        descripcion="Preguntas sobre la evidencia de una organización, con una cita en cada afirmación."
        comoLeer={
          <>
            <p>Pulsa una cita para ir a su evidencia. Cada conversación es de una sola organización y el copiloto no ejecuta nada.</p>
            <p>Hoy responde un proveedor local, sin modelo. El de modelo de lenguaje con recuperación (RAG) vivirá en el servidor; su diseño está en docs/copiloto-rag.md.</p>
          </>
        }
      />
      <p role="note" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs font-medium text-texto-suave">
        <Info className="size-3.5" aria-hidden />
        <span>
          No ejecuta acciones. Para mitigar, usa el <Link to="/respuesta" className="text-acento hover:underline">asistente de respuesta</Link>.
        </span>
      </p>
      {consulta.isError ? (
        <EstadoError error={consulta.error} alReintentar={() => void consulta.refetch()} reintentando={consulta.isFetching} />
      ) : !contextos ? (
        <div role="status" aria-label="Cargando el copiloto"><Skeleton className="h-96 rounded-2xl" /></div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="min-w-0 space-y-2">
            <div role="radiogroup" aria-label="Organización de la conversación" className="flex w-fit rounded-lg bg-superficie-alterna p-0.5">
              {ORGS.map((o) => (
                <button key={o} type="button" role="radio" aria-checked={org === o} onClick={() => setParametros({ org: o }, { replace: true })} className={cn('rounded-md px-3 py-1 text-xs font-semibold', org === o ? 'bg-superficie text-acento shadow-sm' : 'text-texto-suave')}>
                  {contextos[o].organizacion.nombre}
                </button>
              ))}
            </div>
            <Panel
              key={org}
              contexto={contextos[org]}
              conversacion={conversaciones[org]}
              alCambiar={(actualizar) => setConversaciones((todas) => ({ ...todas, [org]: actualizar(todas[org]) }))}
            />
          </div>
          <aside aria-label="Proveedores" className="space-y-2 rounded-2xl border border-borde bg-superficie p-3 text-xs">
            <h2 className="flex items-center gap-1.5 text-sm"><MessagesSquare className="size-4" aria-hidden />Proveedores</h2>
            <ul className="space-y-2">
              {PROVEEDORES.map((p) => (
                <li key={p.id}>
                  <p className="flex items-center justify-between gap-2 font-medium text-texto">
                    {p.nombre}
                    <span className={cn('shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold whitespace-nowrap', p.disponible ? 'bg-ok/15 text-ok' : 'bg-superficie-hundida text-texto-suave')}>{p.disponible ? 'activo' : 'no disponible'}</span>
                  </p>
                  <p className="text-[11px] text-texto-suave">{p.descripcion}</p>
                </li>
              ))}
            </ul>
            <p className="border-t border-borde pt-2 text-[11px] text-texto-suave">
              Datos: <ChipProcedencia procedencia={contextos[org].organizacion.procedencia} fuente={contextos[org].evidencias[0]?.fuente ?? ''} />
            </p>
          </aside>
        </div>
      )}
    </>
  )
}
