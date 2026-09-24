/**
 * Página de una sección de fase futura: qué enseñará, en qué fase se construye y de dónde saldrán sus datos. Así la
 * navegación definitiva existe desde la base y nadie confunde un hueco con un fallo.
 */
import { Construction } from 'lucide-react'
import { Link } from 'react-router'

import type { SeccionFutura } from '@/componentes/shell/navegacion'
import { EncabezadoPagina } from '@/componentes/shell'
import { Button } from '@/componentes/ui/button'

export default function PaginaProximamente({ seccion }: { seccion: SeccionFutura }) {
  const Icono = seccion.icono
  return (
    <>
      <EncabezadoPagina titulo={seccion.titulo} descripcion={seccion.descripcion} />
      <section className="flex max-w-3xl flex-col gap-4 rounded-2xl border border-dashed border-[#aeb8c5] bg-superficie/70 p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-superficie-hundida text-texto-suave" aria-hidden>
            <Icono className="size-5" />
          </span>
          <div>
            <p className="flex items-center gap-2 font-semibold text-texto">
              <Construction className="size-4 text-aviso" aria-hidden />
              Se construye en {seccion.fase}
            </p>
            <p className="text-xs text-texto-suave">La sección ya tiene su sitio en el menú; su contenido llega con la fase.</p>
          </div>
        </div>
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
