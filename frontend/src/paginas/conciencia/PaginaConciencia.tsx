/**
 * Conciencia cibersituacional (demo): qué parte de cada organización está atacando el adversario, hacia dónde va y
 * qué hay que hacer ya para pararlo. Es el anticipo visual de los Pilares B y C sobre datos simulados.
 *
 *   selector      las organizaciones vigiladas, cada una con el estado de su simulación en directo
 *   control       lanzar, pausar o reiniciar el ataque simulado, y su velocidad
 *   grafo         la SEDE por dentro, con el ataque encima: planta 2D (`GrafoOrganizacion`, por defecto) o maqueta
 *                 3D (`Maqueta3D`); o el MUNDO, de dónde viene y adónde va el ataque: mapa 2D (`MapaMundi2D`) o
 *                 globo 3D (`Globo3D`). `?ambito=sede|mundo` y `?vista=2d|3d`, recordados por navegador; lo que no
 *                 es la planta se carga en diferido
 *   cronología    los pasos según ocurren y las respuestas aplicadas
 *   asistente     situación, gravedad y respuesta inmediata (`PanelAsistente`)
 *
 * Todo lo que se ve se recalcula en cada tic a partir de (organización, instante, acciones aplicadas) con funciones
 * puras: `evaluar`, `rutaProbable`, `puntuar`, `recomendar` y el redactor.
 */
import { Pause, Play, RotateCcw, ShieldCheck, Siren } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

import { Button } from '@/componentes/ui/button'
import { Skeleton } from '@/componentes/ui/skeleton'
import { cn } from '@/lib/utils'

import { puntuar } from './asistente/puntuacion'
import { redactorPlantillas } from './asistente/redactor'
import { recomendar } from './asistente/reglas'
import { Cronologia } from './Cronologia'
import { GrafoOrganizacion } from './GrafoOrganizacion'
import type { Organizacion } from './modelo'
import { organizacion, ORGANIZACIONES } from './organizaciones'
import { PanelAsistente } from './PanelAsistente'
import { areasAfectadas, enRiesgo, rutaProbable } from './razonamiento'
import { desenlace, evaluar } from './simulacion'
import { useSimulaciones, type Simulacion } from './useSimulaciones'
import { hayWebGL } from './webgl'

// three.js solo se descarga si se elige una vista 3D; el mapa del mundo (d3-geo y las costas), si se elige el mundo.
const Maqueta3D = lazy(() => import('./Maqueta3D'))
const Globo3D = lazy(() => import('./Globo3D'))
const MapaMundi2D = lazy(() => import('./MapaMundi2D'))

type Vista = '2d' | '3d'
type Ambito = 'sede' | 'mundo'
const CLAVE_VISTA = 'tfg-vista-conciencia'
const CLAVE_AMBITO = 'tfg-ambito-conciencia'
const esVista = (v: unknown): v is Vista => v === '2d' || v === '3d'
const esAmbito = (v: unknown): v is Ambito => v === 'sede' || v === 'mundo'

function leerGuardado<T>(clave: string, valido: (v: unknown) => v is T): T | null {
  try {
    const v = localStorage.getItem(clave)
    return valido(v) ? v : null
  } catch {
    return null
  }
}

function guardar(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    // sin almacenamiento (ventana privada, bloqueado): la elección dura lo que dure la página
  }
}

const BOTON_SELECTOR = 'rounded-md px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50'

/** Qué se ve: la sede (sus salas y equipos) o el mundo (de dónde viene y adónde va el ataque). */
function SelectorAmbito({ ambito, alCambiar }: { ambito: Ambito; alCambiar: (a: Ambito) => void }) {
  return (
    <span role="radiogroup" aria-label="Qué ver" className="flex rounded-lg border border-borde bg-superficie p-0.5 shadow-sm">
      {([
        { valor: 'sede', texto: 'Sede', titulo: 'La organización por dentro: salas, equipos y el ataque' },
        { valor: 'mundo', texto: 'Mundo', titulo: 'De dónde viene y adónde va el ataque (ubicaciones ilustrativas)' },
      ] as const).map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={ambito === o.valor} title={o.titulo} onClick={() => alCambiar(o.valor)} className={cn(BOTON_SELECTOR, ambito === o.valor ? 'bg-acento text-sobre-intenso' : 'text-texto-suave hover:text-texto')}>
          {o.texto}
        </button>
      ))}
    </span>
  )
}

