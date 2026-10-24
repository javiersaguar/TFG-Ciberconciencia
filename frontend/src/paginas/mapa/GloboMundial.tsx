/**
 * El mapa mundial de alertas en 3D: el mismo flujo que `LienzoMundial` (las mismas alertas, filtros, reloj y
 * selección) sobre un globo con el estilo de los del portal (`componentes/tierra`). Cada ruta es un arco por el
 * círculo máximo, del color de su severidad; un punto con estela vuela del origen al destino al ritmo del reloj de la
 * demo y, al llegar, se abre un anillo. Pinchar un arco (o una alerta de la tabla) la elige: se resalta y se rotulan
 * sus dos ciudades.
 *
 * Mismo convenio que el 2D: el reloj lo controla la reproducción (pausa real, velocidad); con movimiento reducido no
 * hay partículas ni giro y cada ruta lleva su punta de flecha. Ubicaciones ILUSTRATIVAS: lo dice la página.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Maximize2, Minus, Plus, RotateCw } from 'lucide-react'
import { Component, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import type { NivelRegla } from '@/api/tipos'
import { useMovimientoReducido } from '@/componentes/datos/useMovimientoReducido'
import { useTema } from '@/componentes/tema/useTema'
import { aEsfera, arcoGeodesico, direccionDeVista, type Vec3 } from '@/componentes/tierra/esfera'
import { leerPaletaGlobo, type PaletaGlobo } from '@/componentes/tierra/paleta'
import { Tierra3D } from '@/componentes/tierra/Tierra3D'
import { cn } from '@/lib/utils'

import { TEXTO_NIVEL, VUELO_MS, type AlertaMapa } from './modelo'

const TOKEN_NIVEL: Record<NivelRegla, keyof PaletaGlobo> = {
  critical: 'sev-critica', high: 'sev-alta', medium: 'sev-media', low: 'sev-baja', informational: 'sev-info',
}

const lugar = (u: AlertaMapa['desde']) => ({ lat: u.coordenadas[1], lon: u.coordenadas[0] })

/** Vista de partida: el Atlántico Norte, con Europa (la sede de Helios) y América a la vista. */
const DIRECCION_INICIAL = direccionDeVista([{ lat: 34, lon: -20 }])
const DISTANCIA = 4.4

interface Props {
  alertas: AlertaMapa[]
  seleccion: AlertaMapa | null
  reloj: RefObject<number>
  enMarcha: boolean
  alSeleccionar: (alerta: AlertaMapa) => void
}

// --- Rutas -------------------------------------------------------------------------------------------------------

interface Piezas {
  curva: THREE.CatmullRomCurve3
  estela: THREE.Object3D[]
  anillo: THREE.Mesh | null
  alerta: AlertaMapa
}

