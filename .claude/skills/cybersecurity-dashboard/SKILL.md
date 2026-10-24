---
name: cybersecurity-dashboard
description: Convenciones del portal web del TFG de conciencia cibersituacional (frontend/, F8). Cárgala SIEMPRE antes de crear, modificar o revisar cualquier cosa en frontend/ (páginas, componentes, tokens y temas, grafos con React Flow, datos de src/api, tests o Playwright), y al presentar en el portal cifras de detección, alertas, campañas o ATT&CK.
---

# Portal de conciencia cibersituacional (frontend/)

Guía de trabajo para el portal del TFG. No sustituye a las fuentes: léelas antes de tocar nada.

- `AGENTS.md` (raíz): reglas de autoría y decisiones de arquitectura. **Nunca `git commit` ni `git push`**; nada de
  `Co-Authored-By` ni atribuciones a IA.
- `frontend/README.md`: secciones, temas, procedencia de los datos, cómo probar y limitaciones.
- `~/proyectos/tfg-memoria/BITACORA.md`: §2 decisiones (diseño del portal, frontend, asistente), §3 convenciones y el
  diario (entradas del 23-09-2026 y 21-10-2026 sobre el portal).
- `docs/ROADMAP.md` F8 (portal) y F2.1 (esquema de alerta).
- `frontend/docs/plan-mejora.md`: matriz existe / mejorar / nuevo / bloqueado.

## 1. Qué es y qué no es

Plataforma que convierte telemetría de Windows en incidentes correlacionados (Pilar A, CEP en Flink), razonados sobre
un grafo (Pilar B, Neo4j + Datalog) y priorizados con explicación (Pilar C, FastAPI). El portal es un **extra (F8)**:
un escaparate para la demo, no el núcleo.

**No hay backend.** La API (F6.3) y el WebSocket `/ws/alerts` no existen. No crees un backend falso ni simules un
WebSocket. Autenticación, JWT y multi-tenancy (F8.2) están fuera de alcance.

## 2. Arquitectura del frontend

- React 19 + TypeScript estricto + Vite 8 (rolldown) + Tailwind 4 + shadcn/ui (Radix) + TanStack Query + Recharts 3 +
  react-router 7 + lucide-react + `@xyflow/react` (solo el explorador del grafo de ataque) + `three` y
  `@react-three/fiber` (solo la maqueta 3D de `/conciencia`, chunk `tresd`). Sin Zustand propio y sin drei.
- **Una sola puerta de datos**: `src/api/fuente.ts` (`desdeSimulado`). Las páginas consumen hooks de `src/api/*.ts`
  (`useSituacion`, `useGrafoAtaque`, `useIncidentes`, `useCronologia`, `useCoberturaAttack`, `useEvaluacion`,
  `useCuadro`…) y **nunca** importan `src/api/simulado/` directamente.
- Contrato futuro con la API: `src/api/tipos.ts` (copiado de `build_alert()`, `p1_05_emision.sql` y la vista de P2).
- Lógica pura en `.ts` con su test (filtros, orden, secuencias, simulación, reglas, puntuación); la UI en `.tsx`.
- Carga diferida: cada página es un chunk (`src/paginasDiferidas.tsx` + `Suspense` en `AppShell`). React Flow va en
  el grupo `flujo` y Recharts en `graficos` (`vite.config.ts`); la portada no descarga ninguno de los dos.
- Estados comunes: `componentes/shell/Estados.tsx` (error con reintento) y esqueletos con `role="status"`.

## 3. Datos: procedencia y honestidad

- Toda cifra lleva chip **documentado** (con su fuente) o **ilustrativo** (`componentes/datos/Chips.tsx`).
- Las documentadas salen SOLO de `src/api/simulado/corpus.ts` (oráculo de la futura prueba de integración) o de las
  copias de `src/api/datos/`, que genera `npm run sincronizar-datos` desde `eval/attack-coverage/*.json` y
  `ml/anomaly/resultados.json`, con origen y SHA-256 en `datos/procedencia.json` (un test comprueba las huellas). No
  edites esas copias a mano ni los originales.
- Si falta un dato (las 1.184 alertas una a una, la hora de cada una de las 17 aristas de P2, la confianza de las
  campañas P1 de apt29): **no lo inventes**. Enséñalo como «no documentado» y propone a Javier la consulta de
  ClickHouse que lo exporta (README §Datos).
