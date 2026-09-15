# Escenario — APT29 / MITRE Evals, día 1

**Fuente de la verdad conocida:** `data/Security-Datasets/datasets/compound/apt29/emulationplans/apt29.xlsx`,
hoja `day1` (32 filas: 28 pasos del ataque + 4 de preparación del entorno).
**Telemetría:** `SDWIN-200501225525` — 196.081 eventos, 4 hosts, 2020-05-02 02:56 → 03:23 UTC.

Este documento es la **verdad conocida de la secuencia**, no solo del conjunto de técnicas.
Es el prerrequisito de F3.2: de aquí salen las etapas de cada patrón CEP y las ventanas
temporales (`WITHIN`), medidas sobre la campaña real en lugar de fijadas a ojo.

---

## 1. Actores y máquinas

| Elemento | Valor |
|---|---|
| Víctima inicial | `SCRANTON.dmevals.local` (10.0.1.4) |
| Víctima secundaria | `NASHUA.dmevals.local` (10.0.1.6) |
| Usuario legítimo | `dmevals\pbeesly` |
| Usuario del atacante tras escalada | `admin` |
| Infraestructura del atacante | Pupy (192.168.0.4) y dos contenedores Metasploit (443 y 8443) |

`NEWYORK` y `UTICA` aparecen en la telemetría de day1 con muy pocas alertas (16 y 2): son
máquinas del dominio, no objetivos de este día. Los objetivos de day2 sí las incluyen.

---

## 2. La cadena, paso a paso

Los identificadores de técnica del plan son de **ATT&CK v5–v6 (2019-2020)** y varios están
**obsoletos**. Se traducen a la versión actual porque es la que usan las reglas Sigma: sin esa
traducción, el cruce plan ↔ alertas no cuadra. Marcados con ⚠️ los que conviene verificar en
attack.mitre.org antes de citarlos en la memoria.

| Paso | Etapa | Técnica (nombre del plan) | ID plan → ID actual | Host | Usuario |
|---|---|---|---|---|---|
| 1.A | Initial Breach | User Execution · Masquerading · Uncommonly Used Port | T1204 · T1036 · T1065 → ⚠️ T1571 | SCRANTON | pbeesly |
| 1.B | Initial Breach | Command-Line Interface · PowerShell | T1059 · T1086 → **T1059.001** | SCRANTON | admin |
| 2.A | Rapid Collection & Exfil | File/Directory Discovery · Automated Collection · Data from Local System · Data Compressed · Data Staged | T1083 · T1119 · T1005 · T1002 → **T1560** · T1074 | SCRANTON | admin |
| 2.B | Rapid Collection & Exfil | Exfiltration Over C2 Channel | T1041 | SCRANTON | admin |
| 3.A | Deploy Stealth Toolkit | Remote File Copy · Obfuscated Files | T1105 · T1027 | SCRANTON | admin |
| 3.B | Deploy Stealth Toolkit | COM Hijacking · **Bypass UAC** · Commonly Used Port | T1122 → **T1546.015** · T1088 → **T1548.002** · T1043 → ⚠️ T1571 | SCRANTON | admin |
| 3.C | Deploy Stealth Toolkit | Modify Registry (borra rastro de la escalada) | T1112 | SCRANTON | admin |
| 4.A | Defense Evasion & Discovery | PowerShell · Deobfuscate/Decode | T1086 → **T1059.001** · T1140 | SCRANTON | admin |
| 4.B | Defense Evasion & Discovery | Process Discovery · **File Deletion** | T1057 · T1107 → **T1070.004** | SCRANTON | admin |
| 4.C | Defense Evasion & Discovery | File/Dir Discovery · System Owner/User · System Info | T1083 · T1033 · T1082 | SCRANTON | admin |
| 5.A | **Persistence** | New Service | T1050 → **T1543.003** | SCRANTON | admin |
| 5.B | **Persistence** | Registry Run Keys / Startup Folder | T1060 → **T1547.001** | SCRANTON | admin |
| 6.A | **Credentials Access** | Credentials in Files · Credential Dumping · Masquerading | T1081 → **T1552.001** · T1003 · T1036 | SCRANTON | admin |
| 6.B | **Credentials Access** | Private Keys | T1145 → **T1552.004** | SCRANTON | admin |
| 6.C | **Credentials Access** | Credential Dumping (hashes) | T1003 → **T1003.001** | SCRANTON | admin |
| 7.A | Collection & Exfil | Screen Capture · Clipboard · Input Capture | T1113 · T1115 · T1056 | SCRANTON | admin |
| 7.B | Collection & Exfil | Data from Local System · Compressed · Encrypted · Exfil over C2 | T1005 · T1002/T1022 → **T1560** · T1041 | SCRANTON | admin |
| 8.A | **Lateral Movement** | Remote System Discovery · **WinRM** · Process Discovery | T1018 · T1028 → **T1021.006** · T1057 | SCRANTON → NASHUA | admin |
| 8.B | **Lateral Movement** | Software Packing (payload UPX) | T1045 → **T1027.002** | SCRANTON → NASHUA | admin |
| 8.C | **Lateral Movement** | Windows Admin Shares · Service Execution · Valid Accounts (PsExec) | T1077 → **T1021.002** · T1035 → **T1569.002** · T1078 | SCRANTON → NASHUA | admin |
| 9.A | Collection | Remote File Copy | T1105 | NASHUA | admin |
| 9.B | Collection | PowerShell · Discovery · Automated Collection · Compressed | T1086 → **T1059.001** · T1083 · T1119 · T1002 → **T1560** | NASHUA | admin |
| 9.C | Collection | File Deletion | T1107 → **T1070.004** | NASHUA | admin |
| 10.A | Persistence & Execution | Service Execution · Registry Run Keys | T1035 → **T1569.002** · T1060 → **T1547.001** | SCRANTON | pbeesly |
| 10.B | Persistence & Execution | Registry Run Keys (token robado) | T1060 → **T1547.001** · T1106 | SCRANTON | pbeesly |

