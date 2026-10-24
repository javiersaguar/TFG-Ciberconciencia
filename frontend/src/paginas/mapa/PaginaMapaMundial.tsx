/**
 * Mapa mundial del boceto: flujo local continuo, expresamente ilustrativo.
 * Las ubicaciones reales llegarán enriquecidas desde el servidor en F6.3.
 *
 * Se ve en 2D (`LienzoMundial`, SVG, por defecto) o en 3D (`GloboMundial`, el globo, en carga diferida): el mismo flujo,
 * los mismos filtros, el mismo reloj y la misma selección. `?vista=2d|3d`, recordada en el navegador; sin WebGL, el 3D
 * no se ofrece.
 */
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Globe2, Info, LocateFixed, Pause, Play, Radio, RotateCcw, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { useMapaMundial } from '@/api/mapa'
import { ChipNivel, ChipProcedencia } from '@/componentes/datos/Chips'
import { formatearEntero } from '@/componentes/datos/formato'
import { EncabezadoPagina, EstadoError } from '@/componentes/shell'
import { Button } from '@/componentes/ui/button'
import { Skeleton } from '@/componentes/ui/skeleton'
import { cn } from '@/lib/utils'

import { hayWebGL } from '@/paginas/conciencia/webgl'

import { LienzoMundial } from './LienzoMundial'
import { alertasEnVentana, COLOR_NIVEL, filtrarAlertas, MAX_RECIENTES, nivelValido, NIVELES, RASTRO_MS, resumirAlertas, TEXTO_NIVEL, type AlertaMapa } from './modelo'
import { useRelojMapa } from './useRelojMapa'
import './mapa.css'

// three.js solo se descarga si se elige el globo
const GloboMundial = lazy(() => import('./GloboMundial'))

type Vista = '2d' | '3d'
const CLAVE_VISTA = 'tfg-vista-mapa'
const esVista = (v: unknown): v is Vista => v === '2d' || v === '3d'

function vistaGuardada(): Vista | null {
  try {
    const v = localStorage.getItem(CLAVE_VISTA)
    return esVista(v) ? v : null
  } catch {
    return null
  }
}

const hora = (ms: number) => new Date(ms).toLocaleTimeString('es-ES', { hour12: false })

function Detalle({ alerta, origen, alCerrar }: { alerta: AlertaMapa | null; origen: number; alCerrar: () => void }) {
  return (
    <aside className="mapa-detalle flex min-w-0 flex-col border-t border-borde bg-superficie p-4 xl:border-t-0 xl:border-l" aria-label="Detalle de la alerta geográfica">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Detalle de la alerta</h2>
        {alerta && <button type="button" className="mapa-icono" aria-label="Cerrar detalle de la alerta" onClick={alCerrar}><X className="size-4" aria-hidden /></button>}
      </div>
      {!alerta ? (
        <div className="flex flex-1 flex-col justify-center gap-3 py-8">
          <LocateFixed className="size-8 text-acento" strokeWidth={1.4} aria-hidden />
          <h3 className="text-base">Sigue una ruta</h3>
          <p className="max-w-xs text-sm text-texto-suave">Selecciona una línea del mapa o una alerta del flujo para ver su origen, destino y sensor.</p>
          <div className="mt-3 space-y-2 border-t border-borde pt-4 text-xs text-texto-suave">
            <p className="flex items-center gap-2"><ArrowUpRight className="size-4" aria-hidden /> El punto sale del origen.</p>
            <p className="flex items-center gap-2"><ArrowDownLeft className="size-4" aria-hidden /> El anillo marca la llegada.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4" data-testid="detalle-geografico">
          <div className="flex flex-wrap items-center justify-between gap-2"><ChipNivel nivel={alerta.nivel} /><span className="font-mono text-xs text-texto-suave">{hora(origen + alerta.instanteMs)}</span></div>
          <h3 className="text-base leading-snug">{alerta.titulo}</h3>
          <div className="mapa-extremos space-y-4 rounded-xl bg-superficie-alterna p-3">
            <div><p className="mb-1 flex items-center gap-1.5 text-[11px] text-texto-suave"><ArrowUpRight className="size-3.5" aria-hidden /> ORIGEN</p><p className="font-semibold">{alerta.desde.ciudad}</p><p className="text-xs text-texto-suave">{alerta.desde.pais}</p></div>
            <div className="border-t border-borde pt-3"><p className="mb-1 flex items-center gap-1.5 text-[11px] text-texto-suave"><ArrowDownLeft className="size-3.5" aria-hidden /> DESTINO</p><p className="font-semibold">{alerta.hasta.ciudad}</p><p className="text-xs text-texto-suave">{alerta.hasta.pais}</p></div>
          </div>
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between gap-3"><dt className="text-texto-suave">Sensor de la demo</dt><dd className="font-mono">{alerta.sensor}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-texto-suave">Categoría</dt><dd>{alerta.categoria}</dd></div>
          </dl>
          <p className="mt-auto border-t border-borde pt-3 text-[11px] text-texto-suave">Alerta y ubicaciones ilustrativas de Helios. La selección permanece fija mientras llegan nuevas alertas.</p>
        </div>
      )}
    </aside>
  )
}

