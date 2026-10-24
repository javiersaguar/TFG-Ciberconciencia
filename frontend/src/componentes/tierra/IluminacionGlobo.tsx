/**
 * La iluminación de los globos 3D del portal (mapa mundial de alertas y «Mundo» de conciencia situacional): el globo
 * se ve igual de iluminado en todas partes y en los dos temas.
 *
 * - Una luz ambiental uniforme, blanca: los mares y las tierras se ven con su color del tema en cualquier punto.
 *   (Antes, una luz de cielo y suelo dejaba el hemisferio sur en penumbra, casi negro en el tema oscuro.)
 * - Una luz principal casi de frente que ACOMPAÑA A LA CÁMARA: la cara que se ve está siempre iluminada igual mientras
 *   el globo gira o se mueve, con el borde apenas más oscuro para que se lea como esfera.
 */
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type * as THREE from 'three'

/** Dónde va la luz principal respecto a la cámara: un poco arriba a la izquierda, por detrás de quien mira. */
const DESDE_LA_CAMARA: [number, number, number] = [-1.2, 1.6, 5]

export function IluminacionGlobo({ oscuro }: { oscuro: boolean }) {
  const luz = useRef<THREE.DirectionalLight>(null)
  useFrame(({ camera }) => {
    luz.current?.position.set(...DESDE_LA_CAMARA).applyQuaternion(camera.quaternion)
  })
  return (
    <>
      <ambientLight intensity={oscuro ? 1.35 : 1.15} />
      <directionalLight ref={luz} position={DESDE_LA_CAMARA} intensity={oscuro ? 1.25 : 1.35} />
    </>
  )
}
