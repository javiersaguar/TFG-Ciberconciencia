# Portal web (F8) — base

Base del frontend de la plataforma: el shell, el **grafo del pipeline**, la **observabilidad** con los cuatro cuadros de
Grafana redibujados, una portada de situación y una **demo de conciencia situacional** con ataques simulados y un
asistente de respuesta. Es un extra del TFG, no parte de su núcleo: sirve para enseñar hacia dónde va. **No está conectado a ningún backend**: la API (F6.3) aún no
existe, así que todos los datos salen de `src/api/simulado/` y cada cifra dice si está documentada o es ilustrativa.

Parte del portal de PIDS (`PIDS-Proyecto1/parte4_frontend/web`): mismo stack, mismo lienzo del grafo, mismo
redibujado de los cuadros de Grafana en la rejilla de 24 columnas. Lo que cambia está en [Diseño](#diseño) y
[Datos](#datos).

| Sección | Ruta | Qué hace |
|---|---|---|
| Situación | `/` | Cifras del corpus de F3 (530.401 eventos, 1.184 alertas, 12 campañas, 99,1 % de reducción), las doce campañas del oráculo en batch y el avance de las fases |
| Conciencia situacional | `/conciencia?org=<id>&t=<s>` | **Demo** de los Pilares B y C: la organización como grafo (zonas de red, áreas de negocio, joyas de la corona), un botón para **simular un ciberataque** que se ve avanzar paso a paso, la ruta más probable hacia la siguiente joya y un **asistente de respuesta** que en cada instante dice qué hacer ya. Aplicar sus acciones cambia el curso del ataque. Varias organizaciones, cada una con su simulación en paralelo |
| Grafo del pipeline | `/grafo` | Las 14 piezas del pipeline con su ficha (qué es, qué hace, cómo se conecta, ficheros del repo). Las de fases futuras (CTI, grafo de ataque, priorización, API) van en discontinua con su fase. «Simular replay de apt29 day1» ilumina los tramos por los que pasa el dato hasta los totales medidos. Zoom con rueda, panel táctil, arrastre o botones |
| Observabilidad | `/observabilidad?cuadro=<uid>` | Los cuatro cuadros de `infra/grafana/dashboards` (salud del pipeline, seguridad, cobertura y calidad, movimiento lateral) con la misma disposición que en Grafana. El cuadro abierto va en la URL para poder enlazarlo |
| Incidentes · Matriz ATT&CK | `/incidentes` · `/attack` | Páginas «próximamente»: en qué fase se construyen, qué enseñarán y de dónde saldrán sus datos. Fijan la navegación final desde la base |

## Puesta en marcha

```bash
cd frontend
npm ci              # dependencias exactas del package-lock.json
npm run dev         # http://localhost:5173
```

No hace falta levantar ningún servicio: el portal funciona sin docker compose. Los enlaces de las fichas del grafo
(Redpanda Console, Flink, ClickHouse, Grafana, Prometheus) y «Abrir en Grafana» sí necesitan el perfil
correspondiente levantado en el mismo equipo.

```bash
npm test -- --run   # 81 tests (Vitest + Testing Library)
npm run lint        # ESLint
npm run build       # tsc + vite build → dist/
npx vite preview    # sirve dist/ en http://localhost:4173
```

## Stack

React 19 · TypeScript · Vite 8 · Tailwind 4 · shadcn/ui (Radix) · TanStack Query · Recharts · lucide-react. El grafo del
pipeline es SVG propio (curvas de Bézier, animaciones SMIL), sin librería de grafos: con 14 nodos colocados a mano no
la necesita.

**Desviación del ROADMAP F8.1** (que decía React 18 + Cytoscape.js + Zustand), decidida el 23-09-2026: se reutiliza el
stack de PIDS porque ya está probado y porque el lienzo y los paneles se trasladan casi tal cual. Cytoscape.js se deja
para el grafo de ataque de F5, que sí tendrá cientos de nodos con disposición automática. Zustand no hace falta todavía:
el estado del servidor lo lleva TanStack Query y el de la interfaz cabe en `useState` y en la URL.

## Diseño

**Tonos grises, no blancos.** El portal está pensado para un SOC, donde se mira la pantalla durante turnos largos. Las
superficies blancas y brillantes cansan la vista y además hacen que los colores de severidad destaquen menos, que es
justo lo que un analista tiene que ver primero. Por eso, frente a PIDS:

- Ningún plano grande es blanco. Fondo `#dde2e8`, tarjetas `#eceff3`, barra lateral `#e4e8ed`; el lienzo del grafo,
  con sus manchas y puntos en movimiento, está en la misma gama.
- El texto es pizarra (`#1d2632`) y no negro puro, y el suave (`#4f5b6a`) mantiene un contraste de 5,2:1 sobre las
  tarjetas: por encima del mínimo WCAG AA de 4,5:1.
- El acento es un azul apagado (`#345f9e`). El color intenso se reserva para la **escala de severidad**
  (`--sev-info` → `--sev-critica`), que es común a alertas, campañas e incidentes y no se usa para series de gráficos.
- Los tonos de los tramos del grafo y de los gráficos son de luminancia media, para que no brillen sobre el gris.

Todos los colores son tokens CSS en `src/estilos/globales.css`, mapeados a las variables de shadcn/ui y expuestos como
utilidades de Tailwind (`bg-superficie`, `text-texto-suave`, `text-sev-alta`…). Un tema oscuro completo se puede añadir
redefiniendo los tokens, sin tocar componentes.

Las animaciones (números que recorren el camino hasta su valor, paneles que entran escalonados, tramos que fluyen)
respetan `prefers-reduced-motion`.

## Datos

Hoy no hay backend. La única puerta de datos es `src/api/`: las páginas consumen hooks de TanStack Query
(`useSituacion`, `useCuadros`, `useCuadro`) y nunca el simulador directamente. Cada hook resuelve contra
`src/api/simulado/` con una latencia ficticia de 250 ms (0 en los tests), así que las páginas ya pasan por sus estados
de carga. Cuando exista la API de F6.3, cada `queryFn` pasará a ser un `fetch('/api/…')` con el mismo tipo de
respuesta (Vite ya reenvía `/api` al puerto 8000) y ninguna página cambiará.

**Procedencia de cada cifra.** Para que ninguna captura haga pasar un dato inventado por uno medido, cada panel y cada
cifra lleva un chip:

- **documentado** — la cifra está medida y escrita. Sale de `src/api/simulado/corpus.ts`, que reúne en un solo sitio
  las cifras del corpus de F3 con la referencia de dónde está cada una (entrada de la `BITACORA.md`,
  `docs/scenarios/apt29-day1.md` o fichero del repo). Los tests (`corpus.test.ts`) comprueban que cuadran entre sí igual
  que se comprobaron en la bitácora: las alertas por dataset suman 1.184, consumidos = normalizados + DLQ, etc.
- **ilustrativo** — solo las métricas de Prometheus (tráfico de Kafka, memoria y CPU de Flink, consultas y memoria de
  ClickHouse), que nunca se han guardado. Se generan con azar determinista y avanzan con el reloj para que la gráfica
  tenga forma.

Donde un cuadro de Grafana consulta algo que el corpus documentado no da (por ejemplo, «Hosts monitorizados»), el
panel se ha sustituido por uno equivalente que sí está documentado, en vez de inventar la cifra. Lo que no está
documentado se deja vacío: los eventos por campaña LSASS aparecen como «—» porque la bitácora da la lista sin decir
cuál es cuál.

El replay del grafo también es simulado: el progreso es una rampa lineal, pero los totales a los que llega son los
medidos (196.081 líneas, 194.829 eventos, 741 alertas, 3 campañas de P1 y 1 de P2).

## Conciencia situacional (demo)

Enseña cómo se vería la parte de conciencia cibersituacional cuando existan los Pilares B y C, sobre escenarios
simulados. Dos organizaciones, intercambiables desde la cabecera y cada una con su propia simulación (se puede lanzar un
ataque en una, cambiar a otra y volver; la tarjeta de cada una dice en qué estado está):

- **Helios Farmacéutica** (`?org=helios`), **ficticia**, diseñada para enseñar la esencia del TFG en un solo ataque:
  phishing → ejecución → mando y control → robo de credenciales (P1) → movimiento lateral (P2) → DCSync →
  exfiltración de fórmulas de I+D, borrado de copias, sabotaje de la planta y ransomware. Tres joyas de la corona en
  ramas distintas, y decisiones con coste de negocio real.
- **DMEVALS** (`?org=dmevals`), el dominio de **APT29 day1** ampliado con áreas de negocio y activos críticos. Los pasos
  hasta las 03:19 son los **medidos** (horas del evento, escenario §4 y bitácora) y van marcados como documentados; lo
  que sigue es una extrapolación ilustrativa de qué habría pasado sin respuesta.

`?t=<segundo>` abre la simulación en pausa en ese momento, para enseñar un instante concreto sin esperar (por ejemplo,
`/conciencia?org=helios&t=62`, justo después del DCSync).

**Todo se recalcula a partir de (organización, instante, acciones aplicadas) con funciones puras**, en
`src/paginas/conciencia/`:

| Módulo | Qué decide | Anticipa |
|---|---|---|
| `simulacion.ts` | Qué pasos ocurren y cuáles impide la respuesta (y por qué: activo aislado, cuenta bloqueada, canal cortado…). Una acción solo afecta a lo posterior | — |
| `razonamiento.ts` | La ruta más probable hacia una joya de la corona (búsqueda en anchura sobre la alcanzabilidad de red) y los activos en riesgo | Pilar B: en F5, Datalog/MulVAL con trazabilidad |
| `asistente/puntuacion.ts` | Gravedad 0–100 descompuesta en cinco factores legibles (criticidad, avance en la kill chain, cercanía a una joya, amplitud, confianza de la detección) | Pilar C (F6.1) |
| `asistente/reglas.ts` | Qué hacer ahora: acciones por fase de respuesta (NIST SP 800-61) y táctica D3FEND, priorizadas, con su evidencia y su coste de negocio | Pilar C |
| `asistente/redactor.ts` | El texto de la situación. Hoy plantillas; **aquí va el LLM** | F6 |

**Reparto de papeles entre reglas y LLM**, deliberado: las reglas **deciden** qué hacer, de forma determinista y
auditable; un LLM con RAG sobre ATT&CK, D3FEND y los playbooks solo **redactará** la explicación, con el mismo contexto
y sin poder inventar acciones ni cifras (solo inferencia, como fija `AGENTS.md`). El sitio está preparado:
`redactorLLM` existe y la interfaz ya lo muestra como «pendiente».

Los tests de esta sección comprueban, además de la lógica, la **coherencia de los escenarios**: que el atacante no se
teletransporta (todo salto sigue un enlace de red), que ningún paso se queda sin respuesta propuesta y que, con el
dominio robado, lo primero que se recomienda es expulsar al atacante (krbtgt) y no blindar activos.

## Estructura

```
frontend/
├── src/
│   ├── api/            hooks por sección (observabilidad, situacion) y fuente.ts, la única puerta de datos
│   │   └── simulado/   corpus.ts (cifras documentadas), cuadros.ts (los 4 cuadros), aleatorio.ts
│   ├── componentes/    shell (barra lateral, aviso de datos simulados), ui (shadcn), datos y graficos
│   ├── paginas/
│   │   ├── situacion/        portada
│   │   ├── conciencia/       demo: organizaciones, simulación, razonamiento, asistente
│   │   ├── grafo/            nodos.ts (piezas y aristas), Lienzo, zoom, actividad (replay simulado)
│   │   ├── observabilidad/   CuadroNativo (rejilla de 24 columnas), Paneles, formatoUnidad
│   │   └── proximamente/     secciones de fases futuras
│   ├── estilos/        globales.css: tokens del sistema de diseño
│   └── pruebas/        configuración de Vitest y utilidades de render
└── public/             favicon
```

## Pendiente

- Conectar a la API de F6.3 y quitar `src/api/simulado` (salvo `corpus.ts`, que pasará a ser el oráculo de la primera
  prueba de integración: la API debe devolver esas mismas cifras).
- F8.0: nombre y marca definitivos (el logotipo y «Ciberconciencia» son provisionales).
- F8.2 y F8.3: multi-tenancy (las organizaciones de la demo saldrán del backend filtradas por `tenant_id`), JWT, cola y
  detalle de incidentes, matriz ATT&CK, grafo de ataque real (Neo4j) con Cytoscape.js.
- Conciencia situacional: sustituir el escenario simulado por las campañas reales de `det.campaigns`, la ruta BFS por
  la de Datalog (F5) y conectar el redactor LLM (F6).
- Tema oscuro completo, si en las pruebas con uso prolongado el gris no basta.
