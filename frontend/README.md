# Portal web (F8)

Portal de la plataforma de conciencia cibersituacional. Es un **extra del TFG**, no parte de su núcleo: un escaparate
para enseñar hacia dónde va. **No está conectado a ningún backend**: la API (F6.3) y el WebSocket de alertas aún no
existen, así que todos los datos salen de `src/api/` (cifras documentadas del corpus de F3 y resultados copiados del
repositorio) y cada cifra dice si está **documentada** (con su fuente) o es **ilustrativa**.

Parte del portal de PIDS (`PIDS-Proyecto1/parte4_frontend/web`): mismo stack, mismo lienzo del grafo del pipeline y
mismo redibujado de los cuadros de Grafana. Las convenciones para trabajar en él están en la skill del proyecto
(`../.claude/skills/cybersecurity-dashboard/SKILL.md`) y el plan de la última mejora en `docs/plan-mejora.md`.

## Secciones

| Grupo | Sección | Ruta | Qué hace |
|---|---|---|---|
| Investigación | Situación | `/` | Panel SOC que cabe en 1440 × 900 sin desplazarse: tres indicadores principales y tres secundarios (la reducción de P1, con su nota de no comparabilidad), alertas de APT29 day1 por minuto apiladas por nivel, reparto por severidad (263 altas, 413 medias, 55 bajas, 10 informativas), mapa de calor táctica × host y las campañas de day1 con enlace a su incidente |
| | Incidentes | `/incidentes?id=<campaña>` | Maestro-detalle de las 12 campañas, agrupadas por dataset (las 7 variantes LSASS en un grupo plegable), sin columna de prioridad (el Pilar C no existe aún) y con el detalle al lado: confianza con sus factores, evidencia por etapa, técnicas, conexiones y enlaces al grafo, a la línea temporal y al asistente |
| | Grafo de ataque | `/ataque?sel=<id>` | React Flow en carriles por host; de izquierda a derecha, **una columna por momento con evidencia** (no minutos lineales), con su hora encima y el tiempo que pasa entre columnas; los **pasos numerados** sobre su elemento y, debajo, el **recorrido** con los diez pasos (clic para ir a uno, o «Reproducir ataque» con la cámara quieta); fundamento de cada relación (observado, inferido, hipótesis); detalle en un panel sobre el lienzo solo con algo elegido |
| | Línea temporal | `/cronologia?sel=<id>&desde=HH:MM&hasta=HH:MM` | Las 741 alertas de day1 en carriles por host, coloreadas por nivel, con las campañas como bandas y P2 como conectores; selector de rango arrastrando (y atajos accesibles), lista compacta sincronizada y detalle con «Ver en el grafo» |
| | Matriz ATT&CK | `/attack?tecnica=<ID>` | Una columna por táctica (orden del catálogo v19), subtécnicas plegables, tres capas fechadas (potencial; observada en F2, 28-07, 34; observada hoy, 21-10, 47), punto de «observada» y tooltip con nombre, reglas, alertas y datasets |
| Respuesta | Asistente de respuesta | `/respuesta?caso=<id>` | Para cada campaña real o caso de la demo: situación, HECHOS OBSERVADOS, INFERENCIAS DEL SISTEMA y RECOMENDACIONES (técnica ATT&CK → acción NIST SP 800-61 y D3FEND, con porqué y coste), con la procedencia por bloque. No ejecuta nada: copiar el plan como texto o, en la demo, ver su efecto en la simulación |
| | Copiloto | panel lateral · `/copiloto?org=<id>` | **Panel lateral derecho** que se abre desde la barra superior, con **Ctrl/Cmd + I** o desde Ctrl+K, y desde «Preguntar al Copiloto sobre esto» en incidentes, grafo y línea temporal (con lo elegido como contexto). Preguntas sobre la evidencia de una organización, respuesta por partes con una cita en cada afirmación, sin acciones (las mitigaciones remiten a `/respuesta`); lee en vivo las simulaciones de la demo y avisa de **señales débiles** («Conviene vigilar», ver abajo). `/copiloto` es su vista a pantalla completa y ya no está en la barra lateral. Proveedor local hoy; LLM con RAG declarado, en el servidor (`docs/copiloto-rag.md`) |
| Plataforma | Evaluación | `/evaluacion` | Solo lo medido; lo de la fase F7, pendiente y sin números |
| | Grafo del pipeline | `/grafo` | Las 14 piezas del pipeline; el fondo solo se mueve durante el replay |
| | Observabilidad | `/observabilidad?cuadro=<uid>` | Los cuatro cuadros de Grafana, más densos: filas de un número compactadas sin romper la disposición, chip de procedencia sin recortes |
| | Proyecto | `/proyecto` | Avance de las fases del TFG y estado documentado del pipeline (antes, en el centro de la portada) |
| Demo | Conciencia situacional | `/conciencia?org=<id>&t=<s>&vista=2d\|3d` | Demo de los Pilares B y C, en grafo 2D (por defecto) o como **maqueta 3D** de la organización; su panel lateral es un resumen con enlace a `/respuesta` |
| Próximamente | Inteligencia de amenazas | `/inteligencia` | Página «próximamente» (F4 · F8.3) |

