/**
 * Modelos 3D de los activos de la maqueta, construidos con piezas simples (cajas, cilindros, toros) para no depender de
 * ficheros de modelos. Cada tipo se reconoce por su silueta, no por su color:
 *
 *   estacion   puesto de trabajo: mesa, monitor encendido, teclado, torre y silla
 *   servidor   armario rack con sus bandejas y LED
 *   dc         dos racks y una llave encima (el controlador de dominio guarda las llaves del dominio)
 *   datos      base de datos: discos apilados con anillos de luz
 *   backup     librería de cintas: armario con ventana y cartuchos
 *   web        rack bajo con un globo de malla
 *   vpn        cortafuegos sobre peana, con candado
 *   correo     pasarela sobre peana, con un sobre
 *   ot         armario industrial con baliza (PLC), rack industrial (SCADA) o consola de control (HMI)
 *   atacante   cristal oscuro flotando sobre un anillo rojo
 *
 * El ESTADO se ve en los LED, las pantallas y la baliza, y en un indicador alrededor de la pieza: halo rojo
 * (comprometido), anillo discontinuo ámbar (en riesgo), jaula azul (aislado) y cúpula verde (protegido). Todos los
 * colores llegan de la paleta del tema (`paleta3d.ts`).
 *
 * RENDIMIENTO: cada modelo es una lista de piezas (una «receta», función pura) y las piezas que comparten material se
 * FUSIONAN en una sola malla (`Fusion`). Un rack pasa de unas 40 mallas a 5; la maqueta entera, de cientos de llamadas
 * de dibujo a unas pocas decenas. Sin esto, con gráficos integrados o sin GPU, la maqueta iba a pocos fotogramas.
 *
 * Coordenadas: cada modelo tiene la base en y = 0 y está centrado en x y z; mira hacia +z, donde está la cámara.
 */
