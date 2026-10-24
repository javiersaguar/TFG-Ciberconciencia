/**
 * Maqueta 3D de la organización (vista alternativa a `GrafoOrganizacion`, que sigue siendo la de por defecto y la
 * accesible). Dibuja la escena de `maqueta.ts`: cada zona de red es una sala con suelo técnico y mampara, escalonada de
 * Internet a los activos críticos; cada activo es un modelo según su tipo (`modelos3d.tsx`), con el estado en sus LED,
 * pantallas y alrededor; el ataque son arcos de luz que saltan de activo en activo.
 *
 * Dos modos de cámara:
 *   - Vista general: la maqueta entera girando despacio en círculo. Se puede girar, desplazar y acercar a mano (el giro
 *     se para mientras se toca y al elegir un activo) y pinchar cualquier activo para ver por qué está como está.
 *   - Seguir el ataque: lanza la simulación y la cámara acompaña cada paso, con perspectiva para ver alrededor. Si se
 *     mueve a mano, deja de seguir hasta el paso siguiente.
 * Con movimiento reducido no hay giro automático ni vuelos de cámara: los cambios de encuadre son instantáneos.
 *
 * El «por qué» de cada activo lo calcula `explicacion.ts` y lo pinta `PanelPorQue`. Las etiquetas de los activos son
 * botones del DOM colocados sobre el lienzo (teclado y lector de pantalla). Colores: los tokens del tema.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bug, Crown, Eye, Map as IconoMapa, Maximize, Maximize2, Minimize2, Minus, Pause, Play, Plus, RotateCw, ShieldCheck, TriangleAlert, Unplug, type LucideIcon } from 'lucide-react'
import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

import { useMovimientoReducido } from '@/componentes/datos/useMovimientoReducido'
import { useTema } from '@/componentes/tema/useTema'
import { cn } from '@/lib/utils'

import { explicarActivo } from './explicacion'
import { FichaActivo } from './GrafoOrganizacion'
import { construirEscena, encuadreDePaso, puntoDelArco, resumenEscena, type Arco, type Escena, type EstadoPieza, type Plataforma, type Vec3 } from './maqueta'
import { porId, NOMBRE_TACTICA, type AccionAplicada, type Organizacion } from './modelo'
import { ModeloActivo } from './modelos3d'
import { leerPaleta3D, type Paleta3D } from './paleta3d'
import { PanelPorQue } from './PanelPorQue'
import type { RutaProbable } from './razonamiento'
import type { Evaluacion } from './simulacion'

export type ModoCamara = 'general' | 'seguir'

// --- Salas (zonas de red) ---------------------------------------------------------------------------------------

function Sala({ p, pal }: { p: Plataforma; pal: Paleta3D }) {
  const [ancho, alto, fondo] = p.medidas
  const [cx, , cz] = p.centro
  // baldosas del suelo técnico: una rejilla de 0,6 m
  const rejilla = useMemo(() => {
    const puntos: number[] = []
    const y = alto + 0.012
    for (let x = -ancho / 2 + 0.6; x < ancho / 2 - 0.05; x += 0.6) puntos.push(x, y, -fondo / 2 + 0.06, x, y, fondo / 2 - 0.06)
    for (let z = -fondo / 2 + 0.6; z < fondo / 2 - 0.05; z += 0.6) puntos.push(-ancho / 2 + 0.06, y, z, ancho / 2 - 0.06, y, z)
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(puntos, 3))
  }, [ancho, alto, fondo])
  useEffect(() => () => rejilla.dispose(), [rejilla])
  return (
    <group position={[cx, 0, cz]}>
      <mesh position={[0, alto / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[ancho, alto, fondo]} />
        <meshStandardMaterial color={pal['maqueta-plataforma']} roughness={0.85} metalness={0.05} />
      </mesh>
      <mesh position={[0, alto + 0.004, 0]} receiveShadow>
        <boxGeometry args={[ancho - 0.12, 0.008, fondo - 0.12]} />
        <meshStandardMaterial color={pal['maqueta-suelo']} roughness={0.7} metalness={0.05} />
      </mesh>
      <lineSegments geometry={rejilla}>
        <lineBasicMaterial color={pal['maqueta-plataforma']} transparent opacity={0.7} />
      </lineSegments>
      {/* mampara de cristal al fondo, con su perfil */}
      <mesh position={[0, alto + 0.75, -fondo / 2 + 0.05]}>
        <boxGeometry args={[ancho - 0.1, 1.5, 0.03]} />
        <meshStandardMaterial color={pal['maqueta-cristal']} transparent opacity={0.16} roughness={0.05} metalness={0.3} depthWrite={false} />
      </mesh>
      <mesh position={[0, alto + 1.5, -fondo / 2 + 0.05]} castShadow>
        <boxGeometry args={[ancho - 0.1, 0.04, 0.05]} />
        <meshStandardMaterial color={pal['maqueta-metal-claro']} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* canto de luz al frente: dónde acaba la sala */}
      <mesh position={[0, alto + 0.012, fondo / 2 - 0.04]}>
        <boxGeometry args={[ancho - 0.1, 0.012, 0.02]} />
        <meshStandardMaterial color={pal['maqueta-pantalla']} emissive={pal['maqueta-pantalla']} emissiveIntensity={0.7} />
      </mesh>
    </group>
  )
}

