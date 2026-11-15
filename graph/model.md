# Modelo del grafo (Pilar B)

Fecha: 15-11-2026. Parte del plan revisado de F5 (ROADMAP).

El grafo vive en Neo4j y tiene cuatro capas, que se distinguen por la propiedad `origen` de cada nodo
y de cada relación:

| Capa | `origen` | De dónde sale | Quién la carga |
|---|---|---|---|
| Conocimiento | — (nodos `:StixObject`) | ATT&CK v19.2, ThreatFox y perfiles de ML-2 | `cti/stix_loader` (F4) |
| Inventario observado | `observado` o `inferido` | Los eventos normalizados (`tfg.events`) y las campañas del Pilar A | `graph/inventory` |
| Escenario sintético | `sintetico` | Lo que los datos no traen: activo crítico y vulnerabilidades | `graph/seed` |
| Rutas derivadas | `derivado` | Lo que concluye el razonador Datalog a partir de las otras capas | `graph/datalog` |

- **`observado`**: está tal cual en un evento (una conexión, una sesión).
- **`inferido`**: sale de lo observado con una regla escrita aquí (la IP de un equipo, su subred, su papel).
- **`sintetico`**: lo ponemos nosotros y se declara como tal. Ninguna regla de razonamiento debe
  depender **solo** de datos sintéticos sin decirlo en su justificación.

## Inventario de la materia prima (15-11-2026)

Antes de diseñar se miró qué hay de verdad en los eventos de APT29:

- **4 equipos** en los dos días: SCRANTON (10.0.1.4), UTICA (10.0.1.5), NASHUA (10.0.1.6) y NEWYORK
  (10.0.0.4, controlador de dominio). Dos subredes: 10.0.0.x y 10.0.1.x.
- **Equipos que se ven pero no se monitorizan:** 10.0.1.10 (habla con el controlador de dominio),
  192.168.0.4 y 192.168.0.5 (infraestructura del atacante) y 172.18.39.2 (origen de las sesiones RDP).
- **Usuarios con sesión** (Security 4624): pbeesly el día 1; dschrute, kmalone y mscott el día 2.
  kmalone tiene RID 500, la cuenta de administrador integrada del dominio.
- **Privilegios** (Security 4672 con `SeDebugPrivilege`): quién entra con un testigo de administrador y dónde.
- **Conexiones** (Sysmon 3): Kerberos, LDAP, SMB, RPC y DNS hacia el controlador; WinRM, SMB y RPC
  entre puestos durante el ataque; HTTPS hacia el atacante.
- **10 campañas v2** del Pilar A (4 el día 1 y 6 el día 2).

**Los dos días son dos montajes distintos del mismo laboratorio:** mismos nombres e IP, pero el SID
del dominio cambia y los usuarios activos también. Por eso **cada día es un escenario propio**
(`apt29-day1`, `apt29-day2`), y los nodos del inventario llevan el escenario en su identificador. La
consecuencia útil es que las reglas se diseñan con el día 1 y se validan con el día 2.

## Nodos del inventario

Todos llevan la etiqueta común `:TfgObject` (restricción de unicidad sobre `id`) y las propiedades
`escenario` y `origen`.

| Etiqueta | `id` | Propiedades | Origen |
|---|---|---|---|
| `:Host` | `<esc>/host/<NOMBRE>` o `<esc>/host/<ip>` | `name`, `fqdn`, `ips[]`, `monitored`, `role` | nombre e IP observados; `role` inferido |
| `:Zone` | `<esc>/zone/<cidr>` | `cidr`, `kind` (`interna`, `externa`, `internet`) | inferido |
| `:Service` | `<esc>/svc/<host>/<proto>/<puerto>` | `port`, `proto`, `name` | observado; `name` inferido del puerto |
| `:User` | `<esc>/user/<sid>` | `name`, `domain`, `sid`, `rid`, `builtin_admin` | observado; `builtin_admin` inferido (RID 500) |
| `:Campaign` | `campaign_id` del Pilar A | `pattern_id`, `title`, `first_seen`, `last_seen`, `confidence`, `severity`, `stages[]`, `techniques[]`, `evidence_count`, `version` | observado |

## Rutas derivadas

Las escribe `graph/datalog/razonar.py` con la salida de Soufflé. Todo lleva `origen: derivado`.

| Etiqueta | `id` | Propiedades |
|---|---|---|
| `:AttackPath` | `<esc>/path/<activo>/<criterio>` | `asset`, `goal`, `criticality`, `criteria[]`, `steps`, `confirmed_steps`, `hypothetical_steps`, `uses_synthetic`, `uses_inferred`, `rules[]`, `hosts[]`, `narrative`, `steps_json`, `rules_sha256` |

| Relación | Entre | Propiedades |
|---|---|---|
| `REACHES` | `AttackPath → Asset` | — |
| `TRAVERSES` | `AttackPath → Host` | `order` |
| `CONFIRMED_BY` | `AttackPath → Campaign` | — |

Una ruta es una **prueba**: el conjunto de aplicaciones de regla que lleva del estado `adversario` al
objetivo, con todas las precondiciones demostradas. `steps_json` guarda la traza completa (regla,
detalle, precondiciones, en qué se apoya y qué evidencia lo confirma), y `rules_sha256` la versión
exacta de las reglas que la derivó. Por activo se guardan hasta dos rutas: la más respaldada por
evidencia y la más corta.

## Capa sintética

La declara `graph/seed/apt29.json` y la construye `graph/seed/construir.py`. Todo lleva
`origen: sintetico`.

