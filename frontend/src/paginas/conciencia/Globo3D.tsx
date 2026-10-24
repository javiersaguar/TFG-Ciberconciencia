/**
 * La Tierra en 3D: el globo con la sede de la organización y los sitios de fuera con los que el ataque la conecta (el
 * correo que entra, el mando y control, la exfiltración), en el mismo estilo que la maqueta 3D: luz suave, mares y
 * tierras de los tokens del tema, costas y fronteras en línea fina, y los pasos como arcos de luz.
 *
 * Las trazas están vivas mientras la simulación avanza: cada conexión nueva CRECE desde su origen, por las que ya
 * ocurrieron corre un punto de luz (por la última, un cometa) y sus extremos laten. En pausa, quieto; con movimiento
 * reducido, sin animación ni giro (se ve igual el estado).
 *
 * Ubicaciones ILUSTRATIVAS (ver `modelo.ts` → `Geografia`): lo dice la leyenda y la lista de conexiones. La lógica
 * (qué cruza la frontera, los arcos) está en `globo.ts`; aquí solo se dibuja.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { geoEquirectangular, geoPath } from 'd3-geo'
import { Crosshair, Minus, Plus, RotateCw } from 'lucide-react'
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import { useMovimientoReducido } from '@/componentes/datos/useMovimientoReducido'
import { useTema } from '@/componentes/tema/useTema'
import { cn } from '@/lib/utils'

import { aEsfera, arcoGeodesico, conexiones, direccionDeVista, ladosDeEtiqueta, resumenMundo, reticula, segmentosEnEsfera, sitiosDeFuera, type Conexion } from './globo'
import mapa from './globo/mapamundi.json'
import type { Vec3 } from './maqueta'
import type { Organizacion } from './modelo'
import { PanelConexiones } from './PanelConexiones'
import type { Evaluacion } from './simulacion'

const TOKENS = ['globo-oceano', 'globo-tierra', 'globo-costa', 'globo-frontera', 'globo-reticula', 'maqueta-base', 'superficie', 'sev-critica', 'linea-bloqueada', 'acento'] as const
type Paleta = Record<(typeof TOKENS)[number], string>

function leerPaleta(): Paleta {
  const estilo = getComputedStyle(document.documentElement)
  return Object.fromEntries(TOKENS.map((t) => [t, estilo.getPropertyValue(`--${t}`).trim() || '#8a94a2'])) as Paleta
}

const datos = mapa as { tierras: number[][][]; fronteras: number[][] }

/** Lista plana [lon, lat, …] como anillo de GeoJSON. */
const anillo = (plano: readonly number[]) => Array.from({ length: plano.length / 2 }, (_, i) => [plano[i * 2], plano[i * 2 + 1]])

/** La textura del globo: mares y tierras pintados en un lienzo equirectangular con los colores del tema. */
function texturaTierra(pal: Paleta): THREE.CanvasTexture {
  const lienzo = document.createElement('canvas')
  lienzo.width = 2048
  lienzo.height = 1024
  const ctx = lienzo.getContext('2d')!
  ctx.fillStyle = pal['globo-oceano']
  ctx.fillRect(0, 0, lienzo.width, lienzo.height)
  const proyeccion = geoEquirectangular().scale(lienzo.width / (2 * Math.PI)).translate([lienzo.width / 2, lienzo.height / 2])
  const camino = geoPath(proyeccion, ctx)
  ctx.fillStyle = pal['globo-tierra']
  for (const poligono of datos.tierras) {
    ctx.beginPath()
    camino({ type: 'Polygon', coordinates: poligono.map(anillo) })
    ctx.fill('evenodd')
  }
  const textura = new THREE.CanvasTexture(lienzo)
  textura.colorSpace = THREE.SRGBColorSpace
  textura.anisotropy = 4
  return textura
}