- Prohibido: inventar precisión, exhaustividad, F1, falsos positivos o latencia (son F3.4/F7: «pendiente», sin
  número); presentar la reducción 0,991 de P1 como mejora sobre la línea base 741 → 87 (88,3 %): **no son
  comparables**; mostrar como real algo simulado. La prioridad del Pilar C solo existe en la demo.
- Horas: UTC del dataset (2-5-2020) y hora del EVENTO, no la de recogida. Respeta la resolución
  (`componentes/datos/hora.ts`): milisegundos solo para Sysmon; las reconstruidas llevan † y van al segundo.

## 4. Esquemas reales (resumen; la fuente manda)

- **Evento**: OCSF (`class_uid`, `type_uid`, `time`, `device.hostname`, `actor.user`, `actor.process`…) con extensión
  `tfg.*` (`dataset_id`, `source_channel`, `source_event_id`, `time_source`) y `unmapped`. Lo no mapeable va a su
  `dlq.*` con el motivo: nada se descarta en silencio.
- **Alerta** (`det.alerts`, `pipeline/jobs/detect_job.py:build_alert`): `alert_id` determinista, `event_hash`, `time`,
  `rule_*`, `attack.technique_ids[]`, `attack.tactic_ids[]`, `device`, `actor`, `source_event`, `matched_fields`.
- **Campaña P1** (`infra/flink/jobs/p1_05_emision.sql`): `campaign_id`, `pattern_id`, `device_hostname`,
  `first_seen`/`last_seen`, contadores `trans_*` (cuentan TRANSICIONES, no alertas) y `confidence` descompuesta.
- **Campaña P2** (`detection/patterns/p2_lateral_movement.sql`): origen → destino, `aristas`, `puertos`,
  `procesos_origen`, `ev_*` y `confidence` con seis factores.
- Hasta F6, un **incidente** es una campaña (12 documentadas).

## 5. ATT&CK

- Técnicas siempre como array de IDs (`T1003.001`); tácticas con su **nombre** (`credential-access`), nunca `TAxxxx`.
- Solo las técnicas que vienen en los datos. Nombres y tácticas de técnica no están en las capas Navigator: no los
  rellenes de memoria (la matriz agrupa por familia por eso).
- `T1685` está verificado en ATT&CK v19 (*Disable or Modify Tools*, `defense-impairment`; `T1685.001` = *Disable or Modify
  Windows Event Log*). Nombres y tácticas salen del catálogo `attack-catalogo-v19.json`.
- Técnicas observadas: **47 en el corpus actual (21-10) y 34 en la capa de F2 (28-07)**. Las dos son ciertas para su
  alcance: donde salga la cifra, di cuál es y de cuándo. La matriz va por táctica (una columna por táctica, una técnica
  con varias tácticas en cada columna).

## 6. Diseño: tokens y los DOS temas

- Tokens en `src/estilos/globales.css`, mapeados a shadcn y expuestos como utilidades (`bg-superficie`,
  `text-texto-suave`, `border-borde`, `text-sev-alta`, `bg-fam-violeta-fondo`, `stroke` con `var(--fund-*)`…).
  **Nada de hexadecimales en componentes**: si falta un color, se crea un token en los dos temas.
- **Claro** (`:root`, por defecto): gris de baja luminancia, sin superficies blancas (decisión del proyecto: no lo
  sustituyas). **Oscuro** (`.dark` en `<html>`): pizarra profunda, sin negro puro ni neón. Los componentes no cambian de
  clases: solo cambian los tokens.
- Tema: `componentes/tema/` (`tema.ts` puro, `useTema`, `BotonTema`), preferencia en `localStorage` (`tfg-tema`, con
  try/catch) y script en línea en `index.html` que lo aplica antes del primer pintado (sin parpadeo).
- Color intenso reservado a la severidad (`--sev-info` → `--sev-critica`); texto sobre color intenso con
  `text-sobre-intenso`. Nunca el color como único portador: severidad, fundamento o tipo llevan también texto, icono o
  trazo.
- Contraste AA **comprobado**: `src/estilos/contraste.test.ts` mide ≥ 4,5:1 (texto) y ≥ 3:1 (gráficos) en los dos
  temas. Si añades un par texto/fondo nuevo, añádelo al test.
