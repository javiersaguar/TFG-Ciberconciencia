/**
 * Panel del Copiloto: el MISMO componente en el panel lateral derecho (`modo="lateral"`) y en la vista ampliada de
 * `/copiloto` (`modo="completo"`). Se carga en diferido: la portada no lo descarga.
 *
 * Cabecera: organización con su estado, proveedor activo, nueva conversación, ampliar/reducir y cerrar. Cuerpo: los
 * avisos proactivos «Conviene vigilar» (señales débiles, con su nivel de atención y cómo descartarlas) y la
 * conversación, con cada respuesta en sus bloques (hechos, inferencias, señales débiles, recomendaciones) y las citas
 * como enlaces a la evidencia. Pie: la pregunta (Intro envía, Mayús+Intro salta de línea), sugerencias según la página
 * y el aviso fijo de que no ejecuta nada. Todo el texto de los datos se pinta como texto.
 */
import { ArrowRight, CircleStop, Eye, Maximize2, MessagesSquare, Minimize2, RotateCcw, Send, TriangleAlert, X } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

import { useDatosRespuesta } from '@/api/respuesta'
import { ChipProcedencia } from '@/componentes/datos/Chips'
import { esObjeto, useEstadoSesion } from '@/componentes/datos/useEstadoSesion'
import { useMovimientoReducido } from '@/componentes/datos/useMovimientoReducido'
import { EstadoError } from '@/componentes/shell/Estados'
import { Button } from '@/componentes/ui/button'
import { cn } from '@/lib/utils'
import { useEstadoSimulaciones } from '@/paginas/conciencia/estadoSimulaciones'
import { HELIOS } from '@/paginas/conciencia/organizaciones/helios'
import { desenlace, evaluar } from '@/paginas/conciencia/simulacion'

import { ORGS_COPILOTO, useCopiloto, type OrgCopiloto } from './estado'
import {
  contextoDemo,
  contextoDmevals,
  MAX_PREGUNTA,
  nuevaConversacion,
  preguntar,
  proveedorLlmRag,
  proveedorLocal,
  TITULO_BLOQUE,
  verificarFragmento,
  type Bloque,
  type Cita,
  type ContextoCopiloto,
  type Conversacion,
  type Fragmento,
  type Mensaje,
} from './nucleo'
import type { Senal } from './senales'
import { sugerenciasPara } from './sugerencias'
import { useSenalesDebiles } from './useSenalesDebiles'

const NOMBRE: Record<OrgCopiloto, string> = { dmevals: 'DMEVALS (APT29 day1)', helios: HELIOS.nombre }
const BLOQUES: Bloque[] = ['hechos', 'inferencias', 'senales', 'recomendaciones']
const ESTILO_BLOQUE: Record<Bloque, string> = {
  hechos: 'border-fund-observado',
  inferencias: 'border-fund-inferido border-dashed',
  senales: 'border-fund-hipotesis border-dotted',
  recomendaciones: 'border-acento',
}

type EstadoOrg = { texto: 'en calma' | 'bajo ataque' | 'contenida'; nota: string }


const esConversacionDe = (org: string) => (v: unknown): v is Conversacion =>
  esObjeto(v) && v.organizacion === org && Array.isArray(v.mensajes) && v.mensajes.length <= 60 &&
  v.mensajes.every((m) => esObjeto(m) && ((m.rol === 'usuario' && typeof m.texto === 'string') || (m.rol === 'copiloto' && Array.isArray(m.fragmentos))))

function CitaEnlace({ n, c }: { n: number; c: Cita }) {
  const clase = 'ml-0.5 inline-flex items-center rounded-full bg-acento-suave px-1.5 align-[1px] text-[10px] font-semibold text-acento'
  return c.enlace ? <Link to={c.enlace} title={c.etiqueta} className={cn(clase, 'hover:underline')}>[{n}]</Link> : <span title={c.etiqueta} className={clase}>[{n}]</span>
}

