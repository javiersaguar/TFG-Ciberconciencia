# Plan de mejora del portal (F8) — auditoría y matriz

Fecha: 21-10-2026. Alcance: solo `frontend/` (más la skill del proyecto y la entrada de bitácora, que se piden
expresamente). Este plan se escribió **antes** de modificar nada y se sigue por incrementos: después de cada bloque,
tests, lint y build en verde.

## 1. Punto de partida medido

| Comprobación | Resultado |
|---|---|
| `npm test -- --run` | 13 ficheros, **81 tests en verde** (3,7 s) |
| `npm run lint` | sin avisos |
| `npm run build` | correcto en 0,4 s, sin avisos de tamaño |

Tamaño del build de partida (Vite 8 / rolldown, sin sourcemaps):

| Chunk | Tamaño | gzip |
|---|---:|---:|
| `index` (aplicación, todas las páginas) | 268,77 kB | 88,92 kB |
| `react` (react, react-dom, router) | 311,64 kB | 98,40 kB |
| `graficos` (Recharts y d3) | 365,38 kB | 105,32 kB |
| `consultas` (TanStack Query) | 32,76 kB | 9,74 kB |
| `rolldown-runtime` | 0,71 kB | 0,42 kB |
| CSS | 67,75 kB | 12,53 kB |
| **Total JS** | **979,26 kB** | **302,80 kB** |

Todo el JS se descarga en la primera visita: `rutas.tsx` importa las páginas de forma estática y Recharts entra
aunque la portada no lo use.

## 2. Hallazgos de la auditoría

- **Separación correcta y que hay que conservar**: lógica pura en `.ts` con tests (`simulacion`, `razonamiento`,
  `asistente/*`, `zoom`, `actividad`, `formatoUnidad`), UI en `.tsx`, y datos solo a través de `src/api/` y del
  simulador.
- **Colores fijos fuera de los tokens**: unos 80 literales hexadecimales en `nodos.ts`, `GrafoOrganizacion.tsx`,
  `Lienzo.tsx`, `formatoUnidad.ts`, `PaginaSituacion.tsx`, `PanelAsistente.tsx`, `PaginaProximamente.tsx`,
  `graficos/comun.ts` y las clases `.fondo-marea`/`.orbita` de `globales.css`. Hay que convertirlos en tokens para
  que un tema oscuro funcione sin cambiar componentes.
- **Ya preparado**: `@custom-variant dark (&:is(.dark *))` en `globales.css`, tokens mapeados a shadcn/ui y
  Recharts coloreado con `var(--chart-*)`.
- **Cifra que puede leerse mal**: la tarjeta «Reducción de alertas 99,1 %» de Situación no dice que solo vale en el
  alcance de P1 y que no se puede comparar con el 88,3 % de la línea base. Hay que añadirlo.
- **Texto desfasado**: el aviso de datos simulados habla de cifras «bitácora», pero los chips dicen «documentado».
- **Seguridad**: no hay `dangerouslySetInnerHTML`. `localStorage` va envuelto en try/catch. `?org` y `?cuadro` se
  validan contra listas cerradas. `?t` usa `Number()` + `isFinite`, pero no tiene límite superior. Los dos
  enlaces externos llevan `rel="noreferrer"` y no `noopener noreferrer`.
- **Accesibilidad**: enlace «Saltar al contenido», foco visible y `prefers-reduced-motion` ya están bien. El grafo
  de la demo se maneja con arrastre y botones.
- **Capa ATT&CK observada**: se generó el 28-07 sobre `tfg.alerts` de entonces (apt29 day1 + el atómico, 616
  pares alerta-técnica), **antes** de cargar las campañas LSASS y antes de la recarga del 14-09. Además, sus dos
  técnicas más frecuentes son `T1685` y `T1685.001`, que la bitácora tiene **pendientes de verificar** en
  attack.mitre.org desde el 27-07. La matriz tiene que decir ambas cosas.

## 3. Matriz de mejoras

