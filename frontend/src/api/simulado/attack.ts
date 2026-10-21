/**
 * Construye la cobertura ATT&CK desde las capas Navigator de F2 (copiadas en `src/api/datos/`), las técnicas
 * observadas en el corpus actual (21-10-2026) y el catálogo ATT&CK v19. Función pura: `attack.test.ts` comprueba las
 * cifras documentadas (300 potenciales; 34 observadas en F2; 47 hoy) y la agrupación por táctica.
 */
import type { CapaNavigator, CeldaTecnica, ColumnaTactica, CoberturaAttack, FamiliaTecnica, TacticaObservada } from '../attack'
import OBSERVADA_F2 from '../datos/cobertura-observada.json'
import POTENCIAL from '../datos/cobertura-potencial.json'
import type { CatalogoAttack, TecnicaObservada } from '../exportaciones'
import { CRONOLOGIA_DAY1, REF } from './corpus'

function agrupar(celdas: CeldaTecnica[], catalogo: CatalogoAttack): FamiliaTecnica[] {
  const porFamilia = new Map<string, CeldaTecnica[]>()
  for (const c of celdas) porFamilia.set(c.familia, [...(porFamilia.get(c.familia) ?? []), c])
  return [...porFamilia.entries()].map(([id, lista]) => ({
    id,
    nombre: catalogo.tecnicas[id]?.nombre ?? null,
    celdas: lista,
    reglas: lista.reduce((s, c) => s + (c.reglas ?? 0), 0),
    alertasF2: lista.reduce((s, c) => s + (c.alertasF2 ?? 0), 0),
    alertasHoy: lista.reduce((s, c) => s + (c.alertasHoy ?? 0), 0),
  }))
}

export function construirCobertura(
  tecnicasHoy: readonly TecnicaObservada[],
  catalogo: CatalogoAttack,
  potencial: CapaNavigator = POTENCIAL as CapaNavigator,
  observadaF2: CapaNavigator = OBSERVADA_F2 as CapaNavigator,
): CoberturaAttack {
  const reglas = new Map(potencial.techniques.map((t) => [t.techniqueID, t.score]))
  const alertasF2 = new Map(observadaF2.techniques.map((t) => [t.techniqueID, t.score]))
  const hoy = new Map(tecnicasHoy.map((t) => [t.id, t]))
  const ids = [...new Set([...reglas.keys(), ...alertasF2.keys(), ...hoy.keys()])].sort()

  const celdas: CeldaTecnica[] = ids.map((id) => {
    const oficial = catalogo.tecnicas[id]
    return {
      id,
      familia: id.split('.')[0],
      subtecnica: id.includes('.'),
      nombre: oficial?.nombre ?? null,
      tacticas: oficial?.tacticas ?? [],
      reglas: reglas.get(id) ?? null,
      alertasF2: alertasF2.get(id) ?? null,
      alertasHoy: hoy.get(id)?.alertas ?? null,
      datasetsHoy: hoy.get(id)?.datasets ?? [],
    }
  })

  // Una técnica con varias tácticas aparece en cada columna (como en ATT&CK Navigator).
  const columnas: ColumnaTactica[] = catalogo.tacticas.map((tactica) => ({
    tactica,
    familias: agrupar(celdas.filter((c) => c.tacticas.includes(tactica.shortname)), catalogo),
  }))

  const porTactica = new Map<string, TacticaObservada>()
  for (const f of CRONOLOGIA_DAY1) {
    const t = porTactica.get(f.tactica) ?? { tactica: f.tactica, hosts: [], alertas: 0 }
    porTactica.set(f.tactica, { ...t, hosts: [...t.hosts, f.host], alertas: t.alertas + f.alertas })
  }

  const suma = (capa: CapaNavigator) => capa.techniques.reduce((s, t) => s + t.score, 0)
  const observadasHoyEnPotencial = tecnicasHoy.filter((t) => reglas.has(t.id)).length
  return {
    familias: agrupar(celdas, catalogo),
    columnas,
    resumen: {
      potenciales: potencial.techniques.length,
      subtecnicasPotenciales: potencial.techniques.filter((t) => t.techniqueID.includes('.')).length,
      familiasPotenciales: new Set(potencial.techniques.map((t) => t.techniqueID.split('.')[0])).size,
      paresReglaTecnica: suma(potencial),
      observadasF2: observadaF2.techniques.length,
      subtecnicasObservadasF2: observadaF2.techniques.filter((t) => t.techniqueID.includes('.')).length,
      paresAlertaTecnicaF2: suma(observadaF2),
      activacionF2: observadaF2.techniques.length / potencial.techniques.length,
      observadasHoy: tecnicasHoy.length,
      paresAlertaTecnicaHoy: tecnicasHoy.reduce((s, t) => s + t.alertas, 0),
      activacionHoy: observadasHoyEnPotencial / potencial.techniques.length,
    },
    capas: { potencial, observadaF2 },
    catalogo: { version: catalogo.procedencia.version_attack, extraido: catalogo.procedencia.extraido, fuente: REF.catalogo },
    tacticasDay1: [...porTactica.values()].sort((a, b) => b.alertas - a.alertas),
    fuente: `${REF.cobertura} · ${REF.tecnicasActuales}`,
  }
}