function Tierra({ pal }: { pal: Paleta }) {
  const textura = useMemo(() => texturaTierra(pal), [pal])
  useEffect(() => () => textura.dispose(), [textura])
  const costas = useMemo(() => segmentosEnEsfera(datos.tierras.flat()), [])
  const fronteras = useMemo(() => segmentosEnEsfera(datos.fronteras, 1.0012), [])
  const malla = useMemo(() => reticula(15), [])
  const geometria = (posiciones: Float32Array) => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(posiciones, 3))
    return g
  }
  const [gCostas, gFronteras, gMalla] = useMemo(() => [geometria(costas), geometria(fronteras), geometria(malla)], [costas, fronteras, malla])
  useEffect(() => () => [gCostas, gFronteras, gMalla].forEach((g) => g.dispose()), [gCostas, gFronteras, gMalla])
  return (
    <group>
      {/* la esfera; el meridiano 0 tiene que caer en +z, como en `aEsfera` */}
      <mesh rotation={[0, -Math.PI / 2, 0]}>
        <sphereGeometry args={[1, 128, 96]} />
        <meshStandardMaterial map={textura} roughness={0.85} metalness={0.02} />
      </mesh>
      <lineSegments geometry={gMalla}>
        <lineBasicMaterial color={pal['globo-reticula']} transparent opacity={0.55} />
      </lineSegments>
      <lineSegments geometry={gFronteras}>
        <lineBasicMaterial color={pal['globo-frontera']} />
      </lineSegments>
      <lineSegments geometry={gCostas}>
        <lineBasicMaterial color={pal['globo-costa']} />
      </lineSegments>
      {/* la atmósfera: un halo tenue alrededor del borde */}
      <mesh>
        <sphereGeometry args={[1.06, 64, 48]} />
        <meshBasicMaterial color={pal.acento} transparent opacity={0.08} side={THREE.BackSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

// --- Conexiones ---------------------------------------------------------------------------------------------------

/** Un arco de luz que CRECE desde su origen al aparecer (o aparece entero con movimiento reducido). */
function ArcoGlobo({ c, pal, animar, reducido, desfase }: { c: Conexion; pal: Paleta; animar: boolean; reducido: boolean; desfase: number }) {
  const curva = useMemo(() => new THREE.CatmullRomCurve3(arcoGeodesico(c.desde, c.hasta).map((p) => new THREE.Vector3(...p))), [c.desde, c.hasta])
  const radio = c.ultimo ? 0.0085 : 0.006
  const geometria = useMemo(() => new THREE.TubeGeometry(curva, 96, radio, 8, false), [curva, radio])
  const halo = useMemo(() => (c.ultimo ? new THREE.TubeGeometry(curva, 96, radio * 2.8, 8, false) : null), [curva, radio, c.ultimo])
  useEffect(
    () => () => {
      geometria.dispose()
      halo?.dispose()
    },
    [geometria, halo],
  )
  const progreso = useRef(reducido ? 1 : 0)
  const { invalidate } = useThree()
  useFrame((_, delta) => {
    if (progreso.current >= 1) return
    progreso.current = Math.min(1, progreso.current + delta / 1.1)
    const total = geometria.index?.count ?? 0
    // el tubo se recorre en orden: mostrar solo el primer tramo es «hacerlo crecer»
    geometria.setDrawRange(0, Math.floor((total * progreso.current) / 6) * 6)
    halo?.setDrawRange(0, Math.floor(((halo.index?.count ?? 0) * progreso.current) / 6) * 6)
    invalidate()
  })
  const color = c.ocurrido ? pal['sev-critica'] : pal['linea-bloqueada']
  const punta = useMemo(() => {
    const t = 0.985
    return { posicion: curva.getPointAt(t), giro: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), curva.getTangentAt(t).normalize()) }
  }, [curva])
  return (
    <group>
      <mesh geometry={geometria}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={c.ocurrido ? 0.7 : 0} transparent={!c.ocurrido} opacity={c.ocurrido ? 1 : 0.7} />
      </mesh>
      {halo && (
        <mesh geometry={halo}>
          <meshBasicMaterial color={color} transparent opacity={0.12} depthWrite={false} />
        </mesh>
      )}
      <mesh position={punta.posicion} quaternion={punta.giro}>
        <coneGeometry args={[radio * 3, radio * 9, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={c.ocurrido ? 0.8 : 0} />
      </mesh>
      {animar && c.ocurrido && <Cometa curva={curva} color={color} grande={c.ultimo} desfase={desfase} />}
    </group>
  )
}

/** El punto de luz que recorre un arco: «por aquí está pasando tráfico del atacante». */
function Cometa({ curva, color, grande, desfase }: { curva: THREE.Curve<THREE.Vector3>; color: string; grande: boolean; desfase: number }) {
  const grupo = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const hijos = grupo.current?.children ?? []
    const t = (clock.getElapsedTime() / (grande ? 1.6 : 2.4) + desfase) % 1
    hijos.forEach((h, i) => h.position.copy(curva.getPointAt(Math.max(0, t - i * 0.022))))
  })
  const radios = grande ? [0.024, 0.018, 0.013, 0.009] : [0.014, 0.01]
  return (
    <group ref={grupo}>
      {radios.map((r, i) => (
        <mesh key={i}>
          <sphereGeometry args={[r, 12, 10]} />
          <meshBasicMaterial color={color} transparent opacity={1 - i * 0.22} />
        </mesh>
      ))}
    </group>
  )
}