/** 2D (por defecto, la accesible) o 3D, para la sede y para el mundo. Sin WebGL, el 3D no se ofrece. */
function SelectorVista({ vista, ambito, webgl, alCambiar }: { vista: Vista; ambito: Ambito; webgl: boolean | null; alCambiar: (v: Vista) => void }) {
  return (
    <span role="radiogroup" aria-label="Vista de la organización" className="flex w-fit rounded-lg border border-borde bg-superficie p-0.5 shadow-sm">
      {(['2d', '3d'] as const).map((v) => {
        const deshabilitada = v === '3d' && !webgl
        const titulo = ambito === 'mundo' ? (v === '3d' ? 'Globo 3D' : 'Mapa del mundo 2D') : v === '3d' ? 'Maqueta 3D de la organización' : 'Planta 2D de la sede'
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={vista === v}
            disabled={deshabilitada}
            title={deshabilitada ? (webgl === null ? 'Comprobando si el navegador puede mostrar 3D…' : 'Este navegador no puede mostrar la vista 3D (sin WebGL)') : titulo}
            onClick={() => alCambiar(v)}
            className={cn(BOTON_SELECTOR, vista === v ? 'bg-acento text-sobre-intenso' : 'text-texto-suave hover:text-texto')}
          >
            {v.toUpperCase()}
          </button>
        )
      })}
    </span>
  )
}

function analizar(org: Organizacion, sim: Simulacion) {
  const ev = evaluar(org, sim.tiempo, sim.acciones)
  const ruta = rutaProbable(org, ev)
  const puntuacion = puntuar(org, ev, ruta)
  const recomendaciones = recomendar(org, ev, ruta, sim.acciones)
  return { ev, ruta, puntuacion, recomendaciones, riesgo: enRiesgo(org, ev), areas: areasAfectadas(org, ev), final: desenlace(ev) }
}

function EstadoOrg({ org, sim }: { org: Organizacion; sim: Simulacion }) {
  const { ev, puntuacion, final } = analizar(org, sim)
  if (sim.enMarcha) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-sev-critica">
        <span className="relative flex size-2" aria-hidden>
          <span className="punto-vivo absolute inset-0 rounded-full bg-sev-critica/60" />
          <span className="relative size-2 rounded-full bg-sev-critica" />
        </span>
        Ataque en curso · {puntuacion.total}
      </span>
    )
  }
  if (final) {
    return final.tono === 'contenido'
      ? <span className="text-xs font-semibold text-ok">Ataque contenido</span>
      : <span className="text-xs font-semibold text-sev-critica">Objetivo alcanzado · {puntuacion.total}</span>
  }
  if (ev.empezado) return <span className="text-xs font-semibold text-aviso">En pausa · {puntuacion.total}</span>
  return <span className="text-xs text-texto-suave">En calma</span>
}