## Puesta en marcha y pruebas

```bash
cd frontend
npm ci                     # dependencias exactas del package-lock.json
npm run dev                # http://localhost:5173
```

No hace falta levantar ningún servicio. Los enlaces de las fichas del grafo del pipeline y «Abrir en Grafana» sí
necesitan el perfil correspondiente de docker compose en el mismo equipo.

```bash
npm test -- --run          # 368 tests (Vitest + Testing Library), en 34 ficheros
npm run lint               # ESLint
npm run build              # tsc + vite build → dist/
npm run e2e                # Playwright contra `vite preview` (requiere un build previo)
npm run sincronizar-datos  # vuelve a copiar a src/api/datos/ los resultados medidos del repositorio
```

**Playwright** (`e2e/portal.spec.ts`, 13 escenarios × 3 anchos: 1280, 1440 y 1920 px) recorre la navegación, el
cambio de tema (recordado al recargar y aplicado antes del primer pintado), los filtros, la selección y la reproducción del
grafo de ataque, el brush de la línea temporal, el maestro-detalle de incidentes, Ctrl+K, la matriz por táctica, el
copiloto, la demo de conciencia situacional, el peso de la primera carga, la ausencia de errores en
consola y de desbordamiento horizontal, y hace **capturas de cada pantalla en los dos temas** en `capturas/` (ignorado
por git). `@playwright/test` va fijado a la 1.63.0 porque usa el Chromium 1243 que ya está en `~/.cache/ms-playwright`:
no hace falta descargar navegadores. En otro equipo: `npx playwright install chromium`.

## Stack y dependencias

React 19 · TypeScript estricto · Vite 8 (rolldown) · Tailwind 4 · shadcn/ui (Radix) · TanStack Query · Recharts 3 ·
react-router 7 · lucide-react · `@fontsource/inter`. Sin Zustand: el estado del servidor lo lleva TanStack Query y el de
la interfaz cabe en `useState` y en la URL.

| Dependencia nueva | Tipo | Por qué |
|---|---|---|
| `@xyflow/react` ^12.12.0 | producción | El explorador del grafo de ataque necesita zoom, desplazamiento, minimapa, nodos agrupados (procesos dentro de su host), selección accesible por teclado y aristas con etiqueta propia. Hacerlo a mano en SVG habría sido reescribir React Flow. Solo se carga en `/ataque` (chunk `flujo`). La atribución de React Flow queda visible (abajo a la izquierda) |
| `@playwright/test` 1.63.0 (exacta) | desarrollo | Pruebas de extremo a extremo y capturas en los dos temas y tres anchos. Versión fijada para reutilizar el Chromium ya descargado |
| `three` 0.186.1 y `@react-three/fiber` 9.8.2 (exactas) | producción | La maqueta 3D de `/conciencia`. React Three Fiber permite escribirla como componentes de React y es compatible con React 19 (pide `>=19 <19.4`). Solo se descarga al elegir la vista 3D (chunk `tresd`, ~245 kB con gzip: R3F incluye three.js entero). **Sin drei**: arrastraba hls.js, mediapipe y otras dependencias que no se usan; los controles de órbita salen de `three/addons` y las etiquetas son botones propios |
| `@types/three` 0.186.0 (exacta) | desarrollo | Tipos de three.js |

