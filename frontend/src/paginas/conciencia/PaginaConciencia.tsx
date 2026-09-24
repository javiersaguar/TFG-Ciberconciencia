/**
 * Conciencia cibersituacional (demo): qué parte de cada organización está atacando el adversario, hacia dónde va y
 * qué hay que hacer ya para pararlo. Es el anticipo visual de los Pilares B y C sobre datos simulados.
 *
 *   selector      las organizaciones vigiladas, cada una con el estado de su simulación en directo
 *   control       lanzar, pausar o reiniciar el ataque simulado, y su velocidad
 *   grafo         la organización por zonas y áreas, con el ataque encima (`GrafoOrganizacion`)
 *   cronología    los pasos según ocurren y las respuestas aplicadas
 *   asistente     situación, gravedad y respuesta inmediata (`PanelAsistente`)
 *
 * Todo lo que se ve se recalcula en cada tic a partir de (organización, instante, acciones aplicadas) con funciones
 * puras: `evaluar`, `rutaProbable`, `puntuar`, `recomendar` y el redactor.
 */
import { Pause, Play, RotateCcw, ShieldCheck, Siren } from 'lucide-react'
import { useSearchParams } from 'react-router'

import { Button } from '@/componentes/ui/button'
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
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto lg:overflow-hidden">
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
                onClick={() => setParametros({ org: o.id }, { replace: true })}
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

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="grid min-h-[36rem] gap-3 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_10.5rem]">
          <GrafoOrganizacion org={org} ev={ev} ruta={ruta} riesgo={riesgo} />
          <Cronologia org={org} ev={ev} acciones={sim.acciones} />
        </div>
        <PanelAsistente
          parrafos={parrafos}
          puntuacion={puntuacion}
          recomendaciones={recomendaciones}
          aplicadas={sim.acciones}
          empezado={ultimo !== undefined}
          alAplicar={(rec) => aplicar(org.id, { clave: rec.clave, titulo: rec.titulo, efecto: rec.efecto })}
        />
      </div>
    </div>
  )
}
