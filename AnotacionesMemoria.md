24-07-2026

El particionado por hostname —que elegimos deliberadamente para garantizar el orden de eventos por máquina, requisito del CEP— tiene como efecto colateral que, con un único host, dos de las tres particiones quedan vacías. Como Flink calcula el watermark global como el mínimo de todas sus fuentes, esas particiones inactivas congelan el reloj de eventos e impiden que se emita cualquier resultado basado en tiempo. La solución es configurar table.exec.source.idle-timeout.


25-07-2026

Una nota importante de arquitectura, para ser honesto contigo: este job usa confluent-kafka directamente, no PyFlink. Es la opción C que te planteé antes (normalizar en un servicio, correlacionar en Flink). Lo hago así a propósito por dos razones: te da resultado funcionando ya, y la lógica de mapeo (pipeline/normalize/) es idéntica en ambos casos — así que envolverla luego en PyFlink es trivial. Lo que ganamos ahora es velocidad; lo que dejamos pendiente es el checkpointing de Flink en esta etapa. Cuando lleguemos a F2/F3, Flink entra de lleno para Sigma y CEP, que es donde su estado sí es imprescindible.

