/**
 * Helios Farmacéutica: organización **ficticia**, diseñada para enseñar en una sola pantalla la esencia del TFG.
 *
 * - **Pilar A:** un ataque multi-etapa completo (phishing → ejecución → C2 → robo de credenciales → movimiento
 *   lateral → DCSync → exfiltración, borrado de copias y sabotaje OT), con pasos que reconocerían P1 y P2.
 * - **Pilar B:** tres joyas de la corona en ramas distintas (fórmulas de I+D, copias, línea de producción), a las que
 *   se llega por caminos diferentes: la ruta probable cambia según lo que se contenga.
 * - **Pilar C:** decisiones con coste de negocio real (aislar el DC corta la autenticación de todos; parar la línea
 *   detiene la producción), que el asistente tiene que sopesar y explicar.
 *
 * Dos debilidades deliberadas hacen el escenario verosímil: una cuenta de soporte con permisos de replicación (permite
 * el DCSync) y un dominio compartido entre TI y la planta (permite el salto a OT). Todo el escenario es ilustrativo.
 */
import type { Organizacion, PasoAtaque } from '../modelo'

const ILU = { procedencia: 'ilustrativa' as const }

const pasos: PasoAtaque[] = [
  { id: 'h1', t: 2, hora: '09:12', desde: 'atacante', hasta: 'pc-mkt', tactica: 'initial-access', tecnica: 'T1566.001', titulo: 'Correo de phishing a Marketing', detalle: '«Propuesta de campaña Q4.docm» llega a hlopez a través de la pasarela de correo.', canal: 'correo', compromete: false, ...ILU },
  { id: 'h2', t: 8, hora: '09:14', desde: 'pc-mkt', hasta: 'pc-mkt', tactica: 'execution', tecnica: 'T1204.002', titulo: 'Se abre el adjunto con macro', detalle: 'La macro descarga y lanza el implante.', requiere: ['h1'], cuenta: 'hlopez', ...ILU },
  { id: 'h3', t: 13, hora: '09:15', desde: 'pc-mkt', hasta: 'atacante', tactica: 'command-and-control', tecnica: 'T1071.001', titulo: 'El implante llama a su servidor de mando', detalle: 'Balizas HTTPS cada 60 s hacia un dominio recién registrado.', requiere: ['h2'], canal: 'c2', compromete: false, ...ILU },
  { id: 'h4', t: 20, hora: '09:21', desde: 'pc-mkt', hasta: 'pc-mkt', tactica: 'persistence', tecnica: 'T1053.005', titulo: 'Tarea programada de persistencia', detalle: 'Sobrevive a un reinicio del equipo.', requiere: ['h3'], canal: 'c2', ...ILU },
  { id: 'h5', t: 28, hora: '09:34', desde: 'pc-mkt', hasta: 'pc-mkt', tactica: 'credential-access', tecnica: 'T1003.001', titulo: 'Volcado de LSASS en PC-MKT-07', detalle: 'En memoria estaba la sesión de svc-soporte, que había atendido una incidencia esa mañana.', requiere: ['h3'], canal: 'c2', expone: 'soporte', patron: 'P1', ...ILU },
  { id: 'h6', t: 36, hora: '09:41', desde: 'pc-mkt', hasta: 'dc', tactica: 'discovery', tecnica: 'T1087.002', titulo: 'Reconocimiento del dominio', detalle: 'Enumeración de cuentas, grupos y equipos por LDAP.', requiere: ['h5'], canal: 'c2', compromete: false, ...ILU },
  { id: 'h7', t: 44, hora: '09:52', desde: 'pc-mkt', hasta: 'pc-fin', tactica: 'lateral-movement', tecnica: 'T1021.002', titulo: 'Salto por SMB a Finanzas', detalle: 'PsExec con svc-soporte hacia PC-FIN-02.', requiere: ['h5'], cuenta: 'soporte', canal: 'c2', patron: 'P2', ...ILU },
  { id: 'h8', t: 52, hora: '10:03', desde: 'pc-fin', hasta: 'fs', tactica: 'lateral-movement', tecnica: 'T1021.002', titulo: 'Salto al servidor de ficheros de Finanzas', detalle: 'Mismo mecanismo, misma cuenta.', requiere: ['h7'], cuenta: 'soporte', patron: 'P2', ...ILU },
  { id: 'h9', t: 60, hora: '10:11', desde: 'pc-fin', hasta: 'dc', tactica: 'credential-access', tecnica: 'T1003.006', titulo: 'DCSync contra DC01', detalle: 'svc-soporte tiene permisos de replicación que nunca necesitó: el atacante obtiene el hash de krbtgt y de todo el dominio.', requiere: ['h7'], cuenta: 'soporte', expone: 'dominio', ...ILU },
  { id: 'h10', t: 70, hora: '10:26', desde: 'dc', hasta: 'lims', tactica: 'lateral-movement', tecnica: 'T1021.006', titulo: 'Salto al LIMS de I+D', detalle: 'Como administrador del dominio, por WinRM.', requiere: ['h9'], cuenta: 'dominio', patron: 'P2', ...ILU },
  { id: 'h11', t: 78, hora: '10:38', desde: 'lims', hasta: 'bd-formulas', tactica: 'collection', tecnica: 'T1213', titulo: 'Acceso a la base de fórmulas', detalle: 'Consulta masiva de formulaciones y resultados de ensayos.', requiere: ['h10'], cuenta: 'dominio', ...ILU },
  { id: 'h12', t: 88, hora: '10:55', desde: 'bd-formulas', hasta: 'atacante', tactica: 'exfiltration', tecnica: 'T1567.002', titulo: 'Exfiltración a almacenamiento en la nube', detalle: '14 GB comprimidos y cifrados salen hacia un servicio de almacenamiento público.', requiere: ['h11'], canal: 'salida', compromete: false, impacto: 'Propiedad intelectual de I+D robada', ...ILU },
  { id: 'h13', t: 96, hora: '11:08', desde: 'dc', hasta: 'backup', tactica: 'impact', tecnica: 'T1490', titulo: 'Borrado de las copias de seguridad', detalle: 'Se eliminan los puntos de restauración y el catálogo de copias.', requiere: ['h9'], cuenta: 'dominio', impacto: 'Copias de seguridad destruidas', ...ILU },
  { id: 'h14', t: 104, hora: '11:15', desde: 'dc', hasta: 'scada', tactica: 'lateral-movement', tecnica: 'T1021.001', titulo: 'Salto a la red de planta (SCADA)', detalle: 'El dominio es compartido entre TI y OT: las credenciales del dominio abren el escritorio remoto del SCADA.', requiere: ['h9'], cuenta: 'dominio', patron: 'P2', ...ILU },
  { id: 'h15', t: 112, hora: '11:22', desde: 'scada', hasta: 'plc', tactica: 'impact', tecnica: 'T0831', titulo: 'Manipulación del control de la línea 2', detalle: 'Cambio de consignas en el PLC (ATT&CK for ICS): la línea se detiene por seguridad.', requiere: ['h14'], impacto: 'Línea 2 de producción parada', ...ILU },
  { id: 'h16', t: 120, hora: '11:30', desde: 'dc', hasta: 'fs', tactica: 'impact', tecnica: 'T1486', titulo: 'Ransomware en los servidores', detalle: 'Cifrado desplegado por directiva de grupo desde el controlador de dominio.', requiere: ['h9'], cuenta: 'dominio', impacto: 'Servidores cifrados', ...ILU },
]

