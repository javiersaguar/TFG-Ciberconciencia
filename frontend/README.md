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
| | Grafo de ataque | `/ataque?sel=<id>` | React Flow en carriles por host con dos selectores: **Eje** «Por momentos» (una columna por momento con evidencia, con su hora y el tiempo entre columnas; por defecto) o «Tiempo real» (a escala, una marca cada 2 min), y **Cámara** «Seguir el ataque» (por defecto: al reproducir, la vista acompaña cada paso) o «Quieta». Pasos numerados sobre su elemento y, debajo, el **recorrido** de los diez pasos; fundamento de cada relación (observado, inferido, hipótesis); detalle en un panel sobre el lienzo al elegir algo y la lista de elementos abierta debajo |
| | Línea temporal | `/cronologia?sel=<id>&desde=HH:MM&hasta=HH:MM` | Las 741 alertas de day1 en carriles por host, coloreadas por nivel, con las campañas como bandas y P2 como conectores; selector de rango arrastrando (y atajos accesibles), lista compacta sincronizada y detalle con «Ver en el grafo» |
| | Matriz ATT&CK | `/attack?tecnica=<ID>` | Una columna por táctica (orden del catálogo v19), subtécnicas plegables, tres capas fechadas (potencial; observada en F2, 28-07, 34; observada hoy, 21-10, 47), punto de «observada» y tooltip con nombre, reglas, alertas y datasets |
| Respuesta | Asistente de respuesta | `/respuesta?caso=<id>` | Para cada campaña real o caso de la demo: situación, HECHOS OBSERVADOS, INFERENCIAS DEL SISTEMA y RECOMENDACIONES (técnica ATT&CK → acción NIST SP 800-61 y D3FEND, con porqué y coste), con la procedencia por bloque. No ejecuta nada: copiar el plan como texto o, en la demo, ver su efecto en la simulación |
| | Copiloto | panel lateral · `/copiloto?org=<id>` | **Panel lateral derecho** que se abre desde la barra superior, con **Ctrl/Cmd + I** o desde Ctrl+K, y desde «Preguntar al Copiloto sobre esto» en incidentes, grafo y línea temporal (con lo elegido como contexto). Preguntas sobre la evidencia de una organización, respuesta por partes con una cita en cada afirmación, sin acciones (las mitigaciones remiten a `/respuesta`); lee en vivo las simulaciones de la demo y avisa de **señales débiles** («Conviene vigilar», ver abajo). `/copiloto` es su vista a pantalla completa y ya no está en la barra lateral. Proveedor local hoy; LLM con RAG declarado, en el servidor (`docs/copiloto-rag.md`) |
| Plataforma | Evaluación | `/evaluacion` | Solo lo medido; lo de la fase F7, pendiente y sin números |
| | Grafo del pipeline | `/grafo` | Las 14 piezas del pipeline; el fondo solo se mueve durante el replay |
| | Observabilidad | `/observabilidad?cuadro=<uid>` | Los cuatro cuadros de Grafana, más densos: filas de un número compactadas sin romper la disposición, chip de procedencia sin recortes |
| | Proyecto | `/proyecto` | Avance de las fases del TFG y estado documentado del pipeline (antes, en el centro de la portada) |
| Demo | Conciencia situacional | `/conciencia?org=<id>&t=<s>&vista=2d\|3d` | Demo de los Pilares B y C, en grafo 2D (por defecto) o como **maqueta 3D** de la organización; su panel lateral es un resumen con enlace a `/respuesta` |
| Demo | Conciencia situacional | `/conciencia?org=<id>&t=<s>` | Demo de los Pilares B y C; su panel lateral es un resumen con enlace a `/respuesta` |
| | Mapa mundial | `/mapa?nivel=<nivel>&pais=<código>&vista=2d\|3d` | Flujo geográfico ilustrativo de Helios, en **mapa 2D o globo 3D**: rutas animadas de origen a destino, severidad, pausa, velocidades 1×/2×/4×, zoom y arrastre (o giro del globo), filtros y detalle fijo de cada alerta |
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
npm test -- --run          # 422 tests (Vitest + Testing Library), en 40 ficheros
npm run lint               # ESLint
npm run build              # tsc + vite build → dist/
npm run e2e                # Playwright contra `vite preview` (requiere un build previo)
npm run sincronizar-datos  # vuelve a copiar a src/api/datos/ los resultados medidos del repositorio
```

### En Docker

La imagen compila el portal con Node y lo sirve con Caddy. En la imagen final solo están los ficheros estáticos, sin
Node ni `node_modules`:

```bash
cd infra
docker compose --profile portal up -d --build   # http://localhost:8090
docker compose --profile portal down            # parar y quitar el contenedor
```

- `frontend/Dockerfile`, en dos etapas: `npm ci` + `npm run build` con `node:22.23.2-alpine`, y servido con
  `caddy:2.10.2-alpine`.
- El contenedor corre como usuario sin privilegios (UID 10001), con el sistema de ficheros de solo lectura,
  `cap_drop: [ALL]` y `no-new-privileges`. Solo escucha en `127.0.0.1:8090` (no el 4173, que es el de `vite preview` y Playwright).
- `frontend/Caddyfile`: las rutas de la SPA (`/ataque`, `/mapa?…`) se resuelven a `index.html`, y un `/assets/…` que no
  existe da 404. Los ficheros de `/assets` (llevan huella en el nombre) se cachean un año; `index.html` se revalida
  siempre. Las respuestas van comprimidas con zstd o gzip.
- Cabeceras de seguridad: CSP sin `unsafe-inline` para scripts, `X-Frame-Options`, `nosniff`, `Referrer-Policy` y
  `Permissions-Policy`. El script del tema de `index.html` entra en la CSP por su huella SHA-256, que
  `scripts/csp-caddy.mjs` calcula en cada compilación. Si cambia el script, la huella cambia sola.
- Los datos van dentro de la compilación (`src/api/datos/`), así que la imagen no lee nada de fuera de `frontend/`. Tras
  `npm run sincronizar-datos` hay que reconstruirla (`--build`). Cuando exista la API de F6.3, Caddy le reenviará `/api`
  (el bloque está comentado en el `Caddyfile`).

Para desarrollar sigue siendo mejor `npm run dev`, que recarga al guardar.

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
| `three` 0.186.1 y `@react-three/fiber` 9.8.2 (exactas) | producción | La maqueta 3D de `/conciencia`. React Three Fiber permite escribirla como componentes de React y es compatible con React 19 (pide `>=19 <19.4`). Solo se descarga al elegir la vista 3D (chunk `tresd`, ~247 kB con gzip: R3F incluye three.js entero). **Sin drei**: arrastraba hls.js, mediapipe y otras dependencias que no se usan; los controles de órbita salen de `three/addons` y las etiquetas son botones propios |
| `@types/three` 0.186.0 (exacta) | desarrollo | Tipos de three.js |
| `world-atlas` 2.0.2 y `topojson-client` 3.1.0 (exactas) | desarrollo | Solo para `npm run generar-mapamundi`, que saca de Natural Earth 1:110m (dominio público; `world-atlas` es ISC) las tierras y fronteras de los globos 3D (`/mapa` y «Mundo») a `src/componentes/tierra/mapamundi.json` (81 kB, 29 kB con gzip, con su origen y la huella SHA-256 del original). El portal no las importa: usa el JSON generado y `d3-geo`, que ya estaba |
| `d3-geo` + `@types/d3-geo` | producción + tipos de desarrollo | Proyección Natural Earth y rutas geodésicas con recorte en el antimeridiano para el mapa mundial. Chunk `geografia`, separado de Recharts |

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

## Mapa mundial de alertas

En **Demo → Mapa mundial** (`/mapa`), un flujo continuo representa alertas ficticias entre ciudades de Helios
Farmacéutica. El punto viaja del origen al destino y un anillo señala su llegada. La procedencia es **ilustrativa**:
ninguna coordenada se deduce de las IP privadas de APT29 ni se presenta como ubicación de un atacante.

- Pausa y reanudación congelan tanto el reloj como las partículas; velocidades 1×, 2× y 4× y reinicio.
- Filtros por severidad y país (origen o destino) en la URL; indicadores sobre los últimos 60 segundos de demo.
- Trazos durante nueve segundos y lista reciente acotada; seleccionar una alerta fija el detalle aunque lleguen otras.
- Zoom y arrastre, selección por teclado y tabla alternativa al mapa. Con movimiento reducido, flechas estáticas.
- La pestaña oculta suspende el reloj. Las partículas se mueven mediante transform y opacity sin renders por fotograma.
- **Mapa 2D o globo 3D** (botón «2D | 3D» del explorador, `?vista=`, recordado en el navegador): el globo
  (`GloboMundial.tsx`, en carga diferida con three.js) enseña **el mismo flujo**, con los mismos filtros, el mismo reloj
  (lee el mismo `reloj`, así que pausa y velocidad valen igual) y la misma selección: arcos por el círculo máximo del
  color de su severidad, el punto con estela que vuela del origen al destino, el anillo al llegar y, al elegir una
  alerta (pinchando el arco o desde la tabla), el arco resaltado y sus dos ciudades rotuladas. Sin WebGL, el 3D no se
  ofrece; con movimiento reducido, rutas estáticas con su flecha.
- **Globo: países, giro y flechas** (24-10, ajustes de Javier):
  - **Países iluminados**: al elegir una alerta se iluminan sus países de origen y destino, como en el 2D, con los
    mismos polígonos (`tierra.json`) pintados en una capa transparente sobre la Tierra.
  - **Gira solo en todo momento**, como el globo de «Mundo», salvo cuando hay algo que mirar. Si lo mueves a mano
    (arrastre o flechas), espera 4 s tras soltarlo y retoma. No hay botón de giro.
  - **Traza elegida**: se para y la encuadra para que se vean bien de dónde viene y adónde va: sobre el punto medio,
    ladeado al norte para ver la curva del arco y más cerca o más lejos según su longitud.
  - **País filtrado**: se para centrado en el país y solo se recoloca cuando llega una traza nueva de nivel medio, alto
    o crítico, que encuadra; las bajas e informativas no lo mueven. Singapur no tiene polígono en el 1:110m, así que se
    centra en su ciudad.
  - Reglas en `componentes/tierra/camara.ts` (`debeGirar`, `encuadrarTraza`), con tests.
  - **Flechas** abajo a la derecha (arriba = norte, izquierda = oeste…): 20° por pulsación, con transición suave y
    tope de 75° de latitud para no pasar por encima del polo. Se acumulan si se pulsan seguidas.
  - **Iluminación uniforme** en los dos globos (`componentes/tierra/IluminacionGlobo.tsx`): luz ambiental blanca y la
    principal casi de frente, acompañando a la cámara. Antes, una luz de cielo y suelo dejaba el hemisferio sur en
    penumbra (casi negro en el tema oscuro, sobre todo en «Mundo»).
  - Lógica pura en `vistaGlobo.ts` (países por código, centro de la parte principal de cada país, pintado, flechas y
    qué traza recoloca el globo con un país filtrado), con su test. La Tierra es la de los globos del portal (`componentes/tierra/`: mares y tierras del tema, costas,
  fronteras, retícula y atmósfera), la misma que el globo de «Mundo» en `/conciencia`.

La cartografía local (`src/paginas/mapa/tierra.json`) contiene 177 geometrías de **Natural Earth**, de dominio público,
con URL de origen y SHA-256 dentro del fichero. Para actualizarla, ejecutar manualmente
`node scripts/actualizar-cartografia.mjs`. La página funciona sin peticiones a cartografía, GeoIP o servicios externos.
`d3-geo`, el mapa y sus datos se cargan solo en su ruta; no arrastran Recharts ni React Flow.

La fuente está en `src/api/mapa.ts` y `src/api/simulado/mapa.ts`. El tiempo real de producción sigue pendiente de IP
públicas, enriquecimiento GeoIP en el servidor y el flujo de alertas de F6.3. No se ha simulado un WebSocket.

Pruebas: `e2e/mapa.spec.ts` comprueba movimiento real de las partículas, pausa, reanudación, detalle estable, filtros,
zoom, teclado, movimiento reducido, ausencia de peticiones externas y de desbordes, y el globo (mismo flujo, selección
desde la tabla, países iluminados, giro y modo de cámara —gira, encuadra la traza, se centra en el país—, flechas, vista recordada); guarda capturas de los dos temas en 1280, 1440 y 1920 px. Las pruebas unitarias cubren la ventana acotada, el reloj y el cruce del Pacífico.

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

> **Sede o Mundo, en 2D o 3D.** Arriba a la izquierda del grafo, dos botones: «Sede | Mundo» (`?ambito=`) y «2D | 3D»
> (`?vista=`). La sede en 2D es el grafo (por defecto, la accesible) y en 3D la maqueta; el mundo en 2D es el mapa y en
> 3D el globo. Las dos elecciones se recuerdan en el navegador. Detalle en «Trazas vivas», «Maqueta 3D» y «El mundo», abajo.

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

## Trazas vivas en el grafo 2D (24-10-2026)

El grafo 2D de la sede conserva su diseño (zonas en columnas, tarjetas con estado). Lo nuevo es que las **trazas del
ataque se mueven** mientras la simulación corre: cada paso se **dibuja** en su sentido al llegar, por los pasos
ocurridos **fluye** un trazo claro, una **cabeza** recorre el último salto y la **joya** a la que va la ruta probable
**late**. En pausa no se mueve nada y con movimiento reducido tampoco (`estilos/movimiento.test.ts` lo comprueba).

## El mundo: mapa 2D y globo 3D (24-10-2026)

De dónde viene y adónde va el ataque: los pasos que **cruzan la frontera** de la organización (el correo que entra, las
balizas de mando y control que salen, la exfiltración) entre la sede y los sitios de fuera, con las mismas trazas vivas
que el grafo 2D (crecen al llegar, fluyen mientras corre la simulación, cometa por la última, los extremos laten).

- **Mapa 2D** (`MapaMundi2D.tsx`, SVG): **el mismo mapa que el de `/mapa`** (24-10). El fondo (proyección Natural
  Earth, océano, retícula y los 177 países con sus contornos) es el componente compartido `paginas/mapa/FondoMundo.tsx`,
  con la proyección de `paginas/mapa/geografia.ts`. Encima van las capas propias de esta vista: pasos del ataque,
  sede y sitios de fuera. Los arcos son círculos máximos (la ruta más corta, curvada en el plano). Se acerca y se mueve
  como el grafo 2D. La cartografía va en un trozo compartido por los dos mapas, que solo se descarga al abrir uno.
- **Globo 3D** (`Globo3D.tsx`, en el estilo de la maqueta: luz suave, mares y tierras del tema, costas y fronteras en
  línea fina y los arcos como tubos de luz). Se abre mirando a las conexiones y gira solo en todo momento; si se
  mueve a mano o con los botones, retoma el giro a los 4 s. Misma iluminación uniforme que el globo de `/mapa`.
- **Lógica pura** (`globo.ts`, con tests): qué pasos cruzan la frontera y a qué sitio va cada uno (por su canal; la
  exfiltración por el propio canal del implante, T1041, al servidor de C2), los arcos, la vista inicial y a qué lado va
  cada etiqueta para que dos ciudades cercanas no se pisen.
- **Ubicaciones ILUSTRATIVAS** (`Organizacion.geografia`): Helios en Tres Cantos con el phishing desde Ámsterdam, el C2
  en Fráncfort y la exfiltración a Virginia; DMEVALS en Scranton (por los nombres de sus equipos) con Estocolmo y
  Singapur. Lo dicen el chip y la lista de conexiones: es la ubicación de la IP, no la del atacante, y en el corpus
  solo hay IP privadas de laboratorio. Con IP públicas y GeoIP en el servidor (F6.3) la API dará los lugares reales y
  las vistas no cambian.
- La lista de conexiones (plegable) es también la alternativa en texto; el dibujo lleva su resumen (`role="img"`).
- Tokens `--globo-*` en los dos temas. El mapa (d3-geo y las costas) y el globo se cargan en diferido.

## Maqueta 3D (24-10-2026)

La misma organización y el mismo instante que la vista 2D, como una maqueta de verdad:

- **Salas**: cada zona de red es una sala con suelo técnico (baldosas de 0,6 m), mampara de cristal al fondo y un canto
  de luz al frente, **escalonadas** de Internet (abajo a la izquierda) a los activos críticos (arriba a la derecha): el
  atacante «sube». Mucho aire entre salas (un pasillo) y entre activos.
- **Un modelo por tipo** (`modelos3d.tsx`), reconocible por su silueta: puesto de trabajo (mesa, monitor encendido,
  teclado, torre y silla), rack de servidor (bandejas y LED), controlador de dominio (dos racks y una llave), base de
  datos (discos apilados con anillos de luz), librería de cintas (ventana y cartuchos), servidor web (rack y globo de
  malla), cortafuegos/VPN (con candado), pasarela de correo (con sobre), industrial en tres variantes (armario PLC con
  baliza, rack SCADA, consola HMI) y el atacante (cristal oscuro sobre un anillo rojo).
- **Estado** en los LED, las pantallas y la baliza (verde, ámbar o roja), y alrededor de la pieza: halo rojo
  (comprometido), anillo discontinuo ámbar (en riesgo), jaula azul (aislado), cúpula verde (protegido), anillo ámbar
  (objetivo de la ruta) y gema dorada encima de las joyas.
- **Ataque**: arcos que saltan de activo en activo con punta de flecha; el último, más grueso y con un cometa que lo
  recorre mientras la simulación avanza. Impedidos en gris con ✕, ruta probable en puntos ámbar y cables de red por el
  suelo (bajan o suben de sala en el pasillo).
- **Luz**: sombras suaves, mapa de reflejos de estudio (`RoomEnvironment`), niebla y suelo bajo las salas.

**Dos modos de cámara** (arriba, en el centro):

- **Vista general**: la maqueta entera **girando despacio en círculo** (una vuelta por minuto, más o menos). Se puede
  girar, desplazar y acercar a mano; el giro se para mientras se toca, al elegir un activo y con el botón de giro, y
  vuelve a los pocos segundos. Al **pinchar un activo** (en la pieza o en su etiqueta) la cámara se centra en él, se
  resaltan sus pasos y se apagan los demás, y se abre el panel **«Por qué»**.
- **Seguir el ataque**: lanza la simulación y la cámara **acompaña cada paso**, desde delante, arriba y un poco por
  detrás del salto, a una distancia que deja ver alrededor (`encuadreDePaso`, pura y con test). Si se mueve a mano,
  deja de seguir hasta el paso siguiente; al acabar el ataque vuelve sola a la vista general. Abajo a la izquierda, el
  paso en curso (n de N, hora, táctica y título) con su botón de pausa.

**Panel «Por qué»** (`explicacion.ts`, pura y probada; `PanelPorQue.tsx`): para el activo elegido, qué pasos del
atacante lo alcanzaron (con hora, técnica, desde dónde y con qué cuenta), **qué lo detectó** (el patrón CEP P1/P2 y sus
alertas Sigma), qué hizo el atacante desde él, qué vecino comprometido llega a él y por qué servicio, si está en la
ruta probable o es su siguiente objetivo, la respuesta aplicada y lo que impidió, y su contexto de negocio. Cada motivo
lleva la procedencia de su paso (documentado en DMEVALS hasta las 03:19, ilustrativo en el resto). Desde ahí, la ficha
completa con sus conexiones.

**Pantalla completa** (botón arriba a la derecha, Esc para salir): la maqueta va directa al `<body>` con un portal; un
`transform` en un contenedor (la animación de entrada de la página) habría encerrado el `position: fixed`.

- **Lógica pura y probada**: `maqueta.ts` (escena y encuadre de seguimiento), `explicacion.ts` (el porqué). El
  componente solo dibuja. No hay datos ni lógica nuevos: es otra forma de pintar `evaluar` y `rutaProbable`.
- **Colores**: tokens del tema (`--maqueta-*` para los materiales; el estado con `--sev-*`, `--acento`, `--ok`),
  releídos al cambiar de tema. Ningún hex en los componentes.
- **Movimiento**: el giro de la vista general es la única animación en bucle del portal, y es una petición expresa:
  se para con un botón, al tocar o al elegir un activo, y **no existe con `prefers-reduced-motion`** (tampoco los
  vuelos de cámara: los cambios de encuadre son instantáneos). El cometa solo corre mientras la simulación avanza.
- **Rendimiento**: los modelos son recetas de piezas que se **fusionan por material** (un rack pasa de unas 40 mallas
  a 5) y los puntos de la ruta son una malla instanciada. La escena solo se rehace cuando cambia algo que se ve (no a
  cada tic de 250 ms de la simulación) y los modelos van memorizados. **Calidad adaptativa**: si mientras se mueve sola
  la mediana de los fotogramas pasa de 50 ms, baja la resolución y quita sombras y reflejos («Modo ligero», con aviso).
  Medido en el Chromium de las pruebas, sin GPU: de 4 a 15 fotogramas por segundo; con GPU no debería activarse.
- **El reloj de la simulación** suma ahora el tiempo real transcurrido (con tope de 2 s) en vez de 250 ms fijos por
  tic: con la página cargada, los tics llegaban tarde y la simulación se frenaba.
- **Accesibilidad**: el lienzo es una imagen con su resumen; las etiquetas son botones (`aria-pressed`), los modos un
  grupo de radio, los botones de cámara con nombre; el estado va con icono y color, nunca solo color. La vista 2D sigue
  a un clic.
- **Pruebas**: `maqueta.test.ts`, `explicacion.test.ts`; e2e: elegir 3D, el porqué de DC01 y su ficha, recordar la
  vista, «Seguir el ataque» con la simulación en marcha, pantalla completa y Esc, el giro que se para con su botón (con
  movimiento normal) y sin WebGL.

## Seguridad

La telemetría la escribe el atacante: procesos, reglas, cuentas y rutas se pintan siempre como texto de React (cero
`dangerouslySetInnerHTML`). Todos los parámetros de URL se validan contra listas cerradas o un formato y lo inválido se
ignora (`?sel`, `?campana`, `?id`, `?tecnica`, `?host`, `?org`, `?cuadro`; `?t` acotado). `localStorage` siempre en
try/catch. Ningún secreto en variables `VITE_*`. Enlaces externos con `rel="noopener noreferrer"`. Servido en Docker,
lleva CSP y cabeceras de seguridad (ver «En Docker»).

## Rendimiento

Cada página es un chunk aparte y `vite.config.ts` separa `react`, `consultas`, `utilidades`, `d3-comun`, `flujo` (React
Flow) y `graficos` (Recharts). La paleta de comandos y cada fichero de datos se cargan bajo demanda.

| Medida (sin comprimir) | 23-09 | 21-10 (ronda 1) | 21-10 (ronda 2) |
|---|---:|---:|---:|
| JS al abrir la portada (Playwright) | 979,3 kB | 483,7 kB | 816,1 kB, de ellos **302 kB son datos** (las 741 alertas, 44,6 kB con gzip) para la actividad por minuto |
| Chunk de entrada `index` | 268,8 kB | 55,6 kB | 61,1 kB |
| React Flow (`flujo`) | — | solo en `/ataque` | solo en `/ataque` (+230 kB al abrirlo) |
| Recharts (`graficos`) | siempre | solo en Observabilidad | solo en Observabilidad |

Desde el 24-10, three.js y React Three Fiber van en el chunk `tresd` (936 kB, 247 kB con gzip), que solo se descarga al
elegir la maqueta 3D; Playwright comprueba que ni la portada ni el grafo de ataque lo bajan.

La portada sigue sin descargar React Flow ni Recharts (lo comprueba Playwright); sus gráficos son HTML. Las alertas se
procesan una vez, en el hook (`useActividadDay1`), no en cada render.

## Estructura

```
frontend/
├── e2e/                  pruebas de Playwright
├── scripts/              sincronizar-datos.mjs, actualizar-cartografia.mjs
├── docs/                 plan-mejora.md, copiloto-rag.md
├── src/
│   ├── api/              hooks por sección, exportaciones.ts (datos de eval/portal), tipos.ts, fuente.ts
│   │   ├── simulado/     corpus.ts, actividad.ts, campanas.ts y los constructores de cada sección
│   │   └── datos/        copias de resultados del repositorio + procedencia.json
│   ├── componentes/      shell (barras, paleta Ctrl+K, ComoLeer), tema, datos (chips, horas, estado de sesión), graficos, ui
│   ├── paginas/          situacion, incidentes, ataque (carriles, reproducción), cronologia (linea.ts), attack, respuesta
│   │                     (plan.ts), copiloto, proyecto, evaluacion, grafo, observabilidad (compactar.ts), conciencia, mapa…
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
- Maqueta 3D: los arcos y las piezas no se pueden enfocar con el teclado dentro del lienzo (las etiquetas sí, y abren
  el porqué); en el hueco de la página, con la maqueta entera a la vista, los modelos se ven pequeños: el detalle luce
  a pantalla completa o en «Seguir el ataque». Sin GPU, la primera carga tarda unos segundos (sombreadores y reflejos).