**Grafos**: el del pipeline, el de la demo y el panel de movimiento lateral siguen en SVG propio (funcionan y no ganan
nada con una librería). React Flow solo en el explorador del grafo de ataque, que es interactivo y de unos veinte
nodos. **Cytoscape.js sigue reservado para el grafo real de F5** (Neo4j, cientos de nodos y disposición automática).

## Diseño: dos temas

Botón **Modo claro / Modo oscuro** siempre visible: al pie de la barra lateral y, con ella cerrada, debajo del botón de
abrirla. `aria-label` con la acción («Cambiar a modo oscuro»), `aria-pressed`, foco visible y uso con teclado.

- **Claro (por defecto)**: la paleta gris de baja luminancia de la decisión del proyecto. Ningún plano grande es blanco:
  en un SOC se mira la pantalla durante turnos largos y las superficies brillantes cansan y apagan los colores de
  severidad.
- **Oscuro (opcional)**: pizarra profunda (`#0e131a` de fondo, `#161d26` en tarjetas), sin negro puro ni neón, con el
  acento azul apagado y la escala de severidad con más luminancia para leerse sobre fondo oscuro.

Todo sale de los tokens de `src/estilos/globales.css`: el tema oscuro (`.dark` en `<html>`) redefine los mismos tokens y
**ningún componente cambia de clases**. Para eso se convirtieron en tokens los ~80 colores fijos que había repartidos por
los componentes (familias del grafo del pipeline, estados de la demo, tarjeta del atacante, colores de Grafana, series
de los gráficos). React Flow lee sus variables `--xy-*` de los mismos tokens y su `colorMode` sigue al tema.

La elección se guarda en `localStorage` (`tfg-tema`, con try/catch: si el navegador lo bloquea, el portal sigue en
claro). Un script en línea en `index.html` aplica el tema, `color-scheme` y `theme-color` **antes del primer pintado**,
así que no parpadea (Playwright lo comprueba).

**Contraste AA comprobado, no a ojo**: `src/estilos/contraste.test.ts` lee los tokens de los dos temas y mide cada par
texto/fondo (≥ 4,5:1) y gráfico/fondo (≥ 3:1) que se usa de verdad. Al medir apareció que el tema claro original ya
incumplía AA en varios pares: severidad media (3,99:1) y alta (4,34:1) como texto, el aviso sobre su propio tinte, el
texto claro sobre severidad media, las líneas de red del grafo de la demo (1,8:1), las líneas de las familias del grafo
del pipeline (2,1–2,8:1), la pastilla de realce de ese grafo y el texto suave al 80 % de la barra lateral (3,7:1). Se
corrigieron con el ajuste mínimo de luminancia, **sin cambiar el tono**, y cada cambio está anotado en `globales.css`.

Severidad, fundamento y tipo nunca van solo por color (texto, icono o trazo). Cifras tabulares, monoespaciada del
sistema para IDs, hashes, rutas y procesos, y `prefers-reduced-motion` respetado.

### Logotipo (24-10-2026)

El de Javier: un hexágono biselado con un escudo en el centro, un pulso que lo atraviesa y seis nodos conectados. Se
**redibujó en SVG** a partir de su imagen (guardada como referencia en `docs/marca/logo-original.png`) para que se vea
nítido de 16 a 400 px: `componentes/shell/Logo.tsx` (colores en tokens `--logo-*`; en oscuro el marco se aclara para no
perderse sobre la barra lateral) y `public/favicon.svg` (los colores del tema claro, que el favicon no puede leer
tokens). Bajo el nombre, «TFG · ETSIT-UPM» en vez de repetir «Conciencia cibersituacional».

### Sobriedad: lo que se quitó por parecer hecho en serie (24-10-2026)

