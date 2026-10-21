/**
 * Evaluación desde `datos/ml1-resultados.json` (copia de `ml/anomaly/resultados.json`) y las cifras documentadas de
 * `corpus.ts`. Ninguna métrica no medida tiene valor aquí: las pendientes solo describen cómo se medirán.
 */
import { formatearEntero } from '@/componentes/datos/formato'

import type { Evaluacion, ResultadoMl1 } from '../evaluacion'
import ML1 from '../datos/ml1-resultados.json'
import { CORPUS, REF } from './corpus'

const PAPEL: Record<string, ResultadoMl1['papel']> = { A: 'principal', B: 'contaminado', C: 'principal', D: 'contaminado', E: 'control', F: 'ablacion', G: 'contaminado' }

interface FicheroMl1 {
  minutes: number
  resultados: { estrategia: string; auc_roc: number; auc_pr: number; positivos: number; muestras: number; n_entrenamiento: number; n_features: number }[]
}

export function construirEvaluacion(fichero: FicheroMl1 = ML1): Evaluacion {
  const resultados = fichero.resultados.map((r) => {
    const clave = r.estrategia.split(':')[0].trim()
    return {
      clave,
      estrategia: r.estrategia,
      papel: PAPEL[clave] ?? 'ablacion',
      aucRoc: r.auc_roc,
      aucPr: r.auc_pr,
      positivos: r.positivos,
      muestras: r.muestras,
      nEntrenamiento: r.n_entrenamiento,
      nFeatures: r.n_features,
    }
  })
  return {
    ml1: { minutosVentana: fichero.minutes, resultados, fuente: REF.ml1 },
    medidas: [
      { clave: 'p1-variantes', titulo: 'Variantes LSASS detectadas por P1', valor: '7 de 7', detalle: 'Las siete campañas de volcado de credenciales, con el oráculo en batch y con Flink.', fuente: REF.p1Revalidado },
      { clave: 'linea-base', titulo: 'Línea base de agrupación (F2)', valor: '741 → 87 (88,3 %)', detalle: 'Agrupación ingenua de las alertas de APT29 day1 por regla + host + 10 minutos.', fuente: REF.lineaBase },
      {
        clave: 'reduccion-p1',
        titulo: 'Reducción dentro del alcance de P1',
        valor: CORPUS.ratioReduccion.toLocaleString('es-ES', { minimumFractionDigits: 3 }),
        detalle: `${formatearEntero(CORPUS.alertasAbsorbidas)} alertas absorbidas en ${CORPUS.campanasP1} campañas P1 (contadas una vez aunque estén en dos).`,
        fuente: REF.p1Revalidado,
        advertencia: 'No es comparable con la línea base: aquella agrupa todas las alertas de APT29 day1; esta solo lo que P1 absorbe alrededor de sus anclas.',
      },
      { clave: 'cobertura', titulo: 'Técnicas observadas · capa de F2 (28-07)', valor: '34 de 300 (11,3 %)', detalle: 'Técnicas con alertas en APT29 day1 y el atómico frente a las que cubren las reglas Sigma (capas Navigator de F2).', fuente: REF.cobertura },
      { clave: 'cobertura-hoy', titulo: 'Técnicas observadas · corpus actual (21-10)', valor: '47 de 300 (15,7 %)', detalle: 'Las mismas 300 potenciales, con las alertas del corpus actual (incluye las campañas LSASS). Las 34 de F2 están dentro de estas 47.', fuente: REF.tecnicasActuales },
      { clave: 'rendimiento', titulo: 'Rendimiento de la detección', valor: '≈ 630 eventos/s', detalle: 'Seis instancias del detector Sigma en paralelo, unas seis veces una sola.', fuente: REF.alertas741 },
      {
        clave: 'etiquetas',
        titulo: 'Alertas sin etiqueta ATT&CK',
        valor: '27,1 %',
        detalle: '316 de 1.168 alertas del corpus de entonces, de solo 4 reglas (292 de una). Son invisibles para P1 y P2, que correlacionan por técnica.',
        fuente: REF.etiquetas,
      },
      { clave: 'laboratorio', titulo: 'Dataset propio del laboratorio', valor: '14.895 eventos', detalle: '14.765 benignos y 130 maliciosos de 4 técnicas (T1547.001 = 86, T1003.001 = 26, T1055 = 10, T1070 = 8).', fuente: REF.laboratorio },
    ],
    pendientes: [
      { metrica: 'Precisión y exhaustividad (precision / recall)', fase: 'F7', como: 'Por campaña, contra las campañas etiquetadas (las 7 LSASS, APT29 day1 y el laboratorio), con las líneas base B1–B5.' },
      { metrica: 'F1', fase: 'F7', como: 'Media armónica de las dos anteriores, con el mismo protocolo.' },
      { metrica: 'Falsos positivos', fase: 'F3.4 · F7', como: 'Campañas formadas sobre tráfico benigno: los 14.765 eventos benignos del laboratorio y capturas sin ataque.' },
      { metrica: 'Latencia de detección', fase: 'F3.4 · F7', como: 'Del evento en raw.* a la campaña en det.campaigns, por percentiles (p50 / p95), en streaming.' },
    ],
  }
}