| Etiqueta | `id` | Propiedades |
|---|---|---|
| `:Vulnerability` | `<esc>/vuln/<CVE>` | `cve`, `name`, `cvss`, `vector`, `access` (`remoto`, `local`), `effect`, `epss`, `epss_percentile`, `kev`, `kev_ransomware`, `published`, `sources[]` |
| `:Asset` | `<esc>/asset/<clave>` | `name`, `criticality` (1–10), `reason` |
| `:Adversary` | `<esc>/adversary/externo` | `name`, `reason` |

| Relación | Entre | Propiedades |
|---|---|---|
| `HAS_VULN` | `Host → Vulnerability` | `proto`, `port` (solo las remotas), `reason` |
| `HOSTS` | `Host → Asset` | — |
| `LOCATED_AT` | `Adversary → Host` | — |

**Lo que es real dentro de lo sintético:** las cifras de cada vulnerabilidad. El CVSS es el de NVD,
el EPSS el de FIRST y la marca de explotada la del catálogo de CISA, consultados el 15-11-2026. Lo
sintético es decir que ese equipo la tiene.

**Regla de asignación:** una vulnerabilidad de acceso remoto solo se asigna si su servicio se
observó en ese escenario. No se inventa un servicio para colgarle una vulnerabilidad. Por eso
SMBGhost está en NASHUA el día 1 (alguien usó su SMB) y se omite el día 2.

| Vulnerabilidad | Equipo | CVSS | EPSS | Efecto | Escenarios |
|---|---|---|---|---|---|
| CVE-2020-1472 (Zerologon) | NEWYORK, `tcp/135` | 10,0 | 0,994 | control del dominio | los dos |
| CVE-2020-0796 (SMBGhost) | NASHUA, `tcp/445` | 10,0 | 0,998 | ejecución como SYSTEM | día 1 |
| CVE-2020-0787 (BITS) | UTICA, local | 7,8 | 0,425 | de usuario a SYSTEM | los dos |

Activos: el directorio activo del dominio en NEWYORK (criticidad 10) y los documentos de usuario de
cada puesto (5). Adversario: en 192.168.0.4 y 192.168.0.5, la infraestructura de mando y control
según el plan de emulación.

## Relaciones del inventario

| Relación | Entre | Propiedades | Fuente |
|---|---|---|---|
| `IN_ZONE` | `Host → Zone` | — | inferido de la IP |
| `RUNS` | `Host → Service` | — | Sysmon 3 (alguien se conectó a ese puerto) |
| `CONNECTS_TO` | `Host → Host` | `port`, `proto`, `service`, `events`, `peers`, `recorders[]`, `first_seen`, `last_seen`, `processes[]` | Sysmon 3 |
| `LOGGED_ON` | `User → Host` | `logon_types[]`, `events`, `from_ips[]`, `first_seen`, `last_seen` | Security 4624 |
| `ADMIN_OF` | `User → Host` | `events`, `privileges[]`, `first_seen`, `last_seen` | Security 4672 con `SeDebugPrivilege` |
| `OBSERVED_ON` | `Campaign → Host` | `role` (`host`, `origen`, `destino`) | campaña del Pilar A |
| `EVIDENCES` | `Campaign → Technique` | — | técnicas de la evidencia, enlazadas con ATT&CK por `external_id` |

`EVIDENCES` es el puente entre lo detectado y el conocimiento: de la técnica se llega a la táctica,
a los grupos que la usan y a los perfiles de ML-2.

## Reglas de inferencia (deterministas)

1. **IP de un equipo:** la IPv4 que más usa como origen en las conexiones que él inicia (Sysmon 3).
2. **Equipos no monitorizados:** cualquier otra IPv4 privada que aparezca en una conexión, salvo
   difusión (`.255`), bucle local, multidifusión y enlace local. Solo se sabe de ellos lo que ven los
   demás. **Las direcciones públicas se agrupan en un único nodo `internet`** (79 el día 1 y 145 el
   día 2: resolución de DNS y servicios de Microsoft), con sus conexiones sumadas por puerto y el
   número de pares distintos en `peers`.
3. **Zona:** la `/24` de la IP si es de la red interna (`10.0.0.0/8`); `externa` si es privada pero
   de otra red (la del atacante, el origen del RDP); `internet` si es pública. El tamaño `/24` es
   una suposición: los eventos no traen máscaras.
4. **Servicio:** un puerto de destino por debajo de 49152 al que alguien se conectó. Los puertos
   efímeros se descartan porque Sysmon no fija bien el sentido de las respuestas UDP.
5. **Papel:** `domain_controller` si es de la red interna y atiende Kerberos (88) y LDAP (389);
   `external` si está en la zona externa; `internet` para el nodo agrupado; si no, `workstation`.
6. **Administrador:** un 4672 cuyos privilegios incluyen `SeDebugPrivilege`. Es el testigo de un
   administrador local o de dominio en ese equipo, en ese inicio de sesión.
7. **Usuarios:** solo cuentas de dominio o locales con SID `S-1-5-21-…`, sin las cuentas de equipo
   (`NOMBRE$`) ni las de servicio integradas.

## Idempotencia

`graph/cargar.py` carga las dos capas propias y fusiona por identificador (`MERGE`), y los identificadores son deterministas:
recargar no duplica. Después borra lo que quedó obsoleto, es decir, los nodos y relaciones de ese
escenario y de esa capa que la carga actual ya no produce. No toca `:StixObject` ni la otra capa.

## Lo que el inventario no puede dar

- **Vulnerabilidades:** no hay escáner en el conjunto. Van en la capa sintética.
- **Pertenencia a grupos y permisos de Active Directory:** solo se ve quién entró como administrador,
  no quién podría hacerlo.
- **Reglas de cortafuegos:** una conexión observada prueba que el camino existe; su ausencia no
  prueba que esté cerrado.
- **Criticidad de los activos:** se declara en la capa sintética, salvo el controlador de dominio,
  cuyo papel sí se infiere.
