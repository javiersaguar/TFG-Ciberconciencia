/**
 * Matriz ATT&CK con tres capas MEDIDAS y fechadas: potencial (reglas Sigma, F2 28-07), observada en F2 (28-07, 34) y
 * observada en el corpus actual (21-10, 47). Formato clásico: una columna por táctica, en el orden del catálogo ATT&CK
 * Enterprise v19, con las subtécnicas plegables. Cada celda dice su número, no solo su color; «observada» es un punto,
 * no un marco. Las capas de F2 se pueden descargar para abrirlas en ATT&CK Navigator.
 */
import { ChevronDown, ChevronRight, Download, ExternalLink, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import { useCoberturaAttack, type CapaNavigator, type CeldaTecnica, type CoberturaAttack } from '@/api/attack'
import { ChipProcedencia } from '@/componentes/datos/Chips'
import { formatearEntero, formatearPorcentaje } from '@/componentes/datos/formato'
import { EncabezadoPagina, EstadoError } from '@/componentes/shell'
import { Button } from '@/componentes/ui/button'
import { Skeleton } from '@/componentes/ui/skeleton'
import { useEstadoSesion } from '@/componentes/datos/useEstadoSesion'
import { cn } from '@/lib/utils'

import { ETIQUETA_CAPA, filtrarFamilias, leerCapa, leerTecnica, maximoCapa, nivelCalor, observada as estaObservada, ordenarFamilias, urlTecnica, valorCelda, type Capa, type OrdenFamilias } from './logica'

/** Mezcla del color de serie con la superficie: el texto sigue siendo el normal (contraste AA en los dos temas). */
const CALOR = ['', 'bg-chart-1/10', 'bg-chart-1/18', 'bg-chart-1/26', 'bg-chart-1/34', 'bg-chart-1/42'] as const

const CAPAS = (Object.keys(ETIQUETA_CAPA) as Capa[]).map((valor) => ({ valor, texto: ETIQUETA_CAPA[valor] }))

function descargar(capa: CapaNavigator, nombre: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(capa, null, 2)], { type: 'application/json' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  URL.revokeObjectURL(url)
}

function Celda({ c, capa, maximo, elegida, alElegir }: { c: CeldaTecnica; capa: Capa; maximo: number; elegida: boolean; alElegir: (id: string) => void }) {
  const valor = valorCelda(c, capa)
  const vista = estaObservada(c, capa)
  const ayuda = [
    `${c.id} · ${c.nombre ?? 'sin nombre en el catálogo'}`,
    `Reglas Sigma: ${c.reglas ?? '—'}`,
    `Alertas hoy (21-10): ${c.alertasHoy ?? '—'}`,
    `Alertas en F2 (28-07): ${c.alertasF2 ?? '—'}`,
    ...(c.datasetsHoy.length ? [`Datasets: ${c.datasetsHoy.join(', ')}`] : []),
  ].join('\n')
  return (
    <button
      type="button"
      onClick={() => alElegir(c.id)}
      aria-pressed={elegida}
      aria-label={`${c.id}${c.nombre ? ` ${c.nombre}` : ''}: ${c.reglas ?? 0} reglas, ${c.alertasHoy ?? 0} alertas hoy, ${c.alertasF2 ?? 0} en F2`}
      title={ayuda}
      className={cn('flex min-w-0 flex-1 items-center gap-1 rounded px-1.5 py-0.5 text-left text-[11px] text-texto', CALOR[nivelCalor(valor, maximo)], elegida && 'ring-2 ring-acento')}
    >
      <span className="shrink-0 font-mono">{c.subtecnica ? `.${c.id.split('.')[1]}` : c.id}</span>
      <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
      {vista && <span className="size-1.5 shrink-0 rounded-full bg-fund-observado" aria-hidden />}
      <span className="shrink-0 tabular-nums">{valor ?? ''}</span>
    </button>
  )
}

function Kpi({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <section aria-label={titulo} className="rounded-2xl border border-borde bg-superficie p-3">
      <h2 className="text-[12.5px] font-semibold text-texto-suave">{titulo}</h2>
      <p className="text-2xl font-semibold text-primario tabular-nums">{valor}</p>
      <p className="text-xs text-texto-suave">{detalle}</p>
    </section>
  )
}

function Detalle({ celda }: { celda: CeldaTecnica | undefined }) {
  if (!celda) return <p className="rounded-2xl border border-dashed border-borde-discontinuo p-3 text-xs text-texto-suave">Elige una técnica de la matriz para ver sus cifras.</p>
  return (
    <section aria-label="Técnica elegida" className="space-y-2 rounded-2xl border border-borde bg-superficie p-3 text-xs">
      <h2 className="text-base"><span className="font-mono">{celda.id}</span>{celda.nombre && <span className="block text-sm font-medium">{celda.nombre}</span>}</h2>
      <p className="text-texto-suave">{celda.tacticas.join(' · ') || 'sin táctica en el catálogo'}{celda.subtecnica ? ' · subtécnica' : ''}</p>
      <dl className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-superficie-alterna p-2"><dt className="text-texto-suave">Reglas Sigma</dt><dd className="text-lg font-semibold text-texto tabular-nums">{celda.reglas ?? '—'}</dd></div>
        <div className="rounded-lg bg-superficie-alterna p-2"><dt className="text-texto-suave">Alertas hoy</dt><dd className="text-lg font-semibold text-texto tabular-nums">{celda.alertasHoy ?? '—'}</dd></div>
        <div className="rounded-lg bg-superficie-alterna p-2"><dt className="text-texto-suave">En F2</dt><dd className="text-lg font-semibold text-texto tabular-nums">{celda.alertasF2 ?? '—'}</dd></div>
      </dl>
      {celda.datasetsHoy.length > 0 && <p className="break-words text-texto-suave">Datasets con alertas hoy: <span className="font-mono">{celda.datasetsHoy.join(', ')}</span></p>}
      <a href={urlTecnica(celda.id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-acento hover:underline">
        Ficha en attack.mitre.org <ExternalLink className="size-3" aria-hidden />
        <span className="sr-only">(se abre en otra pestaña)</span>
      </a>
    </section>
  )
}

function Matriz({ cobertura }: { cobertura: CoberturaAttack }) {
  const [parametros, setParametros] = useSearchParams()
  // La capa, la búsqueda y el orden sobreviven a ir y volver.
  const [capa, setCapa] = useEstadoSesion<Capa>('attack:capa', 'potencial', (v): v is Capa => leerCapa(typeof v === 'string' ? v : null) !== null)
  const [texto, setTexto] = useEstadoSesion('attack:texto', '', (v): v is string => typeof v === 'string' && v.length <= 80)
  const [soloObservadas, setSoloObservadas] = useEstadoSesion('attack:solo', false, (v): v is boolean => typeof v === 'boolean')
  const [orden, setOrden] = useEstadoSesion<OrdenFamilias>('attack:orden', 'alertasHoy', (v): v is OrdenFamilias => v === 'id' || v === 'reglas' || v === 'alertasHoy')
  const elegida = leerTecnica(parametros.get('tecnica'), cobertura)
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set())
  // Cada columna con sus familias filtradas y ordenadas; una técnica con varias tácticas está en cada una.
  const columnas = useMemo(
    () => cobertura.columnas.map((col) => ({ ...col, familias: ordenarFamilias(filtrarFamilias(col.familias, { texto, soloObservadas }, capa), orden) })),
    [cobertura.columnas, texto, soloObservadas, capa, orden],
  )
  const maximo = useMemo(() => maximoCapa(cobertura.familias, capa), [cobertura.familias, capa])
  const tecnicas = new Set(columnas.flatMap((c) => c.familias.flatMap((f) => f.celdas.map((x) => x.id)))).size
  const conTecnicas = columnas.filter((c) => c.familias.length > 0).length
  const elegir = (id: string) => setParametros({ tecnica: id }, { replace: true })
  const alternar = (familia: string) => setAbiertas((a) => { const n = new Set(a); if (n.has(familia)) n.delete(familia); else n.add(familia); return n })
  const { resumen } = cobertura

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titulo="Técnicas potenciales" valor={formatearEntero(resumen.potenciales)} detalle={`${resumen.familiasPotenciales} familias · ${resumen.subtecnicasPotenciales} subtécnicas`} />
        <Kpi titulo="Observadas hoy (21-10)" valor={formatearEntero(resumen.observadasHoy)} detalle={`${formatearPorcentaje(resumen.activacionHoy * 100)} de las potenciales · corpus actual`} />
        <Kpi titulo="Observadas en F2 (28-07)" valor={formatearEntero(resumen.observadasF2)} detalle={`${formatearPorcentaje(resumen.activacionF2 * 100)} · solo APT29 day1 y el atómico`} />
        <Kpi titulo="Pares técnica–alerta hoy" valor={formatearEntero(resumen.paresAlertaTecnicaHoy)} detalle={`${formatearEntero(resumen.paresReglaTecnica)} pares técnica–regla en la potencial`} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Matriz por táctica" className="min-w-0 space-y-3 rounded-2xl border border-borde bg-superficie p-3">
          <div className="flex flex-wrap items-center gap-3">
            <span role="radiogroup" aria-label="Capa" className="flex rounded-lg bg-superficie-alterna p-0.5">
              {CAPAS.map((c) => (
                <button key={c.valor} type="button" role="radio" aria-checked={capa === c.valor} onClick={() => setCapa(c.valor)} className={cn('rounded-md px-2 py-0.5 text-xs font-semibold', capa === c.valor ? 'bg-superficie text-acento shadow-sm' : 'text-texto-suave')}>
                  {c.texto}
                </button>
              ))}
            </span>
            <label className="relative flex items-center">
              <span className="sr-only">Buscar por ID o nombre de técnica</span>
              <Search className="pointer-events-none absolute left-2 size-3.5 text-texto-suave" aria-hidden />
              <input type="search" value={texto} maxLength={40} onChange={(e) => setTexto(e.target.value)} placeholder="T1003, lsass…" className="w-40 rounded-lg border border-borde bg-superficie py-1 pr-2 pl-7 text-xs text-texto" />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-texto">
              <input type="checkbox" checked={soloObservadas} onChange={(e) => setSoloObservadas(e.target.checked)} className="accent-[var(--acento)]" />
              Solo observadas
            </label>
            <label className="flex items-center gap-1.5 text-xs text-texto-suave">
              Ordenar por
              <select value={orden} onChange={(e) => setOrden(e.target.value as OrdenFamilias)} className="rounded-md border border-borde bg-superficie px-1.5 py-1 text-xs text-texto">
                <option value="alertasHoy">Alertas hoy</option>
                <option value="reglas">Reglas Sigma</option>
                <option value="id">ID</option>
              </select>
            </label>
            <p role="status" className="ml-auto text-xs text-texto-suave">{conTecnicas} tácticas · {tecnicas} técnicas</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-texto-suave" aria-label="Leyenda">
            <span>{capa === 'potencial' ? 'Reglas' : 'Alertas'} (escala logarítmica, máx. {maximo}):</span>
            {CALOR.slice(1).map((clase, i) => <span key={clase} className={cn('rounded px-1.5 py-px text-texto', clase)}>nivel {i + 1}</span>)}
            <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-fund-observado" aria-hidden />observada {capa === 'observadaF2' ? 'en F2' : 'hoy'}</span>
            <span>Una técnica con varias tácticas aparece en cada columna. Pasa el ratón por una celda para ver sus cifras.</span>
          </div>

          {tecnicas === 0 ? (
            <p className="py-6 text-center text-xs text-texto-suave">Ninguna técnica con estos filtros.</p>
          ) : (
            <div className="max-h-[36rem] overflow-auto rounded-lg border border-borde/70">
              <div className="flex w-max gap-1.5 p-1.5">
                {columnas.map(({ tactica, familias }) => {
                  const n = familias.reduce((s, f) => s + f.celdas.length, 0)
                  return (
                    <section key={tactica.id} aria-label={`${tactica.nombre}: ${n} técnicas`} className={cn('flex shrink-0 flex-col', n ? 'w-48' : 'w-28')}>
                      <h3 className="sticky top-0 z-10 rounded-md bg-superficie-alterna px-1.5 py-1 text-[11.5px] leading-tight font-semibold text-texto">
                        {tactica.nombre}
                        <span className="block text-[10.5px] font-normal text-texto-suave">{n} técnicas</span>
                      </h3>
                      <ul className="mt-1 space-y-1">
                        {familias.map((f) => {
                          const padre = f.celdas.find((c) => !c.subtecnica)
                          const subs = f.celdas.filter((c) => c.subtecnica)
                          const abierta = abiertas.has(f.id) || texto.trim() !== '' || elegida?.familia === f.id
                          return (
                            <li key={f.id} className="rounded-md border border-borde/70">
                              <div className="flex items-stretch">
                                {padre ? (
                                  <Celda c={padre} capa={capa} maximo={maximo} elegida={elegida?.id === padre.id} alElegir={elegir} />
                                ) : (
                                  <span className="min-w-0 flex-1 truncate px-1.5 py-0.5 text-[11px] text-texto-suave" title={f.nombre ?? undefined}><span className="font-mono">{f.id}</span> {f.nombre}</span>
                                )}
                                {subs.length > 0 && (
                                  <button type="button" aria-expanded={abierta} aria-label={`${abierta ? 'Plegar' : 'Desplegar'} las ${subs.length} subtécnicas de ${f.id}`} onClick={() => alternar(f.id)} className="flex items-center gap-0.5 px-1 text-[10px] text-texto-suave hover:text-texto">
                                    {abierta ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}
                                    <span className="tabular-nums">{subs.length}</span>
                                  </button>
                                )}
                              </div>
                              {abierta && subs.length > 0 && (
                                <ul className="space-y-px border-t border-borde/60 p-0.5">
                                  {subs.map((c) => <li key={c.id} className="flex"><Celda c={c} capa={capa} maximo={maximo} elegida={elegida?.id === c.id} alElegir={elegir} /></li>)}
                                </ul>
                              )}
                            </li>
                          )
                        })}
                        {n === 0 && <li className="px-1.5 py-2 text-[11px] text-texto-suave">—</li>}
                      </ul>
                    </section>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        <aside aria-label="Detalle y capas" className="space-y-3">
          <Detalle celda={elegida} />
          <section aria-label="Tácticas observadas en APT29 day1" className="rounded-2xl border border-borde bg-superficie p-3 text-xs">
            <header className="mb-1.5 flex items-center justify-between gap-2">
              <h2 className="text-sm">Tácticas observadas · APT29 day1</h2>
              <ChipProcedencia procedencia="documentada" fuente="docs/scenarios/apt29-day1.md §4 (15-09-2026)" />
            </header>
            <ul className="space-y-0.5">
              {cobertura.tacticasDay1.map((t) => (
                <li key={t.tactica} className="flex items-baseline justify-between gap-2">
                  <span className="text-texto">{t.tactica} <span className="font-mono text-[10.5px] text-texto-suave">{t.hosts.join(', ')}</span></span>
                  <span className="text-texto tabular-nums">{formatearEntero(t.alertas)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-texto-suave">Nombre de la táctica tal como lo llevan las alertas. Una alerta con varias tácticas cuenta en cada una.</p>
          </section>
          <section aria-label="Capas Navigator" className="space-y-2 rounded-2xl border border-borde bg-superficie p-3 text-xs">
            <h2 className="text-sm">Capas de ATT&CK Navigator</h2>
            <p className="text-texto-suave">ATT&CK v{cobertura.capas.potencial.versions.attack} · Navigator {cobertura.capas.potencial.versions.navigator} · capa {cobertura.capas.potencial.versions.layer}. <ChipProcedencia procedencia="documentada" fuente={cobertura.fuente} /></p>
            <Button size="sm" variant="outline" onClick={() => descargar(cobertura.capas.potencial, 'cobertura-potencial.json')}><Download aria-hidden />Capa potencial</Button>{' '}
            <Button size="sm" variant="outline" onClick={() => descargar(cobertura.capas.observadaF2, 'cobertura-observada.json')}><Download aria-hidden />Capa observada</Button>
          </section>
        </aside>
      </div>
    </div>
  )
}

export default function PaginaAttack() {
  const consulta = useCoberturaAttack()
  return (
    <>
      <EncabezadoPagina
        titulo="Matriz ATT&CK"
        descripcion="Qué técnicas cubren las reglas Sigma y cuáles dispararon alertas."
        comoLeer={
          <>
            <p>Tres capas, cada una con su fecha. Potencial: técnicas que cubre alguna regla Sigma. Observada en F2 (28-07, fase de detección del proyecto): 34 técnicas con alertas, solo en APT29 day1 y el atómico. Observada hoy (21-10): 47, ya con las campañas LSASS. Las dos observadas son ciertas para su alcance.</p>
            <p>T1685 está verificado en ATT&CK v19: <em>Disable or Modify Tools</em> (defense-impairment); T1685.001 es <em>Disable or Modify Windows Event Log</em>.</p>
            <p>El 27,1 % de las alertas no lleva ninguna técnica (BITÁCORA 11-09-2026): no aparece aquí y es invisible para P1 y P2.</p>
          </>
        }
      />
      {consulta.isError ? (
        <EstadoError error={consulta.error} alReintentar={() => void consulta.refetch()} reintentando={consulta.isFetching} />
      ) : !consulta.data ? (
        <div role="status" aria-label="Cargando la matriz ATT&CK"><Skeleton className="h-96 rounded-2xl" /></div>
      ) : (
        <Matriz cobertura={consulta.data} />
      )}
    </>
  )
}
