# Contexto para agentes de IA

Repositorio de **código** del TFG *Plataforma de conciencia cibersituacional*
(detección de ataques multi-etapa, grafo de ataque razonado, priorización explicable).

La memoria, la bitácora y el registro de decisiones viven en un repositorio
aparte: `tfg-memoria`.

## Reglas estrictas

**Autoría.** Todos los commits son exclusivamente de Javier Saguar
<javisaguarantona@gmail.com>. **Ningún agente de IA debe figurar como autor ni
co-autor**: prohibido añadir `Co-Authored-By`, "Generated with", "Assisted by" o
cualquier atribución similar en mensajes de commit, PRs o código. Ninguna IA debe
ejecutar `git commit` ni `git push` de forma autónoma: los comandos se proponen y
los ejecuta Javier. Guardián técnico: hook `.githooks/commit-msg`
(activar tras clonar con `git config core.hooksPath .githooks`).

**Idioma.** Documentación y comentarios en español; nombres de código en inglés.

## Decisiones de arquitectura vigentes

| Área | Decisión |
|---|---|
| Bus de eventos | Redpanda (compatible con la API de Kafka) |
| Streaming + CEP | Apache Flink 2.2.1 + SQL `MATCH_RECOGNIZE` (no la Pattern API de Java) |
| Esquema canónico | OCSF, con extensión propia `tfg.*` y campo `unmapped` |
| Almacén analítico | ClickHouse |
| Detección | Sigma + pySigma, con pipeline OCSF propia (`detection/pipelines/ocsf-tfg.yml`) |
| Grafo | Neo4j + GDS (property graph; **RDF/SPARQL descartado**) |
| Razonamiento | Datalog estilo MulVAL sobre Soufflé |
| Orquestación | Dagster · **API**: FastAPI |
| Uso de ML | Solo inferencia y ajuste fino ligero. **No** entrenar modelos grandes |
| Infra | Contenedores en un único host (WSL2), perfiles por fase |

No revertir ninguna de estas decisiones sin motivo explícito y sin avisar.

## Convenciones

- Rutas: el repo vive en `~/proyectos/tfg-ciberconciencia` (disco Linux, no `/mnt/c`).
- Entorno: `.venv` (Python 3.14) para el pipeline; `.venv-flink` (Python 3.12) para PyFlink.
- Topics: prefijo por etapa `raw.` → `norm.` → `det.` → `enr.`; clave de partición
  por *host* para garantizar el orden de eventos por máquina.
- Nada de descartes silenciosos: todo evento no procesable va a su `dlq.*` con el motivo.
- `data/` nunca se versiona (datasets y reglas se clonan aparte).
- Commits en formato *conventional*: `feat(ambito): ...`, `fix(...)`, `docs(...)`.