export default function PaginaConciencia() {
  const [parametros, setParametros] = useSearchParams()
  const org = organizacion(parametros.get('org'))
  const [preferida, setPreferida] = useState(() => leerGuardado(CLAVE_VISTA, esVista))
  const [ambitoPreferido, setAmbitoPreferido] = useState(() => leerGuardado(CLAVE_AMBITO, esAmbito))
  const pedida = parametros.get('vista')
  const ambitoPedido = parametros.get('ambito')
  const ambito: Ambito = esAmbito(ambitoPedido) ? ambitoPedido : (ambitoPreferido ?? 'sede')
  // Comprobar WebGL crea un contexto de prueba, que sin GPU puede costar medio segundo: si se ha pedido el 3D se
  // comprueba ya (hará falta igualmente); si no, después de pintar la página, para no retrasar la navegación.
  const [webgl, setWebgl] = useState<boolean | null>(() => ((esVista(pedida) ? pedida : preferida) === '3d' ? hayWebGL() : null))
  useEffect(() => {
    if (webgl !== null) return
    const id = window.setTimeout(() => setWebgl(hayWebGL()), 400)
    return () => window.clearTimeout(id)
  }, [webgl])
  const vista: Vista = webgl ? (esVista(pedida) ? pedida : (preferida ?? '2d')) : '2d'
  const fijarParametro = (clave: string, valor: string) =>
    setParametros(
      (previos) => {
        const nuevos = new URLSearchParams(previos)
        nuevos.set(clave, valor)
        return nuevos
      },
      { replace: true },
    )
  const cambiarVista = (v: Vista) => {
    guardar(CLAVE_VISTA, v)
    setPreferida(v)
    fijarParametro('vista', v)
  }
  const cambiarAmbito = (a: Ambito) => {
    guardar(CLAVE_AMBITO, a)
    setAmbitoPreferido(a)
    fijarParametro('ambito', a)
  }
  const tiempoInicial = Number(parametros.get('t'))
  const { simulaciones, iniciar, pausar, reiniciar, fijarVelocidad, aplicar } = useSimulaciones(
    Number.isFinite(tiempoInicial) && tiempoInicial > 0 ? { org: org.id, tiempo: tiempoInicial } : undefined,
  )
  const sim = simulaciones[org.id]
  const { ev, ruta, puntuacion, recomendaciones, riesgo, areas, final } = analizar(org, sim)
  const parrafos = redactorPlantillas.redactar({ org, ev, ruta, puntuacion, recomendaciones })
  const ultimo = ev.ocurridos.at(-1)
  const ultimoVisto = ev.pasos.at(-1)?.paso

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-xl">Conciencia situacional</h1>
          <p className="text-xs text-texto-suave">Demo con datos simulados: qué parte de la organización se ataca, hacia dónde va el atacante y qué hacer ya.</p>
        </div>
        <nav aria-label="Organizaciones" className="flex gap-2 overflow-x-auto">
          {ORGANIZACIONES.map((o) => {
            const elegida = o.id === org.id
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={elegida}
                onClick={() => setParametros({ org: o.id, ...(esVista(pedida) ? { vista: pedida } : {}), ...(esAmbito(ambitoPedido) ? { ambito: ambitoPedido } : {}) }, { replace: true })}
                className={cn(
                  'min-w-52 shrink-0 rounded-2xl border px-3.5 py-2 text-left transition',
                  elegida ? 'border-acento bg-superficie shadow-sm' : 'border-borde bg-superficie/60 hover:bg-superficie',
                )}
              >
                <span className={cn('block text-sm font-semibold', elegida ? 'text-acento' : 'text-texto')}>{o.nombre}</span>
                <span className="block text-[11px] text-texto-suave">{o.sector}</span>
                <EstadoOrg org={o} sim={simulaciones[o.id]} />
              </button>
            )
          })}
        </nav>
      </header>

      <div role="group" aria-label="Control de la simulación" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-borde bg-superficie px-4 py-2.5">
        {sim.enMarcha ? (
          <Button size="sm" variant="outline" onClick={() => pausar(org.id)}>
            <Pause aria-hidden />
            Pausar
          </Button>
        ) : (
          <Button size="sm" onClick={() => iniciar(org.id)} className="bg-sev-critica hover:bg-sev-critica/85">
            <Play aria-hidden />
            {ev.empezado && !final ? 'Reanudar el ataque' : 'Simular ciberataque'}
          </Button>
        )}
        {ev.empezado && (
          <Button size="sm" variant="ghost" onClick={() => reiniciar(org.id)}>
            <RotateCcw aria-hidden />
            Reiniciar
          </Button>
        )}
        <span role="radiogroup" aria-label="Velocidad" className="flex rounded-lg bg-superficie-alterna p-0.5">
          {([1, 2, 4] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={sim.velocidad === v}
              onClick={() => fijarVelocidad(org.id, v)}
              className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', sim.velocidad === v ? 'bg-superficie text-acento shadow-sm' : 'text-texto-suave')}
            >
              ×{v}
            </button>
          ))}
        </span>
        <span className="flex items-center gap-2 text-xs text-texto-suave">
          Hora del escenario <span className="font-semibold text-texto tabular-nums">{ultimoVisto?.hora ?? '—'}</span>
          <span className="h-1.5 w-32 overflow-hidden rounded-full bg-superficie-hundida" aria-hidden>
            <span className="block h-full rounded-full bg-sev-critica transition-[width] duration-200" style={{ width: `${Math.min(1, ev.tiempo / ev.duracion) * 100}%` }} />
          </span>
        </span>
        <span className="text-[11px] text-texto-suave">{org.procedenciaEscenario}</span>
        {(areas.atacadas.length > 0 || areas.enRiesgo.length > 0) && (
          <span className="ml-auto flex flex-wrap items-center gap-1.5 text-xs" aria-label="Áreas afectadas">
            {areas.atacadas.filter((a) => a !== 'Externo').map((a) => (
              <span key={a} className="rounded-full bg-sev-critica/12 px-2 py-0.5 font-semibold text-sev-critica">{a}</span>
            ))}
            {areas.enRiesgo.map((a) => (
              <span key={a} className="rounded-full bg-sev-media/12 px-2 py-0.5 font-semibold text-sev-media">{a} · en riesgo</span>
            ))}
          </span>
        )}
      </div>

      {final && (
        <p role="status" className={cn('flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium', final.tono === 'contenido' ? 'bg-ok/12 text-ok' : 'bg-sev-critica/10 text-sev-critica')}>
          {final.tono === 'contenido' ? <ShieldCheck className="size-4" aria-hidden /> : <Siren className="size-4" aria-hidden />}
          {final.texto}
        </p>
      )}

      <div className="grid min-h-[31rem] flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="grid min-h-[36rem] gap-3 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_10.5rem]">
          <div className="relative min-h-0">
            <div className="absolute top-3 left-3 z-20 flex flex-col items-start gap-1.5">
              <SelectorAmbito ambito={ambito} alCambiar={cambiarAmbito} />
              <SelectorVista vista={vista} ambito={ambito} webgl={webgl} alCambiar={cambiarVista} />
            </div>
            {ambito === 'sede' && vista === '3d' ? (
              <Suspense fallback={<div role="status" aria-label="Cargando la maqueta 3D" className="h-full"><Skeleton className="h-full rounded-lg" /></div>}>
                <Maqueta3D
                  org={org}
                  ev={ev}
                  ruta={ruta}
                  riesgo={riesgo}
                  acciones={sim.acciones}
                  enMarcha={sim.enMarcha}
                  alIniciar={() => iniciar(org.id)}
                  alPausar={() => pausar(org.id)}
                  alVolverA2D={() => cambiarVista('2d')}
                />
              </Suspense>
            ) : ambito === 'mundo' ? (
              <Suspense fallback={<div role="status" aria-label="Cargando el mapa del mundo" className="h-full"><Skeleton className="h-full rounded-lg" /></div>}>
                {vista === '3d' ? <Globo3D org={org} ev={ev} enMarcha={sim.enMarcha} alVolverA2D={() => cambiarVista('2d')} /> : <MapaMundi2D org={org} ev={ev} enMarcha={sim.enMarcha} />}
              </Suspense>
            ) : (
              <GrafoOrganizacion org={org} ev={ev} ruta={ruta} riesgo={riesgo} enMarcha={sim.enMarcha} />
            )}
          </div>
          <Cronologia org={org} ev={ev} acciones={sim.acciones} />
        </div>
        <PanelAsistente
          parrafos={parrafos}
          puntuacion={puntuacion}
          recomendaciones={recomendaciones}
          aplicadas={sim.acciones}
          empezado={ultimo !== undefined}
          alAplicar={(rec) => aplicar(org.id, { clave: rec.clave, titulo: rec.titulo, efecto: rec.efecto })}
          enlaceRespuesta={`/respuesta?caso=${org.id}${ev.tiempo > 0 ? `&t=${Math.round(ev.tiempo)}` : ''}`}
        />
      </div>
    </div>
  )
}
