/**
 * Maqueta 3D de la organización (vista alternativa a `GrafoOrganizacion`, que sigue siendo la de por defecto y la
 * accesible). Dibuja la escena que calcula `maqueta.ts`: zonas de red como plataformas escalonadas, un volumen por
 * activo con el color de su estado, el ataque como arcos que saltan de activo en activo, los pasos impedidos en gris y
 * la ruta probable hacia la siguiente joya en puntos ámbar.
 *
 * Se carga solo al elegir la vista 3D (three.js va en su propio chunk). Reglas del portal que respeta:
 *   - colores: los tokens del tema (`--sev-*`, `--acento`, `--zona`…), leídos al cambiar de tema; ningún hex aquí;
 *   - movimiento: lo único que se anima es el punto que recorre el último paso, y solo mientras la simulación avanza y
 *     el usuario no ha pedido menos movimiento; si no, el lienzo se pinta solo cuando algo cambia;
 *   - accesibilidad: el lienzo es una imagen con su resumen; las etiquetas de los activos son botones que abren la
 *     misma ficha que en 2D, y la vista 2D sigue a un clic;
 *   - telemetría como texto: los nombres se pintan como texto de React, nunca como HTML.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bug, Crown, Maximize, Minus, Plus, ShieldCheck, TriangleAlert, Unplug, type LucideIcon } from 'lucide-react'
import { Component, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

import { useMovimientoReducido } from '@/componentes/datos/useMovimientoReducido'
import { useTema } from '@/componentes/tema/useTema'
import { cn } from '@/lib/utils'

import { FichaActivo } from './GrafoOrganizacion'
import { cima, construirEscena, puntoDelArco, resumenEscena, type Arco, type Escena, type EstadoPieza, type Pieza, type Vec3 } from './maqueta'
import { porId, type Organizacion } from './modelo'
import type { RutaProbable } from './razonamiento'
import type { Evaluacion } from './simulacion'

// --- Colores del tema -------------------------------------------------------------------------------------------

const TOKENS = [
  'superficie', 'maqueta-plataforma', 'maqueta-pieza', 'borde-discontinuo', 'texto-suave', 'linea-red', 'linea-bloqueada',
  'sev-critica', 'sev-media', 'acento', 'ok', 'atacante-fondo', 'atacante-icono', 'fam-ambar-linea',
] as const
type Paleta = Record<(typeof TOKENS)[number], string>

function leerPaleta(): Paleta {
  const estilo = getComputedStyle(document.documentElement)
  return Object.fromEntries(TOKENS.map((t) => [t, estilo.getPropertyValue(`--${t}`).trim() || '#8a94a2'])) as Paleta
}

const COLOR_ESTADO: Record<EstadoPieza, keyof Paleta> = {
  normal: 'maqueta-pieza',
  riesgo: 'sev-media',
  comprometido: 'sev-critica',
  aislado: 'acento',
  protegido: 'ok',
  atacante: 'atacante-fondo',
}

/** Estado en la etiqueta: el mismo icono que en la vista 2D, sobre su color (nunca el color solo), y su nombre al pasar. */
const MARCA_ESTADO: Partial<Record<EstadoPieza, { texto: string; icono: LucideIcon; clase: string }>> = {
  riesgo: { texto: 'En riesgo', icono: TriangleAlert, clase: 'bg-sev-media' },
  comprometido: { texto: 'Comprometido', icono: Bug, clase: 'bg-sev-critica' },
  aislado: { texto: 'Aislado', icono: Unplug, clase: 'bg-acento' },
  protegido: { texto: 'Protegido', icono: ShieldCheck, clase: 'bg-ok' },
}

// --- Piezas -----------------------------------------------------------------------------------------------------

function Bordes({ geometria, color }: { geometria: THREE.BufferGeometry; color: string }) {
  const bordes = useMemo(() => new THREE.EdgesGeometry(geometria, 25), [geometria])
  useEffect(() => () => bordes.dispose(), [bordes])
  return (
    <lineSegments geometry={bordes}>
      <lineBasicMaterial color={color} transparent opacity={0.55} />
    </lineSegments>
  )
}

function geometriaDe(p: Pieza): THREE.BufferGeometry {
  const [ancho, alto, fondo] = p.medidas
  if (p.forma === 'cilindro') return new THREE.CylinderGeometry(ancho / 2, ancho / 2, alto, 28)
  if (p.forma === 'octaedro') return new THREE.OctahedronGeometry(ancho / 2)
  return new THREE.BoxGeometry(ancho, alto, fondo)
}