En 10.A la máquina **se reinicia** y el usuario legítimo vuelve a entrar: la persistencia se
dispara sola. Es el cierre natural de la campaña y un caso interesante para el CEP, porque la
evidencia aparece separada en el tiempo del resto de la cadena.

---

## 3. Lectura para los patrones CEP

La cadena real se agrupa en cuatro bloques que se corresponden casi uno a uno con los patrones
previstos en el roadmap:

| Patrón | Pasos que lo instancian | Observaciones |
|---|---|---|
| **P1** Robo de credenciales | **6.A → 6.B → 6.C** en SCRANTON | Precursores disponibles: 3.B (escalada), 4.x (descubrimiento), 5.x (persistencia) |
| **P2** Movimiento lateral | **8.A → 8.B → 8.C**, SCRANTON → NASHUA | Descubrimiento LDAP → WinRM → carga de payload → PsExec. **Cruza hosts** |
| **P3** Descubrimiento y escalada | **3.B → 4.A/4.B/4.C → 5.A/5.B** | ⚠️ El orden real es **escalada → descubrimiento → persistencia**, no el del roadmap (descubrimiento → privilegios → persistencia). El patrón debe admitir ambos órdenes o ceñirse al observado |
| **P4** Exfiltración | **2.A → 2.B** y **7.B** | Dos instancias en el mismo día: una temprana y rápida, otra tras el robo de credenciales |

### Consecuencias de diseño para P1

1. **La etapa de "borrado de indicios" no sigue al volcado de credenciales.** El borrado de
   ficheros del plan está en 4.B (antes) y en 9.C (después, y **en otro host**). Confirma que
   esa etapa debe ser **opcional** y que no tiene sentido exigirla en la misma ventana ni en la
   misma máquina que el volcado.
2. **El robo de credenciales de apt29 no es solo LSASS.** 6.A son credenciales de navegador y
   6.B claves privadas. Anclar P1 exclusivamente en `T1003.001` cubre 6.C pero pierde 6.A y 6.B,
   que son la misma intención táctica. A valorar: ancla = `T1003.001` **o** cualquier técnica de
   la táctica `credential-access`.