Leyenda de esfuerzo: S (< ½ día), M (½–1 día), L (> 1 día).

| # | Punto (§ del encargo) | Estado | Prioridad | Esfuerzo | Datos de los que depende |
|---|---|---|---|---|---|
| T | Botón de modo claro / oscuro (§6) | **nuevo** | 1 | M | Ninguno. Tokens en `globales.css` |
| B | Explorador del grafo de ataque con React Flow (§5.B) | **nuevo** | 1 | L | `corpus.ts`: `MAPA_IP`, `P2`, `CAMPANAS`, bloque de P1 (escenario §4, se añade) |
| C | Línea temporal de APT29 day1 (§5.C) | **nuevo** (la `Cronologia.tsx` de la demo se queda) | 2 | M | `CRONOLOGIA_DAY1`, bloque de P1, horas de P2 (bitácora 11-09 y 14-09) |
| D | Explorador de incidentes `/incidentes` (§5.D) | **nuevo** (hoy «próximamente») | 2 | M | `CAMPANAS` (12) + confianzas documentadas (bitácora 31-07) |
| A | Situación como panel SOC `/` (§5.A) | **mejorar** | 3 | M | `corpus.ts`. El estado del sistema es ilustrativo |
| E | Asistente: hechos / inferencias / recomendaciones (§5.E) | **mejorar** `PanelAsistente.tsx` | 3 | M | Demo (simulación). Niveles de autonomía solo como interfaz de demo |
| F | Evaluación y métricas `/evaluacion` (§5.F) | **nuevo** | 4 | M | `ml/anomaly/resultados.json` (copiado) + `corpus.ts` |
| G | Matriz ATT&CK `/attack` (§5.G) | **nuevo** (hoy «próximamente») | 4 | M | `eval/attack-coverage/*.json` (copiados) |
| R | Carga diferida por ruta + chunk `@xyflow` (§7) | **mejorar** `rutas.tsx`, `vite.config.ts` | 2 | S | — |
| S | Skill del proyecto (§8) | **nuevo** | 5 | S | — |
| P | Playwright e2e + capturas en los dos temas (§9) | **nuevo** | 5 | M | Chromium 1243 ya en `~/.cache/ms-playwright` (coincide con `@playwright/test` 1.63.0) |
| X | Tipos del contrato futuro `src/api/tipos.ts` (§5) | **nuevo** | 3 | S | Esquemas reales: `build_alert()`, `p1_05_emision.sql`, `p2_lateral_movement.sql` |
| — | Autenticación/JWT, multi-tenancy (F8.2) | **bloqueado por backend** | — | — | API F6.3 |
| — | WebSocket `/ws/alerts`, API REST (F6.3) | **bloqueado por backend** | — | — | API F6.3 |
| — | Puntuación de prioridad de incidentes reales (Pilar C) | **bloqueado por backend** | — | — | F6. Solo existe en la demo |
| — | Alertas una a una, las 17 aristas de P2 con su hora, confianza de las campañas P1 de apt29 | **bloqueado por datos** | — | — | Exportación de ClickHouse (§5). Mientras tanto se usa lo documentado, agregado |

## 4. Decisiones de diseño previas a la implementación

1. **Tema**: clase `.dark` en `<html>` (la variante de Tailwind ya existe), tokens redefinidos bajo `.dark`,
   preferencia en `localStorage` (`tfg-tema`), script en línea en `index.html` para aplicarlo antes del primer
   pintado. Claro por defecto: es la paleta gris vigente (bitácora §2).
2. **Modo oscuro**: pizarra profunda, sin negro puro ni neón. Acento azul apagado. Severidad con más luminancia
   para el fondo oscuro. Inspirado en la propuesta «Minimalism & Swiss Style» de ui-ux-pro-max (fondo de la gama
   `#0F172A`, tarjeta `#192134`, texto suave `#94A3B8`). Se descartan su verde de CTA y Fira desde Google Fonts.