function VolumenPieza({ pieza, paleta, resaltada, alElegir, alPasar }: { pieza: Pieza; paleta: Paleta; resaltada: boolean; alElegir: (id: string) => void; alPasar: (id: string | null) => void }) {
  const geometria = useMemo(() => geometriaDe(pieza), [pieza])
  useEffect(() => () => geometria.dispose(), [geometria])
  const color = paleta[COLOR_ESTADO[pieza.estado]]
  const [, alto] = pieza.medidas
  const centro: Vec3 = [pieza.base[0], pieza.base[1] + alto / 2, pieza.base[2]]
  const borde = pieza.estado === 'atacante' ? paleta['atacante-icono'] : pieza.estado === 'normal' ? paleta['borde-discontinuo'] : color
  return (
    <group position={centro}>
      <mesh
        geometry={geometria}
        onClick={(e) => {
          e.stopPropagation()
          alElegir(pieza.id)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          alPasar(pieza.id)
        }}
        onPointerOut={() => alPasar(null)}
      >
        <meshStandardMaterial color={color} roughness={0.72} metalness={0.05} emissive={color} emissiveIntensity={resaltada ? 0.18 : 0} />
      </mesh>
      <Bordes geometria={geometria} color={borde} />
      {pieza.joya && (
        <mesh position={[0, alto / 2 + 0.32, 0]}>
          <octahedronGeometry args={[0.13]} />
          <meshStandardMaterial color={paleta['fam-ambar-linea']} roughness={0.35} metalness={0.2} />
        </mesh>
      )}
      {(pieza.objetivo || pieza.golpeado) && (
        <mesh position={[0, -alto / 2 + 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.6, 0.64, 48]} />
          <meshBasicMaterial color={pieza.golpeado ? paleta['sev-critica'] : paleta['sev-media']} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

// --- Arcos ------------------------------------------------------------------------------------------------------

function curvaDe(a: Arco): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(Array.from({ length: 25 }, (_, i) => new THREE.Vector3(...puntoDelArco(a, i / 24))))
}

/** Punta de flecha al final del arco, orientada según su tangente. */
function Punta({ curva, color, radio }: { curva: THREE.CatmullRomCurve3; color: string; radio: number }) {
  const { posicion, giro } = useMemo(() => {
    const fin = curva.getPointAt(0.985)
    const tangente = curva.getTangentAt(0.985).normalize()
    return { posicion: fin, giro: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangente) }
  }, [curva])
  return (
    <mesh position={posicion} quaternion={giro}>
      <coneGeometry args={[radio * 2.6, radio * 7, 14]} />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

function Tubo({ arco, color, radio, opacidad = 1 }: { arco: Arco; color: string; radio: number; opacidad?: number }) {
  const curva = useMemo(() => curvaDe(arco), [arco])
  const geometria = useMemo(() => new THREE.TubeGeometry(curva, 48, radio, 8, false), [curva, radio])
  useEffect(() => () => geometria.dispose(), [geometria])
  return (
    <group>
      <mesh geometry={geometria}>
        <meshBasicMaterial color={color} transparent={opacidad < 1} opacity={opacidad} />
      </mesh>
      <Punta curva={curva} color={color} radio={radio} />
    </group>
  )
}

/** Ruta probable: puntos a lo largo de la curva (el «discontinuo» del 2D). */
function Puntos({ arco, color }: { arco: Arco; color: string }) {
  const curva = useMemo(() => curvaDe(arco), [arco])
  const posiciones = useMemo(() => {
    const n = Math.max(6, Math.round(curva.getLength() / 0.22))
    return Array.from({ length: n }, (_, i) => curva.getPointAt(i / (n - 1)))
  }, [curva])
  return (
    <group>
      {posiciones.slice(0, -1).map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.045, 10, 8]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
      <Punta curva={curva} color={color} radio={0.03} />
    </group>
  )
}

function LineaRed({ arco, color }: { arco: Arco; color: string }) {
  const linea = useMemo(() => {
    const geometria = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...arco.desde), new THREE.Vector3(...arco.hasta)])
    return new THREE.Line(geometria, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 }))
  }, [arco, color])
  useEffect(
    () => () => {
      linea.geometry.dispose()
      ;(linea.material as THREE.Material).dispose()
    },
    [linea],
  )
  return <primitive object={linea} />
}