- SOC sobrio: sin animaciones que estorben (respeta `prefers-reduced-motion`), cifras tabulares, monoespaciada para
  IDs, hashes, rutas y líneas de comandos, tablas cuando son más claras que un gráfico.

## 7. Grafos con React Flow

- Solo en el explorador del grafo de ataque (`src/paginas/ataque/`). Cytoscape.js queda reservado para el grafo de F5
  (cientos de nodos): no lo añadas. Los grafos SVG existentes (pipeline, demo, panel P2) no se migran sin motivo.
- Es evidencia, no un editor: `nodesDraggable={false}`, `nodesConnectable={false}`, asas invisibles e inertes.
- Fundamento en cada arista y en la leyenda, con trazo + icono + texto: **observado** (continuo; Sysmon EID 3,
  alertas Sigma), **inferido** (discontinuo; campañas P1/P2 y su confianza), **hipótesis** (punteado; lecturas del
  escenario y extrapolaciones). No inventes aristas: cada una con su `fuente`.
- Nodos y aristas se construyen desde los datos (`api/simulado/grafoAtaque.ts`), cada uno con la hora (`ms`) de su
  primer evento medido. La disposición es en **carriles por host** calculada por una función pura y testeada
  (`paginas/ataque/carriles.ts`). Desde el 24-10 el eje **no es lineal en minutos**: cada momento con evidencia es una
  columna (lo simultáneo del mismo host, < 1 s, se apila; hosts distintos comparten columna), con su hora encima y
  «+N min» entre columnas lejanas. Bandas y asas se colocan interpolando entre columnas; las conexiones que salen de
  una tarjeta bajan en vertical desde ella y la evidencia llega a su banda justo encima de su tarjeta (`asasArista`).
  Nada de posiciones a mano. `nodeTypes`/`edgeTypes` fuera del componente, componentes con `memo`.
- **Pasos numerados** (`numerarPasos` en `logica.ts`): cada hito de la secuencia lleva su número sobre un elemento (el
  proceso que conecta, si no la alerta, si no el host). El recorrido de debajo usa los mismos números. En la
  reproducción la cámara **no se mueve** si el grafo entero se lee (zoom ≥ 0,7); si no, encuadra el paso y el anterior.
- Texto ≥ 11–12 px a zoom 1 y **zoom semántico** (por debajo de `ZOOM_DETALLE` las tarjetas ocultan su segunda línea);
  etiquetas de arista solo al pasar el ratón o al seleccionar; minimapa plegable; atribución visible. El detalle es un
  panel sobre el lienzo que solo aparece con algo elegido, y el lienzo se desplaza para que lo elegido no quede debajo.
- Controlado: atiende los cambios `select` (ratón y teclado) y `dimensions` (devuelve `measured`, o el minimapa sale
  vacío). `colorMode` sincronizado con `useTema`; variables `--xy-*` ligadas a los tokens.
- Accesible: `ariaLabel` en nodos y aristas, `ariaLabelConfig` en español, foco visible y una lista de elementos
  como alternativa al lienzo.

## 8. Seguridad: la telemetría la escribe el atacante

- Procesos, líneas de comandos, PowerShell, rutas, usuarios y títulos de regla son **entrada hostil**: siempre como
  texto de React. Cero `dangerouslySetInnerHTML`; si algún día se pinta Markdown del LLM, sanitizado.
- Parámetros de URL validados contra listas cerradas o formato (`?sel`, `?campana`, `?id`, `?tecnica`, `?host`,
  `?org`, `?cuadro`; `?t` acotado). Lo inválido se ignora.
- `localStorage` siempre en try/catch. Ningún secreto en variables `VITE_*`. Enlaces externos con
  `target="_blank" rel="noopener noreferrer"`.
- «Las reglas deciden, el LLM solo redacta» (`asistente/reglas.ts` decide; `asistente/redactor.ts` redacta). En la
  demo, «Aplicar» solo cambia la simulación, nada se ejecuta sin acción explícita, y los niveles de autonomía 2-4
  están deshabilitados (en estudio / descartado).

## 9. Accesibilidad

