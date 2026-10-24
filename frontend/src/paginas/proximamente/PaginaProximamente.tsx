/**
 * Página de una sección de fase futura: qué enseñará, en qué fase se construye y de dónde saldrán sus datos. Así la
 * navegación definitiva existe desde la base y nadie confunde un hueco con un fallo.
 */
import { Link } from 'react-router'

import type { SeccionFutura } from '@/componentes/shell/navegacion'
import { EncabezadoPagina } from '@/componentes/shell'
import { Button } from '@/componentes/ui/button'

export default function PaginaProximamente({ seccion }: { seccion: SeccionFutura }) {
  return (
    <>
      <EncabezadoPagina titulo={seccion.titulo} descripcion={seccion.descripcion} />
      <section className="flex max-w-3xl flex-col gap-4 rounded-2xl border border-dashed border-borde-discontinuo bg-superficie p-5">
        <p className="font-semibold text-texto">Se construye en {seccion.fase}</p>
        <div>
          <h2 className="mb-1.5 text-sm">Qué enseñará</h2>
          <ul className="list-disc space-y-1 pl-5 text-texto">
            {seccion.contenido.map((linea) => <li key={linea}>{linea}</li>)}
          </ul>
        </div>
        <div>
          <h2 className="mb-1.5 text-sm">De dónde saldrán los datos</h2>
          <p className="text-texto">{seccion.origen}</p>
        </div>
        <div>
          <Button asChild variant="outline" size="sm">
            <Link to="/grafo">Ver dónde encaja en el grafo del pipeline</Link>
          </Button>
        </div>
      </section>
    </>
  )
}