/** El punto que recorre el último paso mientras la simulación avanza: dice «esto está pasando ahora». */
function Avance({ arco, color }: { arco: Arco; color: string }) {
  const ref = useRef<THREE.Mesh>(null)
  const curva = useMemo(() => curvaDe(arco), [arco])
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.copy(curva.getPointAt((clock.getElapsedTime() / 1.6) % 1))
  })
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.1, 16, 12]} />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

function Arcos({ escena, paleta, animando }: { escena: Escena; paleta: Paleta; animando: boolean }) {
  return (
    <group>
      {escena.arcos.map((a) => {
        if (a.tipo === 'red') return <LineaRed key={a.id} arco={a} color={paleta['linea-red']} />
        if (a.tipo === 'ruta') return <Puntos key={a.id} arco={a} color={paleta['sev-media']} />
        if (a.tipo === 'impedido') return <Tubo key={a.id} arco={a} color={paleta['linea-bloqueada']} radio={0.022} opacidad={0.75} />
        return (
          <group key={a.id}>
            <Tubo arco={a} color={paleta['sev-critica']} radio={a.ultimo ? 0.05 : 0.034} />
            {a.ultimo && animando && <Avance arco={a} color={paleta['sev-critica']} />}
          </group>
        )
      })}
      {escena.marcas.map((m) => {
        const pieza = escena.piezas.find((p) => p.id === m.activo)
        if (!pieza) return null
        const [x, y, z] = cima(pieza)
        return (
          <mesh key={`marca-${m.activo}`} position={[x, y + 0.08, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.3, 0.03, 8, 40]} />
            <meshBasicMaterial color={m.tipo === 'ataque' ? paleta['sev-critica'] : paleta['linea-bloqueada']} />
          </mesh>
        )
      })}
    </group>
  )
}

function Plataformas({ escena, paleta }: { escena: Escena; paleta: Paleta }) {
  return (
    <group>
      {escena.plataformas.map((p) => (
        <PlataformaZona key={p.id} centro={p.centro} medidas={p.medidas} paleta={paleta} />
      ))}
    </group>
  )
}

function PlataformaZona({ centro, medidas, paleta }: { centro: Vec3; medidas: Vec3; paleta: Paleta }) {
  const geometria = useMemo(() => new THREE.BoxGeometry(...medidas), [medidas])
  useEffect(() => () => geometria.dispose(), [geometria])
  return (
    <group position={centro}>
      <mesh geometry={geometria}>
        <meshStandardMaterial color={paleta['maqueta-plataforma']} roughness={0.9} />
      </mesh>
      <Bordes geometria={geometria} color={paleta['borde-discontinuo']} />
    </group>
  )
}

// --- Cámara, controles y etiquetas ------------------------------------------------------------------------------

/** Desde delante y bastante desde arriba (unos 55°), sin giro: Internet a la izquierda y lo crítico a la derecha, como en 2D. */
const DIRECCION_CAMARA = new THREE.Vector3(0, 1.45, 1).normalize()
/**
 * Hueco de pantalla (coordenadas normalizadas, -1…1) que puede ocupar la escena al encuadrar: arriba quedan el
 * selector de vista y los botones de cámara, y abajo la leyenda.
 */
const HUECO = { izquierda: -0.95, derecha: 0.95, abajo: -0.74, arriba: 0.8 }

/**
 * Coloca la cámara para que la escena entera quepa en el hueco: busca la distancia por bisección proyectando las
 * esquinas de la caja que la contiene (cuenta la perspectiva de verdad, sin aproximaciones), y la centra.
 */