3. **Contraste comprobado por test**: un test lee `globales.css`, resuelve los tokens de los dos temas y comprueba
   los pares texto/fondo (≥ 4,5:1) y gráfico/fondo (≥ 3:1).
4. **Fuente monoespaciada**: pila del sistema (`ui-monospace`, `SF Mono`, `Cascadia Code`, `Consolas`…). Sin
   dependencia nueva y sin peticiones a terceros.
5. **Grafo de ataque**: posiciones fijas (unos 20 nodos, sin motor de disposición que añada dependencias). Hosts
   como nodos padre que contienen sus procesos y alertas. Tres fundamentos con trazo, icono y texto distintos:
   observado (continuo), inferido (discontinuo largo), hipótesis (punteado). React Flow no editable.
6. **Nada inventado**: lo que no está documentado se muestra como «no documentado» y se deja anotada la consulta de
   ClickHouse que lo exportaría.

## 5. Datos que harían falta de ClickHouse (los ejecuta Javier)

Ver la entrega final y `frontend/README.md` §Datos: exportación de las alertas de apt29 day1, de las 17 aristas de
P2, de `tfg.p1_campanas` y `tfg.p2_campanas`, y regeneración de la capa ATT&CK observada sobre el corpus actual.

## 6. Resultado (21-10-2026)

| # | Estado final |
|---|---|
| T | Hecho. Claro gris por defecto + oscuro opcional; script anti-parpadeo; contraste AA de los dos temas medido por `src/estilos/contraste.test.ts` (el claro original incumplía en varios pares y se corrigió sin cambiar el tono) |
| B | Hecho (`/ataque`). React Flow con 17 nodos y 16 relaciones documentadas, fundamento observado / inferido / hipótesis, filtros, secuencia de 8 pasos, detalle, teclado, minimapa y lista accesible |
| C | Hecho (`/cronologia`). 21 filas por táctica + bloque de P1 + hitos de P2 + campañas, con su resolución real |
| D | Hecho (`/incidentes`). 12 campañas, búsqueda, filtros, orden, detalle; sin prioridad inventada |
| A | Hecho. Accesos, reparto táctica × host, estado del pipeline (en vivo: ilustrativo) y advertencia del 0,991 |
| E | Hecho. Hechos / inferencias / recomendaciones / redacción; niveles de autonomía de demo con confirmación |
| F | Hecho (`/evaluacion`). Solo lo medido; lo de F7, pendiente sin números |
| G | Hecho (`/attack`). Capas Navigator reales por familia de técnica (las capas no traen la táctica) |
| R | Hecho. Portada de 979 a 484 kB de JS; React Flow (163 kB) solo en `/ataque`; grupo `utilidades` para que `clsx` no arrastre Recharts |
| S | Hecho (`.claude/skills/cybersecurity-dashboard/SKILL.md`) |
| P | Hecho. 19 pruebas de Playwright en 1280 / 1440 / 1920 px y capturas de las diez pantallas en los dos temas |
| X | Hecho (`src/api/tipos.ts`) |

Verificación final: 274 tests en 25 ficheros, ESLint y build limpios. Pendiente lo bloqueado por backend o por datos
(§3) y las consultas de exportación de ClickHouse de `README.md` §Datos.

## 7. Ronda 2 (21-10-2026): datos nuevos, diseño, legibilidad, animaciones y asistente

