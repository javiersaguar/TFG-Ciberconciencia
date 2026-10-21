/** Preguntas sugeridas por el Copiloto según la página y lo elegido: el analista ve lo que sabe responder ahí. */
import type { OrgCopiloto } from './estado'

export function sugerenciasPara(pathname: string, org: OrgCopiloto, seleccion?: { tipo: string }): string[] {
  if (org === 'helios') return ['¿Qué está pasando?', '¿Qué debería vigilar?', '¿Hubo movimiento lateral?', '¿Cómo lo mitigo?']
  if (seleccion?.tipo === 'incidente' || pathname.startsWith('/incidentes')) return ['Explícame esta campaña', '¿Qué incidentes hay?', '¿Qué debería vigilar?']
  if (pathname.startsWith('/cronologia')) return ['¿Qué pasó en NASHUA entre 03:09 y 03:18?', '¿Qué hosts tienen más actividad?', '¿Qué debería vigilar?']
  if (pathname.startsWith('/ataque')) return ['¿Hubo movimiento lateral?', '¿Qué pasó en NASHUA?', '¿Qué debería vigilar?']
  return ['¿Qué pasó en NASHUA?', '¿Hubo movimiento lateral?', 'T1003.001', '¿Qué debería vigilar?', '¿Cómo lo mitigo?']
}