Teclado completo (también grafos y paneles), foco visible, `aria-label`/`aria-pressed`/`aria-sort`/`aria-current`
donde toque, regiones con nombre, `role="status"` para lo que cambia, enlace «Saltar al contenido», nada solo por
color, `prefers-reduced-motion`. Responsive desde 1280 px sin desbordamiento horizontal.

## 10. Integración con la API futura

Cuando exista F6.3: cada hook cambia su `queryFn` por `fetch('/api/…')` tipado con `src/api/tipos.ts` (el proxy de
`/api` ya está en `vite.config.ts`); las páginas no se enteran. La prueba de integración compara la respuesta con
`corpus.ts`. La procedencia pasará a «medida»; lo ilustrativo desaparece o se marca.

## 11. Rendimiento y pruebas

- Mide antes y después (`npm run build`): JS de la primera carga y tamaño de los chunks. Memoización solo donde la
  medición lo justifique; virtualización solo por encima de unos cientos de filas.
- Antes de dar algo por terminado: `npm test -- --run`, `npm run lint`, `npm run build`, `npm run e2e`
  (Playwright 1.63.0 fijado: usa el Chromium 1243 ya en caché, sin descargas) y revisar a ojo las capturas de
  `capturas/` en los dos temas y los tres anchos (1280, 1440, 1920).
- Tests nuevos para toda lógica nueva: filtros, orden, construcción de nodos y aristas desde los datos y coherencia
  con `corpus.ts`.

## 12. Cuándo usar otras skills (y cómo adaptarlas)

- **ui-ux-pro-max** (`~/.claude/skills/ui-ux-pro-max`, ver su `PROCEDENCIA.md`): para el tema oscuro, la densidad de
  dashboard, la tipografía de datos y auditorías de accesibilidad (`--domain ux`). Ignora sus patrones de landing y
  marketing (hero, CTA, «Contact Sales»). No sustituyas la paleta gris del tema claro. No cargues Google Fonts: solo
  paquetes `@fontsource/*` locales o la monoespaciada del sistema. Con `--persist`, siempre
  `--output-dir ~/proyectos/tfg-ciberconciencia/frontend/docs` y nunca `--force`. Sus resultados son recomendaciones.
- **react-flow** (`~/.claude/skills/react-flow`): escrita para Next.js + bun + next-themes. Aquí: `npm install`, sin
  `"use client"` ni `next/dynamic` (carga diferida con `React.lazy`), `colorMode` desde `useTema` y nada de edición.
- Si una skill choca con una decisión del proyecto, manda la decisión del proyecto: dilo en la entrega.

## 13. Convenciones de la ronda 2 (21-10-2026)

- **Datos nuevos**: `eval/portal/` (alertas de day1, aristas de P2, campañas de los detectores, técnicas observadas,
  catálogo v19), copiados por `npm run sincronizar-datos` (los `.jsonl` validados línea a línea) y cargados bajo demanda
  por `src/api/exportaciones.ts`. Lo que se procesa (agregados de 741 alertas), una vez y en el hook.
- **Carriles**: grafo de ataque y línea temporal comparten la idea (un carril por host, tiempo de izquierda a derecha).
  La línea temporal tiene brush (`?desde`/`?hasta`) y atajos accesibles; los ids antiguos de `?sel=` se traducen.
- **Movimiento con significado**: solo anima lo que cuenta algo (reproducir el ataque, el replay del pipeline, series
  al entrar, entradas < 300 ms); nada en bucle sin actividad; todo desactivado con `prefers-reduced-motion`
  (`estilos/movimiento.test.ts`).
- **Procedencia por bloque** o por panel, no línea a línea, salvo excepciones.
- **Asistente sin ejecución** (`/respuesta`, `paginas/respuesta/plan.ts`): HECHOS / INFERENCIAS / RECOMENDACIONES; sin
  botón «Aplicar»; copiar el plan como texto plano. «Aplicar» solo existe dentro de la simulación de la demo.
- **Copiloto** (`/copiloto`, `docs/copiloto-rag.md`): cuatro reglas que el código hace cumplir con cualquier proveedor:
  no ejecuta acciones (remite a `/respuesta`); toda afirmación con cita (`verificarFragmento`); una conversación, una
  organización (`preguntar`); nunca un LLM desde el navegador (el proveedor LLM+RAG vivirá en el servidor).
