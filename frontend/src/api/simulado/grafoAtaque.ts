/**
 * Construye el grafo de ataque de APT29 day1 a partir de las cifras DOCUMENTADAS de `corpus.ts`. No inventa aristas:
 * cada relación sale de una entrada de la bitácora, del escenario o de los comentarios de la vista de P2, y lo dice
 * en `fuente`. Lo que no está documentado (las 17 aristas una a una, la confianza de las campañas P1 de apt29) no
 * aparece como dato: aparece como «no documentado».
 *
 * Es una función pura y determinista: `grafoAtaque.test.ts` comprueba su coherencia con `corpus.ts`.
 */
import type { AristaAtaque, ConfianzaDescompuesta, GrafoAtaque, HitoAtaque, NodoAtaque } from '../ataque'
import { msDelDia, type AristaP2, type CampanaP1Medida, type CampanaP2Medida } from '../exportaciones'
import { campanaMedida, factoresP1 } from './campanas'
import {
  ACTORES_DAY1,
  ALERTAS_POR_HOST_DAY1,
  BLOQUE_P1,
  CAMPANAS,
  CRONOLOGIA_DAY1,
  MAPA_IP,
  P1_CONFIANZA,
  P2,
  P2_DETALLE,
  REF,
  type AlertaDocumentada,
  type HoraDataset,
} from './corpus'

const DATASET = 'SDWIN-200501225525'

/** `03:00:29.705` → `03:00:29,705` (las horas de `corpus.ts` con milisegundos). */
const coma = (hora: string) => hora.replace('.', ',')

function alerta(id: string): AlertaDocumentada {
  const encontrada = BLOQUE_P1.find((a) => a.id === id)
  if (!encontrada) throw new Error(`Alerta documentada inexistente: ${id}`)
  return encontrada
}

/** Datos medidos que necesita el grafo (exportaciones del 21-10-2026). */
export interface DatosGrafo {
  campanasP1: readonly CampanaP1Medida[]
  campanaP2: CampanaP2Medida
  /** Las 17 aristas de P2 con su hora real (aristas-p2.jsonl). */
  aristas: readonly AristaP2[]
}

/** Milisegundos del día de una hora del dataset (`03:09:23.801`). */
const msHora = (h: HoraDataset) => msDelDia(`0000-00-00 ${h.hora}`)

function confianzaP1(campana: string, medidas: readonly CampanaP1Medida[]): ConfianzaDescompuesta {
  const c = CAMPANAS.find((x) => x.id === campana)
  const medida = c ? campanaMedida(c, medidas) : undefined
  if (!medida) {
    return { total: null, factores: [P1_CONFIANZA.base, ...P1_CONFIANZA.etapas].map((f) => ({ ...f, presente: null })), nota: 'Sin fila en la exportación del detector P1.', fuente: P1_CONFIANZA.fuente }
  }
  return { total: medida.confianza, factores: factoresP1(medida), fuente: `${REF.p1Campanas} · ${P1_CONFIANZA.fuente}` }
}

function nodoHost(host: string): NodoAtaque {
  const ip = MAPA_IP.find((m) => m.host === host)
  const actor = ACTORES_DAY1.hosts.find((h) => h.host === host)
  return {
    id: `host-${host.toLowerCase()}`,
    tipo: 'host',
    etiqueta: host,
    subtitulo: ip?.ip,
    hosts: [host],
    fundamento: 'observado',
    procedencia: 'documentada',
    fuente: `${REF.esquemaRed} (mapa IP → host) · ${ACTORES_DAY1.fuente}`,
    campanas: CAMPANAS.filter((c) => c.dataset === DATASET && c.hosts.includes(host)).map((c) => c.id),
    detalle: {
      hechos: [
        { etiqueta: 'FQDN', valor: actor?.fqdn ?? host, mono: true },
        { etiqueta: 'IP', valor: ip ? `${ip.ip} (${ip.votos} votos, sin rivales)` : '—', mono: true },
        { etiqueta: 'Papel', valor: actor?.papel ?? '—' },
        { etiqueta: 'Alertas Sigma en day1', valor: `${ALERTAS_POR_HOST_DAY1[host] ?? '—'} (medido en F2)` },
      ],
      tecnicas: [],
      notas: ['La IP sale de los propios datos: en una conexión SALIENTE de Sysmon EID 3, la IP de origen es la del host que la registra.'],
    },
  }
}

