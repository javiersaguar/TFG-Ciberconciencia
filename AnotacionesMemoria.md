24-07-2026

El particionado por hostname —que elegimos deliberadamente para garantizar el orden de eventos por máquina, requisito del CEP— tiene como efecto colateral que, con un único host, dos de las tres particiones quedan vacías. Como Flink calcula el watermark global como el mínimo de todas sus fuentes, esas particiones inactivas congelan el reloj de eventos e impiden que se emita cualquier resultado basado en tiempo. La solución es configurar table.exec.source.idle-timeout.