- **Navegación**: barra superior (ruta, dataset, aviso), paleta Ctrl/Cmd + K propia (sin `cmdk`), filtros en
  `sessionStorage` con `useEstadoSesion` (validados al leerlos) y selección en la URL.
- **Menos texto**: una frase bajo el título y el resto en `ComoLeer` (rotulado «Notas» desde el 24-10); jerga explicada en
  su primera mención («detector P1» en vez de «oráculo» en el texto visible).
- **Densidad de Observabilidad**: `compactar.ts` baja las filas de un número sin romper la disposición de Grafana; no se
  dibujan umbrales que el cuadro de Grafana no tenga.

## 14. Convenciones de la ronda 3 (21-10-2026)

- **Copiloto en panel lateral** (`src/copiloto/`): estado compartido en `ProveedorEstadoCopiloto`, panel en diferido.
  Empuja el contenido **solo si le deja ≥ 1.000 px** (`empujaContenido`); si no, se superpone. No vuelvas a decidirlo por
  el ancho de la ventana: con la barra lateral abierta el contenido se queda estrecho y las tablas se cortan.
- **Señales débiles** (`copiloto/senales.ts`): funciones puras con `UMBRALES` declarados; avisan («Conviene vigilar»),
  nunca alertan ni cambian severidades; cada una con sus citas y descartable. Un patrón que no salga de los datos no se
  enseña.
- **«Preguntar al Copiloto sobre esto»** (`BotonPreguntar`): abre el panel con la pregunta precargada y lo elegido como
  contexto; no envía la pregunta.
- **Agregados en la sincronización**: lo que la portada resume de un fichero grande se calcula en
  `scripts/sincronizar-datos.mjs` (con su huella de origen en `procedencia.json → derivados`), no en el navegador.
- **Modo presentación** (`componentes/presentacion/`): guion puro en `guion.ts`, sin cifras escritas a mano (lo
  comprueba el test); `?presentacion=n` en la URL; ← → y Esc con captura y sin interferir con campos de texto ni
  diálogos; resalta con la clase `presentacion-foco` usando selectores accesibles (aria-label) en vez de añadir ids.
- **Barra superior**: consultas de contenedor (`@container/barra`) para adaptarse al ancho real, no al de la ventana.
- **Pruebas de diseño**: además de las funcionales, hay e2e que fallan si una tabla desborda, si el eje se pisa, si un
  nodo queda fuera del lienzo o si el Copiloto estrecha el contenido. Añade una de este tipo con cada fallo visual.
- **Idea pendiente: mapa mundial de alertas.** Ver `frontend/docs/plan-mejora.md` §8: con el corpus actual sería
  ilustrativo (solo IP privadas); necesita IP públicas, GeoIP local en el servidor y el WebSocket de F6.3.

## 15. Convenciones de la ronda 4 (24-10-2026)

- **Maqueta 3D** (`paginas/conciencia/Maqueta3D.tsx`, lógica en `maqueta.ts`): vista alternativa a la 2D, que sigue
  siendo la de por defecto y la accesible. Selector «2D | 3D» sobre el grafo, `?vista=3d` y `localStorage`
  (`tfg-vista-conciencia`, con try/catch). Carga diferida (`React.lazy`) y chunk `tresd`: ni la portada ni `/ataque` lo
  bajan (lo comprueba Playwright). La escena sale de `construirEscena(org, ev, ruta, riesgo)`, pura y testeada: nada de
  lógica nueva en el componente, solo dibujo.
  - Colores: tokens leídos con `getComputedStyle` al cambiar de tema (`--maqueta-plataforma`, `--maqueta-pieza`,
    `--sev-*`, `--acento`, `--ok`…). Ningún hex en el componente.
  - Movimiento: `frameloop="demand"` salvo mientras algo se mueve (la simulación o el giro). Con
    `prefers-reduced-motion` no hay giro, ni cometa, ni vuelos de cámara: los encuadres cambian de golpe.
  - Etiquetas: botones del DOM proyectados sobre el lienzo (`Proyector`, sin pasar por React en cada fotograma); el
    lienzo es `role="img"` con `resumenEscena`.
  - WebGL: `hayWebGL()` crea un contexto de prueba (lento sin GPU): se comprueba tras pintar, salvo que se haya pedido
    el 3D. Sin WebGL, el 3D no se ofrece; si el contexto falla al crear el lienzo, aviso y «Volver a la vista 2D».
  - Playwright: el Chromium de las pruebas ya tiene WebGL; **no** añadas `--use-angle=swiftshader` (crear el contexto
    pasaba de 18 a 664 ms y las pruebas de navegación vencían).
  - Sin drei: controles de `three/addons/controls/OrbitControls.js` y etiquetas propias.