function nodoAlerta(id: string, otras: string[] = []): NodoAtaque {
  const a = alerta(id)
  const todas = [a, ...otras.map(alerta)]
  const veces = todas.reduce((s, x) => s + x.veces, 0)
  return {
    id: `alerta-${id}`,
    tipo: 'alerta',
    etiqueta: a.regla,
    subtitulo: `${todas.map((x) => coma(x.hora.hora)).join(' · ')}${veces > 1 ? ` · ×${veces}` : ''}`,
    padre: `host-${a.host.toLowerCase()}`,
    hosts: [a.host],
    nivel: a.nivel,
    fundamento: 'observado',
    procedencia: 'documentada',
    fuente: a.fuente,
    campanas: a.campana ? [a.campana] : [],
    detalle: {
      hechos: [
        { etiqueta: 'Regla Sigma', valor: a.regla },
        { etiqueta: 'Nivel', valor: a.nivel },
        { etiqueta: 'Host', valor: a.host, mono: true },
        { etiqueta: 'Hora del evento (UTC)', valor: todas.map((x) => coma(x.hora.hora)).join(' y '), mono: true },
        { etiqueta: 'Alertas distintas', valor: String(veces) },
      ],
      tecnicas: a.tecnicas,
      notas: [a.nota].filter((n): n is string => !!n),
      incidente: a.campana,
      cronologia: a.id,
    },
  }
}

function nodoProceso(id: string, nombre: string, host: string, hechos: NodoAtaque['detalle']['hechos'], notas: string[], fuente: string, campanas: string[], tecnicas: string[] = []): NodoAtaque {
  return {
    id,
    tipo: 'proceso',
    etiqueta: nombre,
    subtitulo: host,
    padre: `host-${host.toLowerCase()}`,
    hosts: [host],
    fundamento: 'observado',
    procedencia: 'documentada',
    fuente,
    campanas,
    detalle: { hechos: [{ etiqueta: 'Proceso', valor: nombre, mono: true }, { etiqueta: 'Host', valor: host, mono: true }, ...hechos], tecnicas, notas },
  }
}

function nodoCampana(id: string, datos: DatosGrafo): NodoAtaque {
  const c = CAMPANAS.find((x) => x.id === id)
  if (!c) throw new Error(`Campaña inexistente: ${id}`)
  const p2 = c.patron === 'P2'
  return {
    id: `camp-${id}`,
    tipo: 'campana',
    etiqueta: `${c.patron} · ${c.hosts}`,
    subtitulo: (() => {
      // ventana medida por el oráculo (21-10); si faltara, la documentada
      const medida = p2 ? { inicio: datos.campanaP2.inicio, fin: datos.campanaP2.fin } : campanaMedida(c, datos.campanasP1)
      return medida ? `${medida.inicio.slice(11, 19)} → ${medida.fin.slice(11, 19)} · ${c.alertas} alertas` : `${c.inicio ?? '—'} → ${c.fin ?? '—'} · ${c.alertas} alertas`
    })(),
    hosts: c.hosts.split(' → '),
    fundamento: 'inferido',
    procedencia: 'documentada',
    fuente: p2 ? REF.p2Revalidado : REF.p1Revalidado,
    campanas: [id],
    detalle: {
      hechos: [
        { etiqueta: 'Patrón', valor: p2 ? 'P2 · movimiento lateral (oráculo en batch)' : 'P1 · robo de credenciales (batch y Flink)' },
        { etiqueta: 'Dataset', valor: c.dataset, mono: true },
        { etiqueta: 'Ventana (UTC)', valor: `${c.inicio ?? '—'} → ${c.fin ?? 'no documentado'}`, mono: true },
        { etiqueta: 'Alertas absorbidas', valor: String(c.alertas) },
        ...(p2 ? [{ etiqueta: 'Aristas', valor: `${P2.aristas} (${P2.porPuerto.map((p) => `${p.puerto} ×${p.conexiones}`).join(', ')})` }] : []),
      ],
      tecnicas: p2 ? ['T1021.006', 'T1569.002', 'T1003.001'] : [...new Set(BLOQUE_P1.filter((a) => a.campana === id).flatMap((a) => a.tecnicas))],
      notas: [c.nota].filter((n): n is string => !!n),
      confianza: p2
        ? { total: datos.campanaP2.confianza, factores: P2_DETALLE.confianza.map((f) => ({ ...f, presente: true })), fuente: `${REF.p2Campanas} · ${P2_DETALLE.fuenteConfianza}` }
        : confianzaP1(id, datos.campanasP1),
      incidente: id,
    },
  }
}

