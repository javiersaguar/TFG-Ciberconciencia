/**
 * `/copiloto`: la vista AMPLIADA del panel lateral del Copiloto. Es el mismo componente (`@/copiloto/PanelCopiloto`)
 * a pantalla completa, no una copia: lo que se pregunta aquí sigue en el panel y al revés. Los enlaces antiguos
 * (`/copiloto?org=helios`) siguen funcionando: el parámetro se valida contra las organizaciones conocidas.
 */
import { Info } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Link, useSearchParams } from 'react-router'

import { esOrgCopiloto, ORGS_COPILOTO } from '@/copiloto/estado'
import { EncabezadoPagina } from '@/componentes/shell'
import { Skeleton } from '@/componentes/ui/skeleton'

const PanelCopiloto = lazy(() => import('@/copiloto/PanelCopiloto'))

export default function PaginaCopiloto() {
  const [parametros, setParametros] = useSearchParams()
  const pedida = parametros.get('org')
  const org = esOrgCopiloto(pedida) ? pedida : ORGS_COPILOTO[0]
  return (
    <>
      <EncabezadoPagina
        titulo="Copiloto"
        descripcion="Preguntas sobre la evidencia de una organización, con una cita en cada afirmación."
        comoLeer={
          <>
            <p>Es el panel lateral del Copiloto a pantalla completa: ábrelo desde cualquier página con el botón de la barra superior o con Ctrl + I.</p>
            <p>Cada respuesta separa hechos observados, inferencias, señales débiles y recomendaciones; pulsa una cita para ir a su evidencia. «Conviene vigilar» son señales débiles: avisan, no alertan. Cada conversación es de una sola organización y el Copiloto no ejecuta nada.</p>
            <p>Hoy responde un proveedor local, sin modelo. El de modelo de lenguaje con recuperación (RAG) vivirá en el servidor; su diseño está en docs/copiloto-rag.md.</p>
          </>
        }
      />
      <p role="note" className="mb-3 flex flex-wrap items-center gap-1.5 text-xs font-medium text-texto-suave">
        <Info className="size-3.5" aria-hidden />
        <span>
          No ejecuta acciones. Para mitigar, usa el <Link to="/respuesta" className="text-acento hover:underline">asistente de respuesta</Link>.
        </span>
      </p>
      <Suspense fallback={<div role="status" aria-label="Cargando el Copiloto"><Skeleton className="h-96 rounded-2xl" /></div>}>
        <PanelCopiloto modo="completo" org={org} alCambiarOrg={(o) => setParametros({ org: o }, { replace: true })} />
      </Suspense>
    </>
  )
}