- **Logotipo**: `componentes/shell/Logo.tsx` (tokens `--logo-*`, `useId` para el recorte) y `public/favicon.svg`. Imagen
  original de referencia en `frontend/docs/marca/logo-original.png`. No lo sustituyas por un PNG.
- **Sobriedad** (fuera los tics de interfaz hecha en serie): radio `--radius` 0,45 rem; nada de bandas de color a la
  izquierda de las tarjetas (`border-l-4`); nada de iconos `Sparkles`/`Bot` para lo que decide un motor de reglas; nada
  de `backdrop-blur` ni fondos translúcidos sobre lienzos; un solo aviso por pantalla de «no ejecuta acciones»; botones
  que solo aparecen cuando hacen algo («Restablecer»). Si un adorno no comunica nada, no va.

### 15.1 Maqueta 3D realista (24-10-2026, segunda vuelta)

- **Modelos** (`modelos3d.tsx`): un modelo por tipo de activo, escrito como **receta de piezas** (`caja`, `cil`, `toro`
  con posición, giro y material) que `Fusion` junta en **una malla por material** (`mergeGeometries`). Un activo nuevo
  es una receta nueva en `receta()`, no mallas sueltas. Las medidas de cada tipo están en `FORMA` (`maqueta.ts`), que
  usan también las etiquetas y los indicadores. Estado en LED, pantallas y balizas (`paleta3d.ts`: `colorEstado`,
  `colorPantalla`) y en `Indicadores` (halo, anillo de riesgo, jaula, cúpula, objetivo, selección, gema de joya).
- **Materiales**: tokens `--maqueta-*` (plataforma, suelo, base, pieza, metal, metal-claro, mueble, pantalla, led,
  industrial, cristal) en los dos temas. Nada de hex en `modelos3d.tsx` ni en `Maqueta3D.tsx`.
- **Cámara**: dos modos, grupo de radio «Modo de cámara». **Vista general**: encuadre que mete la maqueta entera en el
  hueco que dejan los controles (`encuadreGeneral`, por bisección) y giro lento (`autoRotate`), que se para al tocar,
  al elegir un activo o con «Girar la vista» y vuelve a los 3,5 s. **Seguir el ataque**: `encuadreDePaso` (pura, con
  test) para cada paso nuevo; al acabar vuelve a la general. Los vuelos son un `lerp` en `useFrame` con el
  `autoRotate` en pausa mientras dura (si no, se pelean y el giro no se para). El efecto de modo no corre al montar.
- **Por qué** (`explicacion.ts`, pura, con test; `PanelPorQue.tsx`): pasos recibidos, detección (P1/P2 y Sigma),
  pivotes desde él, vecinos comprometidos, ruta, respuesta, impedidos y contexto, cada motivo con su procedencia. Es
  lo que se abre al pinchar un activo; la `FichaActivo` queda a un botón.
- **Rendimiento**: la escena se memoriza por su contenido (`claveEscena`), no por el objeto que da `evaluar` en cada
  tic; `ModeloActivo` va con `memo`; los puntos de la ruta son `InstancedMesh`. `VigiaRendimiento`: con la mediana de
  20 fotogramas por encima de 50 ms pasa a «modo ligero» (sin sombras ni `RoomEnvironment`, `dpr` 0,75), con aviso.
- **Pantalla completa**: `createPortal` al `<body>` (el `transform` de la animación de entrada encierra el
  `position: fixed`). Esc sale.
- **Reloj de la simulación** (`ProveedorSimulaciones`): suma el tiempo real transcurrido (tope 2 s por tic), no 250 ms
  fijos: con el hilo ocupado los tics llegan tarde y la simulación se frenaba.
- **Playwright**: las pruebas de la maqueta esperan al lienzo hasta 20 s (sin GPU, compilar sombreadores tarda). El
  giro solo se prueba en un `describe` con `reducedMotion: 'no-preference'`; el resto corre con movimiento reducido.