/** Una respuesta del Copiloto en sus bloques, con las citas numeradas y la lista de fuentes. */
export function Respuesta({ fragmentos }: { fragmentos: Fragmento[] }) {
  const citas: Cita[] = []
  const numero = (c: Cita) => {
    const i = citas.findIndex((x) => x.id === c.id)
    if (i >= 0) return i + 1
    citas.push(c)
    return citas.length
  }
  const avisos = fragmentos.filter((f): f is Extract<Fragmento, { tipo: 'aviso' }> => f.tipo === 'aviso')
  const de = (b: Bloque) => fragmentos.filter((f) => (f.tipo === 'texto' && (f.bloque ?? 'hechos') === b) || (b === 'recomendaciones' && f.tipo === 'remision'))
  return (
    <div className="space-y-2">
      {avisos.map((f, i) => (
        <p key={`a${i}`} className="flex items-start gap-1.5 text-xs text-texto-suave"><TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-aviso" aria-hidden />{f.texto}</p>
      ))}
      {BLOQUES.map((b) => {
        const lista = de(b)
        if (lista.length === 0) return null
        return (
          <section key={b} aria-label={TITULO_BLOQUE[b]} className={cn('space-y-1 border-l-2 pl-2', ESTILO_BLOQUE[b])}>
            <h4 className="text-[10.5px] font-semibold tracking-wide text-texto-suave uppercase">{TITULO_BLOQUE[b]}</h4>
            {lista.map((f, i) =>
              f.tipo === 'texto' ? (
                <p key={i} className="text-[13px] leading-relaxed break-words text-texto">
                  {f.texto}
                  {f.citas.map((c) => <CitaEnlace key={c.id} n={numero(c)} c={c} />)}
                </p>
              ) : f.tipo === 'remision' ? (
                <p key={i} className="text-xs text-texto">
                  {f.texto}{' '}
                  <Link to={f.a} className="inline-flex items-center gap-1 font-semibold text-acento hover:underline">{f.etiqueta ?? 'Ver'} <ArrowRight className="size-3" aria-hidden /></Link>
                </p>
              ) : null,
            )}
          </section>
        )
      })}
      {citas.length > 0 && (
        <ol aria-label="Fuentes" className="space-y-0.5 border-t border-borde pt-1.5">
          {citas.map((c, i) => (
            <li key={c.id} className="text-[10.5px] break-words text-texto-suave">
              <span className="font-semibold text-texto">[{i + 1}]</span> {c.etiqueta} · <span className="font-mono">{c.fuente}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** Aviso proactivo: estilo propio (no el de una alerta), su nivel de atención en texto, su evidencia y cómo descartarlo. */
function AvisoVigilar({ senal, alDescartar }: { senal: Senal; alDescartar: () => void }) {
  return (
    <article aria-label={`Aviso: ${senal.titulo}`} className="space-y-1 rounded-xl border border-dashed border-fund-hipotesis bg-fund-hipotesis/8 px-3 py-2">
      <header className="flex flex-wrap items-center gap-1.5">
        <Eye className="size-3.5 text-fund-hipotesis" aria-hidden />
        <h3 className="text-[13px] font-semibold text-texto">{senal.titulo}</h3>
        <span className="rounded-full border border-borde px-1.5 text-[10px] font-semibold text-texto">atención {senal.atencion}</span>
        <ChipProcedencia procedencia={senal.procedencia} fuente={senal.citas[0]?.fuente} />
      </header>
      <p className="text-xs leading-relaxed break-words text-texto">
        {senal.porque}
        {senal.citas.map((c, i) => <CitaEnlace key={c.id} n={i + 1} c={c} />)}
      </p>
      <p className="text-[10.5px] text-texto-suave">Umbral: {senal.umbral}. No es una alerta ni cambia la severidad de nada.</p>
      <p className="flex flex-wrap items-center gap-3 text-xs">
        <Link to={senal.vigilar.a} className="inline-flex items-center gap-1 font-semibold text-acento hover:underline">{senal.vigilar.texto} <ArrowRight className="size-3" aria-hidden /></Link>
        <button type="button" onClick={alDescartar} title={senal.descartar} className="text-texto-suave hover:text-texto hover:underline">Descartar</button>
      </p>
    </article>
  )
}

function estadoDe(org: OrgCopiloto, simulaciones: ReturnType<typeof useEstadoSimulaciones>['simulaciones']): EstadoOrg {
  if (org === 'dmevals') return { texto: 'bajo ataque', nota: 'histórico · 2-5-2020' }
  const s = simulaciones[HELIOS.id]
  const ev = evaluar(HELIOS, s?.tiempo ?? 0, s?.acciones ?? [])
  if (!ev.empezado) return { texto: 'en calma', nota: 'simulación parada' }
  return desenlace(ev)?.tono === 'contenido' ? { texto: 'contenida', nota: 'simulación' } : { texto: 'bajo ataque', nota: `simulación · ${Math.floor(s?.tiempo ?? 0)} s` }
}

/** La conversación de UNA organización (se vuelve a montar al cambiar de organización). */
function ConversacionOrg({ org, contexto }: { org: OrgCopiloto; contexto: ContextoCopiloto }) {
  const copiloto = useCopiloto()
  const { pathname } = useLocation()
  const reducido = useMovimientoReducido()
  const [conversacion, setConversacion] = useEstadoSesion(`copiloto:conversacion:${org}`, () => nuevaConversacion(org), esConversacionDe(org))
  const { senales, descartar } = useSenalesDebiles(org)
  const peticion = copiloto.peticion
  const [texto, setTexto] = useState(peticion?.pregunta ?? '')
  const [peticionVista, setPeticionVista] = useState(peticion?.id)
  const [enCurso, setEnCurso] = useState(false)
  const controlador = useRef<AbortController | null>(null)
  const caja = useRef<HTMLTextAreaElement>(null)

  // Una pregunta precargada nueva («Preguntar al Copiloto sobre esto») llena la caja; no se envía sola.
  if (peticion && peticion.id !== peticionVista) {
    setPeticionVista(peticion.id)
    setTexto(peticion.pregunta)
  }
  const seleccion = peticion?.seleccion
  const completo = useMemo<ContextoCopiloto>(
    () => ({ ...contexto, pagina: pathname, seleccion, senales, historial: conversacion.mensajes.flatMap((m) => (m.rol === 'usuario' ? [m.texto] : [])).slice(-4) }),
    [contexto, pathname, seleccion, senales, conversacion.mensajes],
  )

  const preguntarYEscuchar = async (pregunta: string) => {
    const limpia = pregunta.trim().slice(0, MAX_PREGUNTA)
    if (!limpia || enCurso) return
    setConversacion((c) => {
      const conPregunta = preguntar(c, { organizacion: contexto.organizacion.id, texto: limpia })
      const respuesta: Mensaje = { rol: 'copiloto', fragmentos: [], completo: false }
      return { ...conPregunta, mensajes: [...conPregunta.mensajes, respuesta].slice(-60) }
    })
    const anadir = (f: Fragmento | null) =>
      setConversacion((c) => {
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
      const flujo = proveedorLocal.responder({ organizacion: contexto.organizacion.id, texto: limpia }, completo, { retardoMs: reducido ? 0 : 140, senal: controlador.current.signal })
      for await (const f of flujo) anadir(verificarFragmento(f, completo))
    } catch (error) {
      anadir({ tipo: 'aviso', texto: error instanceof DOMException && error.name === 'AbortError' ? 'Respuesta detenida.' : 'No se pudo responder.' })
    } finally {
      anadir(null)
      setEnCurso(false)
    }
  }
  const enviar = (e?: FormEvent) => {
    e?.preventDefault()
    void preguntarYEscuchar(texto)
  }
  const alTeclear = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      enviar()
    }
  }
  const sugerencias = sugerenciasPara(pathname, org, seleccion)

  return (
    <>
      <div role="log" aria-live="polite" aria-busy={enCurso} aria-label="Conversación" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {senales.length > 0 && (
          <section aria-label="Conviene vigilar" className="space-y-2">
            {senales.map((s) => <AvisoVigilar key={s.id} senal={s} alDescartar={() => descartar(s.id)} />)}
          </section>
        )}
        {conversacion.mensajes.length === 0 && (
          <div className="space-y-2 text-xs text-texto-suave">
            <p>Pregunta por la actividad, un host, una técnica o qué conviene vigilar. Cada afirmación llevará su cita.</p>
            <div className="flex flex-wrap gap-1.5">
              {sugerencias.map((s) => (
                <button key={s} type="button" onClick={() => void preguntarYEscuchar(s)} className="rounded-full border border-borde px-2.5 py-1 text-texto hover:border-acento hover:text-acento">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {conversacion.mensajes.map((m, i) =>
          m.rol === 'usuario' ? (
            <p key={i} className="entrada-mensaje ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-acento-suave px-3 py-1.5 text-[13px] break-words whitespace-pre-wrap text-texto">{m.texto}</p>
          ) : (
            <div key={i} className="entrada-mensaje max-w-[95%] space-y-1.5 rounded-2xl rounded-bl-sm border border-borde bg-superficie-alterna px-3 py-2">
              <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-texto-suave">
                Copiloto <ChipProcedencia procedencia={contexto.organizacion.procedencia} fuente={contexto.evidencias[0]?.fuente} />
              </p>
              {/* lo guardado en la sesión se vuelve a verificar al pintarlo: una cita que no exista no se enseña */}
              <Respuesta fragmentos={m.fragmentos.map((f) => verificarFragmento(f, completo))} />
              {!m.completo && enCurso && i === conversacion.mensajes.length - 1 && <span role="status" className="block text-[10.5px] text-texto-suave">Respondiendo…</span>}
            </div>
          ),
        )}
      </div>
      <form onSubmit={enviar} className="space-y-2 border-t border-borde p-3">
        {conversacion.mensajes.length > 0 && (
          <div className="flex flex-wrap gap-1" aria-label="Preguntas sugeridas">
            {sugerencias.slice(0, 3).map((s) => (
              <button key={s} type="button" onClick={() => void preguntarYEscuchar(s)} className="rounded-full border border-borde px-2 py-0.5 text-[11px] text-texto hover:border-acento hover:text-acento">
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={caja}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={alTeclear}
            maxLength={MAX_PREGUNTA}
            rows={2}
            aria-label="Pregunta"
            placeholder={`Pregunta sobre ${contexto.organizacion.nombre}…`}
            className="min-w-0 flex-1 resize-none rounded-lg border border-borde bg-superficie px-3 py-1.5 text-sm text-texto placeholder:text-texto-suave focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
          />
          {enCurso ? (
            <Button type="button" size="sm" variant="outline" onClick={() => controlador.current?.abort()}><CircleStop aria-hidden />Detener</Button>
          ) : (
            <Button type="submit" size="sm" disabled={!texto.trim()}><Send aria-hidden />Preguntar</Button>
          )}
        </div>
        <p className="flex items-center justify-between gap-2 text-[10.5px] text-texto-suave">
          <span>El Copiloto consulta y avisa; no ejecuta acciones.</span>
          <button type="button" onClick={() => setConversacion(nuevaConversacion(org))} className="inline-flex items-center gap-1 hover:text-texto hover:underline">
            <RotateCcw className="size-3" aria-hidden />Borrar conversación
          </button>
        </p>
      </form>
    </>
  )
}

export default function PanelCopiloto({ modo, org: orgFijada, alCambiarOrg }: { modo: 'lateral' | 'completo'; org?: OrgCopiloto; alCambiarOrg?: (org: OrgCopiloto) => void }) {
  const copiloto = useCopiloto()
  const navegar = useNavigate()
  const org = orgFijada ?? copiloto.org
  const cambiarOrg = (o: OrgCopiloto) => {
    copiloto.fijarOrg(o)
    alCambiarOrg?.(o)
  }
  const datos = useDatosRespuesta({ activo: org === 'dmevals' })
  const { simulaciones } = useEstadoSimulaciones()
  const sim = simulaciones[HELIOS.id]
  const contextoDm = useMemo(() => (datos.data ? contextoDmevals(datos.data.alertas, datos.data.aristas, datos.data.incidentes) : null), [datos.data])
  const contextoHelios = useMemo(() => contextoDemo(HELIOS, sim?.tiempo ?? 0, sim?.acciones ?? []), [sim?.tiempo, sim?.acciones])
  const contexto = org === 'dmevals' ? contextoDm : contextoHelios

  const ampliar = () => {
    navegar(`/copiloto?org=${org}`)
    copiloto.cerrar()
  }
  const reducir = () => {
    copiloto.abrir()
    if ((window.history.state as { idx?: number } | null)?.idx) navegar(-1)
    else navegar('/')
  }

  const cuerpo = (
    <>
      <header className="space-y-2 border-b border-borde px-3 py-2">
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-1.5 text-sm"><MessagesSquare className="size-4 text-acento" aria-hidden />Copiloto</h2>
          <span title={proveedorLocal.descripcion} className="rounded-full bg-ok/12 px-1.5 py-px text-[10px] font-semibold whitespace-nowrap text-ok">{proveedorLocal.indicador}</span>
          <span title={proveedorLlmRag.descripcion} className="hidden rounded-full bg-superficie-hundida px-1.5 py-px text-[10px] font-semibold whitespace-nowrap text-texto-suave sm:inline">{proveedorLlmRag.indicador}</span>
          <span className="ml-auto flex items-center">
            {modo === 'lateral' ? (
              <button type="button" onClick={ampliar} aria-label="Ampliar el Copiloto a pantalla completa" title="Ampliar" className="rounded-md p-1.5 text-texto-suave hover:bg-superficie-alterna hover:text-texto"><Maximize2 className="size-4" aria-hidden /></button>
            ) : (
              <button type="button" onClick={reducir} aria-label="Volver al panel lateral" title="Reducir" className="rounded-md p-1.5 text-texto-suave hover:bg-superficie-alterna hover:text-texto"><Minimize2 className="size-4" aria-hidden /></button>
            )}
            {modo === 'lateral' && (
              <button type="button" onClick={copiloto.cerrar} aria-label="Cerrar el Copiloto" title="Cerrar (Esc)" className="rounded-md p-1.5 text-texto-suave hover:bg-superficie-alterna hover:text-texto"><X className="size-4" aria-hidden /></button>
            )}
          </span>
        </div>
        <div role="radiogroup" aria-label="Organización de la conversación" className="flex flex-wrap gap-1">
          {ORGS_COPILOTO.map((o) => {
            const estado = estadoDe(o, simulaciones)
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={org === o}
                onClick={() => cambiarOrg(o)}
                title={estado.nota}
                className={cn('flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold', org === o ? 'border-acento bg-acento-suave text-acento' : 'border-borde text-texto-suave hover:text-texto')}
              >
                {NOMBRE[o]}
                <span className={cn('rounded-full px-1.5 text-[10px] font-semibold', estado.texto === 'bajo ataque' ? 'bg-sev-alta/15 text-sev-alta' : estado.texto === 'contenida' ? 'bg-ok/15 text-ok' : 'bg-superficie-hundida text-texto-suave')}>
                  {estado.texto}
                </span>
              </button>
            )
          })}
        </div>
      </header>
      {org === 'dmevals' && datos.isError ? (
        <div className="p-3"><EstadoError error={datos.error} alReintentar={() => void datos.refetch()} reintentando={datos.isFetching} /></div>
      ) : !contexto ? (
        <div role="status" aria-label="Cargando el Copiloto" className="p-3 text-xs text-texto-suave">Cargando la evidencia de {NOMBRE[org]}…</div>
      ) : (
        <ConversacionOrg key={org} org={org} contexto={contexto} />
      )}
    </>
  )

  return modo === 'lateral' ? (
    <div className="flex h-full min-h-0 flex-col">{cuerpo}</div>
  ) : (
    <section aria-label="Copiloto" className="flex h-[calc(100svh-11rem)] min-h-[30rem] flex-col overflow-hidden rounded-2xl border border-borde bg-superficie">{cuerpo}</section>
  )
}