import { memo, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import type { Pieza, Vec3 } from './maqueta'
import { colorEstado, colorPantalla, type Paleta3D } from './paleta3d'

// --- Piezas y fusión --------------------------------------------------------------------------------------------

interface Material {
  c: string
  /** Rugosidad y metalicidad (PBR). */
  r?: number
  m?: number
  /** Brillo propio (LED, pantallas). */
  e?: string
  ei?: number
  /** Opacidad (cristal, haces). */
  o?: number
}

type Forma =
  | { g: 'caja'; t: Vec3 }
  | { g: 'cilindro'; radio: number; h: number; seg?: number }
  | { g: 'toro'; radio: number; tubo: number; arco?: number }
  | { g: 'octaedro'; radio: number }

interface Parte {
  forma: Forma
  p: Vec3
  rot?: Vec3
  mat: Material
}

const caja = (t: Vec3, p: Vec3, mat: Material, rot?: Vec3): Parte => ({ forma: { g: 'caja', t }, p, rot, mat })
const cil = (radio: number, h: number, p: Vec3, mat: Material, rot?: Vec3, seg?: number): Parte => ({ forma: { g: 'cilindro', radio, h, seg }, p, rot, mat })
const toro = (radio: number, tubo: number, p: Vec3, mat: Material, rot?: Vec3, arco?: number): Parte => ({ forma: { g: 'toro', radio, tubo, arco }, p, rot, mat })

function geometriaDe(f: Forma): THREE.BufferGeometry {
  switch (f.g) {
    case 'caja':
      return new THREE.BoxGeometry(...f.t)
    case 'cilindro':
      return new THREE.CylinderGeometry(f.radio, f.radio, f.h, f.seg ?? 24)
    case 'toro':
      return new THREE.TorusGeometry(f.radio, f.tubo, 10, 28, f.arco ?? Math.PI * 2)
    case 'octaedro':
      return new THREE.OctahedronGeometry(f.radio)
  }
}

function Mat({ c, r = 0.6, m = 0.1, e, ei = 0, o }: Material) {
  return <meshStandardMaterial color={c} roughness={r} metalness={m} emissive={e ?? c} emissiveIntensity={e ? ei : 0} transparent={o != null} opacity={o ?? 1} depthWrite={o == null || o > 0.5} />
}

/** Fusiona las piezas por material: una malla (una llamada de dibujo) por material distinto. */
function Fusion({ partes }: { partes: Parte[] }) {
  const grupos = useMemo(() => {
    const porMaterial = new Map<string, { mat: Material; geometrias: THREE.BufferGeometry[] }>()
    const matriz = new THREE.Matrix4()
    const giro = new THREE.Quaternion()
    const unidad = new THREE.Vector3(1, 1, 1)
    for (const parte of partes) {
      const original = geometriaDe(parte.forma)
      const geometria = original.index ? original.toNonIndexed() : original
      if (geometria !== original) original.dispose()
      giro.setFromEuler(new THREE.Euler(...(parte.rot ?? [0, 0, 0])))
      geometria.applyMatrix4(matriz.compose(new THREE.Vector3(...parte.p), giro, unidad))
      const clave = JSON.stringify(parte.mat)
      const grupo = porMaterial.get(clave) ?? { mat: parte.mat, geometrias: [] }
      grupo.geometrias.push(geometria)
      porMaterial.set(clave, grupo)
    }
    return [...porMaterial.values()].map(({ mat, geometrias }) => {
      const fusionada = mergeGeometries(geometrias) ?? geometrias[0]
      geometrias.forEach((g) => g !== fusionada && g.dispose())
      // los LED, pantallas y cristales no proyectan sombra: ni se notaría ni compensa su coste
      return { mat, geometria: fusionada, sombra: !mat.e && mat.o == null }
    })
  }, [partes])
  useEffect(() => () => grupos.forEach((g) => g.geometria.dispose()), [grupos])
  return (
    <>
      {grupos.map((g, i) => (
        <mesh key={i} geometry={g.geometria} castShadow={g.sombra} receiveShadow>
          <Mat {...g.mat} />
        </mesh>
      ))}
    </>
  )
}

interface Tonos {
  pal: Paleta3D
  /** Color de LED y bandas de estado. */
  led: string
  /** Color de las pantallas. */
  pantalla: string
}

// --- Recetas ----------------------------------------------------------------------------------------------------

function puesto({ pal, led, pantalla }: Tonos): Parte[] {
  const metal = { c: pal['maqueta-metal'], m: 0.5, r: 0.4 }
  const claro = { c: pal['maqueta-metal-claro'], r: 0.55 }
  const tela = { c: pal['maqueta-metal'], r: 0.9 }
  return [
    caja([1.52, 0.05, 0.78], [0, 0.735, 0], { c: pal['maqueta-mueble'], r: 0.75 }),
    ...([[-0.7, -0.33], [0.7, -0.33], [-0.7, 0.33], [0.7, 0.33]] as const).map(([x, z]) => caja([0.05, 0.71, 0.05], [x, 0.355, z], metal)),
    // monitor
    caja([0.26, 0.015, 0.17], [0, 0.768, -0.2], metal),
    caja([0.045, 0.22, 0.04], [0, 0.875, -0.22], metal),
    caja([0.72, 0.44, 0.04], [0, 1.12, -0.21], metal),
    caja([0.67, 0.39, 0.006], [0, 1.12, -0.187], { c: pantalla, e: pantalla, ei: 1.1, r: 0.15 }),
    // teclado, ratón y torre con su LED
    caja([0.48, 0.02, 0.16], [0, 0.77, 0.08], claro),
    caja([0.06, 0.025, 0.1], [0.34, 0.77, 0.1], claro),
    caja([0.21, 0.46, 0.48], [0.56, 0.23, -0.1], metal),
    caja([0.13, 0.014, 0.006], [0.56, 0.4, 0.143], { c: led, e: led, ei: 2.2 }),
    // silla
    cil(0.26, 0.03, [0, 0.03, 0.62], metal, undefined, 5),
    cil(0.028, 0.38, [0, 0.23, 0.62], { c: pal['maqueta-metal-claro'], m: 0.7, r: 0.3 }),
    caja([0.46, 0.07, 0.44], [0, 0.45, 0.62], tela),
    caja([0.44, 0.5, 0.06], [0, 0.75, 0.85], tela, [-0.12, 0, 0]),
  ]
}

function rack({ pal, led }: Tonos, { alto = 2.05, unidades = 9, x = 0, banda }: { alto?: number; unidades?: number; x?: number; banda?: string } = {}): Parte[] {
  const ancho = 0.86
  const fondo = 0.92
  const paso = (alto - 0.42) / unidades
  const metal = { c: pal['maqueta-metal'], m: 0.55, r: 0.42 }
  const bandeja = { c: pal['maqueta-metal-claro'], m: 0.6, r: 0.32 }
  const rejilla = { c: pal['maqueta-metal'], r: 0.8 }
  const luz = { c: led, e: led, ei: 2.4 }
  const luzOk = { c: pal['maqueta-led'], e: pal['maqueta-led'], ei: 1.3 }
  const partes: Parte[] = [
    caja([ancho + 0.04, 0.08, fondo + 0.04], [x, 0.04, 0], { c: pal['maqueta-metal'], m: 0.4, r: 0.5 }),
    caja([ancho, alto - 0.08, fondo], [x, alto / 2 + 0.04, 0], metal),
    caja([ancho - 0.1, 0.035, 0.01], [x, alto - 0.1, fondo / 2 + 0.01], { c: banda ?? led, e: banda ?? led, ei: 1.8 }),
  ]
  for (let i = 0; i < unidades; i++) {
    const y = 0.24 + i * paso + paso / 2
    const h = paso - 0.045
    partes.push(
      caja([ancho - 0.1, h, 0.02], [x, y, fondo / 2 + 0.006], bandeja),
      caja([0.42, h * 0.38, 0.008], [x - 0.12, y, fondo / 2 + 0.02], rejilla),
      caja([0.035, 0.035, 0.01], [x + ancho / 2 - 0.12, y, fondo / 2 + 0.022], luz),
      caja([0.035, 0.035, 0.01], [x + ancho / 2 - 0.19, y, fondo / 2 + 0.022], i % 3 === 1 ? luz : luzOk),
    )
  }
  return partes
}

function controlador(tonos: Tonos): Parte[] {
  const oro = { c: tonos.pal['fam-ambar-linea'], m: 0.85, r: 0.25 }
  return [
    ...rack(tonos, { x: -0.48, alto: 2.15 }),
    ...rack(tonos, { x: 0.48, alto: 2.15 }),
    // la llave del dominio
    toro(0.13, 0.04, [0, 2.5, 0.1], oro),
    caja([0.34, 0.06, 0.06], [0.3, 2.5, 0.1], oro),
    caja([0.05, 0.1, 0.06], [0.36, 2.44, 0.1], oro),
    caja([0.05, 0.07, 0.06], [0.44, 2.45, 0.1], oro),
  ]
}

function baseDeDatos({ pal, led }: Tonos): Parte[] {
  const disco = { c: pal['maqueta-metal-claro'], m: 0.55, r: 0.28 }
  const luz = { c: led, e: led, ei: 1.6 }
  return [
    cil(0.62, 0.08, [0, 0.04, 0], { c: pal['maqueta-metal'], m: 0.4, r: 0.5 }, undefined, 36),
    ...[0, 1, 2].flatMap((i) => {
      const y = 0.1 + i * 0.44
      return [cil(0.54, 0.36, [0, y + 0.18, 0], disco, undefined, 36), cil(0.556, 0.04, [0, y + 0.4, 0], luz, undefined, 36)]
    }),
    cil(0.5, 0.06, [0, 1.45, 0], { c: pal['maqueta-pieza'], m: 0.3, r: 0.35 }, undefined, 36),
  ]
}

function cintas({ pal, led }: Tonos): Parte[] {
  const azul = { c: pal['maqueta-pantalla'], r: 0.5 }
  const gris = { c: pal['maqueta-metal-claro'], r: 0.5 }
  const brazo = { c: pal['maqueta-metal-claro'], m: 0.7, r: 0.3 }
  const partes: Parte[] = [caja([1.86, 1.32, 0.9], [0, 0.66, 0], { c: pal['maqueta-metal'], m: 0.5, r: 0.45 })]
  for (let fila = 0; fila < 3; fila++) {
    for (let col = 0; col < 10; col++) partes.push(caja([0.12, 0.2, 0.06], [-0.72 + col * 0.16, 0.48 + fila * 0.26, 0.42], (col + fila) % 3 === 0 ? azul : gris))
  }
  partes.push(
    caja([1.66, 0.03, 0.04], [0, 1.18, 0.43], brazo),
    caja([0.08, 0.12, 0.06], [0.3, 1.11, 0.44], brazo),
    caja([1.66, 0.9, 0.012], [0, 0.8, 0.456], { c: pal['maqueta-cristal'], o: 0.22, r: 0.05, m: 0.2 }),
    caja([1.4, 0.03, 0.01], [0, 0.2, 0.456], { c: led, e: led, ei: 1.8 }),
  )
  return partes
}

/** Peana con un equipo de red de 1U encima (cortafuegos, pasarela). */
function equipoEnPeana({ pal, led }: Tonos): Parte[] {
  const puerto = { c: pal['maqueta-metal'] }
  const luz = { c: led, e: led, ei: 2.2 }
  return [
    caja([0.6, 0.62, 0.52], [0, 0.31, 0], { c: pal['maqueta-metal'], m: 0.4, r: 0.5 }),
    caja([1.2, 0.13, 0.64], [0, 0.685, 0], { c: pal['maqueta-metal-claro'], m: 0.65, r: 0.3 }),
    ...Array.from({ length: 8 }, (_, i) => caja([0.06, 0.045, 0.01], [-0.48 + i * 0.09, 0.685, 0.325], puerto)),
    ...Array.from({ length: 4 }, (_, i) => caja([0.025, 0.025, 0.01], [0.28 + i * 0.07, 0.685, 0.326], luz)),
  ]
}

function vpn(tonos: Tonos): Parte[] {
  return [
    ...equipoEnPeana(tonos),
    // candado
    caja([0.26, 0.22, 0.08], [0, 1.02, 0.05], { c: tonos.led, e: tonos.led, ei: 0.35, m: 0.6, r: 0.3 }),
    toro(0.085, 0.022, [0, 1.13, 0.05], { c: tonos.pal['maqueta-metal-claro'], m: 0.85, r: 0.25 }, undefined, Math.PI),
  ]
}

function correo(tonos: Tonos): Parte[] {
  const { pal } = tonos
  const solapa = { c: pal['maqueta-metal-claro'] }
  return [
    ...equipoEnPeana(tonos),
    // sobre
    caja([0.46, 0.3, 0.025], [0, 1.02, 0.05], { c: pal['maqueta-pieza'], r: 0.7 }),
    caja([0.27, 0.018, 0.01], [-0.11, 1.09, 0.066], solapa, [0, 0, -0.58]),
    caja([0.27, 0.018, 0.01], [0.11, 1.09, 0.066], solapa, [0, 0, 0.58]),
    caja([0.08, 0.08, 0.01], [0, 1.12, 0.068], { c: tonos.led, e: tonos.led, ei: 1.4 }, [0, 0, Math.PI / 4]),
  ]
}

/** Baliza industrial de tres luces: se enciende la del estado (verde, ámbar o roja). */
function baliza(pal: Paleta3D, encendida: 'verde' | 'ambar' | 'roja', [x, y, z]: Vec3): Parte[] {
  const luces = [
    { clave: 'verde', color: pal.ok, dy: 0 },
    { clave: 'ambar', color: pal['sev-media'], dy: 0.11 },
    { clave: 'roja', color: pal['sev-critica'], dy: 0.22 },
  ] as const
  return [
    cil(0.025, 0.16, [x, y - 0.12, z], { c: pal['maqueta-metal'] }),
    ...luces.map((l) => cil(0.068, 0.1, [x, y + l.dy, z], l.clave === encendida ? { c: l.color, e: l.color, ei: 2.4 } : { c: l.color, e: l.color, ei: 0.08, o: 0.55 }, undefined, 18)),
  ]
}

function industrial(tonos: Tonos, pieza: Pieza): Parte[] {
  const { pal, led, pantalla } = tonos
  const encendida = pieza.estado === 'comprometido' ? 'roja' : pieza.estado === 'riesgo' || pieza.estado === 'aislado' ? 'ambar' : 'verde'
  const amarillo = { c: pal['maqueta-industrial'], r: 0.55, m: 0.25 }
  const oscuro = { c: pal['maqueta-metal'], r: 0.5, m: 0.4 }
  const luz = { c: pantalla, e: pantalla, ei: 1 }
  // PLC (joya): armario de control; SCADA (crítico): rack industrial; HMI: consola de operador.
  if (pieza.joya) {
    return [
      caja([1.02, 1.56, 0.7], [0, 0.78, 0], amarillo),
      caja([0.012, 1.4, 0.006], [0.05, 0.8, 0.352], oscuro),
      caja([0.34, 0.22, 0.008], [-0.22, 1.18, 0.354], luz),
      caja([0.03, 0.18, 0.04], [0.16, 0.85, 0.37], oscuro),
      caja([1.02, 0.09, 0.008], [0, 0.1, 0.354], oscuro),
      cil(0.05, 1.45, [0.58, 0.72, -0.15], { c: pal['maqueta-metal-claro'], m: 0.7, r: 0.3 }, undefined, 14),
      ...baliza(pal, encendida, [-0.38, 1.82, 0.12]),
    ]
  }
  if (pieza.criticidad >= 5) return [...rack(tonos, { banda: pal['maqueta-industrial'] }), ...baliza(pal, encendida, [0.3, 2.22, 0.2])]
  const boton = { c: pal['maqueta-metal-claro'] }
  return [
    caja([1.12, 0.74, 0.62], [0, 0.37, 0], amarillo),
    caja([1.12, 0.05, 0.5], [0, 0.82, 0.02], oscuro, [0.42, 0, 0]),
    caja([0.44, 0.3, 0.025], [-0.27, 1.1, -0.18], oscuro, [-0.2, 0, 0]),
    caja([0.4, 0.26, 0.006], [-0.27, 1.1, -0.165], luz, [-0.2, 0, 0]),
    caja([0.44, 0.3, 0.025], [0.27, 1.1, -0.18], oscuro, [-0.2, 0, 0]),
    caja([0.4, 0.26, 0.006], [0.27, 1.1, -0.165], luz, [-0.2, 0, 0]),
    ...Array.from({ length: 5 }, (_, i) => cil(0.03, 0.02, [-0.3 + i * 0.15, 0.86, 0.12], i === 2 ? { c: led, e: led, ei: 1.8 } : boton, [0.42, 0, 0], 12)),
    ...baliza(pal, encendida, [0.5, 1.4, -0.22]),
  ]
}

function atacante({ pal }: Tonos): Parte[] {
  const rojo = pal['sev-critica']
  return [
    { forma: { g: 'octaedro', radio: 0.5 }, p: [0, 0.62, 0], mat: { c: pal['atacante-fondo'], m: 0.35, r: 0.22 } },
    toro(0.6, 0.03, [0, 0.02, 0], { c: rojo, e: rojo, ei: 1.6 }, [Math.PI / 2, 0, 0]),
    // haz hasta el suelo: viene de fuera
    cil(0.035, 0.9, [0, -0.45, 0], { c: rojo, e: rojo, ei: 1, o: 0.35 }, undefined, 10),
  ]
}

function receta(pieza: Pieza, tonos: Tonos): Parte[] {
  switch (pieza.tipo) {
    case 'estacion':
      return puesto(tonos)
    case 'servidor':
      return rack(tonos)
    case 'dc':
      return controlador(tonos)
    case 'datos':
      return baseDeDatos(tonos)
    case 'backup':
      return cintas(tonos)
    case 'web':
      return rack(tonos, { alto: 1.35, unidades: 5 })
    case 'vpn':
      return vpn(tonos)
    case 'correo':
      return correo(tonos)
    case 'ot':
      return industrial(tonos, pieza)
    case 'atacante':
      return atacante(tonos)
  }
}

// --- Detalles que no se fusionan --------------------------------------------------------------------------------

function Bordes({ geometria, color }: { geometria: THREE.BufferGeometry; color: string }) {
  const bordes = useMemo(() => new THREE.EdgesGeometry(geometria, 20), [geometria])
  useEffect(() => () => bordes.dispose(), [bordes])
  return (
    <lineSegments geometry={bordes}>
      <lineBasicMaterial color={color} transparent opacity={0.9} />
    </lineSegments>
  )
}

/** El globo de malla del servidor web. */
function Globo({ color }: { color: string }) {
  return (
    <group position={[0, 1.75, 0]}>
      <mesh>
        <sphereGeometry args={[0.34, 18, 12]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.9} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.31, 20, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} transparent opacity={0.25} depthWrite={false} />
      </mesh>
    </group>
  )
}

