# Cierre de F3: revisión manual de falsos positivos (06-11-2026)

Ejecución `SUFIJO=f3f`: corpus de F3 (9 datasets) y 101 capturas atómicas de host de OTRF.
Salen 55 campañas: 32 de P1, 7 de P2 y 16 de P3. Del corpus son las 15 de siempre.
Consultas: `detection/evaluation/f3_cierre.sql`. Verdad conocida: `verdad_datasets.csv`.

## 1. Reducción de alertas

| grupo   | alertas | evidencia | campañas | sueltas | reducción s/ evidencia | reducción global |
|---------|--------:|----------:|---------:|--------:|-----------------------:|-----------------:|
| corpus  |   1.184 |        88 |       15 |   1.096 |                  0,830 |            0,062 |
| atómico |   1.556 |       302 |       40 |   1.254 |                  0,868 |            0,168 |
| total   |   2.740 |       390 |       55 |   2.350 |                  0,859 |            0,122 |

Por patrón, la reducción sobre la evidencia es de 0,874 en P1, 0,844 en P2 y 0,862 en P3. Son entre 6,4 y 7,9 alertas por campaña.

Lectura: el CEP comprime unas 7 a 1 lo que reconoce, pero solo reconoce el 14 % de las alertas. La línea base B1 (solo Sigma) tiene reducción 0.

## 2. Matriz por dataset, antes de la revisión

| patrón | grupo   | VP | FP | FN | VN | tasa de falsas alarmas | precisión |
|--------|---------|---:|---:|---:|---:|-----------------------:|----------:|
| P1     | atómico |  9 | 12 | 10 | 70 |                  0,146 |     0,429 |
| P1     | corpus  |  9 |  0 |  0 |  0 |                      — |     1     |
| P2     | atómico |  5 |  0 | 24 | 72 |                  0     |     1     |
| P2     | corpus  |  1 |  0 |  0 |  8 |                  0     |     1     |
| P3     | atómico |  3 | 10 |  2 | 86 |                  0,104 |     0,231 |
| P3     | corpus  |  3 |  0 |  0 |  6 |                  0     |     1     |

## 3. Revisión de las 22 candidatas

Cada campaña se ha clasificado por las reglas y los procesos de su evidencia, en tres categorías:

- **V**: hay actividad de ataque real que el metadato no lista. Pasa a verdadero positivo.
- **M**: ataque real, pero el patrón no es el que pasó. Falso positivo por confusión de patrón.
- **R**: la etapa que hace disparar es ruido del sistema operativo. Falso positivo benigno.

| # | patrón | captura | evidencia determinante | cat. |
|---|--------|---------|------------------------|------|
| 1 | P1 | herpaderping_mimiexplorer (sin ficha) | HackTool - Mimikatz Execution ×2 | V |
| 2 | P1 | Empire Userland Registry Run Keys | `reg export ...\Winlogon\Notifications` y csrss/wininit → lsass | R |
| 3 | P1 | Empire Elevated WMI Eventing | csrss/wininit → lsass y proceso SYSTEM | R |
| 4 | P1 | Empire Invoke SMBExec | Suspicious SYSTEM User Process Creation ×3 (regla etiquetada T1003) | M |
| 5 | P1 | Empire Invoke PsExec | Suspicious SYSTEM User Process Creation ×2 | M |
| 6 | P1 | Covenant PowerShell Remoting | wsmprovhost → lsass ×12 | M |
| 7 | P1 | Mimikatz Netlogon (Zerologon) | mimikatz.exe ejecutado y accediendo a procesos | V |
| 8 | P1 | Empire Elevated Scheduled Tasks | **solo** csrss/wininit → lsass | R |
| 9 | P1 | PurpleSharp AD Playbook I | PurpleSharp.exe accede a procesos ×18 (credenciales, pero kerberoasting y spraying, no volcado) | M |
| 10 | P1 | PurpleSharp PE Injection | PurpleSharp.exe accede a procesos ×14 (inyección) | M |
| 11 | P1 | Process Herpaderping Mimikatz | HackTool - Mimikatz Execution ×2 | V |
| 12 | P1 | SharpView PCRE.NET | SharpView.exe accede a procesos ×23 (descubrimiento) | M |
| 13 | P3 | Empire PSInject | conexiones de notepad inyectado ×48 y PowerShell del agente | V (dudosa) |
| 14 | P3 | Empire Invoke SMBExec | instalación de servicio como «persistencia» y SYSTEM como «escalada» | M |
| 15 | P3 | Empire Invoke PsExec | ídem; P2 no dispara aquí | M |
| 16 | P3 | Invoke BypassUAC FodHelper | una sola técnica (T1548.002) repartida en tres etiquetas tácticas | M |
| 17 | P3 | Covenant DCOM Iertutil DLL Hijacking | movimiento lateral (P2 sí dispara) | M |
| 18 | P3 | WMIC Remote XSL | escalada solo por csrss con Uncommon Process Access Rights | R |
| 19 | P3 | Control Panel Execution | escalada solo por cmd/csrss con Uncommon Process Access Rights | R |
| 20 | P3 | CMSTP Proxy Execution | bypass de UAC con CMSTP (escalada real) y Local Accounts Discovery | V |
| 21 | P3 | Mshta HTA | persistencia real, escalada por cmd/csrss con Uncommon Process Access Rights | R |
| 22 | P3 | Exchange ProxyLogon | proceso SYSTEM tras la RCE y Local Accounts Discovery | V |