// --- Arcos ------------------------------------------------------------------------------------------------------

function curvaDe(a: Arco): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(Array.from({ length: 33 }, (_, i) => new THREE.Vector3(...puntoDelArco(a, i / 32))))
}

function Punta({ curva, color, radio, opacidad }: { curva: THREE.Curve<THREE.Vector3>; color: string; radio: number; opacidad: number }) {
  const { posicion, giro } = useMemo(() => {
    const t = 0.975
    return { posicion: curva.getPointAt(t), giro: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), curva.getTangentAt(t).normalize()) }
  }, [curva])
  return (
    <mesh position={posicion} quaternion={giro}>
      <coneGeometry args={[radio * 2.8, radio * 8, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} transparent={opacidad < 1} opacity={opacidad} />
    </mesh>
  )
}

function Tubo({ curva, color, radio, opacidad = 1, brillo = 0, halo = false }: { curva: THREE.Curve<THREE.Vector3>; color: string; radio: number; opacidad?: number; brillo?: number; halo?: boolean }) {
  const geometria = useMemo(() => new THREE.TubeGeometry(curva, 64, radio, 10, false), [curva, radio])
  const geometriaHalo = useMemo(() => (halo ? new THREE.TubeGeometry(curva, 64, radio * 2.6, 10, false) : null), [curva, radio, halo])
  useEffect(
    () => () => {
      geometria.dispose()
      geometriaHalo?.dispose()
    },
    [geometria, geometriaHalo],
  )
  return (
    <group>
      <mesh geometry={geometria} castShadow={brillo > 0 && opacidad === 1}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={brillo} transparent={opacidad < 1} opacity={opacidad} depthWrite={opacidad === 1} />
      </mesh>
      {geometriaHalo && (
        <mesh geometry={geometriaHalo}>
          <meshBasicMaterial color={color} transparent opacity={0.09 * opacidad} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

function ArcoPaso({ arco, pal, opacidad }: { arco: Arco; pal: Paleta3D; opacidad: number }) {
  const curva = useMemo(() => curvaDe(arco), [arco])
  if (arco.tipo === 'impedido') {
    return <Tubo curva={curva} color={pal['linea-bloqueada']} radio={0.035} opacidad={0.7 * opacidad} />
  }
  const color = pal['sev-critica']
  return (
    <group>
      <Tubo curva={curva} color={color} radio={arco.ultimo ? 0.07 : 0.05} brillo={arco.ultimo ? 0.9 : 0.45} opacidad={opacidad} halo={arco.ultimo} />
      <Punta curva={curva} color={color} radio={arco.ultimo ? 0.07 : 0.05} opacidad={opacidad} />
    </group>
  )
}

function RutaProbable3D({ arco, pal, opacidad }: { arco: Arco; pal: Paleta3D; opacidad: number }) {
  const curva = useMemo(() => curvaDe(arco), [arco])
  const puntos = useMemo(() => {
    const n = Math.max(8, Math.round(curva.getLength() / 0.32))
    return Array.from({ length: n - 1 }, (_, i) => curva.getPointAt(i / (n - 1)))
  }, [curva])
  // todos los puntos en una sola malla instanciada: una llamada de dibujo, no una por punto
  const instancias = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const malla = instancias.current
    if (!malla) return
    const m = new THREE.Matrix4()
    puntos.forEach((p, i) => malla.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)))
    malla.instanceMatrix.needsUpdate = true
  }, [puntos])
  const color = pal['sev-media']
  return (
    <group>
      <instancedMesh ref={instancias} args={[undefined, undefined, puntos.length]} key={puntos.length}>
        <sphereGeometry args={[0.06, 12, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} transparent={opacidad < 1} opacity={opacidad} />
      </instancedMesh>
      <Punta curva={curva} color={color} radio={0.04} opacidad={opacidad} />
    </group>
  )
}

/**
 * Cable de red entre dos activos, por el suelo como en una sala de verdad: sale de su sala a su altura, en el pasillo
 * entre salas baja o sube a la de la otra y llega por el suelo. Dentro de la misma sala, recto.
 */
function Cable({ arco, pal, opacidad }: { arco: Arco; pal: Paleta3D; opacidad: number }) {
  const curva = useMemo(() => {
    const a = new THREE.Vector3(...arco.desde)
    const b = new THREE.Vector3(...arco.hasta)
    const camino = new THREE.CurvePath<THREE.Vector3>()
    if (Math.abs(a.x - b.x) < 0.5) {
      camino.add(new THREE.LineCurve3(a, b))
      return camino
    }
    const pasillo = (a.x + b.x) / 2
    const puntos = [a, new THREE.Vector3(pasillo, a.y, a.z), new THREE.Vector3(pasillo, b.y, b.z), b]
    for (let i = 1; i < puntos.length; i++) camino.add(new THREE.LineCurve3(puntos[i - 1], puntos[i]))
    return camino
  }, [arco])
  return <Tubo curva={curva} color={pal['linea-red']} radio={0.02} opacidad={0.6 * opacidad} />
}

/** El punto (con estela) que recorre el último paso mientras la simulación avanza: «esto está pasando ahora». */
function Avance({ arco, color }: { arco: Arco; color: string }) {
  const grupo = useRef<THREE.Group>(null)
  const curva = useMemo(() => curvaDe(arco), [arco])
  useFrame(({ clock }) => {
    const hijos = grupo.current?.children ?? []
    const t = (clock.getElapsedTime() / 1.8) % 1
    hijos.forEach((h, i) => h.position.copy(curva.getPointAt(Math.max(0, t - i * 0.025))))
  })
  return (
    <group ref={grupo}>
      {[0.16, 0.12, 0.09, 0.06].map((r, i) => (
        <mesh key={i}>
          <sphereGeometry args={[r, 16, 12]} />
          <meshBasicMaterial color={color} transparent opacity={1 - i * 0.22} />
        </mesh>
      ))}
    </group>
  )
}

function Arcos({ escena, pal, animando, resaltado }: { escena: Escena; pal: Paleta3D; animando: boolean; resaltado: string | null }) {
  const opacidad = (a: Arco) => (!resaltado || a.extremos.includes(resaltado) ? 1 : 0.18)
  return (
    <group>
      {escena.arcos.map((a) => {
        if (a.tipo === 'red') return <Cable key={a.id} arco={a} pal={pal} opacidad={opacidad(a)} />
        if (a.tipo === 'ruta') return <RutaProbable3D key={a.id} arco={a} pal={pal} opacidad={opacidad(a)} />
        return (
          <group key={a.id}>
            <ArcoPaso arco={a} pal={pal} opacidad={opacidad(a)} />
            {a.ultimo && animando && <Avance arco={a} color={pal['sev-critica']} />}
          </group>
        )
      })}
      {escena.marcas.map((m) => {
        const pieza = escena.piezas.find((p) => p.id === m.activo)
        if (!pieza) return null
        const [x, y, z] = pieza.base
        const color = m.tipo === 'ataque' ? pal['sev-critica'] : pal['linea-bloqueada']
        return (
          <mesh key={`marca-${m.activo}`} position={[x, y + pieza.medidas[1] + 0.15, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.32, 0.03, 8, 40]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} />
          </mesh>
        )
      })}
    </group>
  )
}

// --- Entorno: luz de estudio para los reflejos -------------------------------------------------------------------

function Entorno({ intensidad }: { intensidad: number }) {
  const gl = useThree((s) => s.gl)
  const obtener = useThree((s) => s.get)
  const mapa = useMemo(() => {
    const generador = new THREE.PMREMGenerator(gl)
    const textura = generador.fromScene(new RoomEnvironment(), 0.04).texture
    generador.dispose()
    return textura
  }, [gl])
  useEffect(() => () => mapa.dispose(), [mapa])
  useEffect(() => {
    // la intensidad del reflejo depende del tema (en oscuro, menos)
    const { scene, invalidate } = obtener()
    scene.environmentIntensity = intensidad
    invalidate()
  }, [obtener, intensidad])
  return <primitive object={mapa} attach="environment" />
}

// --- Cámara -----------------------------------------------------------------------------------------------------

const DIRECCION_GENERAL = new THREE.Vector3(-0.2, 1.25, 1).normalize()
const HUECO = { izquierda: -0.95, derecha: 0.95, abajo: -0.72, arriba: 0.78 }

/** Encuadre de la vista general: busca la distancia que mete la escena entera en el hueco, con la perspectiva real. */
function encuadreGeneral(camara: THREE.PerspectiveCamera, escena: Escena): { pos: THREE.Vector3; obj: THREE.Vector3 } {
  const prueba = camara.clone()
  const { min, max } = escena.extension
  const esquinas = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new THREE.Vector3(i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]))
  const objetivo = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
  const p = new THREE.Vector3()
  const colocar = (d: number) => {
    prueba.position.copy(objetivo).addScaledVector(DIRECCION_GENERAL, d)
    prueba.lookAt(objetivo)
    prueba.updateMatrixWorld()
    prueba.updateProjectionMatrix()
  }
  const caja = () => {
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const e of esquinas) {
      p.copy(e).project(prueba)
      x0 = Math.min(x0, p.x)
      x1 = Math.max(x1, p.x)
      y0 = Math.min(y0, p.y)
      y1 = Math.max(y1, p.y)
    }
    return { x0, x1, y0, y1 }
  }
  let lejos = 160
  for (let pasada = 0; pasada < 2; pasada++) {
    let cerca = 2
    lejos = 160
    for (let i = 0; i < 28; i++) {
      const d = (cerca + lejos) / 2
      colocar(d)
      const c = caja()
      if (c.x1 - c.x0 <= HUECO.derecha - HUECO.izquierda && c.y1 - c.y0 <= HUECO.arriba - HUECO.abajo) lejos = d
      else cerca = d
    }
    colocar(lejos)
    if (pasada === 0) {
      const c = caja()
      const dx = (HUECO.izquierda + HUECO.derecha) / 2 - (c.x0 + c.x1) / 2
      const dy = (HUECO.abajo + HUECO.arriba) / 2 - (c.y0 + c.y1) / 2
      const escala = lejos * Math.tan(THREE.MathUtils.degToRad(prueba.fov) / 2)
      objetivo.addScaledVector(new THREE.Vector3().setFromMatrixColumn(prueba.matrixWorld, 0), -dx * escala * prueba.aspect)
      objetivo.addScaledVector(new THREE.Vector3().setFromMatrixColumn(prueba.matrixWorld, 1), -dy * escala)
    }
  }
  colocar(lejos)
  return { pos: prueba.position.clone(), obj: objetivo }
}