function encuadrar(camara: THREE.PerspectiveCamera, controles: OrbitControls | null, escena: Escena) {
  const { min, max } = escena.extension
  const esquinas = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]))
  const centro = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
  const p = new THREE.Vector3()
  const colocar = (d: number, objetivo: THREE.Vector3) => {
    camara.position.copy(objetivo).addScaledVector(DIRECCION_CAMARA, d)
    camara.lookAt(objetivo)
    camara.updateMatrixWorld()
    camara.updateProjectionMatrix()
  }
  const caja = () => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const e of esquinas) {
      p.copy(e).project(camara)
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y)
    }
    return { x0, x1, y0, y1 }
  }
  const objetivo = centro.clone()
  // Dos pasadas: la primera encuentra la distancia; la segunda recentra el objetivo y vuelve a ajustar.
  for (let pasada = 0; pasada < 2; pasada++) {
    let cerca = 1
    let lejos = 80
    for (let i = 0; i < 26; i++) {
      const d = (cerca + lejos) / 2
      colocar(d, objetivo)
      const c = caja()
      const cabe = (c.x1 - c.x0) <= HUECO.derecha - HUECO.izquierda && (c.y1 - c.y0) <= HUECO.arriba - HUECO.abajo
      if (cabe) lejos = d
      else cerca = d
    }
    colocar(lejos, objetivo)
    if (pasada === 0) {
      // desplaza el objetivo para que el centro de la caja proyectada caiga en el centro del hueco
      const c = caja()
      const dx = (HUECO.izquierda + HUECO.derecha) / 2 - (c.x0 + c.x1) / 2
      const dy = (HUECO.abajo + HUECO.arriba) / 2 - (c.y0 + c.y1) / 2
      const derecha = new THREE.Vector3().setFromMatrixColumn(camara.matrixWorld, 0)
      const arriba = new THREE.Vector3().setFromMatrixColumn(camara.matrixWorld, 1)
      const escala = lejos * Math.tan(THREE.MathUtils.degToRad(camara.fov) / 2)
      objetivo.addScaledVector(derecha, -dx * escala * camara.aspect).addScaledVector(arriba, -dy * escala)
    }
  }
  if (controles) {
    controles.target.copy(objetivo)
    controles.update()
  }
}

/** Orden de los botones de cámara; `n` cambia en cada pulsación para que la misma orden se repita. */
export interface OrdenCamara {
  tipo: 'encuadrar' | 'acercar' | 'alejar'
  n: number
}

function Camara({ escena, reducido, orden }: { escena: Escena; reducido: boolean; orden: OrdenCamara | null }) {
  const { camera, gl, size, invalidate } = useThree()
  const controles = useRef<OrbitControls | null>(null)
  const camara = camera as THREE.PerspectiveCamera

  useEffect(() => {
    const c = new OrbitControls(camara, gl.domElement)
    c.enableDamping = !reducido
    c.dampingFactor = 0.09
    c.screenSpacePanning = true
    c.minDistance = 4
    c.maxDistance = 30
    c.minPolarAngle = 0.12
    // que no se pueda bajar por debajo del suelo: siempre se ve desde arriba
    c.maxPolarAngle = Math.PI * 0.44
    const alCambiar = () => invalidate()
    c.addEventListener('change', alCambiar)
    controles.current = c
    return () => {
      c.removeEventListener('change', alCambiar)
      c.dispose()
      controles.current = null
    }
  }, [camara, gl, invalidate, reducido])

  // Encuadra al cargar, al cambiar de organización y al cambiar de tamaño. No al avanzar el ataque: la cámara quieta
  // deja seguir el camino.
  const clave = `${escena.plataformas.map((p) => p.id).join()}|${size.width}x${size.height}`
  useEffect(() => {
    encuadrar(camara, controles.current, escena)
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de organización o de tamaño
  }, [clave])

  useEffect(() => {
    if (!orden) return
    if (orden.tipo === 'encuadrar') {
      encuadrar(camara, controles.current, escena)
    } else {
      const objetivo = controles.current?.target ?? new THREE.Vector3()
      camara.position.sub(objetivo).multiplyScalar(orden.tipo === 'acercar' ? 0.8 : 1.25).add(objetivo)
      controles.current?.update()
    }
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando llega una orden nueva
  }, [orden])

  useFrame(() => {
    // con amortiguación, el movimiento sigue unos fotogramas después de soltar: hay que seguir actualizando
    if (controles.current?.enableDamping && controles.current.update()) invalidate()
  })
  return null
}