Revisadas todas las pantallas buscando los tics de las interfaces generadas en serie. Los textos aguantaban (son
concretos y llevan su fuente); lo que sobraba era de forma:

- **Radio**: `--radius` de 0,75 a 0,45 rem. Las tarjetas muy redondeadas con sombra suave son la marca de la casa de
  esas interfaces; en un SOC sobra.
- **Bandas de color a la izquierda** de tarjetas (asistente, recomendaciones, error, notas de la evaluación): fuera. La
  urgencia ya la dice su chip, con texto.
- **Iconos de «chispas» y de robot** para lo que es un motor de reglas: fuera (el asistente lleva una lista de
  comprobación). El LLM aún no existe y no se anuncia con adornos.
- **Efecto cristal** (`backdrop-blur` y fondos translúcidos) en leyendas, controles y el modo presentación: fondos
  sólidos.
- **Avisos repetidos**: «no ejecuta acciones» aparecía dos o tres veces por pantalla en `/copiloto` y `/respuesta`; queda
  uno. La página «próximamente» pierde el icono de obras y la frase de relleno.
- **«Cómo leer esta página»** pasa a llamarse **«Notas»**: mismo contenido, sin el tono de manual.
- Grafo de ataque: menos texto por tarjeta (el tipo lo dice el icono), filtros en una fila (la leyenda es el filtro de
  fundamento, las relaciones en un desplegable, «Restablecer» solo si hay algo que restablecer) y etiquetas de las
  aristas solo al pasar el ratón o al elegirlas.

## Navegación y lectura

- **Barra superior** fina en todas las páginas: dónde estás (grupo › sección), qué datos se ven (APT29 day1 · corpus F3),
  el aviso de datos simulados y el botón de búsqueda.
- **Paleta de comandos** con **Ctrl/Cmd + K**: secciones, los cuatro hosts, las 12 campañas y las 47 técnicas observadas,
  buscando sin tildes (por ID o por nombre: «lsass memory» → T1003.001). Patrón combobox de WAI-ARIA sobre el diálogo de
  Radix, sin dependencias nuevas; su índice se descarga la primera vez que se abre.
- **Barra lateral** reagrupada (Investigación, Respuesta, Plataforma, Demo, Próximamente) y sin etiquetas recortadas.
- **El contexto se conserva**: la selección va en la URL (`?sel=`, `?id=`, `?caso=`, `?desde=`…) y los filtros de
  `/ataque`, `/incidentes`, `/cronologia` y `/attack` se guardan en `sessionStorage` (validados al leerlos), así que al ir
  y volver siguen ahí.
- **Menos texto**: cada página abre con una frase; el resto está en «Cómo leer esta página». La jerga interna se explica
  en su primera mención (F2, F6, F7, CEP, RAG) y la procedencia se marca por bloque o por panel.
- **Copiloto en panel lateral**: empuja el contenido **solo si le deja al menos 1.000 px** (`empujaContenido`, en
  `copiloto/estado.ts`); si no, se superpone con sombra. Con la regla anterior (empujar a partir de 1.280 px de
  ventana) el contenido se quedaba en unos 800 px a 1440 px y las tablas se cortaban. La barra superior se adapta a su
  propio ancho (consultas de contenedor): por debajo de 48 rem esconde el dataset y el atajo.

### Señales débiles del Copiloto («Conviene vigilar»)

Funciones puras en `copiloto/senales.ts`, con sus umbrales en `UMBRALES` (y repetidos en cada aviso). Un aviso **no es
una alerta** ni cambia la severidad de nada: se puede descartar (por organización, en `sessionStorage`).

| Detector | Umbral | Caso real que encuentra |
|---|---|---|
| Impacto previo al salto | ≥ 2 alertas de `impact` en un host, ≥ 5 min antes del primer salto lateral hacia él | NASHUA: alertas de impact desde las 02:59:37, casi 10 min antes de la conexión desde SCRANTON |
| Alertas sin técnica | ≥ 20 alertas sin técnica ATT&CK en un host en 5 min | SCRANTON: la ráfaga del «Dropper Via PowerShell», invisible para P1 y P2 |
| P1 a medias | campaña P1 con ≤ 1 etapa de refuerzo además del ancla | SCRANTON 03:10 (confianza 0,65) |
| Pasos sin patrón (demo) | ≥ 2 pasos en un activo sin ningún patrón que los confirme | Según el instante de la simulación |