export const HELIOS: Organizacion = {
  id: 'helios',
  nombre: 'Helios Farmacéutica',
  sector: 'Farmacéutica · organización ficticia',
  descripcion:
    'Empresa inventada con oficinas, laboratorio de I+D y planta de producción. El escenario recorre los tres pilares del TFG en un solo ataque.',
  procedenciaEscenario: 'Organización y escenario ilustrativos',
  lienzo: { ancho: 1420, alto: 660 },
  zonas: [
    { id: 'internet', titulo: 'Internet', columna: 0 },
    { id: 'perimetro', titulo: 'Perímetro (DMZ)', columna: 1 },
    { id: 'usuarios', titulo: 'Puestos de trabajo', columna: 2 },
    { id: 'servidores', titulo: 'Servidores', columna: 3 },
    { id: 'critico', titulo: 'Activos críticos', columna: 4 },
  ],
  activos: [
    { id: 'atacante', nombre: 'Atacante', tipo: 'atacante', zona: 'internet', area: 'Externo', criticidad: 1, x: 110, y: 330 },
    { id: 'correo', nombre: 'Pasarela de correo', tipo: 'correo', zona: 'perimetro', area: 'Infraestructura TI', criticidad: 3, x: 390, y: 140 },
    { id: 'vpn', nombre: 'VPN corporativa', tipo: 'vpn', zona: 'perimetro', area: 'Infraestructura TI', criticidad: 3, x: 390, y: 330 },
    { id: 'web', nombre: 'Web corporativa', tipo: 'web', zona: 'perimetro', area: 'Comunicación', criticidad: 2, x: 390, y: 490 },
    { id: 'pc-mkt', nombre: 'PC-MKT-07', tipo: 'estacion', zona: 'usuarios', area: 'Marketing', criticidad: 1, x: 670, y: 110 },
    { id: 'pc-fin', nombre: 'PC-FIN-02', tipo: 'estacion', zona: 'usuarios', area: 'Finanzas', criticidad: 2, x: 670, y: 250 },
    { id: 'pc-id', nombre: 'PC-ID-11', tipo: 'estacion', zona: 'usuarios', area: 'I+D', criticidad: 3, x: 670, y: 390 },
    { id: 'hmi', nombre: 'HMI-PLANTA', tipo: 'ot', zona: 'usuarios', area: 'Producción', criticidad: 4, x: 670, y: 540 },
    { id: 'dc', nombre: 'DC01', tipo: 'dc', zona: 'servidores', area: 'Infraestructura TI', criticidad: 5, x: 950, y: 110 },
    { id: 'fs', nombre: 'FS-FINANZAS', tipo: 'servidor', zona: 'servidores', area: 'Finanzas', criticidad: 4, x: 950, y: 250 },
    { id: 'lims', nombre: 'LIMS', tipo: 'servidor', zona: 'servidores', area: 'I+D', criticidad: 4, x: 950, y: 390 },
    { id: 'scada', nombre: 'SCADA-SRV', tipo: 'ot', zona: 'servidores', area: 'Producción', criticidad: 5, x: 950, y: 540 },
    { id: 'bd-formulas', nombre: 'BD-FÓRMULAS', tipo: 'datos', zona: 'critico', area: 'I+D', criticidad: 5, joya: true, x: 1270, y: 170 },
    { id: 'backup', nombre: 'BACKUP-01', tipo: 'backup', zona: 'critico', area: 'Infraestructura TI', criticidad: 5, joya: true, x: 1270, y: 350 },
    { id: 'plc', nombre: 'PLC-LÍNEA-2', tipo: 'ot', zona: 'critico', area: 'Producción', criticidad: 5, joya: true, x: 1270, y: 540 },
  ],
  enlaces: [
    { desde: 'atacante', hasta: 'correo', servicio: 'SMTP' },
    { desde: 'atacante', hasta: 'vpn', servicio: 'IPsec' },
    { desde: 'atacante', hasta: 'web', servicio: 'HTTPS' },
    { desde: 'atacante', hasta: 'pc-mkt', servicio: 'Correo entregado' },
    { desde: 'correo', hasta: 'pc-mkt', servicio: 'Correo' },
    { desde: 'correo', hasta: 'pc-fin', servicio: 'Correo' },
    { desde: 'vpn', hasta: 'pc-id', servicio: 'Acceso remoto' },
    { desde: 'pc-mkt', hasta: 'pc-fin', servicio: 'SMB (red plana)' },
    { desde: 'pc-mkt', hasta: 'dc', servicio: 'LDAP · Kerberos' },
    { desde: 'pc-fin', hasta: 'dc', servicio: 'LDAP · Kerberos · DRSUAPI' },
    { desde: 'pc-id', hasta: 'dc', servicio: 'LDAP · Kerberos' },
    { desde: 'pc-fin', hasta: 'fs', servicio: 'SMB' },
    { desde: 'pc-id', hasta: 'lims', servicio: 'HTTPS' },
    { desde: 'hmi', hasta: 'scada', servicio: 'OPC UA' },
    { desde: 'dc', hasta: 'fs', servicio: 'Administración · GPO' },
    { desde: 'dc', hasta: 'lims', servicio: 'WinRM' },
    { desde: 'dc', hasta: 'backup', servicio: 'Administración' },
    { desde: 'dc', hasta: 'scada', servicio: 'RDP (dominio compartido TI/OT)' },
    { desde: 'fs', hasta: 'backup', servicio: 'Agente de copias' },
    { desde: 'lims', hasta: 'bd-formulas', servicio: 'SQL' },
    { desde: 'scada', hasta: 'plc', servicio: 'Modbus/TCP' },
  ],
  cuentas: {
    hlopez: 'HELIOS\\hlopez (Marketing)',
    soporte: 'HELIOS\\svc-soporte (soporte, con permisos de replicación de más)',
    dominio: 'Administrador del dominio (hash de krbtgt robado)',
  },
  pasos,
  geografia: {
    sede: { nombre: 'Tres Cantos (Madrid)', pais: 'ES', lat: 40.6, lon: -3.71 },
    infraestructura: {
      correo: { nombre: 'Ámsterdam', pais: 'NL', lat: 52.37, lon: 4.9, papel: 'Servidor de envío del phishing' },
      c2: { nombre: 'Fráncfort', pais: 'DE', lat: 50.11, lon: 8.68, papel: 'Servidor de mando y control (VPS)' },
      salida: { nombre: 'Ashburn (Virginia)', pais: 'US', lat: 39.04, lon: -77.49, papel: 'Almacenamiento en la nube de la exfiltración' },
    },
    procedencia: 'ilustrativa',
    nota: 'Ubicaciones inventadas para la demo (centros de datos habituales de servidores alquilados).',
  },
}