**Resultado:** 6 V, 10 M y 6 R.

Aparece además un falso positivo dentro del corpus que la evaluación por dataset no ve. Una de las 11 campañas de P1 de APT29 (`5e436f22…`) son solo 2 alertas: csrss y wininit abriendo lsass con `0x1fffff` en el mismo milisegundo, al arrancar lsass.

## 4. Cifras tras la revisión

| patrón | grupo   | VP | FP (M + R) | FN | VN | tasa de falsas alarmas | precisión | exhaustividad |
|--------|---------|---:|-----------:|---:|---:|-----------------------:|----------:|--------------:|
| P1     | atómico | 12 | 9 (6 + 3)  | 10 | 70 |                  0,114 |     0,571 |         0,545 |
| P2     | atómico |  5 | 0          | 24 | 72 |                  0     |     1     |         0,172 |
| P3     | atómico |  6 | 7 (4 + 3)  |  2 | 86 |                  0,075 |     0,462 |         0,750 |

**A nivel de campaña:**
- Hay 17 falsas de 55: 10 de confusión de patrón y 7 de ruido, contando la de APT29. La precisión queda en 0,69.
- Las de ruido benigno son 7 de 55 (12,7 %).

## 5. Causas

1. *Potential Credential Dumping Activity Via LSASS* salta cuando csrss.exe o wininit.exe abren lsass al arrancar. Está detrás de las campañas R de P1 y de la de APT29.
2. *Uncommon Process Access Rights For Target Image* salta con csrss.exe y cmd.exe. Está etiquetada como inyección (T1055.011), así que fabrica la etapa de «escalada» de P3.
3. *Suspicious SYSTEM User Process Creation* lleva las etiquetas T1003 y T1134. Por eso SMBExec y PsExec se leen como robo de credenciales (P1) y como escalada (P3).
4. *HackTool - Generic Process Access* reconoce la herramienta, no la intención. PurpleSharp y SharpView caen en P1.

## 6. Falsos negativos

- **P2 (24):**
  - En 18 capturas las alertas caen en un solo equipo, o no hay ninguna (6 casos).
  - Una captura atómica suele registrar solo el lado del destino, y P2 necesita ver origen y destino.
  - Es un límite del conjunto de evaluación, no solo del patrón.
- **P1 (10):** sobre todo DCSync y Mimikatz en memoria con Empire (`Invoke-Mimikatz`). Ahí no hay mimikatz.exe y apenas acceso a lsass visible desde Sysmon; una de ellas no tiene ninguna alerta.
- **P3 (2):** IKEEXT DLL Hijack y Remote Scheduled Task Modification.

## 7. Límites de la medida

- **No es una tasa sobre actividad benigna.** Las capturas atómicas son todas ataques, así que un FP aquí significa sobre todo «patrón equivocado sobre actividad maliciosa». La tasa sobre actividad benigna solo puede medirse con tráfico limpio; queda para F7 o FA.
- **La revisión es manual y la ha hecho el propio autor.** Las categorías y la evidencia de cada una están en la tabla para que puedan auditarse.
- **La latencia de detección no se mide aquí.** La reproducción va acelerada; se mide en F7.