3. **El enlace con P2 existe y es real.** El acceso remoto a LSASS por WinRM detectado en NASHUA
   es la costura entre 6.C (robo en SCRANTON) y 8.A (movimiento a NASHUA): las credenciales
   robadas son las que habilitan el salto. Es exactamente la correlación jerárquica de dos
   niveles que plantea F3.2.

### Consecuencias de diseño para P2  *(medidas el 08-09-2026)*

**1. La arista entre hosts sale de Sysmon EID 3, no del logon.** Los `4624` de tipo 3 traen
`IpAddress`, `IpPort` y `WorkstationName` a `'-'` en este dataset: son logons Kerberos
intra-dominio y Windows no rellena el origen. Comprobado contra el fichero de origen, no es
un fallo del normalizador. Además son ruido de fondo —1.164 en 25 minutos—, así que como
etapa harían encajar el patrón con cualquier cosa. Sysmon EID 3 sí da la arista: dirigida,
con puerto y atribuida al proceso que la abre.

**2. Cada conexión se registra dos veces, y eso es un regalo.** El host que inicia la
registra con `Initiated=true` y el que recibe con `Initiated=false`, con las mismas
`SourceIp`/`DestinationIp` y ~1 s de diferencia. De ahí sale el mapa host↔IP sin
configuración externa (el registro `Initiated=false` revela la IP propia del receptor):

| Host | IP | Papel |
|---|---|---|
| NEWYORK | 10.0.0.4 | Controlador de dominio |
| SCRANTON | 10.0.1.4 | Origen del salto |
| NASHUA | 10.0.1.6 | Destino del salto |
| UTICA | 10.0.1.5 | — |

El par `(true, false)` permite además **confirmar** la arista desde los dos extremos, que es
más fuerte que fiarse de un solo host.

**3. La cadena de P2, con evidencia:**

| Hora | Host | Evidencia | Fuente |
|---|---|---|---|
| 03:09:27.836 | SCRANTON | `powershell.exe` → NASHUA:5985, `Initiated=true` | Sysmon 3 |
| 03:09:24.805 | NASHUA | `wsmprovhost.exe` (`T1021.006`) | alerta Sigma |
| 03:09:31.016 | NASHUA | `wsmprovhost.exe` → `lsass.exe` (`T1003.001`) | alerta Sigma ← **costura con P1** |
| 03:10:25.531 | SCRANTON | → NASHUA:445, `Initiated=true` | Sysmon 3 |
| 03:11:20.087 | NASHUA | `PSEXESVC.exe` creado (`T1569.002`) | alerta Sigma |

**4. ⚠️ Las marcas de tiempo de apt29 son horas de RECOGIDA, no horas de evento.**
La conexión de red aparece a las 03:09:27 y el proceso `wsmprovhost.exe` que la atiende a las
03:09:24, **tres segundos antes**. La causa no es un retardo de Sysmon: **apt29 day1 y day2 no
traen el campo `TimeCreated`** (0 de 196.081 líneas), así que `base_event` cae a `@timestamp`
(`ocsf_common.py:47-50`), que coincide con `EventReceivedTime` — la hora a la que el colector
recibió el evento, no aquella en que ocurrió.

Magnitud medida sobre los 143.883 eventos de Sysmon de day1 que sí traen `UtcTime`
(desfase `@timestamp` − `UtcTime`):

| mediana | p75 | p95 | máximo | desviación |
|---|---|---|---|---|
| 6,2 s | 49,7 s | 74,9 s | **101,2 s** | 26,7 s |

El 53 % de los eventos van desviados más de 5 s. Lo grave no es el desfase sino su
**variabilidad**: con σ = 26,7 s los eventos **se reordenan unos respecto a otros**, así que no
es un offset constante que se pueda restar.

**Alcance.** Solo afecta a apt29 day1 y day2. El atómico y las 7 campañas LSASS sí traen
`TimeCreated` y usan la hora correcta, de modo que **el 7 de 7 de P1 no queda en cuestión**.
Sí quedan en cuestión las ventanas medidas en la sección 4 de este documento y la extensión
temporal de las campañas de apt29.