| # | Mejora | Estado |
|---|---|---|
| §1 | Datos de `eval/portal/` sincronizados y sus consecuencias (T1685 verificado, confianzas P1, 47 frente a 34 con fecha) | Hecho |
| 1 | `/respuesta`: asistente que propone y no ejecuta, procedencia por bloque | Hecho |
| — | `/copiloto` con RAG preparado (proveedor local + LLM declarado) y `docs/copiloto-rag.md` | Hecho |
| 2 | Animaciones con significado (reproducir el ataque, replay, entradas breves), con movimiento reducido | Hecho |
| 3 | Grafo de ataque en carriles por host, zoom semántico, 17 aristas reales | Hecho |
| 4 | Portada SOC en 1440 × 900 y `/proyecto` | Hecho |
| 5 | Línea temporal real con carriles, brush y lista sincronizada | Hecho |
| 6 | Incidentes maestro-detalle, sin columna de prioridad, LSASS agrupadas | Hecho |
| 7 | Ctrl/Cmd + K, barra superior, barra lateral reagrupada, contexto conservado | Hecho |
| 8 | Matriz ATT&CK por táctica (catálogo v19) | Hecho |
| 9 | Densidad de Observabilidad (compactación, chips, bandas de umbral si existen) | Hecho; ninguna serie de Grafana define umbrales |
| 10 | Menos texto: una frase + «Cómo leer esta página» | Hecho |

Verificación: 368 tests unitarios en 34 ficheros, ESLint y build limpios; Playwright 37 escenarios en verde (2 saltos
previstos) en 1280, 1440 y 1920 px; capturas en los dos temas revisadas.

## 8. Ronda 3 (21-10-2026): fallos visuales, portada ligera, Copiloto en panel lateral y modo presentación

El agente se quedó sin uso a mitad de la ronda (con la batería de tests fallando por *timeouts*: corría a la vez que
Playwright; sin carga, los 383 pasaban en 5 s). La terminó otra sesión.

| Bloque | Mejora | Estado |
|---|---|---|
| §1 | Tabla de incidentes que no se corta, eje de la línea temporal sin solapes, grafo de ataque encajado con los nombres de carril visibles; con pruebas que lo habrían detectado | Hecho. Además: escala del grafo compactada (34 px/min) |
| §1 | Con el Copiloto abierto a 1440 px el contenido se quedaba en ~800 px y las tablas volvían a cortarse | Hecho: el panel solo empuja si deja ≥ 1.000 px; si no, se superpone. Barra superior con consultas de contenedor |
| §2 | Agregados de la portada calculados al sincronizar | Hecho: portada de 816 a 462 kB de JS |
| §3 | Copiloto en panel lateral (botón, Ctrl/Cmd + I, Ctrl+K), contexto de página, tiempo real de la demo, 4 detectores de señales débiles, avisos «Conviene vigilar» | Hecho; `/copiloto` queda como vista a pantalla completa |
| §4 | Modo presentación de 8 pasos (Ctrl+K o `?presentacion=1`), cifras del guion comprobadas por test | Hecho |

Verificación: 396 tests unitarios en 37 ficheros, ESLint y build limpios; Playwright 52 escenarios en verde (2 saltos
previstos) en 1280, 1440 y 1920 px.

### Pendiente anotado: mapa mundial de alertas (idea del 21-10-2026)

Un mapa del mundo que muestre en tiempo real **desde dónde llegan las alertas y hacia dónde van**. Requisitos para que
sea real y no ilustrativo:

1. **IP públicas que geolocalizar.** El corpus actual solo tiene direcciones privadas de laboratorio (10.0.x.x y el
   atacante en 192.168.0.4): hoy no hay ni un origen geolocalizable. Harían falta capturas con tráfico a Internet
   (p. ej. el C2 de un escenario nuevo del laboratorio) o los IOC de red de la CTI (F4).
2. **Base GeoIP local** (p. ej. GeoLite2) consultada en el servidor, nunca desde el navegador hacia un servicio de
   terceros: las IP de un incidente son datos sensibles.
3. **Tiempo real**: el WebSocket de alertas de la API (F6.3).
4. **Honestidad del dato**: la geolocalización por IP es aproximada y los atacantes usan infraestructura intermedia
   (VPS, proxies); el mapa dice «ubicación de la IP», no «ubicación del atacante».

Mientras tanto, si se quiere para la demo, puede hacerse sobre el escenario ficticio de Helios **marcado como
ilustrativo**, con la misma interfaz que usará la versión real. Propuesta de ubicación: F8.3 (completo).
