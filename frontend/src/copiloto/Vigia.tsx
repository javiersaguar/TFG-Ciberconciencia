/**
 * Vigía de señales débiles: evalúa los detectores en segundo plano y deja en el estado del Copiloto cuántos avisos
 * activos tiene cada organización, para el contador discreto del botón. No pinta nada. Se carga en diferido y solo
 * donde la evidencia ya está (o con una simulación de la demo en marcha): la portada no lo descarga.
 */
import { useEffect } from 'react'

import { useCopiloto, type OrgCopiloto } from './estado'
import { useSenalesDebiles } from './useSenalesDebiles'

function VigiaOrg({ org }: { org: OrgCopiloto }) {
  const { senales } = useSenalesDebiles(org)
  const { fijarAvisos } = useCopiloto()
  useEffect(() => {
    fijarAvisos(org, senales.length)
  }, [org, senales.length, fijarAvisos])
  return null
}

export default function VigiaCopiloto({ dmevals, demo }: { dmevals: boolean; demo: boolean }) {
  return (
    <>
      {dmevals && <VigiaOrg org="dmevals" />}
      {demo && <VigiaOrg org="helios" />}
    </>
  )
}