## Modo presentación

Recorrido guiado de 8 pasos para contar el TFG con el propio portal (ROADMAP F8.4, «modo demo»): el problema (portada) →
el ataque en el tiempo → el grafo y «Reproducir ataque» → de alertas a incidentes → el asistente de respuesta → el
Copiloto con sus avisos → lo medido y lo que falta → la demo de conciencia situacional.

- Se inicia desde **Ctrl/Cmd + K → «Iniciar presentación»** o con **`?presentacion=1`** en la URL (el número es el paso).
- **← y →** cambian de paso (también los botones y los puntos), **Esc** sale. No interfiere con lo que se escribe ni con
  un diálogo abierto, y no bloquea la página: se puede pulsar «Reproducir ataque» durante el paso del grafo.
- Resalta el elemento del paso y lo trae a la vista; si la tarjeta lo taparía, la tarjeta sube arriba. En el paso del
  Copiloto abre el panel con una pregunta precargada (sin enviarla) y lo cierra al salir de ese paso.
- **Ninguna cifra del guion está escrita a mano** (`componentes/presentacion/guion.ts`): salen de `corpus.ts` y de los
  resultados de ML-1, y `presentacion.test.tsx` falla si aparece un número que no se pueda reconstruir desde ahí.
- Solo se descarga cuando la URL lo pide.

## Movimiento

Las animaciones cuentan lo que pasa y nada se mueve en bucle cuando no pasa nada: la reproducción del ataque dibuja cada
tramo en el sentido del ataque y hace latir el nodo alcanzado, con la hora del paso sobre el lienzo; el fondo del grafo
del pipeline solo se mueve durante el replay; las series de Observabilidad se dibujan al entrar; las páginas entran con
un fundido de 180 ms y las tarjetas, escalonadas, en menos de 300 ms. **Para desactivarlas**, basta con la preferencia
del sistema «reducir movimiento» (`prefers-reduced-motion`): el portal la respeta en todas (un test lo comprueba).

## Datos y procedencia

La única puerta de datos es `src/api/`: las páginas consumen hooks de TanStack Query (`useSituacion`, `useIncidentes`,
`useGrafoAtaque`, `useCronologia`, `useCoberturaAttack`, `useEvaluacion`, `useCuadro`…) y nunca el simulador.
`fuente.ts` resuelve con una latencia ficticia de 250 ms (0 en los tests). Cuando exista la API de F6.3, cada `queryFn`
pasará a ser un `fetch('/api/…')` tipado con `src/api/tipos.ts`, que ya recoge el contrato copiado de los esquemas
reales (`build_alert()`, `p1_05_emision.sql` y la vista de P2), y ninguna página cambiará.

- **documentado**: medido y escrito, con su referencia. Sale de `src/api/simulado/corpus.ts` (cifras del corpus de F3,
  ampliado ahora con el bloque de P1 alerta a alerta, las horas de P2 con la hora del evento, el proceso de cada puerto,
  las confianzas que la bitácora da con valor, las alertas por host y los papeles del escenario) o de las copias de
  `src/api/datos/`.
- **ilustrativo**: las métricas de Prometheus de Observabilidad, el estado en vivo del pipeline y los escenarios de la
  demo (salvo los pasos de DMEVALS hasta las 03:19).
- **no documentado**: se dice así («—» o «no documentada»), nunca se rellena.

`npm run sincronizar-datos` copia a `src/api/datos/` las dos capas ATT&CK (`eval/attack-coverage/*.json`) y los
resultados de ML-1 (`ml/anomaly/resultados.json`), sin tocar los originales, y anota en `procedencia.json` la ruta de
origen, el SHA-256, el tamaño y la fecha. Un test comprueba que cada copia coincide con su huella.