**Consecuencia inmediata para los patrones.** Una ventana de 10 min como la de P1 absorbe un
desfase de 101 s; una de 300 s como la que P2 pide **no**: el desfase sería un tercio de la
ventana. Mientras no se corrija el origen del tiempo, P2 debe usar restricción de
**proximidad** (`|dt| <= ventana`), nunca de orden, y su ventana debe elegirse con este
margen de error en la mano.

**5. `T1570` sí es observable, pero no como alerta.** Las alertas etiquetadas `T1570` son
`Rundll32 Execution Without Parameters`, cuyo mapeo ATT&CK es amplio: es etiquetado de la
regla, no evidencia de transferencia. La transferencia real está en la telemetría de red
—SCRANTON → NASHUA:445 a las 03:10:25, justo antes de que aparezca `PSEXESVC.exe`— y solo
se ve por Sysmon 3. **Contar etiquetas como etapas infla el patrón con evidencia que nadie
observó.**

**6. Ventana sugerida.** El núcleo del salto (WinRM → SMB → servicio) ocupa **1 min 53 s**
(03:09:27 → 03:11:20). La cadena completa hasta rundll32 en SCRANTON son 19 min, pero eso ya
es otra fase. Para P2 la ventana se mide sobre el núcleo, no sobre la campaña entera.

---

## 4. Ventanas temporales observadas

Medidas sobre las alertas reales de `SDWIN-200501225525` (el plan no lleva marcas de tiempo),
en los dos hosts de la cadena principal, SCRANTON y NASHUA.

**Recalculadas el 15-09-2026** sobre `tfg.alerts FINAL`, con la **hora del evento** (no la de
recogida) y la identidad de evento completa (741 alertas).

> **Nota sobre las marcas de tiempo.** La versión del 31-07 de esta sección afirmaba que las
> marcas de tiempo "no se habían visto afectadas". Era cierto respecto a la deduplicación, pero
> **falso por otro motivo**, descubierto el 08-09: apt29 no trae `TimeCreated` y el normalizador
> caía a `@timestamp`, que es la hora a la que el colector **recibió** el evento, con un desfase
> de hasta 101 s y σ 26,7 s. Corregido el 11-09 en `ocsf_common.event_time`. Todas las cifras
> de abajo usan ya la hora del evento.
>
> **Nota sobre la deduplicación (30-07).** La primera versión de la tabla deduplicaba a mano
> por `(time, rule_id, host, matched_fields, src_event_id)`, criterio demasiado agresivo que
> colapsaba alertas legítimas del mismo milisegundo (`execution` en SCRANTON pasaba de 93 a
> 174). Desde el 31-07 la deduplicación es correcta por construcción.
>
> **Nota sobre la tabla del 31-07.** Tenía 17 filas y **le faltaban cuatro** de NASHUA
> (`impact`, `credential-access`, `stealth`, `resource-development`). Se comprobó contra
> `tfg.alerts_legacy` que esas alertas ya existían entonces: la tabla se montó a mano y se
> quedó corta. Por eso ahora cada tabla va acompañada de la consulta que la genera.

**Campaña completa: 02:56:14,000 † → 03:22:41,798 = 26 min 27 s.** Duración **idéntica** a la
medida con horas de recogida (1.587 s en ambos casos); el inicio se adelanta 1,9 s y el final 1,1 s.

† = hora reconstruida con **resolución de segundo** (`EventTime` + desfase horario, eventos de
Security y PowerShell). El resto lleva hora de Sysmon con milisegundos.

