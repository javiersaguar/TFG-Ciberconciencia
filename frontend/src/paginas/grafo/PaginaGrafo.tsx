/**
 * Grafo del pipeline: el lienzo de arquitectura. Cada pieza se explica al pulsarla; las de fases futuras están
 * dibujadas pero en discontinua; y el replay simulado ilumina los tramos por los que pasa el dato.
 */
import { flujosDe } from './actividad'
import { BarraActividad } from './BarraActividad'
import { Lienzo } from './Lienzo'
import { useReplaySimulado } from './useReplaySimulado'

export default function PaginaGrafo() {
  const { estado, iniciar, detener } = useReplaySimulado()
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <h1 className="sr-only">Grafo del pipeline</h1>
      <BarraActividad replay={estado} alIniciar={iniciar} alDetener={detener} />
      <div className="min-h-0 flex-1">
        <Lienzo flujos={flujosDe(estado)} />
      </div>
    </div>
  )
}
