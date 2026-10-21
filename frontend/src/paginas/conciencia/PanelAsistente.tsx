/**
 * Resumen del asistente de respuesta dentro de la simulación: la situación redactada, la gravedad con sus factores y
 * las acciones que se pueden PROBAR en la simulación. El razonamiento completo (hechos observados, inferencias y plan,
 * con su procedencia por bloque) está en `/respuesta`, que usa las mismas funciones puras y no ejecuta nada.
 *
 * «Aplicar» solo cambia la SIMULACIÓN de la demo y nada se aplica sin una acción explícita del usuario. Los niveles de
 * autonomía son una interfaz de demo de la propuesta en estudio (agente de respuesta acotada, F6.4): el 0 y el 1
 * funcionan; el 2 y el 3 están deshabilitados (en estudio) y el 4 está descartado por diseño.
 */
import { ArrowRight, Bot, CheckCircle2, ChevronDown, ShieldAlert, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { Button } from '@/componentes/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componentes/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/componentes/ui/tooltip'
import { cn } from '@/lib/utils'

import type { Puntuacion } from './asistente/puntuacion'
import { redactorLLM } from './asistente/redactor'
import { urgencia, type Recomendacion } from './asistente/reglas'
import type { AccionAplicada } from './modelo'

const COLOR_NIVEL: Record<Puntuacion['nivel'], string> = {
  'Sin incidente': 'text-texto-suave',
  Baja: 'text-sev-baja',
  Media: 'text-sev-media',
  Alta: 'text-sev-alta',
  Crítica: 'text-sev-critica',
}

const COLOR_URGENCIA = {
  Inmediata: 'border-l-sev-critica',
  Alta: 'border-l-sev-alta',
  Media: 'border-l-sev-media',
} as const

const NIVELES_AUTONOMIA = [
  { nivel: 0, nombre: 'Recomienda', detalle: 'El analista decide y aplica cada acción con un clic.', disponible: true },
  { nivel: 1, nombre: 'Ejecuta con aprobación', detalle: 'Cada acción pide confirmación explícita, con su justificación completa.', disponible: true },
  { nivel: 2, nombre: 'Autónomo en lo reversible', detalle: 'En estudio (F6.4): no disponible.', disponible: false },
  { nivel: 3, nombre: 'Autónomo con política', detalle: 'En estudio (F6.4): no disponible.', disponible: false },
  { nivel: 4, nombre: 'Autónomo pleno', detalle: 'Descartado por diseño: incompatible con la supervisión humana.', disponible: false },
] as const

const EFECTO: Record<Recomendacion['efecto']['tipo'], string> = {
  aislar: 'El activo deja de poder usarse como origen o destino del ataque.',
  proteger: 'El activo queda protegido frente a los pasos posteriores.',
  'bloquear-cuenta': 'La cuenta deja de servir al atacante en los pasos posteriores.',
  'bloquear-canal': 'El canal (correo, mando y control o salida de datos) queda cortado.',
  informativa: 'No cambia el curso del ataque: queda registrada como hecha.',
}

function Gravedad({ puntuacion }: { puntuacion: Puntuacion }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="rounded-xl bg-superficie-alterna p-3">
      <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} className="flex w-full items-center justify-between gap-2 text-left">
        <span>
          <span className="block text-[11px] font-semibold tracking-wide text-texto-suave uppercase">Gravedad del incidente</span>
          <span className={cn('text-2xl font-semibold tabular-nums', COLOR_NIVEL[puntuacion.nivel])}>{puntuacion.total}</span>
          <span className="text-sm text-texto-suave">/100 · </span>
          <span className={cn('text-sm font-semibold', COLOR_NIVEL[puntuacion.nivel])}>{puntuacion.nivel}</span>
        </span>
        {puntuacion.factores.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-acento">
            {abierto ? 'Ocultar' : 'Por qué'}
            <ChevronDown className={cn('size-3.5 transition-transform', abierto && 'rotate-180')} aria-hidden />
          </span>
        )}
      </button>
      {abierto && (
        <ul className="mt-2 space-y-2" aria-label="Factores de la gravedad">
          {puntuacion.factores.map((f) => (
            <li key={f.clave}>
              <span className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-texto">{f.titulo} <span className="text-texto-suave">· peso {Math.round(f.peso * 100)} %</span></span>
                <span className="font-medium text-texto tabular-nums">{Math.round(f.valor * 100)} %</span>
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-superficie-hundida">
                <span className="block h-full rounded-full bg-acento transition-[width] duration-500" style={{ width: `${f.valor * 100}%` }} />
              </span>
              <span className="mt-0.5 block text-[11px] text-texto-suave">{f.explicacion}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TarjetaRecomendacion({ rec, alAplicar }: { rec: Recomendacion; alAplicar: () => void }) {
  const nivel = urgencia(rec.prioridad)
  return (
    <li className={cn('rounded-xl border border-l-4 border-borde bg-superficie p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]', COLOR_URGENCIA[nivel])}>
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10.5px] font-semibold">
        <span className={cn('rounded-full px-1.5 py-px text-sobre-intenso', nivel === 'Inmediata' ? 'bg-sev-critica' : nivel === 'Alta' ? 'bg-sev-alta' : 'bg-sev-media')}>
          {nivel} · {rec.prioridad}
        </span>
        <span className="rounded-full bg-superficie-hundida px-1.5 py-px text-texto-suave">{rec.fase}</span>
        <span className="rounded-full bg-acento-suave px-1.5 py-px text-acento" title="Táctica de MITRE D3FEND">D3FEND · {rec.d3fend}</span>
      </div>
      <p className="text-[13.5px] font-semibold text-texto">{rec.titulo}</p>
      <p className="mt-0.5 text-xs text-texto-suave">{rec.detalle}</p>
      <ul className="mt-1.5 space-y-0.5" aria-label="Evidencias">
        {rec.porque.map((linea) => (
          <li key={linea} className="text-[11px] text-texto">
            <span className="text-texto-suave">Por qué: </span>
            {linea}
          </li>
        ))}
      </ul>
      {rec.impactoNegocio && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-aviso/10 px-2 py-1 text-[11px] text-aviso">
          <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          Coste: {rec.impactoNegocio}
        </p>
      )}
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="text-[10.5px] text-texto-suave">solo en la simulación</span>
        <Button size="sm" variant={nivel === 'Inmediata' ? 'default' : 'outline'} onClick={alAplicar}>
          {rec.efecto.tipo === 'informativa' ? 'Marcar como hecha' : 'Aplicar'}
        </Button>
      </div>
    </li>
  )
}

interface Props {
  parrafos: string[]
  puntuacion: Puntuacion
  recomendaciones: Recomendacion[]
  aplicadas: AccionAplicada[]
  alAplicar: (rec: Recomendacion) => void
  empezado: boolean
  /** Enlace al razonamiento completo (hechos, inferencias y recomendaciones) en `/respuesta`. */
  enlaceRespuesta: string
}

export function PanelAsistente({ parrafos, puntuacion, recomendaciones, aplicadas, alAplicar, empezado, enlaceRespuesta }: Props) {
  const [autonomia, setAutonomia] = useState(0)
  const [pendiente, setPendiente] = useState<Recomendacion | null>(null)

  const pedirAplicar = (rec: Recomendacion) => (autonomia >= 1 ? setPendiente(rec) : alAplicar(rec))

  return (
    <aside aria-label="Asistente de respuesta" className="flex min-h-0 flex-col rounded-2xl border border-borde bg-superficie">
      <header className="flex items-center justify-between gap-2 border-b border-borde px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-acento-suave text-acento" aria-hidden>
            <Bot className="size-4" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-primario">Asistente de respuesta</span>
            <span className="block text-[11px] text-texto-suave">Motor de reglas · ATT&CK → NIST 800-61 · D3FEND</span>
          </span>
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="flex items-center gap-1 rounded-full bg-superficie-hundida px-2 py-0.5 text-[10.5px] font-semibold text-texto-suave">
              <Sparkles className="size-3" aria-hidden />
              {redactorLLM.nombre}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">
            Pendiente. Las reglas deciden qué hacer; un LLM con RAG sobre ATT&CK, D3FEND y los playbooks solo redactará la
            explicación, con el mismo contexto y sin poder inventar acciones ni cifras.
          </TooltipContent>
        </Tooltip>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <section aria-label="Situación" className="space-y-2.5">
          <div role="status" aria-live="polite" className="space-y-1.5 text-[13px] leading-relaxed text-texto">
            {parrafos.map((p) => <p key={p}>{p}</p>)}
          </div>
          {empezado && <Gravedad puntuacion={puntuacion} />}
          <Link to={enlaceRespuesta} className="inline-flex items-center gap-1 text-xs font-medium text-acento hover:underline">
            Hechos, inferencias y plan completo en el asistente de respuesta <ArrowRight className="size-3" aria-hidden />
          </Link>
        </section>

        {empezado && (
          <section aria-label="Respuesta inmediata" className="space-y-2">
            <h2 className="text-sm">Respuesta inmediata <span className="font-normal text-texto-suave">· {recomendaciones.length}</span></h2>
            <fieldset className="rounded-xl border border-dashed border-borde-discontinuo p-2">
              <legend className="px-1 text-[10.5px] font-semibold text-texto-suave">Nivel de autonomía · demo (propuesta en estudio)</legend>
              <div className="grid gap-0.5">
                {NIVELES_AUTONOMIA.map((n) => (
                  <label key={n.nivel} className={cn('flex items-start gap-1.5 text-[11px]', n.disponible ? 'text-texto' : 'text-texto-suave')}>
                    <input type="radio" name="autonomia" className="mt-0.5 accent-[var(--acento)]" value={n.nivel} checked={autonomia === n.nivel} disabled={!n.disponible} onChange={() => setAutonomia(n.nivel)} />
                    <span>
                      <span className="font-semibold">Nivel {n.nivel} · {n.nombre}.</span> {n.detalle}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-[11px] text-texto-suave">«Aplicar» solo cambia la simulación de esta demo: no ejecuta nada fuera del navegador.</p>
            {recomendaciones.length === 0 ? (
              <p className="text-xs text-texto-suave">Nada pendiente con la evidencia actual.</p>
            ) : (
              <ol className="space-y-2">
                {recomendaciones.map((rec) => <TarjetaRecomendacion key={rec.clave} rec={rec} alAplicar={() => pedirAplicar(rec)} />)}
              </ol>
            )}
          </section>
        )}

        {aplicadas.length > 0 && (
          <section aria-label="Acciones aplicadas" className="space-y-1.5">
            <h2 className="text-sm">Aplicadas</h2>
            <ol className="space-y-1">
              {aplicadas.map((a) => (
                <li key={a.clave} className="flex items-start gap-1.5 text-xs text-texto">
                  <CheckCircle2 className="mt-px size-3.5 shrink-0 text-ok" aria-hidden />
                  <span>
                    {a.titulo} <span className="text-texto-suave">· segundo {Math.round(a.t)} de la simulación</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <Dialog open={pendiente !== null} onOpenChange={(abierto) => !abierto && setPendiente(null)}>
        {pendiente && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Aplicar en la simulación?</DialogTitle>
              <DialogDescription>Nivel 1 · ejecuta con aprobación. Solo cambia la simulación de la demo; se deshace con «Reiniciar».</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-texto">{pendiente.titulo}</p>
              <p className="text-xs text-texto-suave">Efecto: {EFECTO[pendiente.efecto.tipo]}</p>
              <ul className="space-y-0.5 text-xs text-texto" aria-label="Justificación">
                {pendiente.porque.map((l) => <li key={l}>Evidencia: {l}</li>)}
                <li>Regla: {pendiente.fase} · D3FEND {pendiente.d3fend} · prioridad {pendiente.prioridad}</li>
              </ul>
              {pendiente.impactoNegocio && <p className="rounded-lg bg-aviso/10 px-2 py-1 text-xs text-aviso">Coste: {pendiente.impactoNegocio}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendiente(null)}>Cancelar</Button>
              <Button
                onClick={() => {
                  alAplicar(pendiente)
                  setPendiente(null)
                }}
              >
                Confirmar y aplicar en la simulación
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </aside>
  )
}