| Táctica | Host | Alertas | Primera | Duración |
|---|---|---:|---|---:|
| execution | SCRANTON | 174 | 02:56:14 † | 25,2 min |
| persistence | SCRANTON | 322 | 02:57:18 | 22,5 min |
| defense-impairment | SCRANTON | 175 | 02:57:18 | 24,9 min |
| privilege-escalation | SCRANTON | 28 | 02:58:30 | 22,5 min |
| stealth | SCRANTON | 22 | 02:58:44 | 22,8 min |
| impact | NASHUA | 3 | 02:59:37 | 16,7 min |
| **credential-access** | **SCRANTON** | **7** | **03:00:29** | **18,8 min** |
| resource-development | SCRANTON | 25 | 03:02:04 | 12,6 min |
| exfiltration | SCRANTON | 10 | 03:08:50 † | 1,6 min |
| execution | NASHUA | 19 | 03:09:23 † | 13,3 min |
| **lateral-movement** | **NASHUA** | **4** | **03:09:23 †** | **0,1 min** |
| credential-access | NASHUA | 1 | 03:09:29 | 0,0 min |
| defense-impairment | NASHUA | 76 | 03:09:29 | 13,0 min |
| privilege-escalation | NASHUA | 5 | 03:14:17 | 8,4 min |
| persistence | NASHUA | 4 | 03:14:17 | 0,0 min |
| stealth | NASHUA | 2 | 03:14:19 | 0,0 min |
| collection | NASHUA | 4 | 03:16:19 † | 0,0 min |
| resource-development | NASHUA | 9 | 03:16:52 | 0,8 min |
| lateral-movement | SCRANTON | 2 | 03:19:14 † | 0,0 min |
| discovery | SCRANTON | 2 | 03:19:17 † | 0,0 min |
| command-and-control | SCRANTON | 2 | 03:21:29 † | 0,0 min |

El orden de aparición reproduce la cadena del plan: ejecución en SCRANTON (02:56) → persistencia
(02:57) → escalada (02:58) → **credenciales (03:00)** → exfiltración (03:08) → **salto a NASHUA
(03:09:23)** → recolección en NASHUA (03:16) → segundo volcado de credenciales en SCRANTON
(03:19:09) → cierre en SCRANTON (03:21). NEWYORK y UTICA aparecen con pocas alertas y no son
objetivo de este día.

**Qué ha cambiado respecto a las horas de recogida:**

- **Los eventos del final se desplazan más que los del principio.** Casi todo se adelanta 1-2 s,
  pero lo de las 03:19 en SCRANTON se adelanta **21 s** (`lateral-movement`) y **36 s**
  (`discovery`). Encaja con un colector que se iba retrasando a medida que crecía el volumen, y
  explica que las duraciones de las tácticas de SCRANTON encojan entre 0,7 y 1,3 min.
- **Cambia un orden a las 03:19.** Con horas de recogida, el movimiento lateral en SCRANTON
  (03:19:35) iba *antes* que el segundo volcado de LSASS (03:19:42). Con la hora del evento, el
  volcado va primero (03:19:09,803) y el movimiento lateral después (03:19:14 †). Es lo coherente
  —primero se roban credenciales, luego se usan—, pero la alerta de movimiento lateral tiene hora
  de resolución de segundo, así que con 4,2 s de diferencia el orden es **muy probable, no seguro**.

> **❓ Pregunta abierta.** NASHUA tiene **3 alertas de `impact` desde las 02:59:37**, diez
> minutos **antes** del salto de SCRANTON a las 03:09:23. No están en la cadena del plan, y la
> campaña P1 de NASHUA también arranca a esa hora, así que las está absorbiendo. Hasta
> explicarlas no puede afirmarse que NASHUA entra en juego con el salto lateral.

### El bloque de P1, alerta a alerta

```
03:00:29,705    Cred Dump Tools Dropped Files            high     T1003.001-005  SCRANTON
03:00:31,064    Cred Dump Tools Dropped Files            high     T1003.001-005  SCRANTON
03:05:16,654    Potential Credential Dumping Via LSASS   medium   T1003.001      SCRANTON
03:09:29,430    Remote LSASS Access Through WinRM        high     T1003.001      NASHUA
03:19:09,803    Potential Credential Dumping Via LSASS   medium   T1003.001      SCRANTON  (×2)
03:19:17,000 †  New Network Trace Capture Via Netsh.EXE  medium   T1040          SCRANTON
03:19:17,154    New Network Trace Capture Via Netsh.EXE  medium   T1040          SCRANTON
```

La fila `(×2)` son **dos alertas distintas en el mismo milisegundo**: dos eventos de acceso a
LSASS que antes normalizaban idénticos y colapsaban en uno. Es una de las tres parejas que
reaparecieron al pasar de 738 a 741 alertas (14-09).

