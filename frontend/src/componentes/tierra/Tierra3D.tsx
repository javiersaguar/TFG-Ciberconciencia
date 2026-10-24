/**
 * La Tierra para los globos 3D del portal (conciencia situacional y mapa mundial de alertas), en el estilo de la maqueta
 * 3D: mares y tierras pintados con los tokens del tema en una textura, costas y fronteras en línea fina, una retícula
 * cada 15° y un halo tenue de atmósfera. Mapamundi de Natural Earth 1:110m (`npm run generar-mapamundi`).
 */
import { geoEquirectangular, geoPath } from 'd3-geo'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

import { reticula, segmentosEnEsfera } from './esfera'
import mapa from './mapamundi.json'
import type { PaletaGlobo } from './paleta'

const datos = mapa as { tierras: number[][][]; fronteras: number[][] }

/** Lista plana [lon, lat, …] como anillo de GeoJSON. */
const anillo = (plano: readonly number[]) => Array.from({ length: plano.length / 2 }, (_, i) => [plano[i * 2], plano[i * 2 + 1]])

/** La textura del globo: mares y tierras pintados en un lienzo equirectangular con los colores del tema. */
function texturaTierra(pal: PaletaGlobo): THREE.CanvasTexture {
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

/** La Tierra: esfera con mares y tierras, retícula, fronteras, costas y un halo de atmósfera. Radio 1. */
export function Tierra3D({ pal }: { pal: PaletaGlobo }) {
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