- **Mapa mundial**: hecho como demo ilustrativa (ver «El mundo»). Para que sea real hace falta telemetría con IP públicas
  (o los IOC de la CTI de F4), una base GeoIP local en el servidor (p. ej. GeoLite2, sin llamadas a terceros desde el
  navegador) y el WebSocket de alertas de F6.3.
- F8.0: nombre y marca definitivos (el logotipo y «Ciberconciencia» son provisionales).
- `npm audit`: avisos en dependencias que ya estaban (cadena de `shadcn` y `vite`); esta ronda solo añade dos de desarrollo para generar el mapamundi.
- Grafo de ataque: con todo el día a la vista el texto queda pequeño (el eje cubre 28 min); «Reproducir ataque» y el zoom
  acercan cada paso. Se compactó la escala de tiempo (34 px por minuto, antes 46).
- **Mapa mundial:** boceto ilustrativo construido en `/mapa`. El corpus actual solo contiene direcciones privadas
  de laboratorio (10.0.x.x y 192.168.0.4). Para que sea real hace falta telemetría con IP
  públicas (o los IOC de la CTI de F4) y una base GeoIP local (p. ej. GeoLite2, sin llamadas a terceros desde el
  navegador), además del WebSocket de alertas de F6.3.
- F8.0: nombre y marca definitivos (el logotipo y «Ciberconciencia» son provisionales).
- `npm audit`: se mantienen los 11 avisos anteriores tras incorporar `d3-geo` y sus tipos.

