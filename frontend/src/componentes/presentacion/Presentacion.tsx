/**
 * Modo presentación: una tarjeta flotante y discreta que recorre el guion (`guion.ts`) por el propio portal. Se activa
 * con `?presentacion=1` o desde Ctrl+K («Iniciar presentación»); ← y → pasan de paso y Esc sale.
 *
 * No bloquea nada: la página sigue siendo usable debajo (se puede pulsar «Reproducir ataque» en el paso del grafo).
 * Resalta el elemento del paso con un contorno y lo trae a la vista; si no lo encuentra, el paso se enseña sin resalte.
 * En el paso del Copiloto abre el panel con una pregunta precargada (sin enviarla) y lo cierra al salir de ese paso.
 */
import { ChevronLeft, ChevronRight, Presentation, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'

import { useMovimientoReducido } from '@/componentes/datos/useMovimientoReducido'
import { Button } from '@/componentes/ui/button'
import { useCopiloto } from '@/copiloto/estado'
import { cn } from '@/lib/utils'

import { PARAMETRO, pasoDeUrl, pasosPresentacion, rutaDePaso } from './guion'

const CLASE_FOCO = 'presentacion-foco'
/** El elemento puede tardar en aparecer (páginas en diferido, datos con latencia simulada). */
const ESPERA_MAXIMA_MS = 4000
/** Alto aproximado de la tarjeta más su margen. */
const ALTO_TARJETA_PX = 240

function esCampoDeTexto(objetivo: EventTarget | null): boolean {
  if (!(objetivo instanceof HTMLElement)) return false
  return objetivo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(objetivo.tagName)
}

export default function Presentacion() {
  const pasos = useMemo(() => pasosPresentacion(), [])
  const [parametros] = useSearchParams()
  const { pathname, search } = useLocation()
  const navegar = useNavigate()
  const reducido = useMovimientoReducido()
  const { abrir, cerrar } = useCopiloto()
  const copilotoAbiertoAqui = useRef(false)
  // La tarjeta va abajo salvo que tape lo que se resalta (p. ej. «Reproducir ataque», al pie del grafo): entonces, arriba.
  const [arriba, setArriba] = useState(false)

  const numero = pasoDeUrl(parametros.get(PARAMETRO), pasos.length)
  const paso = numero ? pasos[numero - 1] : null

  const ir = useCallback((n: number) => navegar(rutaDePaso(pasos[n - 1], n)), [navegar, pasos])
  const salir = useCallback(() => {
    const resto = new URLSearchParams(search)
    resto.delete(PARAMETRO)
    const consulta = resto.toString()
    navegar(consulta ? `${pathname}?${consulta}` : pathname)
  }, [navegar, pathname, search])

  // Acción del paso: el Copiloto se abre al entrar en su paso y se cierra al salir de él (solo si lo abrió la presentación).
  useEffect(() => {
    if (paso?.accion === 'abrir-copiloto') {
      abrir({ org: 'dmevals', pregunta: '¿Qué debería vigilar?' })
      copilotoAbiertoAqui.current = true
    } else if (copilotoAbiertoAqui.current) {
      cerrar()
      copilotoAbiertoAqui.current = false
    }
  }, [paso, abrir, cerrar])
  useEffect(() => () => {
    if (copilotoAbiertoAqui.current) cerrar()
  }, [cerrar])

  // Resalte del elemento del paso, cuando aparezca.
  useEffect(() => {
    if (!paso?.foco) return
    let elemento: Element | null = null
    const inicio = Date.now()
    const buscar = () => {
      elemento = document.querySelector(paso.foco!)
      if (elemento) {
        elemento.classList.add(CLASE_FOCO)
        let caja = elemento.getBoundingClientRect()
        if (caja.top < 0 || caja.bottom > window.innerHeight) {
          elemento.scrollIntoView({ block: 'center', behavior: 'auto' })
          caja = elemento.getBoundingClientRect()
        }
        // ¿Lo taparía la tarjeta (unos 15 rem al pie)? Solo si el elemento cabe por encima de ella.
        setArriba(caja.bottom > window.innerHeight - ALTO_TARJETA_PX && caja.top > ALTO_TARJETA_PX)
        return true
      }
      return Date.now() - inicio > ESPERA_MAXIMA_MS
    }
    // primera búsqueda en el siguiente tick (no se cambia estado dentro del cuerpo del efecto) y luego cada 150 ms
    const id = window.setInterval(() => { if (buscar()) window.clearInterval(id) }, 150)
    const primero = window.setTimeout(() => { if (buscar()) window.clearInterval(id) }, 0)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(primero)
      elemento?.classList.remove(CLASE_FOCO)
      setArriba(false)
    }
  }, [paso, pathname, reducido])

  // Teclado: ← y → cambian de paso, Esc sale. No interfiere con lo que se escribe ni con un diálogo abierto (Ctrl+K).
  useEffect(() => {
    if (!numero) return
    const alPulsar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || esCampoDeTexto(e.target) || document.querySelector('[role="dialog"]')) return
      if (e.key === 'ArrowRight' && numero < pasos.length) ir(numero + 1)
      else if (e.key === 'ArrowLeft' && numero > 1) ir(numero - 1)
      else if (e.key === 'Escape') salir()
      else return
      // Esc ya está atendido: que el shell no cierre además el Copiloto
      e.preventDefault()
    }
    window.addEventListener('keydown', alPulsar, { capture: true })
    return () => window.removeEventListener('keydown', alPulsar, { capture: true })
  }, [numero, pasos.length, ir, salir])

  if (!paso || !numero) return null

  return (
    <section
      aria-label="Presentación"
      aria-roledescription="presentación guiada"
      className={cn(
        'fixed left-1/2 z-50',
        arriba ? 'top-14' : 'bottom-4',
        'w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-acento/50 bg-superficie p-4 shadow-lg',
        !reducido && 'entrada-mensaje',
      )}
    >
      <header className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold tracking-wide text-texto-suave uppercase">
        <Presentation className="size-3.5 text-acento" aria-hidden />
        <span>Presentación · paso {numero} de {pasos.length}</span>
        <button type="button" onClick={salir} aria-label="Salir de la presentación (Esc)" className="ml-auto rounded p-0.5 hover:bg-superficie-alterna hover:text-texto">
          <X className="size-4" aria-hidden />
        </button>
      </header>
      <div aria-live="polite">
        <h2 className="text-[15px] font-semibold text-texto">{paso.titulo}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-texto">{paso.texto}</p>
      </div>
      <footer className="mt-3 flex items-center gap-2">
        <ol className="flex items-center gap-1" aria-label="Pasos">
          {pasos.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => ir(i + 1)}
                aria-label={`Paso ${i + 1}: ${p.titulo}`}
                aria-current={i + 1 === numero ? 'step' : undefined}
                className={cn('block size-2 rounded-full', i + 1 === numero ? 'bg-acento' : 'bg-borde hover:bg-texto-suave')}
              />
            </li>
          ))}
        </ol>
        <span className="ml-auto hidden text-[11px] text-texto-suave sm:inline">← → para avanzar · Esc para salir</span>
        <Button size="sm" variant="outline" disabled={numero === 1} onClick={() => ir(numero - 1)}>
          <ChevronLeft aria-hidden />
          Anterior
        </Button>
        {numero < pasos.length ? (
          <Button size="sm" onClick={() => ir(numero + 1)}>
            Siguiente
            <ChevronRight aria-hidden />
          </Button>
        ) : (
          <Button size="sm" onClick={salir}>Terminar</Button>
        )}
      </footer>
    </section>
  )
}
