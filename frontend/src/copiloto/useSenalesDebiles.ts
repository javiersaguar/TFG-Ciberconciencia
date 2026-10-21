/**
 * Avisos proactivos: evalúa los detectores de señales débiles (`senales.ts`) sobre el estado ACTUAL de una
 * organización. DMEVALS, sobre los datos medidos; la demo, sobre el instante de su simulación (tiempo real), que lee
 * del estado compartido. Devuelve las activas (sin las descartadas, que no se repiten) y cómo descartarlas.
 */
import { useMemo } from 'react'

import { useDatosRespuesta } from '@/api/respuesta'
import { useEstadoSimulaciones } from '@/paginas/conciencia/estadoSimulaciones'
import { HELIOS } from '@/paginas/conciencia/organizaciones/helios'
import { evaluar } from '@/paginas/conciencia/simulacion'

import { useCopiloto, type OrgCopiloto } from './estado'
import { detectarPasosSinPatron, senalesDmevals, type Senal } from './senales'

export function useSenalesDebiles(org: OrgCopiloto) {
  const { descartadas, descartar } = useCopiloto()
  const datos = useDatosRespuesta({ activo: org === 'dmevals' })
  const { simulaciones } = useEstadoSimulaciones()
  const sim = simulaciones[HELIOS.id]
  const tiempo = sim?.tiempo ?? 0
  const acciones = sim?.acciones
  const todas = useMemo<Senal[]>(() => {
    if (org === 'dmevals') return datos.data ? senalesDmevals(datos.data) : []
    return detectarPasosSinPatron(HELIOS, evaluar(HELIOS, tiempo, acciones ?? []))
  }, [org, datos.data, tiempo, acciones])
  const fuera = descartadas[org]
  const activas = useMemo(() => todas.filter((s) => !fuera?.includes(s.id)), [todas, fuera])
  return { senales: activas, todas, descartar: (id: string) => descartar(org, id) }
}
