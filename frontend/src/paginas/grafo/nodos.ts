/**
 * Piezas del grafo del pipeline: dónde se sienta cada tarjeta, de qué color es su camino, en qué estado está y el
 * texto de su ficha. Misma estructura que el lienzo de PIDS, con dos añadidos propios del TFG:
 *
 *   - `estado`: `operativa` (construida y medida), `base` (esqueleto sin conectar) o `planificada` (fase futura).
 *     Las planificadas se dibujan en discontinua y con su fase, así el grafo es también el mapa del ROADMAP.
 *   - `ficheros`: dónde vive cada pieza en el repositorio, para ir del dibujo al código.
 *
 * Las aristas llevan el nombre del topic de Redpanda o de la tabla de ClickHouse por la que pasa el dato.
 * Colores de las aristas: verde = topic de Redpanda, cian = escritura en ClickHouse, coral = DLQ,
 * pizarra = métricas, violeta = tramos de fases futuras.
 */
import {
  Activity,
  BrainCircuit,
  Database,
  FileJson,
  Filter,
  Gauge,
  Globe,
  LayoutDashboard,
  LineChart,
  Play,
  Scale,
  Server,
  ShieldAlert,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

export const TARJETA = { ancho: 200, alto: 104 }
export const LIENZO = { ancho: 1280, alto: 744 }

export type Tono = 'verde' | 'azul' | 'ambar' | 'violeta' | 'cian' | 'coral' | 'pizarra'
export type Lado = 'arriba' | 'abajo' | 'izquierda' | 'derecha'
export type EstadoPieza = 'operativa' | 'base' | 'planificada'

export interface Nodo {
  id: string
  x: number
  y: number
  titulo: string
  /** Nombre largo de la ficha, si la tarjeta usa uno más corto. */
  nombre?: string
  subtitulo: string
  tecnologia: string
  /** Pastilla corta de la tarjeta: qué tipo de dato toca. */
  datos: string
  tono: Tono
  icono: LucideIcon
  estado: EstadoPieza
  /** Fase del ROADMAP en la que se construye o se construyó. */
  fase: string
  queEs: string[]
  queHace: string[]
  comoConecta: string[]
  ficheros?: string[]
  /** Interfaz web local de la pieza (docker compose). */
  enlace?: { url: string; texto: string }
}

export interface Arista {
  desde: string
  hasta: string
  etiqueta: string
  tono: Tono
  salida: Lado
  entrada: Lado
  desplazaSalida?: number
  desplazaEntrada?: number
  /** Punto de la curva (0–1) donde se sienta la etiqueta. */
  tEtiqueta?: number
}

export const NODOS: Nodo[] = [
  {
    id: 'fuentes',
    x: 16,
    y: 24,
    titulo: 'Telemetría',
    nombre: 'Fuentes de telemetría',
    subtitulo: 'Datasets y laboratorio',
    tecnologia: 'OTRF · Atomic Red Team',
    datos: 'JSON Lines',
    tono: 'ambar',
    icono: FileJson,
    estado: 'operativa',
    fase: 'F1 · F2',
    queEs: [
      'Los registros de Windows (Sysmon, Security y PowerShell) de ataques reales grabados: APT29 day1 de MITRE Evals, las siete variantes de LSASS_campaign y un atómico de referencia. Son el corpus reproducible de F3.',
    ],
    queHace: [
      'No hace nada por sí misma: son ficheros en `data/`, que nunca se versiona. El laboratorio propio de VirtualBox con Atomic Red Team genera capturas adicionales con la misma forma.',
    ],
    comoConecta: [
      'El replay los lee línea a línea. Que sean ficheros y no un agente en vivo es lo que hace el experimento repetible: la misma entrada da siempre las mismas 530.401 filas.',
    ],
    ficheros: ['scripts/load_f3_corpus.sh', 'emulation/'],
  },
  {
    id: 'replay',
    x: 290,
    y: 24,
    titulo: 'Replay',
    subtitulo: 'Reproduce la captura',
    tecnologia: 'Python · confluent-kafka',
    datos: 'Crudo',
    tono: 'ambar',
    icono: Play,
    estado: 'operativa',
    fase: 'F1',
    queEs: ['Publica cada línea del dataset en Redpanda como si llegara ahora, con el número de línea como cabecera.'],
    queHace: [
      'Ese ordinal es la identidad de reserva de los eventos que no traen `RecordNumber` (todas las campañas LSASS): leer el mismo fichero produce siempre el mismo ordinal, y por eso una recarga sobrescribe en vez de duplicar.',
    ],
    comoConecta: ['Escribe en `raw.host.windows` (3 particiones). No toca ClickHouse ni sabe nada de OCSF.'],
    ficheros: ['pipeline/replay_dataset.py'],
    enlace: { url: 'http://localhost:8080', texto: 'Abrir Redpanda Console' },
  },
  {
    id: 'normalizador',
    x: 620,
    y: 24,
    titulo: 'Normalización',
    nombre: 'Normalización a OCSF',
    subtitulo: 'Del registro de Windows a OCSF',
    tecnologia: 'normalize_job · OCSF',
    datos: 'OCSF',
    tono: 'azul',
    icono: Workflow,
    estado: 'operativa',
    fase: 'F1',
    queEs: ['Traduce cada evento de Windows al esquema canónico OCSF, con la extensión propia `tfg.*` y el campo `unmapped`.'],
    queHace: [
      'Un mapeador por canal y EventID. Calcula la identidad del evento (host, canal, record_number) y la hora por una cadena de fiabilidad medida: TimeCreated → UtcTime → EventTime + desfase → @timestamp.',
      'Cobertura: 99,36 % en apt29 day1 y 96,4 % en el corpus completo. Lo que no sabe mapear no se pierde: va a la DLQ con el motivo.',
    ],
    comoConecta: [
      'Lee `raw.host.windows` y publica en `norm.events` (6 particiones), con la identidad del evento como clave de partición: reparte uniforme por cardinalidad, no por suerte.',
    ],
    ficheros: ['pipeline/jobs/normalize_job.py', 'pipeline/normalize/'],
  },
  {
    id: 'dlq',
    x: 1064,
    y: 24,
    titulo: 'DLQ',
    nombre: 'Colas de mensajes no procesables',
    subtitulo: 'Nada se descarta en silencio',
    tecnologia: 'dlq.normalize · dlq.detect',
    datos: 'Con motivo',
    tono: 'coral',
    icono: ShieldAlert,
    estado: 'operativa',
    fase: 'F1',
    queEs: ['Dos topics donde acaba todo evento que una etapa no pudo procesar, junto al motivo.'],
    queHace: [
      'Tras la recarga del 11-09 recibió 20.093 eventos, todos `UnmappedEvent` (tipos sin mapeador, como el PowerShell operacional) y ninguna excepción. Es la lista de trabajo para ampliar el normalizador.',
    ],
    comoConecta: ['Reciben del normalizador y de la detección. Nadie las consume de forma automática: se revisan.'],
  },
  {
    id: 'deteccion',
    x: 620,
    y: 212,
    titulo: 'Detección Sigma',
    subtitulo: 'Reglas sobre cada evento',
    tecnologia: 'pySigma · pipeline propia',
    datos: 'Alertas',
    tono: 'azul',
    icono: Filter,
    estado: 'operativa',
    fase: 'F2',
    queEs: [
      'Evalúa las reglas Sigma de la comunidad sobre cada evento OCSF, con una pipeline de traducción propia que corrige tres desviaciones semánticas de la oficial.',
    ],
    queHace: [
      'Sin estado: cada evento se evalúa solo. La alerta lleva un `alert_id` determinista (sha1 del evento y la regla), así que republicar no duplica. En el corpus: 1.184 alertas, 741 en apt29 day1.',
    ],
    comoConecta: ['Lee `norm.events` con seis instancias en paralelo y publica en `det.alerts`.'],
    ficheros: ['pipeline/jobs/detect_job.py', 'detection/pipelines/ocsf-tfg.yml'],
  },
  {
    id: 'clickhouse',
    x: 250,
    y: 262,
    titulo: 'ClickHouse',
    subtitulo: 'Almacén analítico',
    tecnologia: 'ReplacingMergeTree',
    datos: 'Eventos · alertas',
    tono: 'cian',
    icono: Database,
    estado: 'operativa',
    fase: 'F1',
    queEs: ['El almacén columnar donde se investiga: `tfg.events` y `tfg.alerts`, más las vistas de movimiento lateral.'],
    queHace: [
      'La clave de ordenación es la identidad del evento, así que recargar sobrescribe. Aquí viven los oráculos en batch de P1 y P2 (`detection/patterns/`), contra los que se valida lo que hace Flink.',
      'Guarda para las consultas nuevas: FINAL, ifNull antes de isIPAddressInRange y nada de subconsultas correlacionadas.',
    ],
    comoConecta: ['Los sinks escriben desde `norm.events` y `det.alerts`. Grafana lo consulta directamente; la API lo hará en F6.'],
    ficheros: ['infra/clickhouse/init/', 'detection/patterns/', 'pipeline/jobs/sink_clickhouse.py'],
    enlace: { url: 'http://localhost:8123/play', texto: 'Abrir ClickHouse' },
  },
  {
    id: 'cti',
    x: 1064,
    y: 212,
    titulo: 'CTI',
    nombre: 'Plano de inteligencia de amenazas',
    subtitulo: 'OpenCTI y ATT&CK',
    tecnologia: 'STIX 2.1 · ML-2',
    datos: 'TTPs',
    tono: 'coral',
    icono: Globe,
    estado: 'planificada',
    fase: 'F4',
    queEs: ['OpenCTI con el conector de MITRE ATT&CK y feeds de IOCs, y un extractor de TTPs de informes en lenguaje natural.'],
    queHace: ['Convierte informes de amenazas en técnicas ATT&CK etiquetadas (SecureBERT afinado, ML-2) y las publica como STIX 2.1.'],
    comoConecta: ['Alimenta el grafo de ataque con técnicas, actores y vulnerabilidades.'],
  },
  {
    id: 'cep',
    x: 620,
    y: 400,
    titulo: 'CEP multi-etapa',
    nombre: 'Correlación multi-etapa (Pilar A)',
    subtitulo: 'Secuencias, no alertas sueltas',
    tecnologia: 'Flink 2.2.1 · MATCH_RECOGNIZE',
    datos: 'Campañas',
    tono: 'violeta',
    icono: Activity,
    estado: 'operativa',
    fase: 'F3',
    queEs: ['Reconoce secuencias de la kill chain sobre las alertas y las agrupa en campañas.'],
    queHace: [
      'P1 (robo de credenciales) funciona en Flink y detecta 7 de 7 variantes de LSASS. La correlación va en dos niveles porque MATCH_RECOGNIZE no puede expresar una racha maximal abierta.',
      'P2 (movimiento lateral) existe en batch sobre ClickHouse y encuentra el salto SCRANTON → NASHUA; falta portarlo a Flink.',
    ],
    comoConecta: ['Lee `det.alerts` y emite en `det.campaigns`. Reducción de alertas: 99,1 %.'],
    ficheros: ['infra/flink/jobs/p1_0*.sql', 'detection/patterns/p2_lateral_movement.sql'],
    enlace: { url: 'http://localhost:8081', texto: 'Abrir Flink' },
  },
  {
    id: 'grafo',
    x: 1064,
    y: 400,
    titulo: 'Grafo de ataque',
    nombre: 'Grafo de ataque razonado (Pilar B)',
    subtitulo: 'Rutas hacia activos críticos',
    tecnologia: 'Neo4j + GDS · Soufflé',
    datos: 'Rutas',
    tono: 'violeta',
    icono: BrainCircuit,
    estado: 'planificada',
    fase: 'F5',
    queEs: ['Un property graph de hosts, cuentas, servicios y vulnerabilidades, con reglas Datalog estilo MulVAL.'],
    queHace: ['Deriva las rutas de ataque factibles y conserva qué regla y qué hechos justifican cada paso (trazabilidad).'],
    comoConecta: ['Recibe campañas y CTI; entrega rutas a la priorización.'],
  },
  {
    id: 'prometheus',
    x: 16,
    y: 430,
    titulo: 'Prometheus',
    subtitulo: 'Toma el pulso',
    tecnologia: 'Cada 15 s',
    datos: 'Métricas',
    tono: 'pizarra',
    icono: Gauge,
    estado: 'operativa',
    fase: 'F1',
    queEs: ['Recoge las métricas de Redpanda, del JobManager y el TaskManager de Flink y de ClickHouse.'],
    queHace: ['Mide la máquina, no los datos: tráfico, memoria, CPU, consultas por segundo.'],
    comoConecta: ['Grafana dibuja lo que guarda.'],
    ficheros: ['infra/prometheus/prometheus.yml'],
    enlace: { url: 'http://localhost:9090', texto: 'Abrir Prometheus' },
  },
  {
    id: 'grafana',
    x: 16,
    y: 616,
    titulo: 'Grafana',
    subtitulo: 'Cuatro cuadros',
    tecnologia: 'Prometheus · ClickHouse',
    datos: 'Cuadros',
    tono: 'pizarra',
    icono: LineChart,
    estado: 'operativa',
    fase: 'F1 · F3',
    queEs: ['Los cuadros aprovisionados de forma declarativa: salud del pipeline, seguridad, calidad de datos y movimiento lateral.'],
    queHace: ['Es donde se editan los cuadros. El portal los redibuja con sus propios componentes en Observabilidad.'],
    comoConecta: ['Lee Prometheus y ClickHouse. El portal lee sus JSON, no lo incrusta.'],
    ficheros: ['infra/grafana/dashboards/'],
    enlace: { url: 'http://localhost:3001', texto: 'Abrir Grafana' },
  },
  {
    id: 'portal',
    x: 300,
    y: 616,
    titulo: 'Portal web',
    subtitulo: 'Esta aplicación',
    tecnologia: 'React · Vite · Tailwind',
    datos: 'Simulado',
    tono: 'azul',
    icono: LayoutDashboard,
    estado: 'base',
    fase: 'F8',
    queEs: ['El portal del analista. Hoy es la base: shell, este grafo y los cuadros de observabilidad.'],
    queHace: ['Enseña cifras documentadas del corpus y métricas ilustrativas, cada una marcada con su procedencia.'],
    comoConecta: ['Aún no habla con nadie. Cuando exista la API, todas sus cifras pasarán por ella.'],
    ficheros: ['frontend/'],
  },
  {
    id: 'api',
    x: 620,
    y: 616,
    titulo: 'API',
    nombre: 'API de la plataforma',
    subtitulo: 'Única puerta de salida',
    tecnologia: 'FastAPI',
    datos: 'Incidentes',
    tono: 'azul',
    icono: Server,
    estado: 'planificada',
    fase: 'F6.3',
    queEs: ['Los servicios REST de la plataforma: incidentes, su ruta de ataque y su explicación.'],
    queHace: ['/incidents, /incidents/{id}, /incidents/{id}/path; modelos Pydantic y OpenAPI automático.'],
    comoConecta: ['Lee ClickHouse y la priorización; el portal solo habla con ella.'],
  },
  {
    id: 'scoring',
    x: 1064,
    y: 616,
    titulo: 'Priorización',
    nombre: 'Priorización explicable (Pilar C)',
    subtitulo: 'Puntuación con su porqué',
    tecnologia: 'Python · ML-4',
    datos: 'Puntuación',
    tono: 'ambar',
    icono: Scale,
    estado: 'planificada',
    fase: 'F6',
    queEs: ['Una puntuación por incidente, descompuesta en factores normalizados.'],
    queHace: ['Devuelve siempre la descomposición y una narrativa legible; los pesos pueden aprenderse (ML-4) con atribución SHAP.'],
    comoConecta: ['Recibe rutas del grafo y campañas; entrega incidentes ordenados a la API.'],
  },
]

export const ARISTAS: Arista[] = [
  { desde: 'fuentes', hasta: 'replay', etiqueta: 'ficheros', tono: 'ambar', salida: 'derecha', entrada: 'izquierda' },
  { desde: 'replay', hasta: 'normalizador', etiqueta: 'raw.host.windows', tono: 'verde', salida: 'derecha', entrada: 'izquierda', desplazaEntrada: -14 },
  { desde: 'normalizador', hasta: 'dlq', etiqueta: 'dlq.normalize', tono: 'coral', salida: 'derecha', entrada: 'izquierda', desplazaSalida: -14, desplazaEntrada: -14 },
  { desde: 'normalizador', hasta: 'deteccion', etiqueta: 'norm.events', tono: 'verde', salida: 'abajo', entrada: 'arriba', desplazaSalida: 40, desplazaEntrada: 40 },
  { desde: 'normalizador', hasta: 'clickhouse', etiqueta: 'tfg.events', tono: 'cian', salida: 'abajo', entrada: 'arriba', desplazaSalida: -80, tEtiqueta: 0.62 },
  { desde: 'deteccion', hasta: 'dlq', etiqueta: 'dlq.detect', tono: 'coral', salida: 'derecha', entrada: 'izquierda', desplazaEntrada: 22, tEtiqueta: 0.55 },
  { desde: 'deteccion', hasta: 'clickhouse', etiqueta: 'tfg.alerts', tono: 'cian', salida: 'izquierda', entrada: 'derecha' },
  { desde: 'deteccion', hasta: 'cep', etiqueta: 'det.alerts', tono: 'verde', salida: 'abajo', entrada: 'arriba' },
  { desde: 'cep', hasta: 'grafo', etiqueta: 'det.campaigns', tono: 'violeta', salida: 'derecha', entrada: 'izquierda' },
  { desde: 'cti', hasta: 'grafo', etiqueta: 'STIX 2.1', tono: 'violeta', salida: 'abajo', entrada: 'arriba' },
  { desde: 'grafo', hasta: 'scoring', etiqueta: 'rutas', tono: 'violeta', salida: 'abajo', entrada: 'arriba' },
  { desde: 'scoring', hasta: 'api', etiqueta: 'incidentes', tono: 'violeta', salida: 'izquierda', entrada: 'derecha' },
  { desde: 'clickhouse', hasta: 'api', etiqueta: 'consultas', tono: 'violeta', salida: 'abajo', entrada: 'arriba', desplazaEntrada: -50, tEtiqueta: 0.4 },
  { desde: 'api', hasta: 'portal', etiqueta: 'REST', tono: 'violeta', salida: 'izquierda', entrada: 'derecha' },
  { desde: 'prometheus', hasta: 'grafana', etiqueta: 'métricas', tono: 'pizarra', salida: 'abajo', entrada: 'arriba' },
  { desde: 'grafana', hasta: 'portal', etiqueta: 'JSON', tono: 'pizarra', salida: 'derecha', entrada: 'izquierda' },
]

/**
 * Tonos apagados: los fondos de icono son pasteles grisáceos y las líneas de luminancia media, para que sobre el
 * lienzo gris no brillen (README §Diseño).
 */
export const TONOS: Record<Tono, { fondo: string; texto: string; pastilla: string; linea: string }> = {
  verde: { fondo: 'bg-[#d5e6dc]', texto: 'text-[#22674a]', pastilla: 'bg-[#d5e6dc] text-[#22674a]', linea: '#4a9a78' },
  azul: { fondo: 'bg-[#d5dfec]', texto: 'text-[#2c5592]', pastilla: 'bg-[#d5dfec] text-[#2c5592]', linea: '#5b85c0' },
  ambar: { fondo: 'bg-[#ebdfc8]', texto: 'text-[#80561a]', pastilla: 'bg-[#ebdfc8] text-[#80561a]', linea: '#c09040' },
  violeta: { fondo: 'bg-[#dfd9ea]', texto: 'text-[#57458c]', pastilla: 'bg-[#dfd9ea] text-[#57458c]', linea: '#8a78bf' },
  cian: { fondo: 'bg-[#d2e5e5]', texto: 'text-[#1d6466]', pastilla: 'bg-[#d2e5e5] text-[#1d6466]', linea: '#3f9899' },
  coral: { fondo: 'bg-[#ecd9d0]', texto: 'text-[#8d4526]', pastilla: 'bg-[#ecd9d0] text-[#8d4526]', linea: '#c47a58' },
  pizarra: { fondo: 'bg-[#d9dee5]', texto: 'text-[#44505f]', pastilla: 'bg-[#d9dee5] text-[#44505f]', linea: '#7d8997' },
}

/** ¿Es un tramo de una fase futura? Lo es si toca alguna pieza planificada. */
export function esTramoPlanificado(arista: Arista, porId: Map<string, Nodo>): boolean {
  return porId.get(arista.desde)?.estado === 'planificada' || porId.get(arista.hasta)?.estado === 'planificada'
}