function arista(a: Omit<AristaAtaque, 'procedencia' | 'detalle'> & Partial<Pick<AristaAtaque, 'procedencia'>> & { detalle?: Partial<AristaAtaque['detalle']> }): AristaAtaque {
  return {
    procedencia: 'documentada',
    ...a,
    detalle: { hechos: [], tecnicas: [], notas: [], ...a.detalle },
  }
}

export function construirGrafoAtaque(datos: DatosGrafo): GrafoAtaque {
  const conexion = P2_DETALLE.conexionWinrm
  const puerto = (p: number) => P2.porPuerto.find((x) => x.puerto === p)!
  const proceso = (p: number) => P2_DETALLE.procesoPorPuerto.find((x) => x.puerto === p)!
  const lateral = CRONOLOGIA_DAY1.find((f) => f.host === 'SCRANTON' && f.tactica === 'execution')!
  const delPuerto = (p: number) => datos.aristas.filter((a) => a.puerto === p)
  const primeraArista = datos.aristas[0]
  const ultimaArista = datos.aristas.at(-1)!

  const nodos: NodoAtaque[] = [
    ...['SCRANTON', 'NASHUA', 'NEWYORK', 'UTICA'].map(nodoHost),
    {
      id: 'cuenta-pbeesly',
      tipo: 'cuenta',
      etiqueta: ACTORES_DAY1.cuentas[0].cuenta,
      subtitulo: 'Usuaria legítima',
      hosts: ['SCRANTON'],
      fundamento: 'observado',
      procedencia: 'documentada',
      fuente: `${REF.p2} · ${ACTORES_DAY1.fuente}`,
      campanas: ['p2-scranton-nashua'],
      detalle: {
        hechos: [{ etiqueta: 'Cuenta', valor: ACTORES_DAY1.cuentas[0].cuenta, mono: true }, { etiqueta: 'Papel', valor: ACTORES_DAY1.cuentas[0].papel }],
        tecnicas: [],
        notas: ['El plan de emulación dice que, tras la escalada, el atacante opera como «admin»; esa cuenta no aparece en ninguna arista documentada, así que no se dibuja.'],
      },
    },
    nodoProceso('proc-powershell', 'powershell.exe', 'SCRANTON', [{ etiqueta: 'Conexiones', valor: `WinRM ${conexion.puerto} ×${puerto(5985).conexiones}` }], [], proceso(5985).fuente, ['p2-scranton-nashua']),
    nodoProceso('proc-psexec', 'PsExec64.exe', 'SCRANTON', [{ etiqueta: 'Conexiones', valor: `RPC / DCOM 135 ×${puerto(135).conexiones}` }], [], proceso(135).fuente, ['p2-scranton-nashua']),
    nodoProceso('proc-system', 'System', 'SCRANTON', [{ etiqueta: 'Conexiones', valor: `SMB 445 ×${puerto(445).conexiones}` }], ['El cliente SMB de Windows está en el núcleo: Sysmon atribuye las conexiones 445 a System, no a PsExec64.exe.'], proceso(445).fuente, ['p2-scranton-nashua']),
    nodoProceso(
      'proc-wsmprovhost',
      'wsmprovhost.exe',
      'NASHUA',
      [{ etiqueta: 'Hora del evento (UTC)', valor: coma(P2_DETALLE.wsmprovhost.hora.hora), mono: true }, { etiqueta: 'Alerta Sigma', valor: `${P2_DETALLE.wsmprovhost.regla} (${P2_DETALLE.wsmprovhost.tecnicas.join(', ')})` }],
      [P2_DETALLE.wsmprovhost.nota],
      P2_DETALLE.wsmprovhost.fuente,
      ['p2-scranton-nashua'],
      [...P2_DETALLE.wsmprovhost.tecnicas],
    ),
    nodoAlerta('al-0300-drop', ['al-0300-drop-2']),
    nodoAlerta('al-0305-lsass'),
    nodoAlerta('al-0319-lsass'),
    { ...nodoAlerta('al-0309-remota'), campanas: ['p1-nashua', 'p2-scranton-nashua'] },
    ...['p1-scranton-1', 'p1-scranton-2', 'p2-scranton-nashua', 'p1-nashua'].map((id) => nodoCampana(id, datos)),
  ]

  const conexionRed = (id: string, p: number, origen: string, extra: Partial<AristaAtaque['detalle']>): AristaAtaque =>
    arista({
      id,
      origen,
      destino: 'host-nashua',
      relacion: 'conexion',
      fundamento: 'observado',
      fuente: `${REF.p2Revalidado} · ${proceso(p).fuente} · ${REF.aristasP2}`,
      etiqueta: `${puerto(p).servicio} ${p} · ×${delPuerto(p).length}`,
      campanas: ['p2-scranton-nashua'],
      asaOrigen: 's-abajo',
      asaDestino: `t-${p}`,
      ms: delPuerto(p)[0]?.ms,
      detalle: {
        hechos: [
          { etiqueta: 'Fuente', valor: 'Sysmon EID 3 (conexión de red), registro saliente (Initiated=true)' },
          { etiqueta: 'Origen → destino', valor: `SCRANTON 10.0.1.4 → NASHUA 10.0.1.6:${p}`, mono: true },
          { etiqueta: 'Conexiones', valor: `${delPuerto(p).length}, de ${coma(delPuerto(p)[0]?.hora.hora ?? '—')} a ${coma(delPuerto(p).at(-1)?.hora.hora ?? '—')}`, mono: true },
          { etiqueta: 'Proceso · usuario', valor: `${delPuerto(p)[0]?.proceso ?? proceso(p).proceso} · ${delPuerto(p)[0]?.usuario ?? '—'}`, mono: true },
          ...(extra.hechos ?? []),
        ],
        notas: extra.notas ?? [`Horas una a una: ${delPuerto(p).map((a) => coma(a.hora.hora)).join(' · ')}.`],
        incidente: 'p2-scranton-nashua',
      },
    })

  const dominio = (origen: string, asaOrigen: string, asaDestino: string): AristaAtaque =>
    arista({
      id: `e-dom-${origen}`,
      origen: `host-${origen}`,
      destino: 'host-newyork',
      relacion: 'dominio',
      fundamento: 'observado',
      fuente: REF.p2Sql,
      etiqueta: 'LDAP 389 · Kerberos 88',
      campanas: [],
      asaOrigen,
      asaDestino,
      fondo: true,
      detalle: {
        hechos: [{ etiqueta: 'Fuente', valor: 'Sysmon EID 3, registros salientes' }, { etiqueta: 'Recuento', valor: 'No documentado' }],
        notas: ['Tráfico de fondo del dominio: por él se identifica a NEWYORK como controlador de dominio, y P2 lo descarta como ruido para no encajar con cualquier cosa.'],
      },
    })

  const evidencia = (origen: string, campana: string, papel: string, fuente: string): AristaAtaque =>
    arista({
      id: `e-ev-${origen}-${campana}`,
      origen,
      destino: `camp-${campana}`,
      relacion: 'evidencia',
      fundamento: 'inferido',
      fuente,
      etiqueta: papel,
      campanas: [campana],
      asaOrigen: 's-arriba',
      asaDestino: 't-abajo',
      detalle: { hechos: [{ etiqueta: 'Papel en la campaña', valor: papel }], notas: ['Correlación del sistema: la alerta (o el proceso) es evidencia de la campaña, no una relación observada en la red.'], incidente: campana },
    })

  const aristas: AristaAtaque[] = [
    arista({
      id: 'e-cuenta-pbeesly',
      origen: 'cuenta-pbeesly',
      destino: 'proc-powershell',
      relacion: 'cuenta',
      fundamento: 'observado',
      fuente: REF.p2,
      etiqueta: 'ejecuta · Sysmon 3',
      campanas: ['p2-scranton-nashua'],
      asaOrigen: 's-abajo',
      asaDestino: 't-arriba',
      detalle: { hechos: [{ etiqueta: 'Campo', valor: 'User del Sysmon EID 3 de la conexión WinRM' }], notas: ['map_sysmon_3 descartaba el usuario hasta el 11-09; desde entonces la arista sale atribuida.'] },
    }),
    conexionRed('e-winrm', 5985, 'proc-powershell', {
      hechos: [
        { etiqueta: 'Primera conexión (UTC)', valor: coma(conexion.hora.hora), mono: true },
        { etiqueta: 'Usuario', valor: conexion.usuario, mono: true },
        { etiqueta: 'Confirmada desde los dos extremos', valor: 'Sí (registro Initiated=false en NASHUA)' },
      ],
      notas: ['Con la hora corregida la causalidad sale bien: la conexión (03:09:23,801) precede en 84 ms a wsmprovhost.exe (03:09:23,885).'],
    }),
    conexionRed('e-rpc', 135, 'proc-psexec', {}),
    conexionRed('e-smb', 445, 'proc-system', {}),
    dominio('scranton', 's-dom-scranton', 't-dom-scranton'),
    dominio('nashua', 's-dom-nashua', 't-dom-nashua'),
    dominio('utica', 's-dom-utica', 't-dom-utica'),
    arista({
      id: 'e-alerta-remota',
      origen: 'proc-wsmprovhost',
      destino: 'alerta-al-0309-remota',
      relacion: 'alerta',
      fundamento: 'observado',
      fuente: alerta('al-0309-remota').fuente,
      etiqueta: 'abre lsass.exe',
      campanas: ['p1-nashua', 'p2-scranton-nashua'],
      asaOrigen: 's-abajo',
      asaDestino: 't-arriba',
      detalle: { hechos: [{ etiqueta: 'Evento', valor: 'Acceso a proceso (Sysmon 10): wsmprovhost.exe → lsass.exe' }, { etiqueta: 'Hora del evento (UTC)', valor: coma(alerta('al-0309-remota').hora.hora), mono: true }], tecnicas: alerta('al-0309-remota').tecnicas, cronologia: 'al-0309-remota' },
    }),
    evidencia('alerta-al-0300-drop', 'p1-scranton-1', 'ancla · fichero', REF.bloqueP1),
    evidencia('alerta-al-0305-lsass', 'p1-scranton-1', 'ancla · acceso a LSASS', REF.bloqueP1),
    evidencia('alerta-al-0319-lsass', 'p1-scranton-2', 'ancla · acceso a LSASS', REF.bloqueP1),
    evidencia('alerta-al-0309-remota', 'p1-nashua', 'ancla · acceso remoto', REF.reconciliacion),
    evidencia('alerta-al-0309-remota', 'p2-scranton-nashua', 'credenciales en destino', REF.p2),
    evidencia('proc-wsmprovhost', 'p2-scranton-nashua', 'ejecución remota', REF.p2),
    arista({
      id: 'e-hip-habilita',
      origen: 'camp-p1-scranton-1',
      destino: 'camp-p2-scranton-nashua',
      relacion: 'hipotesis',
      fundamento: 'hipotesis',
      fuente: `${REF.escenarioLectura} (consecuencias de diseño para P1, punto 3)`,
      etiqueta: 'habilita el salto (hipótesis)',
      campanas: ['p1-scranton-1', 'p2-scranton-nashua'],
      asaOrigen: 's-abajo',
      asaDestino: 't-arriba',
      escalon: true,
      detalle: {
        hechos: [{ etiqueta: 'Separación', valor: '4 min 7 s entre el acceso a LSASS (03:05:16,654) y el salto (03:09:23,801)' }],
        notas: ['Lectura del escenario: «las credenciales robadas son las que habilitan el salto». Ningún evento lo demuestra: es la interpretación que une el robo en SCRANTON con el movimiento a NASHUA.'],
      },
    }),
    arista({
      id: 'e-hip-dcsync',
      origen: 'host-nashua',
      destino: 'host-newyork',
      relacion: 'hipotesis',
      fundamento: 'hipotesis',
      procedencia: 'ilustrativa',
      fuente: 'Demo de conciencia situacional, organización DMEVALS, paso d12 (extrapolación)',
      etiqueta: 'DCSync (extrapolación)',
      campanas: [],
      asaOrigen: 's-dcsync',
      asaDestino: 't-dcsync',
      alFinal: true,
      detalle: {
        hechos: [{ etiqueta: 'Cuándo', valor: 'Después de las 03:22, cuando day1 ya ha terminado' }],
        notas: ['No está en day1: es lo que la demo supone que haría el atacante sin respuesta. Se dibuja para ver hacia dónde iría, nunca como algo observado.'],
      },
    }),
  ]

  const hitos: HitoAtaque[] = [
    { id: 'h-inicio', hora: { hora: lateral.primera.replace(' †', ''), resolucion: 'reconstruida' }, titulo: `Primera alerta en SCRANTON (execution, ${lateral.alertas} alertas de esa táctica)`, nodos: ['host-scranton'], aristas: [], fuente: REF.ventanas },
    { id: 'h-drop', hora: alerta('al-0300-drop').hora, titulo: 'Herramientas de volcado escritas a disco (×2, hasta 03:00:31,064)', nodos: ['alerta-al-0300-drop', 'camp-p1-scranton-1'], aristas: ['e-ev-alerta-al-0300-drop-p1-scranton-1'], fuente: REF.bloqueP1 },
    { id: 'h-lsass', hora: alerta('al-0305-lsass').hora, titulo: 'Acceso a LSASS en SCRANTON', nodos: ['alerta-al-0305-lsass'], aristas: ['e-ev-alerta-al-0305-lsass-p1-scranton-1'], fuente: REF.bloqueP1 },
    { id: 'h-winrm', hora: conexion.hora, titulo: 'Conexión WinRM SCRANTON → NASHUA:5985 (powershell.exe, DMEVALS\\pbeesly)', nodos: ['cuenta-pbeesly', 'proc-powershell', 'host-nashua', 'camp-p2-scranton-nashua'], aristas: ['e-cuenta-pbeesly', 'e-winrm', 'e-hip-habilita'], fuente: REF.tiempo },
    { id: 'h-wsm', hora: P2_DETALLE.wsmprovhost.hora, titulo: `wsmprovhost.exe en NASHUA: ${P2_DETALLE.wsmprovhost.regla}`, nodos: ['proc-wsmprovhost'], aristas: ['e-ev-proc-wsmprovhost-p2-scranton-nashua'], fuente: REF.tiempo },
    { id: 'h-remota', hora: alerta('al-0309-remota').hora, titulo: 'Acceso remoto a LSASS por WinRM en NASHUA: la costura entre P1 y P2', nodos: ['alerta-al-0309-remota', 'camp-p1-nashua'], aristas: ['e-alerta-remota', 'e-ev-alerta-al-0309-remota-p1-nashua', 'e-ev-alerta-al-0309-remota-p2-scranton-nashua'], fuente: REF.bloqueP1 },
    { id: 'h-smb', hora: delPuerto(445)[0].hora, titulo: `Primera conexión SMB a NASHUA:445 (System); ${delPuerto(445).length} hasta las ${coma(delPuerto(445).at(-1)!.hora.hora)}`, nodos: ['proc-system', 'host-nashua'], aristas: ['e-smb'], fuente: REF.aristasP2 },
    { id: 'h-rpc', hora: delPuerto(135)[0].hora, titulo: `Primera conexión RPC a NASHUA:135 (PsExec64.exe, ${delPuerto(135)[0].usuario})`, nodos: ['proc-psexec', 'host-nashua'], aristas: ['e-rpc'], fuente: REF.aristasP2 },
    { id: 'h-ultima', hora: ultimaArista.hora, titulo: `Última de las ${datos.aristas.length} conexiones de P2 (desde las ${coma(primeraArista.hora.hora)})`, nodos: ['proc-psexec', 'host-nashua', 'camp-p2-scranton-nashua'], aristas: ['e-rpc'], fuente: REF.aristasP2 },
    { id: 'h-segundo', hora: alerta('al-0319-lsass').hora, titulo: 'Segundo volcado de LSASS en SCRANTON (×2): segunda campaña P1', nodos: ['alerta-al-0319-lsass', 'camp-p1-scranton-2'], aristas: ['e-ev-alerta-al-0319-lsass-p1-scranton-2'], fuente: REF.bloqueP1 },
  ]

  // Hora de cada nodo en el eje de tiempo de los carriles: la de su primer evento medido (las campañas, su ventana).
  const ventana = (inicio: string, fin: string) => ({ ms: msDelDia(inicio), msFin: msDelDia(fin) })
  const tiempos: Record<string, { ms: number; msFin?: number }> = {
    'cuenta-pbeesly': { ms: datos.aristas.find((a) => a.usuario.endsWith('pbeesly'))?.ms ?? primeraArista.ms },
    'proc-powershell': { ms: delPuerto(5985)[0].ms },
    'proc-psexec': { ms: delPuerto(135)[0].ms },
    'proc-system': { ms: delPuerto(445)[0].ms },
    'proc-wsmprovhost': { ms: msHora(P2_DETALLE.wsmprovhost.hora) },
    'camp-p2-scranton-nashua': ventana(datos.campanaP2.inicio, datos.campanaP2.fin),
  }
  for (const a of BLOQUE_P1) tiempos[`alerta-${a.id}`] = { ms: msHora(a.hora) }
  for (const c of CAMPANAS.filter((x) => x.patron === 'P1' && x.dataset === 'SDWIN-200501225525')) {
    const m = campanaMedida(c, datos.campanasP1)
    if (m) tiempos[`camp-${c.id}`] = ventana(m.inicio, m.fin)
  }
  return { nodos: nodos.map((n) => ({ ...n, ...tiempos[n.id] })), aristas, hitos }
}