export default function PaginaMapaMundial() {
  const fuente = useMapaMundial()
  const reproduccion = useRelojMapa()
  const [parametros, setParametros] = useSearchParams()
  const nivel = nivelValido(parametros.get('nivel'))
  const [seleccion, setSeleccion] = useState<AlertaMapa | null>(null)
  const escenario = fuente.data
  const paises = useMemo(() => escenario ? [...new Map(escenario.ubicaciones.map((u) => [u.codigoPais, u.pais])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es')) : [], [escenario])
  const pais = paises.some(([id]) => id === parametros.get('pais')) ? parametros.get('pais')! : ''
  const alertas = useMemo(() => escenario ? alertasEnVentana(escenario, reproduccion.tiempo) : [], [escenario, reproduccion.tiempo])
  const visibles = useMemo(() => filtrarAlertas(alertas, nivel, pais), [alertas, nivel, pais])
  const trazos = useMemo(() => visibles.filter((a) => reproduccion.tiempo - a.instanteMs < RASTRO_MS), [visibles, reproduccion.tiempo])
  const resumen = resumirAlertas(visibles)
  const [preferida, setPreferida] = useState(vistaGuardada)
  const pedida = parametros.get('vista')
  // Comprobar WebGL crea un contexto de prueba (lento sin GPU): ya, si se ha pedido el globo; si no, tras pintar.
  const [webgl, setWebgl] = useState<boolean | null>(() => ((esVista(pedida) ? pedida : preferida) === '3d' ? hayWebGL() : null))
  useEffect(() => {
    if (webgl !== null) return
    const id = window.setTimeout(() => setWebgl(hayWebGL()), 400)
    return () => window.clearTimeout(id)
  }, [webgl])
  const vista: Vista = webgl ? (esVista(pedida) ? pedida : (preferida ?? '2d')) : '2d'
  function cambiarVista(v: Vista) {
    try {
      localStorage.setItem(CLAVE_VISTA, v)
    } catch {
      // sin almacenamiento: la elección dura lo que dure la página
    }
    setPreferida(v)
    setParametros((actual) => {
      const copia = new URLSearchParams(actual)
      copia.set('vista', v)
      return copia
    }, { replace: true })
  }
  const recientes = visibles.slice(0, MAX_RECIENTES)
  if (seleccion && !recientes.some((a) => a.id === seleccion.id)) recientes.push(seleccion)

  function filtrar(clave: string, valor: string) {
    setSeleccion(null)
    setParametros((actual) => {
      const copia = new URLSearchParams(actual)
      if (!valor || valor === 'todos') copia.delete(clave)
      else copia.set(clave, valor)
      return copia
    }, { replace: true })
  }

  return (
    <>
      <EncabezadoPagina
        titulo="Mapa mundial de alertas"
        descripcion="De dónde sale cada señal y a dónde llega, con su dirección y severidad."
        comoLeer={<><p>Esta es una demo geográfica de Helios Farmacéutica. El flujo se genera localmente y las ubicaciones son ilustrativas: no se han geolocalizado las IP privadas de APT29.</p><p>El punto recorre la ruta del origen al destino. Al llegar aparece un anillo. El mapa conserva los trazos durante nueve segundos y los indicadores resumen los últimos sesenta segundos de la simulación. La ubicación de una IP no identifica al atacante.</p><p>Pausa el flujo para investigar, cambia la velocidad o filtra por país y severidad. Al ampliar puedes arrastrar el mapa. «2D | 3D» cambia entre el mapa y el globo, que se gira arrastrando: el flujo, los filtros y la selección son los mismos. Con movimiento reducido se muestran flechas estáticas.</p></>}
        acciones={<div className="flex items-center gap-2"><ChipProcedencia procedencia="ilustrativa" fuente={escenario?.fuente} /><span className="text-xs text-texto-suave">Helios Farmacéutica</span></div>}
      />
      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-aviso/25 bg-aviso/5 px-3 py-2.5 text-xs text-texto-suave">
        <Info className="mt-px size-4 shrink-0 text-aviso" aria-hidden />
        <p><strong className="font-semibold text-aviso">Demo geográfica ilustrativa.</strong> El movimiento se reproduce en directo en este navegador. El corpus APT29 contiene IP privadas; sus alertas reales están en la <Link to="/cronologia" className="font-medium text-acento underline underline-offset-2">línea temporal</Link>. Los pasos de un ataque concreto, de dónde viene y adónde va, están en la vista <Link to="/conciencia?org=helios&ambito=mundo" className="font-medium text-acento underline underline-offset-2">Mundo de conciencia situacional</Link>.</p>
      </div>
      {fuente.error ? <EstadoError error={fuente.error} alReintentar={() => { void fuente.refetch() }} reintentando={fuente.isFetching} /> : !escenario ? <div role="status" aria-label="Cargando el mapa mundial"><Skeleton className="h-[560px] rounded-2xl" /></div> : (
        <div className="space-y-4">
          <div className="mapa-indicadores grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Actividad de los últimos sesenta segundos de la demo">
            {[{ valor: resumen.total, titulo: 'Alertas en la ventana', nota: 'Últimos 60 s de demo' }, { valor: resumen.prioritarias, titulo: 'Severidad alta o crítica', nota: 'En la selección actual' }, { valor: resumen.origenes, titulo: 'Países de origen', nota: 'Ubicaciones ilustrativas' }, { valor: resumen.destinos, titulo: 'Países de destino', nota: 'Ubicaciones ilustrativas' }].map((c) => (
              <div key={c.titulo} className="rounded-xl border border-borde bg-superficie px-4 py-3">
                <p className="mb-1 text-xs text-texto-suave">{c.titulo}</p>
                <p className="text-2xl font-semibold leading-none tabular-nums">{formatearEntero(c.valor)}</p>
                <p className="mt-1.5 text-[10.5px] text-texto-suave">{c.nota}</p>
              </div>
            ))}
          </div>
          <section className="overflow-hidden rounded-2xl border border-borde bg-superficie" aria-label="Explorador geográfico">
            <div className="flex flex-wrap items-center gap-3 border-b border-borde px-4 py-3">
              <span role="radiogroup" aria-label="Vista del mapa" className="flex rounded-lg border border-borde bg-superficie-alterna p-0.5">
                {(['2d', '3d'] as const).map((v) => {
                  const deshabilitada = v === '3d' && !webgl
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={vista === v}
                      disabled={deshabilitada}
                      title={deshabilitada ? (webgl === null ? 'Comprobando si el navegador puede mostrar 3D…' : 'Este navegador no puede mostrar el globo (sin WebGL)') : v === '3d' ? 'Globo 3D' : 'Mapa 2D'}
                      onClick={() => cambiarVista(v)}
                      className={cn('rounded-md px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50', vista === v ? 'bg-superficie text-acento shadow-sm' : 'text-texto-suave hover:text-texto')}
                    >
                      {v.toUpperCase()}
                    </button>
                  )
                })}
              </span>
              <div className="mr-auto flex items-center gap-2 text-xs">
                <Radio className={cn('size-4', reproduccion.enMarcha ? 'text-ok' : 'text-texto-suave')} aria-hidden />
                <strong className={cn('font-semibold', reproduccion.enMarcha ? 'text-ok' : 'text-texto-suave')}>{reproduccion.enMarcha ? 'Demo en directo' : 'Demo en pausa'}</strong>
                <span className="hidden text-texto-suave sm:inline">·</span>
                <span className="font-mono text-texto-suave tabular-nums" aria-label="Reloj de la simulación">{hora(reproduccion.origen + reproduccion.tiempo)}</span>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-texto-suave">Severidad
                <select aria-label="Filtrar por severidad" value={nivel} onChange={(e) => filtrar('nivel', e.target.value)} className="mapa-select">
                  <option value="todos">Todos los niveles</option>{NIVELES.map((n) => <option key={n} value={n}>{TEXTO_NIVEL[n]}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-texto-suave">País
                <select aria-label="Filtrar por país" value={pais} onChange={(e) => filtrar('pais', e.target.value)} className="mapa-select">
                  <option value="">Todo el mundo</option>{paises.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
                </select>
              </label>
              <div className="flex items-center gap-1 border-l border-borde pl-3">
                <select aria-label="Velocidad de reproducción" value={reproduccion.velocidad} onChange={(e) => reproduccion.setVelocidad(Number(e.target.value))} className="mapa-select w-14">
                  {[1, 2, 4].map((v) => <option key={v} value={v}>{v}×</option>)}
                </select>
                <Button variant="outline" size="sm" onClick={reproduccion.pausar}>{reproduccion.enMarcha ? <Pause aria-hidden /> : <Play aria-hidden />}{reproduccion.enMarcha ? 'Pausar demo' : 'Reanudar demo'}</Button>
                <button type="button" className="mapa-icono" aria-label="Reiniciar demo geográfica" onClick={() => { setSeleccion(null); reproduccion.reiniciar() }}><RotateCcw className="size-4" aria-hidden /></button>
              </div>
            </div>
            <div className="grid xl:grid-cols-[minmax(0,1fr)_280px]">
              <div className="relative min-w-0">
                {vista === '3d' ? (
                  <Suspense fallback={<div role="status" aria-label="Cargando el globo"><Skeleton className="aspect-[1000/540] min-h-[340px] w-full rounded-none" /></div>}>
                    <GloboMundial alertas={trazos} seleccion={seleccion} reloj={reproduccion.reloj} enMarcha={reproduccion.enMarcha} alSeleccionar={setSeleccion} />
                  </Suspense>
                ) : (
                  <LienzoMundial alertas={trazos} seleccion={seleccion} reloj={reproduccion.reloj} enMarcha={reproduccion.enMarcha} alSeleccionar={setSeleccion} />
                )}
                {!visibles.length && <p role="status" className="absolute top-1/2 left-1/2 w-64 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-borde bg-superficie/95 p-4 text-center text-sm text-texto-suave">No hay alertas con estos filtros en la ventana actual.</p>}
              </div>
              <Detalle alerta={seleccion} origen={reproduccion.origen} alCerrar={() => setSeleccion(null)} />
            </div>
            <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-borde px-4 py-2.5 text-[11px] text-texto-suave">
              <span className="mr-auto flex items-center gap-1.5"><Globe2 className="size-3.5" aria-hidden /> Ubicaciones de red, sin atribución del atacante</span>
              {NIVELES.map((n) => <span key={n} className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ backgroundColor: COLOR_NIVEL[n] }} aria-hidden />{TEXTO_NIVEL[n]}</span>)}
            </footer>
          </section>
          <section className="overflow-hidden rounded-2xl border border-borde bg-superficie" aria-labelledby="flujo-geografico">
            <header className="flex items-center justify-between gap-3 px-4 py-3">
              <h2 id="flujo-geografico" className="text-sm font-semibold">Flujo reciente</h2>
              <span className="text-[11px] text-texto-suave">Selecciona una alerta para fijar su detalle</span>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" aria-label="Alertas geográficas recientes">
                <thead className="bg-superficie-alterna text-[11px] text-texto-suave"><tr><th className="px-4 py-2 font-medium">Hora de demo</th><th className="px-3 py-2 font-medium">Severidad</th><th className="px-3 py-2 font-medium">Origen → destino</th><th className="px-3 py-2 font-medium">Señal ilustrativa</th><th className="px-4 py-2 font-medium">Sensor</th></tr></thead>
                <tbody>
                  {recientes.map((a) => (
                    <tr key={a.id} className={cn('border-t border-borde/60', seleccion?.id === a.id && 'bg-acento-suave/50')}>
                      <td className="px-4 py-2 font-mono text-[11px] whitespace-nowrap text-texto-suave tabular-nums">{hora(reproduccion.origen + a.instanteMs)}</td>
                      <td className="px-3 py-2"><ChipNivel nivel={a.nivel} /></td>
                      <td className="px-3 py-2"><button type="button" className="flex items-center gap-2 whitespace-nowrap font-medium text-texto hover:text-acento hover:underline" onClick={() => setSeleccion(a)} aria-pressed={seleccion?.id === a.id} aria-label={'Ver ' + a.desde.ciudad + ' a ' + a.hasta.ciudad + ' · ' + a.id}>{a.desde.ciudad}<ArrowRight className="size-3 text-texto-suave" aria-hidden />{a.hasta.ciudad}</button></td>
                      <td className="px-3 py-2">{a.titulo}</td>
                      <td className="px-4 py-2 font-mono text-[10.5px] whitespace-nowrap text-texto-suave">{a.sensor}</td>
                    </tr>
                  ))}
                  {!recientes.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-texto-suave">Sin alertas para la selección actual.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
