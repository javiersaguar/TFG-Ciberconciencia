/**
 * Evaluación y métricas: SOLO lo medido. ML-1 con sus controles (el de volumen, 0,941, junto al 0,995) y la advertencia
 * del tamaño de la muestra; P1, la línea base, la cobertura, el rendimiento y el laboratorio con su fuente. Lo que
 * aún no está medido (precisión, exhaustividad, F1, falsos positivos, latencia) aparece como pendiente, sin números.
 */
import { CircleDashed, TriangleAlert } from 'lucide-react'

import { useEvaluacion, type ResultadoMl1 } from '@/api/evaluacion'
import { ChipProcedencia } from '@/componentes/datos/Chips'
import { EncabezadoPagina, EstadoError } from '@/componentes/shell'
import { Skeleton } from '@/componentes/ui/skeleton'
import { cn } from '@/lib/utils'

const PAPEL: Record<ResultadoMl1['papel'], { texto: string; clase: string }> = {
  principal: { texto: 'principal', clase: 'bg-acento-suave text-acento' },
  control: { texto: 'control', clase: 'bg-fam-ambar-fondo text-fam-ambar-texto' },
  ablacion: { texto: 'ablación', clase: 'bg-fam-pizarra-fondo text-fam-pizarra-texto' },
  contaminado: { texto: 'entrenado con ataques', clase: 'bg-fam-coral-fondo text-fam-coral-texto' },
}

const decimal = (v: number) => v.toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

export default function PaginaEvaluacion() {
  const consulta = useEvaluacion()
  const datos = consulta.data
  const muestra = datos?.ml1.resultados[0]
  const pares = muestra ? muestra.positivos * (muestra.muestras - muestra.positivos) : 0

  return (
    <>
      <EncabezadoPagina titulo="Evaluación" descripcion="Solo lo medido, cada cifra con su fuente." comoLeer={<p>Las métricas de la evaluación final (fase F7: precisión, exhaustividad, F1, falsos positivos y latencia) todavía no se han medido: aparecen como pendientes, sin números.</p>} />
      {consulta.isError ? (
        <EstadoError error={consulta.error} alReintentar={() => void consulta.refetch()} reintentando={consulta.isFetching} />
      ) : !datos ? (
        <div role="status" aria-label="Cargando la evaluación"><Skeleton className="h-96 rounded-2xl" /></div>
      ) : (
        <div className="grid gap-4">
          <section aria-labelledby="titulo-ml1" className="rounded-2xl border border-borde bg-superficie p-4">
            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="titulo-ml1" className="text-base">ML-1 · Isolation Forest sobre ventanas de {datos.ml1.minutosVentana} min</h2>
              <ChipProcedencia procedencia="documentada" fuente={datos.ml1.fuente} />
            </header>
            <div className="overflow-x-auto rounded-lg border border-borde/70">
              <table className="w-full border-collapse text-xs">
                <caption className="sr-only">Resultados de ML-1 por estrategia</caption>
                <thead className="bg-superficie-alterna text-texto-suave">
                  <tr>
                    <th scope="col" className="px-2.5 py-2 text-left font-semibold">Estrategia</th>
                    <th scope="col" className="px-2.5 py-2 text-left font-semibold">Papel</th>
                    <th scope="col" className="px-2.5 py-2 text-right font-semibold">AUC-ROC</th>
                    <th scope="col" className="px-2.5 py-2 text-right font-semibold">AUC-PR</th>
                    <th scope="col" className="px-2.5 py-2 text-right font-semibold">Variables</th>
                    <th scope="col" className="px-2.5 py-2 text-right font-semibold">Ventanas de entrenamiento</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.ml1.resultados.map((r) => (
                    <tr key={r.clave} className={cn('border-t border-borde/60', r.papel === 'control' ? 'bg-fam-ambar-fondo/40' : 'odd:bg-superficie even:bg-superficie-alterna/50')}>
                      <th scope="row" className="px-2.5 py-1.5 text-left font-normal text-texto">{r.estrategia}</th>
                      <td className="px-2.5 py-1.5"><span className={cn('rounded-full px-1.5 py-px text-[10.5px] font-semibold', PAPEL[r.papel].clase)}>{PAPEL[r.papel].texto}</span></td>
                      <td className="px-2.5 py-1.5 text-right font-semibold text-texto tabular-nums">{decimal(r.aucRoc)}</td>
                      <td className="px-2.5 py-1.5 text-right text-texto tabular-nums">{decimal(r.aucPr)}</td>
                      <td className="px-2.5 py-1.5 text-right text-texto tabular-nums">{r.nFeatures}</td>
                      <td className="px-2.5 py-1.5 text-right text-texto tabular-nums">{r.nEntrenamiento}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {muestra && (
              <div className="mt-3 space-y-1 rounded-xl border border-borde bg-superficie-alterna p-3 text-xs text-texto">
                <p className="flex items-center gap-1.5 font-semibold"><TriangleAlert className="size-3.5 text-aviso" aria-hidden />Cómo leerlo</p>
                <p>
                  Se evalúa sobre <strong>{muestra.muestras} ventanas</strong> ({muestra.positivos} con ataque): {pares} pares positiva–negativa, así que cada par mal ordenado
                  resta {decimal(1 / pares)} al AUC. Es una muestra pequeña: el 0,995 no es una estimación estable.
                </p>
                <p>
                  El <strong>control con una sola variable, el volumen de eventos, ya da 0,941</strong>: buena parte de la señal es «hay más eventos cuando hay ataque».
                  Sin volumen (solo proporciones) baja a 0,867. El control de volumen es la línea base permanente para F7.
                </p>
              </div>
            )}
          </section>

          <section aria-labelledby="titulo-medidas">
            <h2 id="titulo-medidas" className="mb-2 text-base">Medido en las fases F2 y F3</h2>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {datos.medidas.map((m) => (
                <li key={m.clave} aria-label={m.titulo} className="flex flex-col gap-1 rounded-2xl border border-borde bg-superficie p-3">
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-texto-suave">{m.titulo}</span>
                    <ChipProcedencia procedencia="documentada" fuente={m.fuente} />
                  </span>
                  <span className="text-xl font-semibold text-primario tabular-nums">{m.valor}</span>
                  <span className="text-xs text-texto-suave">{m.detalle}</span>
                  {m.advertencia && <span className="rounded-lg bg-aviso/10 px-2 py-1 text-xs text-aviso">{m.advertencia}</span>}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="titulo-pendiente" className="rounded-2xl border border-dashed border-borde-discontinuo bg-superficie p-4">
            <h2 id="titulo-pendiente" className="mb-2 text-base">Pendiente de medir</h2>
            <ul className="space-y-2">
              {datos.pendientes.map((p) => (
                <li key={p.metrica} className="flex items-start gap-2 text-xs">
                  <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-texto-suave" aria-hidden />
                  <span>
                    <span className="font-semibold text-texto">{p.metrica}</span> <span className="rounded-full bg-superficie-hundida px-1.5 py-px text-[10.5px] font-semibold text-texto-suave">pendiente ({p.fase})</span>
                    <span className="block text-texto-suave">{p.como}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  )
}