Lo que **no** se enseña porque no está medido: precisión, exhaustividad, F1, falsos positivos y latencia (F3.4/F7) y la
prioridad de incidentes reales (Pilar C). Y la reducción 0,991 de P1 va
siempre con su advertencia: **no es comparable** con la línea base 741 → 87 (88,3 %).

### Datos exportados de ClickHouse (21-10-2026)

`eval/portal/` trae, medidos el 21-10: las 741 alertas de day1 una a una, las 17 aristas de P2 con su hora, las 11
campañas P1 y la P2 de los detectores en lote (con host, ventana y confianza de todas), las 47 técnicas observadas en el
corpus actual y el catálogo de ATT&CK v19. Su `README.md` explica cada fichero y **las consultas para regenerarlos**.
`npm run sincronizar-datos` los copia a `src/api/datos/` (los `.jsonl`, validados línea a línea; huella SHA-256 y filas
en `procedencia.json`, comprobadas por un test) y `src/api/exportaciones.ts` los carga bajo demanda, cada uno en su chunk.
Además **deriva** de las 741 alertas los tres agregados de la portada (`actividad-por-minuto.json`, `severidad.json` y
`tacticas-por-host.json`, anotados en `procedencia.json → derivados` con la huella de su origen), así que la portada ya
no descarga las alertas: un test comprueba que dan los mismos números que el cálculo en el navegador.

Consecuencias ya reflejadas: T1685 verificado (*Disable or Modify Tools*); confianza de las campañas P1 de apt29
(0,85 · 0,80 · 0,65); y técnicas observadas **47 en el corpus actual (21-10) frente a 34 en la capa de F2 (28-07)**, cada
cifra con su fecha.

## Conciencia situacional (demo)

> **Vista 2D o maqueta 3D.** Arriba a la izquierda del grafo, «2D | 3D». La 2D sigue siendo la de por defecto y la
> accesible; la elección se recuerda en el navegador y se puede fijar con `?vista=3d`. Detalle en «Maqueta 3D», abajo.

Enseña cómo se vería la conciencia cibersituacional cuando existan los Pilares B y C, sobre escenarios simulados:
**Helios Farmacéutica** (`?org=helios`, ficticia) y **DMEVALS** (`?org=dmevals`, APT29 day1: medido hasta las 03:19 y
extrapolación ilustrativa después). `?t=<segundo>` abre la simulación en pausa en ese instante (acotado a la duración
del escenario).

Todo se recalcula a partir de (organización, instante, acciones aplicadas) con funciones puras
(`simulacion.ts`, `razonamiento.ts`, `asistente/puntuacion.ts`, `asistente/reglas.ts`, `asistente/redactor.ts`).

El panel lateral de la demo es ahora un **resumen** (situación, gravedad y las acciones que se pueden probar en la simulación) con enlace a `/respuesta`, donde está el razonamiento completo. El asistente separa:

- **Hechos observados**: los pasos ocurridos, con hora, técnica y procedencia, enlazados a su paso en la cronología.
- **Inferencias del sistema**: patrones CEP reconocidos, ruta probable (búsqueda en anchura; en F5, Datalog), la
  incertidumbre (confianza de la detección) y la gravedad descompuesta en sus cinco factores.
- **Recomendaciones**: del motor de reglas, con su porqué y su coste de negocio. «Aplicar» **solo cambia la
  simulación** y lo dice; nada se aplica sin una acción explícita.
- **Redacción**: hoy plantillas. Las reglas deciden y el LLM (F6) solo redactará, sin poder inventar acciones ni cifras.

**Niveles de autonomía (demo de la propuesta en estudio, F6.4)**: nivel 0 «recomienda» (por defecto) y nivel 1
«ejecuta con aprobación», que abre una confirmación explícita con efecto, evidencia, regla y coste. Los niveles 2 y 3
están deshabilitados (en estudio) y el 4 está descartado por diseño.

## Maqueta 3D (24-10-2026)

