/**
 * DMEVALS ampliada: el dominio de APT29 day1 (MITRE Evals) con los cuatro hosts reales y unas áreas de negocio y
 * activos críticos inventados alrededor, para que se vea qué parte de la organización toca el ataque.
 *
 * - **Documentado:** hosts, IPs, cuentas y los pasos hasta las 03:19 (hora del evento, escenario §4 y bitácora). Las
 *   tácticas, los hosts y las horas son medidos; la técnica concreta se da solo donde hay alerta que la respalde.
 * - **Ilustrativo:** las áreas de negocio (Ventas, RR. HH., Finanzas), FS01, ERP-DB y BACKUP01, y los pasos a partir
 *   de las 03:24, que extrapolan qué habría pasado si nadie hubiera respondido. day1 termina a las 03:22.
 */
import { REF } from '@/api/simulado/corpus'

import type { Organizacion } from '../modelo'

const DOC = { procedencia: 'documentada' as const, fuente: REF.ventanas }
const EXT = { procedencia: 'ilustrativa' as const }

export const DMEVALS: Organizacion = {
  id: 'dmevals',
  nombre: 'DMEVALS',
  sector: 'APT29 day1 (MITRE Evals), ampliada',
  descripcion:
    'El dominio real de APT29 day1 con áreas de negocio y activos críticos añadidos. Los pasos hasta las 03:19 son los medidos; a partir de ahí es una extrapolación.',
  procedenciaEscenario: 'Pasos medidos de apt29 day1 + extrapolación ilustrativa',
  lienzo: { ancho: 1180, alto: 620 },
  zonas: [
    { id: 'internet', titulo: 'Internet', columna: 0 },
    { id: 'puestos', titulo: 'Puestos de trabajo', columna: 1 },
    { id: 'servidores', titulo: 'Servidores', columna: 2 },
    { id: 'critico', titulo: 'Activos críticos', columna: 3 },
  ],
  activos: [
    { id: 'atacante', nombre: 'Atacante', tipo: 'atacante', zona: 'internet', area: 'Externo', criticidad: 1, ip: '192.168.0.4 (Pupy)', x: 120, y: 310 },
    { id: 'scranton', nombre: 'SCRANTON', tipo: 'estacion', zona: 'puestos', area: 'Ventas', criticidad: 2, ip: '10.0.1.4', x: 420, y: 150 },
    { id: 'utica', nombre: 'UTICA', tipo: 'estacion', zona: 'puestos', area: 'Recursos Humanos', criticidad: 2, ip: '10.0.1.5', x: 420, y: 470 },
    { id: 'nashua', nombre: 'NASHUA', tipo: 'estacion', zona: 'puestos', area: 'Finanzas', criticidad: 3, ip: '10.0.1.6', x: 420, y: 310 },
    { id: 'newyork', nombre: 'NEWYORK', tipo: 'dc', zona: 'servidores', area: 'Infraestructura TI', criticidad: 5, ip: '10.0.0.4', x: 740, y: 200 },
    { id: 'fs01', nombre: 'FS01', tipo: 'servidor', zona: 'servidores', area: 'Finanzas', criticidad: 4, x: 740, y: 420 },
    { id: 'erp', nombre: 'ERP-DB', tipo: 'datos', zona: 'critico', area: 'Finanzas', criticidad: 5, joya: true, x: 1050, y: 200 },
    { id: 'backup', nombre: 'BACKUP01', tipo: 'backup', zona: 'critico', area: 'Infraestructura TI', criticidad: 5, joya: true, x: 1050, y: 420 },
  ],
  enlaces: [
    { desde: 'atacante', hasta: 'scranton', servicio: 'C2 HTTPS' },
    { desde: 'scranton', hasta: 'nashua', servicio: 'WinRM · SMB · RPC' },
    { desde: 'scranton', hasta: 'newyork', servicio: 'LDAP · Kerberos' },
    { desde: 'utica', hasta: 'newyork', servicio: 'LDAP · Kerberos' },
    { desde: 'nashua', hasta: 'newyork', servicio: 'LDAP · Kerberos' },
    { desde: 'nashua', hasta: 'fs01', servicio: 'SMB' },
    { desde: 'newyork', hasta: 'fs01', servicio: 'Administración' },
    { desde: 'newyork', hasta: 'erp', servicio: 'SQL (cuenta de dominio)' },
    { desde: 'newyork', hasta: 'backup', servicio: 'Administración' },
    { desde: 'fs01', hasta: 'erp', servicio: 'ODBC' },
    { desde: 'fs01', hasta: 'backup', servicio: 'Agente de copias' },
  ],
  cuentas: {
    pbeesly: 'DMEVALS\\pbeesly (usuaria de Ventas)',
    admin: 'admin (cuenta del atacante tras la escalada)',
    dominio: 'Administrador del dominio',
  },
  pasos: [
    { id: 'd1', t: 2, hora: '02:56:14', desde: 'atacante', hasta: 'scranton', tactica: 'execution', tecnica: 'T1204', titulo: 'Ejecución del implante en SCRANTON', detalle: 'La usuaria abre el fichero del atacante; arranca el implante de Pupy.', cuenta: 'pbeesly', alertas: 174, ...DOC },
    { id: 'd2', t: 8, hora: '02:57:18', desde: 'scranton', hasta: 'scranton', tactica: 'persistence', tecnica: 'T1547', titulo: 'Persistencia en SCRANTON', detalle: 'Claves de arranque automático en el registro.', requiere: ['d1'], canal: 'c2', alertas: 322, ...DOC },
    { id: 'd3', t: 14, hora: '02:58:30', desde: 'scranton', hasta: 'scranton', tactica: 'privilege-escalation', tecnica: 'T1548', titulo: 'Escalada de privilegios en SCRANTON', detalle: 'El atacante pasa a operar como «admin».', requiere: ['d1'], canal: 'c2', alertas: 28, ...DOC },
    { id: 'd4', t: 22, hora: '03:00:29', desde: 'scranton', hasta: 'scranton', tactica: 'credential-access', tecnica: 'T1003.001', titulo: 'Volcado de LSASS en SCRANTON', detalle: 'Herramientas de volcado de credenciales escritas a disco y acceso a LSASS a las 03:05:16.', requiere: ['d3'], canal: 'c2', expone: 'pbeesly', patron: 'P1', alertas: 7, ...DOC },
    { id: 'd5', t: 44, hora: '03:08:50', desde: 'scranton', hasta: 'atacante', tactica: 'exfiltration', tecnica: 'T1041', titulo: 'Exfiltración desde SCRANTON', detalle: 'Datos del puesto de Ventas salen por el canal del implante.', requiere: ['d1'], canal: 'salida', compromete: false, impacto: 'Datos de Ventas exfiltrados', alertas: 10, ...DOC },
    { id: 'd6', t: 48, hora: '03:09:23', desde: 'scranton', hasta: 'nashua', tactica: 'lateral-movement', tecnica: 'T1021.006', titulo: 'Salto por WinRM de SCRANTON a NASHUA', detalle: 'powershell.exe → NASHUA:5985 con DMEVALS\\pbeesly; 17 aristas en total (5985, 445, 135).', requiere: ['d4'], cuenta: 'pbeesly', canal: 'c2', patron: 'P2', alertas: 4, procedencia: 'documentada', fuente: REF.p2Revalidado },
    { id: 'd7', t: 51, hora: '03:09:29', desde: 'nashua', hasta: 'nashua', tactica: 'credential-access', tecnica: 'T1003.001', titulo: 'Acceso remoto a LSASS en NASHUA', detalle: '«Remote LSASS Process Access Through WinRM»: la costura entre P2 y P1.', requiere: ['d6'], expone: 'admin', patron: 'P1', alertas: 1, ...DOC },
    { id: 'd8', t: 60, hora: '03:14:17', desde: 'nashua', hasta: 'nashua', tactica: 'privilege-escalation', tecnica: 'T1569.002', titulo: 'Servicio de PsExec en NASHUA', detalle: 'Ejecución remota como servicio.', requiere: ['d6'], alertas: 5, ...DOC },
    { id: 'd9', t: 66, hora: '03:16:19', desde: 'nashua', hasta: 'nashua', tactica: 'collection', tecnica: 'T1560', titulo: 'Recolección en NASHUA', detalle: 'Se preparan ficheros de Finanzas para sacarlos.', requiere: ['d6'], alertas: 4, ...DOC },
    { id: 'd10', t: 74, hora: '03:19:09', desde: 'scranton', hasta: 'scranton', tactica: 'credential-access', tecnica: 'T1003.001', titulo: 'Segundo volcado de LSASS en SCRANTON', detalle: 'Dos alertas en el mismo milisegundo; abre la segunda campaña P1 de SCRANTON.', requiere: ['d3'], canal: 'c2', expone: 'pbeesly', patron: 'P1', alertas: 2, ...DOC },
    { id: 'd11', t: 86, hora: '03:24 (ext.)', desde: 'nashua', hasta: 'fs01', tactica: 'lateral-movement', tecnica: 'T1021.002', titulo: 'Salto por SMB de NASHUA a FS01', detalle: 'Con las credenciales de «admin» volcadas en NASHUA.', requiere: ['d7'], cuenta: 'admin', patron: 'P2', ...EXT },
    { id: 'd12', t: 94, hora: '03:27 (ext.)', desde: 'nashua', hasta: 'newyork', tactica: 'credential-access', tecnica: 'T1003.006', titulo: 'DCSync contra NEWYORK', detalle: 'El atacante se hace pasar por un controlador de dominio y replica todos los hashes, incluido el de krbtgt.', requiere: ['d7'], cuenta: 'admin', expone: 'dominio', ...EXT },
    { id: 'd13', t: 104, hora: '03:31 (ext.)', desde: 'newyork', hasta: 'erp', tactica: 'collection', tecnica: 'T1213', titulo: 'Acceso a la base del ERP', detalle: 'Con credenciales de administrador del dominio.', requiere: ['d12'], cuenta: 'dominio', ...EXT },
    { id: 'd14', t: 112, hora: '03:34 (ext.)', desde: 'erp', hasta: 'atacante', tactica: 'exfiltration', tecnica: 'T1048', titulo: 'Exfiltración de la contabilidad', detalle: 'Volcado de la base del ERP hacia el exterior.', requiere: ['d13'], canal: 'salida', compromete: false, impacto: 'Contabilidad de la empresa exfiltrada', ...EXT },
    { id: 'd15', t: 118, hora: '03:36 (ext.)', desde: 'newyork', hasta: 'backup', tactica: 'impact', tecnica: 'T1490', titulo: 'Borrado de las copias de seguridad', detalle: 'Preparación típica de un ransomware: sin copias, no hay recuperación.', requiere: ['d12'], cuenta: 'dominio', impacto: 'Copias de seguridad destruidas', ...EXT },
  ],
}