**Núcleo de la secuencia: volcado de la herramienta → acceso a LSASS = 4 min 47 s**
(03:00:29,705 → 03:05:16,654). **Idéntico** al medido con horas de recogida
(03:00:30,614 → 03:05:17,687).

Tres consecuencias directas para el `DEFINE` de P1:

1. **El precursor no puede excluirse por técnica.** El mejor precursor —el *drop* de la
   herramienta de volcado, nivel `high`— viene etiquetado con `T1003.001`. Una condición del
   tipo `A.technique <> 'T1003.001'`, que es lo natural al escribir el patrón, **elimina
   precisamente la mejor evidencia**. La separación entre etapas tiene que hacerse por otra vía
   (clase de evento de origen, o `file.path` frente a `unmapped.GrantedAccess`).
2. **El acceso a LSASS ocurre dos veces**, separadas **13 min 53 s** (14 min 25 s con horas de
   recogida). Son dos acciones distintas y deben producir **dos campañas**, no una: es un
   argumento a favor de `AFTER MATCH SKIP PAST LAST ROW`. Queda un margen de **3 min 53 s**
   sobre la ventana de 10 min, suficiente para que la separación no dependa del redondeo.
3. **`WITHIN` propuesto para P1: 10 minutos** — el doble del núcleo observado (4 min 47 s),
   suficiente para no partir la secuencia y lo bastante estrecho para que las dos instancias de
   volcado no se fusionen. **Sigue siendo válido con la hora del evento.**

### Cómo se regeneran estas cifras

Las tablas de esta sección salen de consultas, no se editan a mano:

```sql
-- Duración de la campaña (SCRANTON y NASHUA)
SELECT min(time), max(time), dateDiff('second', min(time), max(time))
FROM tfg.alerts FINAL
WHERE dataset_id = 'SDWIN-200501225525'
  AND splitByChar('.', device_hostname)[1] IN ('SCRANTON', 'NASHUA');

-- Tabla de tácticas por host
SELECT tactica, host, count() AS alertas, min(time) AS primera,
       round(dateDiff('second', min(time), max(time)) / 60, 1) AS duracion_min
FROM (SELECT arrayJoin(tactic_ids) AS tactica, splitByChar('.', device_hostname)[1] AS host, time
      FROM tfg.alerts FINAL WHERE dataset_id = 'SDWIN-200501225525')
WHERE host IN ('SCRANTON', 'NASHUA')
GROUP BY tactica, host ORDER BY primera;

-- Bloque de P1
SELECT time, rule_title, rule_level, technique_ids, device_hostname
FROM tfg.alerts FINAL
WHERE dataset_id = 'SDWIN-200501225525'
  AND arrayExists(t -> t LIKE 'T1003%' OR t = 'T1040', technique_ids)
ORDER BY time;
```

### ⚠️ Limitación importante de esta calibración

La campaña entera dura **26 minutos**. Cualquier `WITHIN` de 20-30 minutos abarcaría el día
completo y **el criterio temporal dejaría de discriminar**. Esto es un artefacto del dataset:
las evaluaciones de MITRE son ejercicios *hands-on-keyboard* comprimidos, mientras que una
campaña APT29 real tiene tiempos de permanencia de semanas. Las ventanas calibradas aquí valen
para reproducir estos resultados, **no** como valores operativos. En la memoria hay que
declararlo así, y en F7 medir la sensibilidad del resultado al valor de `WITHIN` en vez de
presentarlo como un número acertado.

---

## 5. Limitaciones conocidas de esta verdad conocida

- El plan describe **lo que el equipo rojo ejecutó**, no lo que la telemetría capturó. Un paso
  del plan sin alerta asociada puede significar tres cosas distintas —no hay regla Sigma, la
  regla existe pero no casa, o el evento no se generó— y hay que distinguirlas antes de contar
  un fallo de detección.
- Los pasos marcados como `SETUP` (Pupy, Metasploit) ocurren en la infraestructura del atacante
  y **no dejan telemetría de host**: no son detectables por diseño.
- La granularidad del plan es el paso (1.A, 1.B…), no el evento. Un paso puede producir decenas
  de alertas —ya se vio con las 292 del "Dropper Via PowerShell" en F2—, que es justamente lo
  que el Pilar A debe colapsar.