/** Las aristas rojas del cristal del atacante. */
function AristasAtacante({ color }: { color: string }) {
  const cristal = useMemo(() => new THREE.OctahedronGeometry(0.5), [])
  useEffect(() => () => cristal.dispose(), [cristal])
  return (
    <group position={[0, 0.62, 0]}>
      <Bordes geometria={cristal} color={color} />
    </group>
  )
}

// --- Indicadores de estado alrededor de la pieza ----------------------------------------------------------------

function Anillo({ r0, r1, color, intensidad = 1.4, y = 0.015, opacidad }: { r0: number; r1: number; color: string; intensidad?: number; y?: number; opacidad?: number }) {
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[r0, r1, 64]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensidad} side={THREE.DoubleSide} transparent={opacidad != null} opacity={opacidad ?? 1} depthWrite={opacidad == null} />
    </mesh>
  )
}

function Indicadores({ pieza, pal, seleccionada }: { pieza: Pieza; pal: Paleta3D; seleccionada: boolean }) {
  const [ancho, alto, fondo] = pieza.medidas
  const radio = Math.max(ancho, fondo) / 2 + 0.3
  const jaula = useMemo(() => new THREE.BoxGeometry(ancho + 0.3, alto + 0.25, fondo + 0.3), [ancho, alto, fondo])
  useEffect(() => () => jaula.dispose(), [jaula])
  // el anillo discontinuo de «en riesgo», en una sola malla
  const trazos = useMemo<Parte[]>(() => {
    const ambar = { c: pal['sev-media'], e: pal['sev-media'], ei: 1.5 }
    return Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2
      return caja([0.06, 0.02, radio * 0.22], [Math.cos(a) * (radio + 0.05), 0.02, Math.sin(a) * (radio + 0.05)], ambar, [0, -a, 0])
    })
  }, [pal, radio])
  const rojo = pal['sev-critica']
  return (
    <group>
      {(pieza.estado === 'comprometido' || pieza.golpeado) && (
        <>
          <Anillo r0={radio} r1={radio + 0.1} color={rojo} intensidad={1.8} />
          <Anillo r0={0} r1={radio} color={rojo} intensidad={0.6} opacidad={0.16} y={0.01} />
        </>
      )}
      {pieza.estado === 'riesgo' && <Fusion partes={trazos} />}
      {pieza.estado === 'aislado' && (
        <group position={[0, (alto + 0.25) / 2, 0]}>
          <mesh geometry={jaula}>
            <meshStandardMaterial color={pal.acento} transparent opacity={0.1} depthWrite={false} />
          </mesh>
          <Bordes geometria={jaula} color={pal.acento} />
        </group>
      )}
      {pieza.estado === 'protegido' && (
        <mesh>
          <sphereGeometry args={[radio + 0.15, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={pal.ok} emissive={pal.ok} emissiveIntensity={0.25} transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {pieza.objetivo && <Anillo r0={radio + 0.22} r1={radio + 0.3} color={pal['sev-media']} intensidad={1.6} y={0.02} />}
      {seleccionada && <Anillo r0={radio + 0.42} r1={radio + 0.5} color={pal.acento} intensidad={1.2} y={0.025} />}
      {pieza.joya && (
        <mesh position={[0, alto + 0.42, 0]} castShadow>
          <octahedronGeometry args={[0.16]} />
          <meshStandardMaterial color={pal['fam-ambar-linea']} emissive={pal['fam-ambar-linea']} emissiveIntensity={0.35} metalness={0.6} roughness={0.25} />
        </mesh>
      )}
    </group>
  )
}

function ModeloActivoBase({ pieza, pal, seleccionada }: { pieza: Pieza; pal: Paleta3D; seleccionada: boolean }) {
  const tonos = useMemo<Tonos>(() => ({ pal, led: colorEstado(pieza.estado, pal), pantalla: colorPantalla(pieza.estado, pal) }), [pal, pieza.estado])
  const partes = useMemo(() => receta(pieza, tonos), [pieza, tonos])
  return (
    <group position={pieza.base}>
      <Fusion partes={partes} />
      {pieza.tipo === 'web' && <Globo color={tonos.pantalla} />}
      {pieza.tipo === 'atacante' && <AristasAtacante color={pal['sev-critica']} />}
      {pieza.tipo !== 'atacante' && <Indicadores pieza={pieza} pal={pal} seleccionada={seleccionada} />}
    </group>
  )
}

/** El modelo de una pieza, colocado en su base, con sus indicadores de estado. Solo se repinta si cambia la pieza. */
export const ModeloActivo = memo(ModeloActivoBase)