/** Proyecta a pantalla los puntos de las etiquetas y mueve sus elementos del DOM, sin pasar por React en cada fotograma. */
function Proyector({ anclas, elementos }: { anclas: Map<string, Vec3>; elementos: RefObject<Map<string, HTMLElement>> }) {
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    for (const [id, punto] of anclas) {
      const el = elementos.current.get(id)
      if (!el) continue
      v.set(...punto).project(camera)
      const fuera = v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05
      el.style.visibility = fuera ? 'hidden' : 'visible'
      // solo el punto; cada etiqueta se alinea con él por su cuenta (clases `translate-*`, que se suman a esto)
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`
    }
  })
  return null
}

// --- Fallos de WebGL --------------------------------------------------------------------------------------------

class SinWebGL extends Component<{ alternativa: ReactNode; children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false }
  static getDerivedStateFromError() {
    return { fallo: true }
  }
  render() {
    return this.state.fallo ? this.props.alternativa : this.props.children
  }
}

// --- La maqueta -------------------------------------------------------------------------------------------------

interface Props {
  org: Organizacion
  ev: Evaluacion
  ruta: RutaProbable | null
  riesgo: Set<string>
  /** La simulación avanza: solo entonces se anima el último paso. */
  enMarcha: boolean
  alVolverA2D: () => void
}

export default function Maqueta3D({ org, ev, ruta, riesgo, enMarcha, alVolverA2D }: Props) {
  const { tema } = useTema()
  const reducido = useMovimientoReducido()
  // Los colores se leen del tema activo; `tema` cambia cuando la clase de <html> ya está puesta.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tema` no se usa dentro, pero marca cuándo releer los tokens
  const paleta = useMemo(() => leerPaleta(), [tema])
  const escena = useMemo(() => construirEscena(org, ev, ruta, riesgo), [org, ev, ruta, riesgo])
  const [fichaId, setFichaId] = useState<string | null>(null)
  const [bajoRaton, setBajoRaton] = useState<string | null>(null)
  const etiquetas = useRef(new Map<string, HTMLElement>())
  const [orden, setOrden] = useState<OrdenCamara | null>(null)
  const ordenar = (tipo: OrdenCamara['tipo']) => setOrden((o) => ({ tipo, n: (o?.n ?? 0) + 1 }))
  const activos = porId(org.activos)
  const ficha = fichaId ? activos.get(fichaId) : undefined
  const animando = enMarcha && !reducido && escena.arcos.some((a) => a.ultimo)

  const anclas = useMemo(() => {
    const m = new Map<string, Vec3>()
    // La etiqueta de cada activo, delante de su pieza (hacia quien mira): así no tapa lo que hay detrás.
    for (const p of escena.piezas) m.set(p.id, [p.base[0], p.base[1], p.base[2] + p.medidas[2] / 2 + 0.06])
    for (const z of escena.plataformas) m.set(`zona-${z.id}`, [z.centro[0], z.medidas[1] + 0.02, z.centro[2] + z.medidas[2] / 2])
    for (const a of escena.arcos.filter((x) => x.tipo === 'impedido')) m.set(`impedido-${a.id}`, puntoDelArco(a, 0.5))
    return m
  }, [escena])
  const registrar = (id: string) => (el: HTMLElement | null) => {
    if (el) etiquetas.current.set(id, el)
    else etiquetas.current.delete(id)
  }

  const alternativa = (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-texto">
      <p>No se ha podido iniciar la vista 3D en este navegador (WebGL).</p>
      <button type="button" onClick={alVolverA2D} className="font-medium text-acento hover:underline">
        Volver a la vista 2D
      </button>
    </div>
  )

  return (
    <div role="region" aria-label={`Maqueta 3D de ${org.nombre}`} className="relative h-full w-full overflow-hidden rounded-lg border border-borde bg-lienzo">
      <SinWebGL alternativa={alternativa}>
        <div role="img" aria-label={resumenEscena(org, escena)} className="absolute inset-0" style={{ cursor: bajoRaton ? 'pointer' : 'grab' }}>
          <Canvas
            frameloop={animando ? 'always' : 'demand'}
            dpr={[1, 2]}
            camera={{ fov: 30, near: 0.1, far: 300, position: [0, 14, 10] }}
            gl={{ antialias: true, alpha: true }}
            fallback={alternativa}
            onPointerMissed={() => setBajoRaton(null)}
          >
            <ambientLight intensity={tema === 'oscuro' ? 1.1 : 0.95} />
            <hemisphereLight args={[paleta.superficie, paleta['texto-suave'], 0.6]} />
            <directionalLight position={[-5, 12, 8]} intensity={tema === 'oscuro' ? 1.9 : 1.7} />
            <Plataformas escena={escena} paleta={paleta} />
            {escena.piezas.map((p) => (
              <VolumenPieza key={p.id} pieza={p} paleta={paleta} resaltada={bajoRaton === p.id} alElegir={setFichaId} alPasar={setBajoRaton} />
            ))}
            <Arcos escena={escena} paleta={paleta} animando={animando} />
            <Camara escena={escena} reducido={reducido} orden={orden} />
            <Proyector anclas={anclas} elementos={etiquetas} />
          </Canvas>
        </div>

        {/* Etiquetas: botones de verdad (teclado y lector de pantalla), colocados sobre el lienzo por el proyector. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {escena.plataformas.map((z) => (
            <span key={z.id} ref={registrar(`zona-${z.id}`)} className="absolute top-0 left-0 -translate-x-1/2 translate-y-1 text-[10.5px] font-semibold tracking-wide whitespace-nowrap text-texto-suave uppercase" style={{ visibility: 'hidden' }} aria-hidden>
              {z.titulo}
            </span>
          ))}
          {escena.arcos.filter((a) => a.tipo === 'impedido').map((a) => (
            <span key={a.id} ref={registrar(`impedido-${a.id}`)} title={`Impedido: ${a.pasos.join(' · ')}`} className="absolute top-0 left-0 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-borde bg-superficie text-[11px] font-bold text-texto-suave" style={{ visibility: 'hidden' }} aria-hidden>
              ✕
            </span>
          ))}
          {escena.piezas.map((p) => {
            const marca = MARCA_ESTADO[p.estado]
            return (
              <button
                key={p.id}
                ref={registrar(p.id)}
                type="button"
                onClick={() => setFichaId(p.id)}
                onPointerEnter={() => setBajoRaton(p.id)}
                onPointerLeave={() => setBajoRaton(null)}
                data-activo={p.id}
                data-estado={p.estado}
                aria-label={`${p.nombre} · ${activos.get(p.id)?.area ?? ''} · ${p.estado === 'atacante' ? 'atacante' : p.estado}${p.joya ? ' · joya de la corona' : ''}`}
                className={cn(
                  'pointer-events-auto absolute top-0 left-0 flex -translate-x-1/2 translate-y-0.5 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap shadow-sm',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
                  p.estado === 'atacante' ? 'border-atacante-borde bg-atacante-fondo text-atacante-texto' : 'border-borde bg-superficie text-texto',
                  bajoRaton === p.id && 'ring-2 ring-acento',
                )}
                style={{ visibility: 'hidden' }}
              >
                {p.joya && <Crown className="size-3 text-fam-ambar-texto" aria-hidden />}
                {p.nombre}
                {marca && (
                  <span title={marca.texto} className={cn('flex size-4 items-center justify-center rounded text-sobre-intenso', marca.clase)}>
                    <marca.icono className="size-3" aria-hidden />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div role="group" aria-label="Cámara de la maqueta" title="Arrastra para girar, con el botón derecho para desplazar y con la rueda para acercar" className="absolute top-3 right-3 z-10 flex gap-1">
          {[
            { texto: 'Acercar', icono: Plus, accion: () => ordenar('acercar') },
            { texto: 'Alejar', icono: Minus, accion: () => ordenar('alejar') },
            { texto: 'Encuadrar la maqueta', icono: Maximize, accion: () => ordenar('encuadrar') },
          ].map((b) => (
            <button key={b.texto} type="button" onClick={b.accion} title={b.texto} className="flex size-8 items-center justify-center rounded-lg border border-borde bg-superficie text-texto-suave hover:text-texto">
              <b.icono className="size-4" aria-hidden />
              <span className="sr-only">{b.texto}</span>
            </button>
          ))}
        </div>
      </SinWebGL>

      <ul aria-label="Leyenda de la maqueta" className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-x-3 gap-y-1 rounded-lg border border-borde bg-superficie px-3 py-1.5 text-[11px] text-texto-suave">
        {[
          { texto: 'Red', color: 'var(--linea-red)', trazo: undefined, ancho: 1.5 },
          { texto: 'Paso del ataque', color: 'var(--sev-critica)', trazo: undefined, ancho: 3 },
          { texto: 'Paso impedido', color: 'var(--linea-bloqueada)', trazo: undefined, ancho: 2 },
          { texto: 'Ruta probable', color: 'var(--sev-media)', trazo: '1 4', ancho: 3 },
        ].map((l) => (
          <li key={l.texto} className="flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden>
              <line x1="1" y1="3" x2="17" y2="3" stroke={l.color} strokeWidth={l.ancho} strokeDasharray={l.trazo} strokeLinecap="round" />
            </svg>
            {l.texto}
          </li>
        ))}
      </ul>

      {ficha && <FichaActivo org={org} ev={ev} activo={ficha} alCerrar={() => setFichaId(null)} />}
    </div>
  )
}