/** Orden de los botones de cámara; `n` cambia en cada pulsación para que la misma orden se repita. */
export interface OrdenCamara {
  tipo: 'encuadrar' | 'acercar' | 'alejar'
  n: number
}

interface PropsCamara {
  escena: Escena
  modo: ModoCamara
  autoGiro: boolean
  reducido: boolean
  /** Paso que sigue la cámara en modo «seguir» (clave para saber cuándo cambia). */
  pasoSeguido: { clave: string; desde: string; hasta: string } | null
  foco: string | null
  orden: OrdenCamara | null
  alInteractuar: (tocando: boolean) => void
}

function Camara({ escena, modo, autoGiro, reducido, pasoSeguido, foco, orden, alInteractuar }: PropsCamara) {
  const { camera, gl, size, invalidate } = useThree()
  const camara = camera as THREE.PerspectiveCamera
  const controles = useRef<OrbitControls | null>(null)
  const meta = useRef<{ pos: THREE.Vector3; obj: THREE.Vector3 } | null>(null)
  const espera = useRef(0)
  const alInteractuarRef = useRef(alInteractuar)
  useEffect(() => {
    alInteractuarRef.current = alInteractuar
  }, [alInteractuar])

  const irA = useCallback(
    (destino: { pos: THREE.Vector3; obj: THREE.Vector3 }, inmediato = false) => {
      if (inmediato || reducido || !controles.current) {
        camara.position.copy(destino.pos)
        controles.current?.target.copy(destino.obj)
        controles.current?.update()
        meta.current = null
      } else {
        meta.current = destino
      }
      invalidate()
    },
    [camara, invalidate, reducido],
  )

  useEffect(() => {
    const c = new OrbitControls(camara, gl.domElement)
    c.enableDamping = !reducido
    c.dampingFactor = 0.08
    c.screenSpacePanning = true
    c.minDistance = 4
    c.maxDistance = 90
    c.minPolarAngle = 0.15
    c.maxPolarAngle = Math.PI * 0.45
    // una vuelta por minuto, más o menos (con `update(delta)` el giro va por tiempo, no por fotogramas)
    c.autoRotateSpeed = 1
    const alCambiar = () => invalidate()
    const alEmpezar = () => {
      window.clearTimeout(espera.current)
      meta.current = null
      alInteractuarRef.current(true)
    }
    // al soltar, el giro automático vuelve tras unos segundos quieto
    const alAcabar = () => {
      window.clearTimeout(espera.current)
      espera.current = window.setTimeout(() => alInteractuarRef.current(false), 3500)
    }
    c.addEventListener('change', alCambiar)
    c.addEventListener('start', alEmpezar)
    c.addEventListener('end', alAcabar)
    controles.current = c
    return () => {
      window.clearTimeout(espera.current)
      c.removeEventListener('change', alCambiar)
      c.removeEventListener('start', alEmpezar)
      c.removeEventListener('end', alAcabar)
      c.dispose()
      controles.current = null
    }
  }, [camara, gl, invalidate, reducido])

  useEffect(() => {
    const c = controles.current
    if (!c) return
    c.autoRotate = autoGiro
    if (!autoGiro && c.enableDamping) {
      // al parar el giro, sin inercia: con pocos fotogramas por segundo la amortiguación tardaría segundos en apagarse
      c.enableDamping = false
      c.update()
      c.enableDamping = true
    }
    invalidate()
  }, [autoGiro, invalidate])

  // Encuadre de partida: al cargar, al cambiar de organización o de tamaño (sin vuelo).
  const clave = `${escena.plataformas.map((p) => p.id).join()}|${size.width}x${size.height}`
  useEffect(() => {
    irA(encuadreGeneral(camara, escena), true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de organización o de tamaño
  }, [clave])

  // Vista general: vuelve a la maqueta entera, pero solo al CAMBIAR de modo (al cargar ya está encuadrada).
  const modoAnterior = useRef(modo)
  useEffect(() => {
    if (modoAnterior.current === modo) return
    modoAnterior.current = modo
    if (modo === 'general') irA(encuadreGeneral(camara, escena))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de modo
  }, [modo])

  // Seguir el ataque: a cada paso nuevo, la cámara vuela a encuadrarlo.
  useEffect(() => {
    if (modo !== 'seguir') return
    const encuadre = encuadreDePaso(escena, pasoSeguido ?? { desde: 'atacante', hasta: 'atacante' })
    if (encuadre) irA({ pos: new THREE.Vector3(...encuadre.posicion), obj: new THREE.Vector3(...encuadre.objetivo) })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando hay un paso nuevo o se entra en el modo
  }, [modo, pasoSeguido?.clave])

  // Al elegir un activo en la vista general, se centra en él (sin acercarse más de la cuenta).
  useEffect(() => {
    if (!foco || modo !== 'general' || !controles.current) return
    const pieza = escena.piezas.find((p) => p.id === foco)
    if (!pieza) return
    const obj = new THREE.Vector3(pieza.base[0], pieza.base[1] + pieza.medidas[1] / 2, pieza.base[2])
    const desde = camara.position.clone().sub(controles.current.target)
    const distancia = Math.min(desde.length(), 18)
    irA({ obj, pos: obj.clone().add(desde.setLength(distancia)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al elegir otro activo
  }, [foco])

  useEffect(() => {
    if (!orden || !controles.current) return
    if (orden.tipo === 'encuadrar') {
      irA(encuadreGeneral(camara, escena))
      return
    }
    const objetivo = controles.current.target
    const pos = camara.position.clone().sub(objetivo).multiplyScalar(orden.tipo === 'acercar' ? 0.75 : 1.33).add(objetivo)
    irA({ pos, obj: objetivo.clone() })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando llega una orden nueva
  }, [orden])

  useFrame((_, delta) => {
    const c = controles.current
    if (!c) return
    if (meta.current) {
      const k = 1 - Math.exp(-Math.min(delta, 1 / 30) * 2.4)
      camara.position.lerp(meta.current.pos, k)
      c.target.lerp(meta.current.obj, k)
      // durante un vuelo, el giro automático espera: si no, los dos tiran de la cámara y el vuelo no acaba nunca
      const giro = c.autoRotate
      c.autoRotate = false
      c.update(delta)
      c.autoRotate = giro
      if (camara.position.distanceTo(meta.current.pos) < 0.03 && c.target.distanceTo(meta.current.obj) < 0.03) meta.current = null
      invalidate()
    } else if (c.update(delta)) {
      invalidate()
    }
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
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`
    }
  })
  return null
}

/**
 * Vigila el ritmo mientras la maqueta se mueve sola (giro o animación). Si la mediana de 20 fotogramas pasa de 50 ms
 * (gráficos integrados flojos, o sin GPU), pide el modo ligero: menos resolución, sin sombras y sin el mapa de reflejos
 * (sombrear el reflejo es lo más caro por píxel: quitarlo duplica los fotogramas sin GPU). Solo se mide con el
 * lienzo pintando seguido: en reposo los fotogramas son esporádicos y su separación no dice nada.
 */
function VigiaRendimiento({ activo, alLento }: { activo: boolean; alLento: () => void }) {
  const muestras = useRef<number[]>([])
  const avisado = useRef(false)
  useFrame((_, delta) => {
    if (!activo || avisado.current) return
    muestras.current.push(delta)
    if (muestras.current.length < 20) return
    const mediana = [...muestras.current].sort((a, b) => a - b)[10]
    muestras.current = []
    if (mediana > 0.05) {
      avisado.current = true
      alLento()
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

const MARCA_ESTADO: Partial<Record<EstadoPieza, { texto: string; icono: LucideIcon; clase: string }>> = {
  riesgo: { texto: 'En riesgo', icono: TriangleAlert, clase: 'bg-sev-media' },
  comprometido: { texto: 'Comprometido', icono: Bug, clase: 'bg-sev-critica' },
  aislado: { texto: 'Aislado', icono: Unplug, clase: 'bg-acento' },
  protegido: { texto: 'Protegido', icono: ShieldCheck, clase: 'bg-ok' },
}

const BOTON = 'flex size-8 items-center justify-center rounded-lg border border-borde bg-superficie text-texto-suave hover:text-texto aria-pressed:bg-acento-suave aria-pressed:text-acento'

interface Props {
  org: Organizacion
  ev: Evaluacion
  ruta: RutaProbable | null
  riesgo: Set<string>
  acciones: readonly AccionAplicada[]
  /** La simulación avanza: solo entonces se anima el último paso. */
  enMarcha: boolean
  alIniciar: () => void
  alPausar: () => void
  alVolverA2D: () => void
}

export default function Maqueta3D({ org, ev, ruta, riesgo, acciones, enMarcha, alIniciar, alPausar, alVolverA2D }: Props) {
  const { tema } = useTema()
  const reducido = useMovimientoReducido()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tema` no se usa dentro, pero marca cuándo releer los tokens
  const pal = useMemo(() => leerPaleta3D(), [tema])
  // La simulación da un `ev` nuevo cada 250 ms aunque no pase nada. La escena (y con ella la geometría de cada arco y
  // cada modelo) solo se rehace cuando cambia algo que se ve: qué pasos hay y cómo acabaron, estados, ruta y riesgo.
  const claveEscena = JSON.stringify([ev.pasos.map((p) => `${p.paso.id}:${p.ocurrido ? 1 : 0}`), [...ev.estado], ruta?.camino ?? null, [...riesgo].sort()])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `claveEscena` resume todo lo de `ev`, `ruta` y `riesgo` que se dibuja
  const escena = useMemo(() => construirEscena(org, ev, ruta, riesgo), [org, claveEscena])
  const [modo, setModo] = useState<ModoCamara>('general')
  const [girar, setGirar] = useState(true)
  const [tocando, setTocando] = useState(false)
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [fichaId, setFichaId] = useState<string | null>(null)
  const [bajoRaton, setBajoRaton] = useState<string | null>(null)
  const [ampliada, setAmpliada] = useState(false)
  const [orden, setOrden] = useState<OrdenCamara | null>(null)
  const [ligero, setLigero] = useState(false)
  const etiquetas = useRef(new Map<string, HTMLElement>())
  const activos = porId(org.activos)
  const ficha = fichaId ? activos.get(fichaId) : undefined
  const explicacion = seleccion ? explicarActivo(org, ev, ruta, riesgo, acciones, seleccion) : null

  const ultimoOcurrido = ev.ocurridos.at(-1)
  const ultimoVisto = ev.pasos.at(-1)
  const pasoSeguido = ultimoOcurrido ? { clave: ultimoOcurrido.id, desde: ultimoOcurrido.desde, hasta: ultimoOcurrido.hasta } : null
  const animando = enMarcha && !reducido && escena.arcos.some((a) => a.ultimo)
  const autoGiro = modo === 'general' && girar && !reducido && !seleccion && !tocando
  const ordenar = (tipo: OrdenCamara['tipo']) => setOrden((o) => ({ tipo, n: (o?.n ?? 0) + 1 }))

  const elegirModo = (m: ModoCamara) => {
    setModo(m)
    if (m === 'seguir') {
      setSeleccion(null)
      if (!enMarcha) alIniciar()
    }
  }

  // Al acabar el ataque siguiéndolo, la cámara se aleja a la vista general.
  const terminado = ev.terminado && !enMarcha
  useEffect(() => {
    if (modo !== 'seguir' || !terminado) return
    const id = window.setTimeout(() => setModo('general'), 2500)
    return () => window.clearTimeout(id)
  }, [modo, terminado])

  // Esc sale de la pantalla completa.
  useEffect(() => {
    if (!ampliada) return
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !fichaId) setAmpliada(false)
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [ampliada, fichaId])

  const anclas = useMemo(() => {
    const m = new Map<string, Vec3>()
    // la etiqueta de cada activo, delante de su pieza (hacia quien mira): así no tapa lo que hay detrás
    for (const p of escena.piezas) m.set(p.id, [p.base[0], p.base[1], p.base[2] + p.medidas[2] / 2 + 0.3])
    for (const z of escena.plataformas) m.set(`zona-${z.id}`, [z.centro[0], z.medidas[1] + 0.02, z.centro[2] + z.medidas[2] / 2])
    for (const a of escena.arcos.filter((x) => x.tipo === 'impedido')) m.set(`impedido-${a.id}`, puntoDelArco(a, 0.5))
    return m
  }, [escena])
  const registrar = (id: string) => (el: HTMLElement | null) => {
    if (el) etiquetas.current.set(id, el)
    else etiquetas.current.delete(id)
  }
  const elegir = (id: string) => setSeleccion((actual) => (actual === id ? null : id))

  const alternativa = (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-texto">
      <p>No se ha podido iniciar la vista 3D en este navegador (WebGL).</p>
      <button type="button" onClick={alVolverA2D} className="font-medium text-acento hover:underline">
        Volver a la vista 2D
      </button>
    </div>
  )

  const vista = (
    <div
      role="region"
      aria-label={`Maqueta 3D de ${org.nombre}`}
      className={cn('overflow-hidden border border-borde bg-lienzo', ampliada ? 'fixed inset-0 z-50' : 'relative h-full w-full rounded-lg')}
    >
      <SinWebGL alternativa={alternativa}>
        <div role="img" aria-label={resumenEscena(org, escena)} className="absolute inset-0" style={{ cursor: bajoRaton ? 'pointer' : 'grab' }}>
          <Canvas
            frameloop={animando || autoGiro ? 'always' : 'demand'}
            shadows={ligero ? false : 'soft'}
            dpr={ligero ? 0.75 : [1, 1.5]}
            camera={{ fov: 32, near: 0.1, far: 400, position: [0, 30, 30] }}
            gl={{ antialias: true }}
            fallback={alternativa}
            onPointerMissed={() => setBajoRaton(null)}
          >
            <color attach="background" args={[pal['maqueta-base']]} />
            <fog attach="fog" args={[pal['maqueta-base'], 55, 140]} />
            {!ligero && <Entorno intensidad={tema === 'oscuro' ? 0.35 : 0.55} />}
            <hemisphereLight args={[pal.superficie, pal['maqueta-base'], (tema === 'oscuro' ? 0.55 : 0.7) + (ligero ? 0.45 : 0)]} />
            <directionalLight
              position={[-14, 26, 18]}
              intensity={tema === 'oscuro' ? 1.9 : 2.3}
              castShadow
              shadow-mapSize={[1536, 1536]}
              shadow-camera-left={-26}
              shadow-camera-right={26}
              shadow-camera-top={20}
              shadow-camera-bottom={-20}
              shadow-camera-near={1}
              shadow-camera-far={90}
              shadow-bias={-0.0004}
              shadow-normalBias={0.03}
            />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
              <planeGeometry args={[400, 400]} />
              <meshStandardMaterial color={pal['maqueta-base']} roughness={1} />
            </mesh>
            {escena.plataformas.map((p) => (
              <Sala key={p.id} p={p} pal={pal} />
            ))}
            {escena.piezas.map((p) => (
              <group
                key={p.id}
                onClick={(e) => {
                  e.stopPropagation()
                  elegir(p.id)
                }}
                onPointerOver={(e) => {
                  e.stopPropagation()
                  setBajoRaton(p.id)
                }}
                onPointerOut={() => setBajoRaton(null)}
              >
                <ModeloActivo pieza={p} pal={pal} seleccionada={seleccion === p.id || bajoRaton === p.id} />
              </group>
            ))}
            <Arcos escena={escena} pal={pal} animando={animando} resaltado={seleccion} />
            <Camara escena={escena} modo={modo} autoGiro={autoGiro} reducido={reducido} pasoSeguido={pasoSeguido} foco={seleccion} orden={orden} alInteractuar={setTocando} />
            <Proyector anclas={anclas} elementos={etiquetas} />
            <VigiaRendimiento activo={animando || autoGiro} alLento={() => setLigero(true)} />
          </Canvas>
        </div>

        {/* Etiquetas: botones de verdad (teclado y lector de pantalla), colocados sobre el lienzo por el proyector. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {escena.plataformas.map((z) => (
            <span key={z.id} ref={registrar(`zona-${z.id}`)} className="absolute top-0 left-0 -translate-x-1/2 translate-y-1.5 text-[11px] font-semibold tracking-wide whitespace-nowrap text-texto-suave uppercase" style={{ visibility: 'hidden' }} aria-hidden>
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
                onClick={() => elegir(p.id)}
                onPointerEnter={() => setBajoRaton(p.id)}
                onPointerLeave={() => setBajoRaton(null)}
                data-activo={p.id}
                data-estado={p.estado}
                aria-pressed={seleccion === p.id}
                aria-label={`${p.nombre} · ${activos.get(p.id)?.area ?? ''} · ${p.estado === 'atacante' ? 'atacante' : p.estado}${p.joya ? ' · joya de la corona' : ''}`}
                className={cn(
                  'pointer-events-auto absolute top-0 left-0 flex -translate-x-1/2 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap shadow-sm',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
                  p.estado === 'atacante' ? 'border-atacante-borde bg-atacante-fondo text-atacante-texto' : 'border-borde bg-superficie text-texto',
                  (bajoRaton === p.id || seleccion === p.id) && 'ring-2 ring-acento',
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

        {/* Modo de cámara */}
        <div role="radiogroup" aria-label="Modo de cámara" className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 rounded-lg border border-borde bg-superficie p-0.5 shadow-sm">
          {([
            { modo: 'general', texto: 'Vista general', icono: IconoMapa },
            { modo: 'seguir', texto: 'Seguir el ataque', icono: Eye },
          ] as const).map((b) => (
            <button
              key={b.modo}
              type="button"
              role="radio"
              aria-checked={modo === b.modo}
              onClick={() => elegirModo(b.modo)}
              className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap', modo === b.modo ? 'bg-acento text-sobre-intenso' : 'text-texto-suave hover:text-texto')}
            >
              <b.icono className="size-3.5" aria-hidden />
              {b.texto}
            </button>
          ))}
        </div>

        {ligero && (
          <p className="absolute top-14 left-1/2 z-10 -translate-x-1/2 rounded-md border border-borde bg-superficie px-2 py-0.5 text-[11px] text-texto-suave">
            Modo ligero: este equipo va justo para la 3D; se bajó la resolución y se quitaron sombras y reflejos.
          </p>
        )}
        <div role="group" aria-label="Cámara de la maqueta" title="Arrastra para girar, con el botón derecho para desplazar y con la rueda para acercar" className="absolute top-3 right-3 z-10 flex gap-1">
          {modo === 'general' && !reducido && (
            <button type="button" onClick={() => setGirar((g) => !g)} aria-pressed={girar} title={girar ? 'Parar el giro' : 'Girar la vista'} className={BOTON}>
              <RotateCw className="size-4" aria-hidden />
              <span className="sr-only">Girar la vista</span>
            </button>
          )}
          {[
            { texto: 'Acercar', icono: Plus, accion: () => ordenar('acercar') },
            { texto: 'Alejar', icono: Minus, accion: () => ordenar('alejar') },
            { texto: 'Encuadrar la maqueta', icono: Maximize, accion: () => ordenar('encuadrar') },
          ].map((b) => (
            <button key={b.texto} type="button" onClick={b.accion} title={b.texto} className={BOTON}>
              <b.icono className="size-4" aria-hidden />
              <span className="sr-only">{b.texto}</span>
            </button>
          ))}
          <button type="button" onClick={() => setAmpliada((a) => !a)} aria-pressed={ampliada} title={ampliada ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'} className={BOTON}>
            {ampliada ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
            <span className="sr-only">{ampliada ? 'Salir de pantalla completa' : 'Pantalla completa'}</span>
          </button>
        </div>

        {/* Lo que está pasando: el último paso, con la reproducción a mano */}
        <div role="status" aria-live="polite" className="absolute bottom-3 left-3 z-10 flex max-w-[min(34rem,calc(100%-1.5rem))] items-start gap-2 rounded-lg border border-borde bg-superficie px-3 py-2 shadow-sm">
          <button type="button" onClick={enMarcha ? alPausar : alIniciar} title={enMarcha ? 'Pausar el ataque' : ev.empezado && !ev.terminado ? 'Reanudar el ataque' : 'Simular el ataque'} className={cn(BOTON, 'size-7 shrink-0')}>
            {enMarcha ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
            <span className="sr-only">{enMarcha ? 'Pausar el ataque' : 'Simular el ataque'}</span>
          </button>
          {ultimoVisto ? (
            <p className="min-w-0 text-xs leading-snug text-texto">
              <span className="font-semibold">
                Paso {ev.pasos.length} de {org.pasos.length} · <span className="font-mono tabular-nums">{ultimoVisto.paso.hora}</span> · {NOMBRE_TACTICA[ultimoVisto.paso.tactica] ?? ultimoVisto.paso.tactica}
              </span>
              <br />
              {ultimoVisto.ocurrido ? ultimoVisto.paso.titulo : `Impedido: ${ultimoVisto.paso.titulo} (${ultimoVisto.motivo})`}
            </p>
          ) : (
            <p className="text-xs text-texto-suave">En calma. «Seguir el ataque» lo lanza y la cámara acompaña cada paso; pincha un activo para ver por qué está así.</p>
          )}
        </div>

        <ul aria-label="Leyenda de la maqueta" className="absolute right-3 bottom-3 z-10 hidden flex-col gap-0.5 rounded-lg border border-borde bg-superficie px-2.5 py-1.5 text-[11px] text-texto-suave xl:flex">
          {[
            { texto: 'Paso del ataque', color: 'var(--sev-critica)', trazo: undefined, ancho: 3 },
            { texto: 'Paso impedido', color: 'var(--linea-bloqueada)', trazo: undefined, ancho: 2 },
            { texto: 'Ruta probable', color: 'var(--sev-media)', trazo: '1 4', ancho: 3 },
            { texto: 'Cable de red', color: 'var(--linea-red)', trazo: undefined, ancho: 1.5 },
          ].map((l) => (
            <li key={l.texto} className="flex items-center gap-1.5">
              <svg width="18" height="6" aria-hidden>
                <line x1="1" y1="3" x2="17" y2="3" stroke={l.color} strokeWidth={l.ancho} strokeDasharray={l.trazo} strokeLinecap="round" />
              </svg>
              {l.texto}
            </li>
          ))}
        </ul>

        {explicacion && (
          <PanelPorQue
            explicacion={explicacion}
            alCerrar={() => setSeleccion(null)}
            alVerFicha={() => setFichaId(explicacion.activo.id)}
            className="absolute top-14 right-3 z-20 max-h-[calc(100%-7.5rem)] w-[22rem] max-w-[calc(100%-1.5rem)]"
          />
        )}
      </SinWebGL>

      {ficha && <FichaActivo org={org} ev={ev} activo={ficha} alCerrar={() => setFichaId(null)} />}
    </div>
  )
  // A pantalla completa va directa al <body>: un `transform` en un contenedor (la animación de entrada de la página)
  // convertiría el `position: fixed` en relativo a ese contenedor y no taparía la barra lateral.
  return ampliada ? createPortal(vista, document.body) : vista
}