La misma organización y el mismo instante que la vista 2D, en volumen: **las zonas de red son plataformas escalonadas**
(Internet abajo a la izquierda, los activos críticos arriba a la derecha: el atacante «sube»), cada activo es una pieza
con forma según su tipo y color según su estado, **los pasos del ataque son arcos** que saltan de pieza en pieza (rojo si
ocurrieron, gris si la respuesta los impidió, con ✕), la **ruta probable** hacia la siguiente joya va en puntos ámbar y
los pasos locales (abrir un adjunto, volcar LSASS en el propio equipo) son un anillo sobre la pieza. Las joyas llevan
una gema encima; el objetivo de la ruta y lo que acaba de recibir el último paso, un anillo en la base.

- **Lógica pura y probada** (`paginas/conciencia/maqueta.ts`): convierte (organización, evaluación, ruta, riesgo) en
  plataformas, piezas, arcos y marcas. `Maqueta3D.tsx` solo dibuja. No hay datos nuevos ni lógica nueva: es otra forma
  de pintar lo que ya calculan `evaluar` y `rutaProbable`, así que la procedencia (ilustrativo / documentado) no cambia.
- **Colores**: los tokens del tema (`--sev-*`, `--acento`, `--ok` y dos propios, `--maqueta-plataforma` y
  `--maqueta-pieza`), releídos al cambiar de tema. Ningún hex en el componente.
- **Movimiento**: solo se anima el punto que recorre el último paso, **mientras la simulación avanza** y si el usuario no
  ha pedido menos movimiento. El resto del tiempo el lienzo se pinta solo cuando algo cambia (`frameloop="demand"`). La
  cámara no se mueve al avanzar el ataque; se puede girar, desplazar y acercar, y «Encuadrar» la recoloca.
- **Encuadre**: la distancia de la cámara se busca proyectando las esquinas de la escena (con la perspectiva real) para
  que quepa en el hueco que dejan el selector, los botones y la leyenda.
- **Accesibilidad**: el lienzo es una imagen con un resumen (qué está comprometido, aislado y hacia dónde va la ruta);
  las etiquetas de los activos son **botones** de verdad, colocados sobre el lienzo, que abren la misma ficha que en 2D;
  el estado va con icono y color, nunca solo con color.
- **Sin WebGL** la opción 3D se desactiva y la página se queda en 2D. La comprobación crea un contexto de prueba, que
  sin GPU puede costar medio segundo: se hace tras pintar la página, salvo que se haya pedido el 3D.
- **Pruebas**: `maqueta.test.ts` (escalonado, cada activo en su zona, arcos de ataque e impedidos, ruta, último paso,
  resumen); e2e con WebGL real en Chromium (elegir 3D, ficha de un activo, recordar la vista, capturas en los dos temas)
  y sin WebGL (simulado: el 3D no se ofrece).

## Seguridad

La telemetría la escribe el atacante: procesos, reglas, cuentas y rutas se pintan siempre como texto de React (cero
`dangerouslySetInnerHTML`). Todos los parámetros de URL se validan contra listas cerradas o un formato y lo inválido se
ignora (`?sel`, `?campana`, `?id`, `?tecnica`, `?host`, `?org`, `?cuadro`; `?t` acotado). `localStorage` siempre en
try/catch. Ningún secreto en variables `VITE_*`. Enlaces externos con `rel="noopener noreferrer"`.

## Rendimiento

Cada página es un chunk aparte y `vite.config.ts` separa `react`, `consultas`, `utilidades`, `d3-comun`, `flujo` (React
Flow) y `graficos` (Recharts). La paleta de comandos y cada fichero de datos se cargan bajo demanda.

| Medida (sin comprimir) | 23-09 | 21-10 (ronda 1) | 21-10 (ronda 2) |
|---|---:|---:|---:|
| JS al abrir la portada (Playwright) | 979,3 kB | 483,7 kB | 816,1 kB, de ellos **302 kB son datos** (las 741 alertas, 44,6 kB con gzip) para la actividad por minuto |
| Chunk de entrada `index` | 268,8 kB | 55,6 kB | 61,1 kB |
| React Flow (`flujo`) | — | solo en `/ataque` | solo en `/ataque` (+230 kB al abrirlo) |
| Recharts (`graficos`) | siempre | solo en Observabilidad | solo en Observabilidad |

