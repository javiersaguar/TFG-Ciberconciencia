24-07-2026

El particionado por hostname —que elegimos deliberadamente para garantizar el orden de eventos por máquina, requisito del CEP— tiene como efecto colateral que, con un único host, dos de las tres particiones quedan vacías. Como Flink calcula el watermark global como el mínimo de todas sus fuentes, esas particiones inactivas congelan el reloj de eventos e impiden que se emita cualquier resultado basado en tiempo. La solución es configurar table.exec.source.idle-timeout.


25-07-2026

Una nota importante de arquitectura, para ser honesto contigo: este job usa confluent-kafka directamente, no PyFlink. Es la opción C que te planteé antes (normalizar en un servicio, correlacionar en Flink). Lo hago así a propósito por dos razones: te da resultado funcionando ya, y la lógica de mapeo (pipeline/normalize/) es idéntica en ambos casos — así que envolverla luego en PyFlink es trivial. Lo que ganamos ahora es velocidad; lo que dejamos pendiente es el checkpointing de Flink en esta etapa. Cuando lleguemos a F2/F3, Flink entra de lleno para Sigma y CEP, que es donde su estado sí es imprescindible.

25-07-2026

ORDER BY (device_hostname, time) — la clave de ordenación. El 90 % de tus consultas serán "qué pasó en este host en esta ventana temporal", y esto las hace casi instantáneas.
PARTITION BY toYYYYMM(time) — particiona por mes; útil para gestionar y purgar datos por rangos.
LowCardinality(String) — para campos con pocos valores distintos (hostnames, nombres de clase). ClickHouse los comprime muchísimo.
CODEC(Delta, ZSTD) en time — los timestamps consecutivos se parecen; guardar solo la diferencia comprime muy bien.
Las signal_* como columnas propias — así podrás hacer WHERE signal_lsass_access directamente, sin tocar el JSON. Es lo que hará tus consultas de detección triviales.
raw conserva el evento OCSF íntegro por si necesitas un campo que no promocionaste a columna.


25-07-2026

ClickHouse en contenedor no acepta conexiones desde el host aunque el puerto esté publicado: por defecto solo escucha en la interfaz de loopback interna. El síntoma engaña, porque `wget` funciona dentro del contenedor con `localhost` pero falla contra su propia IP de red Docker, y desde fuera da "connection reset by peer" (no "connection refused"), lo que sugiere erróneamente un problema de red o de proxy de puertos. La solución es declarar `<listen_host>0.0.0.0</listen_host>` en la configuración del servidor.


25-07-2026

Sincronización temporal entre fuentes de telemetría. Sysmon y el canal Security de Windows exponen campos de tiempo distintos: Sysmon incluye `UtcTime` además de `TimeCreated`, mientras que Security solo aporta `TimeCreated`. Priorizar `UtcTime` cuando existe introduce un desfase entre canales (16 horas en los datasets utilizados), que reordena los eventos de forma incoherente y rompería la correlación multi-etapa: la última etapa del ataque aparecía como la primera. La normalización debe apoyarse en el campo común y coherente entre fuentes (`TimeCreated`), no en el aparentemente más preciso. El error es silencioso —no produce ningún fallo ni rechazo— y solo se detecta al inspeccionar la secuencia reconstruida.