/** Un sitio en el globo: chincheta y, si está activo, un anillo que late en el suelo. */
function Sitio({ lat, lon, color, latir, reducido }: { lat: number; lon: number; color: string; latir: boolean; reducido: boolean }) {
  const { posicion, giro } = useMemo(() => {
    const n = new THREE.Vector3(...aEsfera(lat, lon))
    return { posicion: n.clone().multiplyScalar(1.001), giro: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n) }
  }, [lat, lon])
  const anillo = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const a = anillo.current
    if (!a || !latir || reducido) return
    const t = (clock.getElapsedTime() % 1.6) / 1.6
    a.scale.setScalar(1 + t * 2.4)
    ;(a.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - t)
  })
  return (
    <group position={posicion} quaternion={giro}>
      <mesh position={[0, 0.025, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.05, 6]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.055, 0]}>
        <sphereGeometry args={[0.014, 16, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
      {latir && (
        <mesh ref={anillo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
          <ringGeometry args={[0.02, 0.026, 40]} />
          <meshBasicMaterial color={color} transparent opacity={reducido ? 0.6 : 0} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

// --- Cámara y etiquetas -------------------------------------------------------------------------------------------

const DISTANCIA = 4.6

function Camara({ direccion, girar, reducido, orden, alTocar }: { direccion: Vec3; girar: boolean; reducido: boolean; orden: { tipo: 'acercar' | 'alejar' | 'centrar'; n: number } | null; alTocar: () => void }) {
  const { camera, gl, invalidate } = useThree()
  const controles = useRef<OrbitControls | null>(null)
  const meta = useRef<THREE.Vector3 | null>(null)
  const alTocarRef = useRef(alTocar)
  useEffect(() => {
    alTocarRef.current = alTocar
  }, [alTocar])
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement)
    c.enablePan = false
    c.enableDamping = !reducido
    c.dampingFactor = 0.08
    c.minDistance = 1.8
    c.maxDistance = 7.5
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
    return () => {
      c.removeEventListener('change', alCambiar)
      c.removeEventListener('start', alEmpezar)
      c.dispose()
      controles.current = null
    }
  }, [camera, gl, invalidate, reducido])
  // al cambiar de organización (o al pedirlo), mirar hacia sus sitios
  const clave = direccion.join(',')
  useEffect(() => {
    camera.position.set(...direccion).multiplyScalar(DISTANCIA)
    camera.lookAt(0, 0, 0)
    controles.current?.update()
    invalidate()
  }, [clave, camera, invalidate]) // eslint-disable-line react-hooks/exhaustive-deps -- `direccion` cambia con `clave`
  useEffect(() => {
    if (controles.current) controles.current.autoRotate = girar && !reducido
    invalidate()
  }, [girar, reducido, invalidate])
  useEffect(() => {
    if (!orden) return
    const distancia = camera.position.length()
    if (orden.tipo === 'centrar') meta.current = new THREE.Vector3(...direccion).multiplyScalar(DISTANCIA)
    else meta.current = camera.position.clone().setLength(THREE.MathUtils.clamp(distancia * (orden.tipo === 'acercar' ? 0.8 : 1.25), 1.8, 7.5))
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
      // por la superficie de la esfera, no en línea recta (que pasaría por dentro)
      const largo = THREE.MathUtils.lerp(camera.position.length(), meta.current.length(), k)
      camera.position.lerp(meta.current, k).setLength(largo)
      if (camera.position.distanceTo(meta.current) < 0.005) meta.current = null
      invalidate()
    }
    if (c.update(delta)) invalidate()
  })
  return null
}

/** Mueve las etiquetas del DOM sobre sus sitios y oculta las que quedan detrás del globo. */
function Proyector({ anclas, elementos }: { anclas: Map<string, Vec3>; elementos: Map<string, HTMLElement> }) {
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  const n = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    for (const [id, punto] of anclas) {
      const el = elementos.get(id)
      if (!el) continue
      n.set(...punto).normalize()
      const delante = n.dot(v.copy(camera.position).normalize()) > 0.2
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

const LADO = { derecha: 'translate-x-3', izquierda: '-translate-x-[calc(100%+0.75rem)]' } as const

const BOTON = 'flex size-8 items-center justify-center rounded-lg border border-borde bg-superficie text-texto-suave hover:text-texto aria-pressed:bg-acento-suave aria-pressed:text-acento'

interface Props {
  org: Organizacion
  ev: Evaluacion
  enMarcha: boolean
  alVolverA2D: () => void
}

export default function Globo3D({ org, ev, enMarcha, alVolverA2D }: Props) {
  const { tema } = useTema()
  const reducido = useMovimientoReducido()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tema` marca cuándo releer los tokens
  const pal = useMemo(() => leerPaleta(), [tema])
  const cs = conexiones(org, ev)
  const sitios = sitiosDeFuera(cs)
  const geo = org.geografia
  const direccion = useMemo(
    () => (geo ? direccionDeVista([geo.sede, ...Object.values(geo.infraestructura).filter((l) => !!l)]) : ([0, 0.3, 1] as Vec3)),
    [geo],
  )
  // quieto y mirando a las conexiones; el botón lo pone a girar
  const [girar, setGirar] = useState(false)
  const [tocado, setTocado] = useState(false)
  const [orden, setOrden] = useState<{ tipo: 'acercar' | 'alejar' | 'centrar'; n: number } | null>(null)
  const [etiquetas] = useState(() => new Map<string, HTMLElement>())
  const animar = enMarcha && !reducido
  const autoGiro = girar && !tocado && !reducido
  const ordenar = (tipo: 'acercar' | 'alejar' | 'centrar') => setOrden((o) => ({ tipo, n: (o?.n ?? 0) + 1 }))

  const anclas = new Map<string, Vec3>()
  if (geo) anclas.set('sede', aEsfera(geo.sede.lat, geo.sede.lon, 1.04))
  for (const s of sitios) anclas.set(`sitio-${s.lat},${s.lon}`, aEsfera(s.lat, s.lon, 1.04))
  const registrar = (id: string) => (el: HTMLElement | null) => {
    if (el) etiquetas.set(id, el)
    else etiquetas.delete(id)
  }
  const ultimo = cs.find((c) => c.ultimo)
  // a qué lado de su punto va cada etiqueta (la sede primero), para que las cercanas no se pisen
  const lados = ladosDeEtiqueta(geo ? [geo.sede, ...sitios] : sitios)

  const alternativa = (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-texto">
      <p>No se ha podido iniciar el globo 3D en este navegador (WebGL).</p>
      <button type="button" onClick={alVolverA2D} className="font-medium text-acento hover:underline">
        Ver el mapa 2D
      </button>
    </div>
  )

  return (
    <div role="region" aria-label={`Globo de ${org.nombre}`} className="relative h-full w-full overflow-hidden rounded-lg border border-borde bg-lienzo">
      <SinWebGL alternativa={alternativa}>
        <div role="img" aria-label={resumenMundo(org, cs)} className="absolute inset-0 cursor-grab">
          <Canvas frameloop={animar || autoGiro ? 'always' : 'demand'} dpr={[1, 1.75]} camera={{ fov: 30, near: 0.1, far: 50, position: [0, 0, DISTANCIA] }} gl={{ antialias: true }} fallback={alternativa}>
            <color attach="background" args={[pal['maqueta-base']]} />
            <hemisphereLight args={[pal.superficie, pal['maqueta-base'], tema === 'oscuro' ? 1.1 : 1.3]} />
            <directionalLight position={[-3, 4, 5]} intensity={tema === 'oscuro' ? 1.6 : 1.9} />
            <Tierra pal={pal} />
            {geo && <Sitio lat={geo.sede.lat} lon={geo.sede.lon} color={pal.acento} latir={!!ultimo && ultimo.sentido === 'entrada'} reducido={reducido} />}
            {sitios.map((s) => (
              <Sitio key={`${s.lat},${s.lon}`} lat={s.lat} lon={s.lon} color={pal['sev-critica']} latir={!!ultimo && ultimo.fuera.lat === s.lat && ultimo.fuera.lon === s.lon} reducido={reducido} />
            ))}
            {cs.map((c, i) => (
              <ArcoGlobo key={c.id} c={c} pal={pal} animar={animar} reducido={reducido} desfase={(i * 0.37) % 1} />
            ))}
            <Camara direccion={direccion} girar={autoGiro} reducido={reducido} orden={orden} alTocar={() => setTocado(true)} />
            <Proyector anclas={anclas} elementos={etiquetas} />
          </Canvas>
        </div>

        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {geo && (
            <span ref={registrar('sede')} className={cn('absolute top-0 left-0 -translate-y-1/2 rounded-md border border-acento/50 bg-superficie px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-acento shadow-sm', LADO[lados[0]])} style={{ visibility: 'hidden' }}>
              Sede · {geo.sede.nombre}
            </span>
          )}
          {sitios.map((s, i) => (
            <span key={`${s.lat},${s.lon}`} ref={registrar(`sitio-${s.lat},${s.lon}`)} title={s.papeles.join(' · ')} className={cn('absolute top-0 left-0 -translate-y-1/2 rounded-md border border-sev-critica/50 bg-superficie px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-sev-critica shadow-sm', LADO[lados[i + 1]])} style={{ visibility: 'hidden' }}>
              {s.nombre} ({s.pais})
            </span>
          ))}
        </div>

        <div role="group" aria-label="Cámara del globo" className="absolute top-3 right-3 z-10 flex gap-1">
          {!reducido && (
            <button type="button" onClick={() => { setGirar((g) => !g); setTocado(false) }} aria-pressed={autoGiro} title={autoGiro ? 'Parar el giro' : 'Girar el globo'} className={BOTON}>
              <RotateCw className="size-4" aria-hidden />
              <span className="sr-only">Girar el globo</span>
            </button>
          )}
          {[
            { texto: 'Acercar', icono: Plus, accion: () => ordenar('acercar') },
            { texto: 'Alejar', icono: Minus, accion: () => ordenar('alejar') },
            { texto: 'Centrar en la sede y sus conexiones', icono: Crosshair, accion: () => ordenar('centrar') },
          ].map((b) => (
            <button key={b.texto} type="button" onClick={b.accion} title={b.texto} className={BOTON}>
              <b.icono className="size-4" aria-hidden />
              <span className="sr-only">{b.texto}</span>
            </button>
          ))}
        </div>

        <PanelConexiones org={org} conexiones={cs} className={cn('absolute bottom-3 left-3 z-10 w-[min(24rem,calc(100%-1.5rem))]')} />
      </SinWebGL>
    </div>
  )
}
