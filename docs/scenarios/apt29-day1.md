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

---

## 4. Ventanas temporales observadas

Medidas sobre las alertas reales de `SDWIN-200501225525` (el plan no lleva marcas de tiempo).

Recalculadas el 31-07-2026 sobre `tfg.alerts FINAL`, con la deduplicación correcta por
construcción (`alert_id` determinista + `ReplacingMergeTree`).

> **Nota metodológica.** La primera versión de esta tabla (30-07) deduplicaba a mano por
> `(time, rule_id, host, matched_fields, src_event_id)`, y ese criterio resultó **demasiado
> agresivo**: colapsaba alertas legítimas de eventos distintos ocurridos en el mismo
> milisegundo. El efecto no era menor —`execution` en SCRANTON pasa de 93 a 174 y
> `defense-impairment` de 86 a 175, casi el doble— y afecta sobre todo a las reglas que
> disparan muchas veces sobre eventos con los mismos campos coincidentes. Las **marcas de
> tiempo no se vieron afectadas**, así que las ventanas derivadas de ellas siguen siendo válidas.

**Campaña completa: 02:56:15,884 → 03:22:42,872 = 26 min 27 s.**

| Táctica | Host | Alertas | Primera | Duración |
|---|---|---:|---|---:|
| execution | SCRANTON | 174 | 02:56:15 | 26,0 min |
| defense-impairment | SCRANTON | 175 | 02:57:20 | 24,9 min |
| persistence | SCRANTON | 320 | 02:57:20 | 23,8 min |
| privilege-escalation | SCRANTON | 26 | 02:58:32 | 23,3 min |
| stealth | SCRANTON | 22 | 02:58:46 | 23,4 min |
| **credential-access** | **SCRANTON** | **7** | **03:00:30** | **19,5 min** |
| resource-development | SCRANTON | 25 | 03:02:06 | 12,6 min |
| exfiltration | SCRANTON | 10 | 03:08:52 | **1,5 min** |
| execution | NASHUA | 19 | 03:09:24 | 13,3 min |
| **lateral-movement** | **NASHUA** | **4** | **03:09:24** | **0,1 min** |
| defense-impairment | NASHUA | 76 | 03:09:31 | 13,0 min |
| privilege-escalation | NASHUA | 5 | 03:14:18 | 8,4 min |
| persistence | NASHUA | 4 | 03:14:18 | 0,0 min |
| collection | NASHUA | 4 | 03:16:19 | 0,0 min |
| lateral-movement | SCRANTON | 2 | 03:19:35 | 0,4 min |
| discovery | SCRANTON | 2 | 03:19:53 | 0,2 min |
| command-and-control | SCRANTON | 2 | 03:21:32 | 0,0 min |

El orden de aparición reproduce la cadena del plan: ejecución en SCRANTON (02:56) → persistencia
(02:57) → escalada (02:58) → **credenciales (03:00)** → exfiltración (03:08) → **salto a NASHUA
(03:09:24)** → recolección en NASHUA (03:16) → cierre en SCRANTON (03:21). NEWYORK aparece con
pocas alertas y no es objetivo de este día.

### El bloque de P1, alerta a alerta

```
03:00:30,614  Cred Dump Tools Dropped Files            high     T1003.001-005  SCRANTON
03:00:36,937  Cred Dump Tools Dropped Files            high     T1003.001-005  SCRANTON
03:05:17,687  Potential Credential Dumping Via LSASS   medium   T1003.001      SCRANTON
03:09:31,016  Remote LSASS Access Through WinRM        high     T1003.001      NASHUA
03:19:42,693  Potential Credential Dumping Via LSASS   medium   T1003.001      SCRANTON
03:19:53,186  New Network Trace Capture Via Netsh.EXE  medium   T1040          SCRANTON
03:20:02,096  New Network Trace Capture Via Netsh.EXE  medium   T1040          SCRANTON
```

**Núcleo de la secuencia: volcado de la herramienta → acceso a LSASS = 4 min 47 s.**

Tres consecuencias directas para el `DEFINE` de P1:

1. **El precursor no puede excluirse por técnica.** El mejor precursor —el *drop* de la
   herramienta de volcado, nivel `high`— viene etiquetado con `T1003.001`. Una condición del
   tipo `A.technique <> 'T1003.001'`, que es lo natural al escribir el patrón, **elimina
   precisamente la mejor evidencia**. La separación entre etapas tiene que hacerse por otra vía
   (clase de evento de origen, o `file.path` frente a `unmapped.GrantedAccess`).
2. **El acceso a LSASS ocurre dos veces**, separadas 14 min. Son dos acciones distintas y deben
   producir **dos campañas**, no una: es un argumento a favor de `AFTER MATCH SKIP PAST LAST ROW`.
3. **`WITHIN` propuesto para P1: 10 minutos** — el doble del núcleo observado (4 min 47 s),
   suficiente para no partir la secuencia y lo bastante estrecho para que las dos instancias de
   volcado no se fusionen.

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