Desde el 24-10, three.js y React Three Fiber van en el chunk `tresd` (930 kB, 245 kB con gzip), que solo se descarga al
elegir la maqueta 3D; Playwright comprueba que ni la portada ni el grafo de ataque lo bajan.

La portada sigue sin descargar React Flow ni Recharts (lo comprueba Playwright); sus gráficos son HTML. Las alertas se
procesan una vez, en el hook (`useActividadDay1`), no en cada render.

## Estructura

```
frontend/
├── e2e/                  pruebas de Playwright
├── scripts/              sincronizar-datos.mjs
├── docs/                 plan-mejora.md, copiloto-rag.md
├── src/
│   ├── api/              hooks por sección, exportaciones.ts (datos de eval/portal), tipos.ts, fuente.ts
│   │   ├── simulado/     corpus.ts, actividad.ts, campanas.ts y los constructores de cada sección
│   │   └── datos/        copias de resultados del repositorio + procedencia.json
│   ├── componentes/      shell (barras, paleta Ctrl+K, ComoLeer), tema, datos (chips, horas, estado de sesión), graficos, ui
│   ├── paginas/          situacion, incidentes, ataque (carriles, reproducción), cronologia (linea.ts), attack, respuesta
│   │                     (plan.ts), copiloto, proyecto, evaluacion, grafo, observabilidad (compactar.ts), conciencia…
│   ├── estilos/          globales.css (tokens de los dos temas), contraste.test.ts, movimiento.test.ts
│   └── pruebas/          configuración de Vitest y utilidades de render
└── playwright.config.ts
```

## Limitaciones y pendiente

- Sin backend: la API (F6.3), la autenticación y la separación por organización en el servidor (F8.2) y el WebSocket de
  alertas siguen fuera de este frontend. El copiloto con LLM y RAG está diseñado (`docs/copiloto-rag.md`), no construido.
- El grafo de ataque y la línea temporal cubren APT29 day1; las campañas LSASS solo tienen su evidencia por etapa (no hay
  alertas una a una exportadas de esos datasets).
- Ninguna serie de los cuadros de Grafana define umbrales: el soporte de bandas existe, pero no se dibuja ninguna (no se
  inventan). Solo hay un panel de un número ilustrativo y su valor es constante, así que no lleva minigráfica.
- Portada: **462 kB de JS** sin comprimir (era 816 kB en la ronda 2) porque los agregados se calculan al sincronizar; con
  la API, la agregación la hará ClickHouse.
- Grafo de ataque: resuelto el 24-10 lo de que con todo el día a la vista el texto quedaba diminuto. El eje ya no es
  lineal en minutos sino una columna por momento con evidencia, así que el grafo entero cabe a un zoom legible (~0,8
  en 1440 px). A 1280 px con la barra lateral abierta baja a ~0,6 y las tarjetas ocultan su segunda línea.
- Maqueta 3D: los arcos y las piezas no se pueden enfocar con el teclado dentro del lienzo (las etiquetas sí, y abren la
  ficha); con muchos activos en la misma zona las etiquetas pueden tocarse a lo lejos, y se separan al acercar.
- **Idea anotada para F8 (21-10-2026): mapa mundial en tiempo real del origen y el destino de las alertas.** Con el
  corpus actual no hay qué geolocalizar: todas las direcciones son privadas de laboratorio (10.0.x.x, y el atacante
  en 192.168.0.4), así que un mapa con estos datos sería **ilustrativo**. Para que sea real hace falta telemetría con IP
  públicas (o los IOC de la CTI de F4) y una base GeoIP local (p. ej. GeoLite2, sin llamadas a terceros desde el
  navegador), además del WebSocket de alertas de F6.3. Si se adelanta como demo, va marcado como ilustrativo.
- F8.0: nombre y marca definitivos (el logotipo y «Ciberconciencia» son provisionales).
- `npm audit`: 11 avisos en dependencias que ya estaban (cadena de `shadcn` y `vite`); esta ronda no añade dependencias.