function Ruta({ alerta, pal, elegida, apagada, reducido, registrar, alSeleccionar }: {
  alerta: AlertaMapa
  pal: PaletaGlobo
  elegida: boolean
  apagada: boolean
  reducido: boolean
  registrar: (id: string, piezas: Piezas | null) => void
  alSeleccionar: (a: AlertaMapa) => void
}) {
  const color = pal[TOKEN_NIVEL[alerta.nivel]]
  const curva = useMemo(() => new THREE.CatmullRomCurve3(arcoGeodesico(lugar(alerta.desde), lugar(alerta.hasta)).map((p) => new THREE.Vector3(...p))), [alerta.desde, alerta.hasta])
  const radio = elegida ? 0.0075 : 0.0045
  const tubo = useMemo(() => new THREE.TubeGeometry(curva, 80, radio, 6, false), [curva, radio])
  const zona = useMemo(() => new THREE.TubeGeometry(curva, 40, 0.03, 6, false), [curva])
  useEffect(
    () => () => {
      tubo.dispose()
      zona.dispose()
    },
    [tubo, zona],
  )
  const estela = useRef<(THREE.Mesh | null)[]>([])
  const anillo = useRef<THREE.Mesh>(null)
  useEffect(() => {
    registrar(alerta.id, { curva, estela: estela.current.filter((m): m is THREE.Mesh => !!m), anillo: anillo.current, alerta })
    return () => registrar(alerta.id, null)
  }, [alerta, curva, registrar])
  const destino = useMemo(() => {
    const n = new THREE.Vector3(...aEsfera(alerta.hasta.coordenadas[1], alerta.hasta.coordenadas[0]))
    return { posicion: n.clone().multiplyScalar(1.002), giro: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n) }
  }, [alerta.hasta])
  const punta = useMemo(() => {
    const t = 0.985
    return { posicion: curva.getPointAt(t), giro: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), curva.getTangentAt(t).normalize()) }
  }, [curva])
  return (
    <group>
      <mesh geometry={tubo}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={elegida ? 0.8 : 0.45} transparent opacity={apagada ? 0.35 : 1} />
      </mesh>
      {/* zona invisible y gruesa para poder pinchar el arco */}
      <mesh
        geometry={zona}
        onClick={(e) => {
          e.stopPropagation()
          alSeleccionar(alerta)
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {reducido ? (
        <mesh position={punta.posicion} quaternion={punta.giro}>
          <coneGeometry args={[0.016, 0.05, 10]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
        </mesh>
      ) : (
        <>
          {[0.018, 0.014, 0.01, 0.007].map((r, i) => (
            <mesh key={i} ref={(m) => { estela.current[i] = m }} visible={false}>
              <sphereGeometry args={[r, 10, 8]} />
              <meshBasicMaterial color={color} transparent opacity={1 - i * 0.23} />
            </mesh>
          ))}
          <mesh ref={anillo} position={destino.posicion} quaternion={destino.giro} visible={false}>
            <ringGeometry args={[0.02, 0.026, 40]} />
            <meshBasicMaterial color={color} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  )
}

/**
 * Mueve partículas y anillos según el reloj de la demo, en un solo bucle (no un `useFrame` por ruta): el punto sale
 * del origen y llega en `VUELO_MS`; al llegar, el anillo crece y se apaga en un segundo. Igual que el 2D.
 */
function Movimiento({ piezas, reloj, enMarcha }: { piezas: Map<string, Piezas>; reloj: RefObject<number>; enMarcha: boolean }) {
  const { invalidate } = useThree()
  const pintar = () => {
    for (const { curva, estela, anillo, alerta } of piezas.values()) {
      const edad = reloj.current - alerta.instanteMs
      const avance = edad / VUELO_MS
      estela.forEach((m, i) => {
        const t = avance - i * 0.035
        m.visible = t >= 0 && t <= 1
        if (m.visible) m.position.copy(curva.getPointAt(t))
      })
      if (anillo) {
        const llegada = (edad - VUELO_MS) / 1000
        anillo.visible = llegada >= 0 && llegada <= 1
        if (anillo.visible) {
          anillo.scale.setScalar(1 + llegada * 2.5)
          ;(anillo.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - llegada)
        }
      }
    }
  }
  useFrame(() => {
    if (enMarcha) pintar()
  })
  // en pausa, un fotograma con la posición del reloj detenido (no se mueve nada más)
  useEffect(() => {
    if (enMarcha) return
    pintar()
    invalidate()
  })
  return null
}

// --- Cámara y rótulos --------------------------------------------------------------------------------------------

interface Orden {
  tipo: 'acercar' | 'alejar' | 'mundo'
  n: number
}

function Camara({ girar, reducido, orden, alTocar }: { girar: boolean; reducido: boolean; orden: Orden | null; alTocar: () => void }) {
  const { camera, gl, invalidate } = useThree()
  const controles = useRef<OrbitControls | null>(null)
  const meta = useRef<THREE.Vector3 | null>(null)
  const alTocarRef = useRef(alTocar)
  useEffect(() => {
    alTocarRef.current = alTocar
  }, [alTocar])
  useEffect(() => {
    camera.position.set(...DIRECCION_INICIAL).multiplyScalar(DISTANCIA)
    camera.lookAt(0, 0, 0)
    const c = new OrbitControls(camera, gl.domElement)
    c.enablePan = false
    c.enableDamping = !reducido
    c.dampingFactor = 0.08
    c.minDistance = 1.7
    c.maxDistance = 7
    c.rotateSpeed = 0.6
    c.autoRotateSpeed = 0.6
    const alCambiar = () => invalidate()
    const alEmpezar = () => {
      meta.current = null
      alTocarRef.current()
    }
    c.addEventListener('change', alCambiar)
    c.addEventListener('start', alEmpezar)
    controles.current = c
    invalidate()
    return () => {
      c.removeEventListener('change', alCambiar)
      c.removeEventListener('start', alEmpezar)
      c.dispose()
      controles.current = null
    }
  }, [camera, gl, invalidate, reducido])
  useEffect(() => {
    if (controles.current) controles.current.autoRotate = girar && !reducido
    invalidate()
  }, [girar, reducido, invalidate])
  useEffect(() => {
    if (!orden) return
    const distancia = camera.position.length()
    meta.current =
      orden.tipo === 'mundo'
        ? new THREE.Vector3(...DIRECCION_INICIAL).multiplyScalar(DISTANCIA)
        : camera.position.clone().setLength(THREE.MathUtils.clamp(distancia * (orden.tipo === 'acercar' ? 0.8 : 1.25), 1.7, 7))
    if (reducido) {
      camera.position.copy(meta.current)
      meta.current = null
    }
    invalidate()
  }, [orden]) // eslint-disable-line react-hooks/exhaustive-deps -- solo cuando llega una orden nueva
  useFrame((_, delta) => {
    const c = controles.current
    if (!c) return
    if (meta.current) {
      const k = 1 - Math.exp(-Math.min(delta, 1 / 30) * 4)
      // por fuera de la esfera, no en línea recta (que pasaría por dentro)
      const largo = THREE.MathUtils.lerp(camera.position.length(), meta.current.length(), k)
      camera.position.lerp(meta.current, k).setLength(largo)
      if (camera.position.distanceTo(meta.current) < 0.005) meta.current = null
      invalidate()
    }
    if (c.update(delta)) invalidate()
  })
  return null
}

/** Mueve los rótulos del DOM sobre sus ciudades y oculta los que quedan detrás del globo. */
function Proyector({ anclas, elementos }: { anclas: Map<string, Vec3>; elementos: Map<string, HTMLElement> }) {
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  const n = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    for (const [id, punto] of anclas) {
      const el = elementos.get(id)
      if (!el) continue
      n.set(...punto).normalize()
      const delante = n.dot(v.copy(camera.position).normalize()) > 0.15
      v.set(...punto).project(camera)
      el.style.visibility = delante ? 'visible' : 'hidden'
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`
    }
  })
  return null
}

class SinWebGL extends Component<{ alternativa: ReactNode; children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false }
  static getDerivedStateFromError() {
    return { fallo: true }
  }
  render() {
    return this.state.fallo ? this.props.alternativa : this.props.children
  }
}

// --- El globo ----------------------------------------------------------------------------------------------------

export default function GloboMundial({ alertas, seleccion, reloj, enMarcha, alSeleccionar }: Props) {
  const { tema } = useTema()
  const reducido = useMovimientoReducido()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tema` marca cuándo releer los tokens
  const pal = useMemo(() => leerPaletaGlobo(), [tema])
  const [girar, setGirar] = useState(false)
  const [tocado, setTocado] = useState(false)
  const [orden, setOrden] = useState<Orden | null>(null)
  const [piezas] = useState(() => new Map<string, Piezas>())
  const [rotulos] = useState(() => new Map<string, HTMLElement>())
  const registrar = useMemo(() => (id: string, p: Piezas | null) => (p ? piezas.set(id, p) : piezas.delete(id)), [piezas])
  const autoGiro = girar && !tocado && !reducido
  const ordenar = (tipo: Orden['tipo']) => setOrden((o) => ({ tipo, n: (o?.n ?? 0) + 1 }))

  // si la elegida ya salió de la ventana de rastro, se sigue dibujando (como en el 2D)
  const rutas = seleccion && !alertas.some((a) => a.id === seleccion.id) ? [...alertas, seleccion] : alertas
  // los rótulos: las dos ciudades de la elegida o, sin elección, la sede (Madrid) y Singapur, como en el 2D
  const rotuladas = seleccion ? [seleccion.desde, seleccion.hasta] : [...new Map(rutas.flatMap((a) => [a.desde, a.hasta]).map((u) => [u.id, u])).values()].filter((u) => u.id === 'madrid' || u.id === 'singapur')
  const anclas = new Map<string, Vec3>(rotuladas.map((u) => [u.id, aEsfera(u.coordenadas[1], u.coordenadas[0], 1.03)]))
  const ciudades = [...new Map(rutas.flatMap((a) => [a.desde, a.hasta]).map((u) => [u.id, u])).values()]
  const resumen = `Globo con ${alertas.length} ${alertas.length === 1 ? 'ruta' : 'rutas'} de origen a destino en los últimos segundos de la demo (ubicaciones ilustrativas).${seleccion ? ` Elegida: de ${seleccion.desde.ciudad} a ${seleccion.hasta.ciudad}, nivel ${TEXTO_NIVEL[seleccion.nivel].toLowerCase()}.` : ''}`

  const alternativa = (
    <div role="alert" className="flex h-full min-h-[340px] items-center justify-center p-6 text-center text-sm text-texto">
      No se ha podido iniciar el globo 3D en este navegador (WebGL). El mapa 2D muestra lo mismo.
    </div>
  )

  return (
    <div className="mapa-lienzo relative aspect-[1000/540] min-h-[340px] w-full overflow-hidden" role="region" aria-label="Globo de rutas geográficas">
      <SinWebGL alternativa={alternativa}>
        <div role="img" aria-label={resumen} className="absolute inset-0 cursor-grab">
          <Canvas frameloop={(enMarcha && !reducido) || autoGiro ? 'always' : 'demand'} dpr={[1, 1.75]} camera={{ fov: 30, near: 0.1, far: 50, position: [0, 0, DISTANCIA] }} gl={{ antialias: true }} fallback={alternativa}>
            <color attach="background" args={[pal['maqueta-base']]} />
            <hemisphereLight args={[pal.superficie, pal['maqueta-base'], tema === 'oscuro' ? 1.1 : 1.3]} />
            <directionalLight position={[-3, 4, 5]} intensity={tema === 'oscuro' ? 1.6 : 1.9} />
            <Tierra3D pal={pal} />
            {ciudades.map((u) => {
              const elegida = u.id === seleccion?.desde.id || u.id === seleccion?.hasta.id
              return (
                <mesh key={u.id} position={aEsfera(u.coordenadas[1], u.coordenadas[0], 1.004) as unknown as THREE.Vector3Tuple}>
                  <sphereGeometry args={[elegida ? 0.016 : 0.01, 12, 10]} />
                  <meshStandardMaterial color={elegida ? pal.acento : pal.superficie} emissive={elegida ? pal.acento : pal['texto-suave']} emissiveIntensity={elegida ? 0.6 : 0.2} />
                </mesh>
              )
            })}
            {rutas.map((a) => (
              <Ruta key={a.id} alerta={a} pal={pal} elegida={seleccion?.id === a.id} apagada={!!seleccion && seleccion.id !== a.id} reducido={reducido} registrar={registrar} alSeleccionar={alSeleccionar} />
            ))}
            {!reducido && <Movimiento piezas={piezas} reloj={reloj} enMarcha={enMarcha} />}
            <Camara girar={autoGiro} reducido={reducido} orden={orden} alTocar={() => setTocado(true)} />
            <Proyector anclas={anclas} elementos={rotulos} />
          </Canvas>
        </div>

        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {rotuladas.map((u) => (
            <span
              key={u.id}
              ref={(el) => {
                if (el) rotulos.set(u.id, el)
                else rotulos.delete(u.id)
              }}
              className="mapa-etiqueta-globo absolute top-0 left-0 translate-x-2 -translate-y-1/2 text-xs font-semibold whitespace-nowrap text-texto"
              style={{ visibility: 'hidden' }}
            >
              {u.ciudad}
            </span>
          ))}
        </div>

        <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-lg border border-borde bg-superficie/95 p-1">
          {!reducido && (
            <button type="button" className={cn('mapa-icono', autoGiro && 'text-acento')} aria-label="Girar el globo" aria-pressed={autoGiro} onClick={() => { setGirar((g) => !g); setTocado(false) }}>
              <RotateCw className="size-4" aria-hidden />
            </button>
          )}
          <button type="button" className="mapa-icono" aria-label="Acercar el globo" onClick={() => ordenar('acercar')}><Plus className="size-4" aria-hidden /></button>
          <button type="button" className="mapa-icono" aria-label="Alejar el globo" onClick={() => ordenar('alejar')}><Minus className="size-4" aria-hidden /></button>
          <button type="button" className="mapa-icono border-l border-borde" aria-label="Ver todo el mundo" onClick={() => ordenar('mundo')}><Maximize2 className="size-3.5" aria-hidden /></button>
        </div>
        <div className="absolute bottom-3 left-4 flex gap-4 text-[10px] text-texto-suave">
          <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer" className="hover:underline">Natural Earth · dominio público</a>
          <span className="hidden sm:inline">Arrastra para girar el globo</span>
        </div>
        {reducido && <p className="absolute right-3 bottom-3 rounded bg-superficie/95 px-2 py-1 text-[10px] text-texto-suave">Movimiento reducido: rutas estáticas</p>}
      </SinWebGL>
    </div>
  )
}
