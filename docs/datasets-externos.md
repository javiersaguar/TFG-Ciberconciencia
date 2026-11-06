# Inventario externo de la fase FA

Inventariado el **2026-11-04** (Europe/Madrid). Tamaños exactos en bytes salvo cuando se indica que el editor solo muestra una cifra redondeada. Se conservaron los ZIP originales. Se consultaron metadatos oficiales y se inspeccionaron listados ZIP y registros como datos; no se ejecutó contenido de las capturas ni se abrieron PCAP con analizadores.

**Total verificado en ficheros (sin este índice ni parciales): 5.711.190.806 B.** Tras el OK se añadieron **5.008.849.961 B de datos verificados**. OTRF preexistente está fuera de ese total. No se descargaron AIT v2 crudo, COMISET REAL, PCAP de Orion ni datos del nivel C.

## Encaje con el globo del frontend

El contrato actual de mapa usa ubicaciones con ciudad, país, código y longitud/latitud; las rutas referencian esas ubicaciones y el reloj del navegador reproduce una secuencia ficticia. APT29 Zeek aporta pares de endpoints, tiempos, puertos y protocolo; Orion y CICDDoS2019 pueden aportar concentración hacia un destino y ritmo de tráfico. CAM-LDS, AttackMate y Log4Shell aportan contexto de una secuencia. Los atómicos de cron/macOS y los registros Windows de COMISET no proporcionan por sí solos un par geográfico. Las topologías privadas, emuladas o anonimizadas no permiten inferir países de atacantes.

Para la demo: conservar los tiempos relativos y roles de origen/destino del corpus; asignar sedes ilustrativas estables por escenario; reproducir a 1× o acelerar solo el reloj del mapa. Para DDoS, una ruta por sede de origen y servicio destino, con volumen por ventana y un identificador de episodio común. Preservar la hora original y, por separado, la de emisión del replay. Los endpoints sin ubicación quedan en el panel de evidencias. Para un mapa geográfico externo, [Cloudflare Radar publica pares agregados L7](https://developers.cloudflare.com/api/resources/radar/subresources/attacks/subresources/layer7/subresources/top/methods/attacks/): mostrarlos como agregados fechados y atribuidos al proveedor, separados de las alertas del TFG; el destino L7 se aproxima con el país de facturación. No se ha contratado ni consultado esa API.

## A1. OTRF Security-Datasets

| URL oficial | Licencia | Fecha de descarga | ROADMAP | Estado |
|---|---|---|---|---|
| [OTRF](https://github.com/OTRF/Security-Datasets) | MIT en el LICENSE del clon fijado a d9d40ef | — (clon preexistente) | FA.1, FA.2, FA.4; GoldenSAML previsto en F7 | **solo registrado; comprobado localmente** |

Rutas de la tabla relativas a data/Security-Datasets/. No se alteró el clon existente. Plan de emulación en XLSX; los registros individuales no traen etiqueta de ataque por línea.

| Metadato local en data/external | Bytes | SHA-256 |
|---|---:|---|
| `otrf-security-datasets/LICENSE` | 1,083 | `fce88163b60d67ecabd317b75f7638233e11cbe648fe608ebbf6c10161564686` |
| `otrf-security-datasets/SOURCE.txt` | 216 | `4d6b3478f146b2407a18b7ee71beda1353df0431f3a14354b805df2e58c06814` |

| Fichero | Bytes | SHA-256 | Verificación del editor |
|---|---:|---|---|
| `datasets/compound/apt29/day1/apt29_evals_day1_manual.zip` | 13.944.973 | `98a073140860560d70080ace9142961be4f64b4862bae892d62d0f254d0fdbe5` | — |
| `datasets/compound/apt29/day1/zeek/combined_zeek.log` | 1.243.861 | `2b3268dd04f54e0bc3d6b11fdec85e821a0be7b4754b71d7fd7c9595a7d235d1` | — |
| `datasets/compound/apt29/day1/zeek/individual_zeek_logs/NASHUA_conn.log` | 233.889 | `db9fd7fe7b60e86a860935903ef5b5dd49e91ce722676d0968596fa7b1d3161f` | — |
| `datasets/compound/apt29/day1/zeek/individual_zeek_logs/SCRANTON_conn.log` | 64.367 | `b68dc635a812032cf9fc087c72560f14eaf9eeb3625df6333e521461e4171d86` | — |
| `datasets/compound/apt29/day1/zeek/individual_zeek_logs/NASHUA_dns.log` | 9.598 | `51544172d8b97a8da5b6c85c5b193054acfa96eeb025ba502b31ae776872c500` | — |
| `datasets/compound/apt29/day1/zeek/individual_zeek_logs/SCRANTON_dns.log` | 15.821 | `c9143f0b6a786d1e8cbe496a7df3fccf34c5fd07ac6f91e241ad0cc776a5e7ad` | — |
| `datasets/compound/apt29/day2/apt29_evals_day2_manual.zip` | 43.033.041 | `377f8cba5db95a453a3ee8bd19f493efafc23724541482a4da99da28ee4665f9` | — |
| `datasets/compound/apt29/day2/zeek/combined_zeek.log` | 1.542.562 | `218a40ec39926efd4e2cb482f9bdb699f9ff92cdecbb85c6e8c6fd53ea1652ec` | — |
| `datasets/compound/apt29/day2/zeek/individual_zeek_logs/NEWYORK_conn.log` | 147.187 | `86548bc5e0e9fd9e51b226b0442e0cef1d924641cf700ef17047e6f7c4e960db` | — |
| `datasets/compound/apt29/day2/zeek/individual_zeek_logs/SCRANTON_conn.log` | 24.748 | `496f85f4d898ca7acff461e510173636dc0436a4728e4a204da95d30d643afdb` | — |
| `datasets/compound/apt29/day2/zeek/individual_zeek_logs/UTICA-A_conn.log` | 168.041 | `4be6ee47030420ebf6f609c4b5a45952dd61bf9b6cdb116914e9f155101bf6fb` | — |
| `datasets/compound/apt29/day2/zeek/individual_zeek_logs/UTICA-C_conn.log` | 14.804 | `1c7e5e62a83b57e8dc35924fcb281ed6c4f5c3b44f31f094d91714a9d5448b69` | — |
| `datasets/compound/apt29/day2/zeek/individual_zeek_logs/UTICA-D_conn.log` | 169.931 | `2e91ca0d0fb5373bc8f3a8c38f13900c709e88062617ce1542863d19f3d6ff62` | — |
| `datasets/compound/apt29/day2/zeek/individual_zeek_logs/UTICA-ONE-DRIVE_conn.log` | 30.506 | `ba797eff686cd97ff84dddee5349743dbf6af94b57bb71dd4484be4cc8e225af` | — |
| `datasets/compound/apt29/day2/zeek/individual_zeek_logs/NEWYORK_dns.log` | 75.457 | `434c5b255c611bf6926d38bbc3ab51c2eb201f13fd20e562d60c4e3fd8e8142c` | — |
| `datasets/compound/apt29/day2/zeek/individual_zeek_logs/SCRANTON_dns.log` | 8.696 | `351b3afcfd5f78dccd16bcdadfd418d5d3c4cc2a690bfbebca6a594760372dd3` | — |
| `datasets/compound/apt29/day2/zeek/individual_zeek_logs/UTICA-A_dns.log` | 27.920 | `55956df127a1317490ee559a3a3d9e7c64eaa3f7fefbd4f678faef302fe30b9d` | — |
| `datasets/compound/apt29/day2/zeek/individual_zeek_logs/UTICA-C_dns.log` | 579 | `08dd17adb12e8cbeb991e6838d7a25f04aa60f45071fcab79c98952725216fc1` | — |
| `datasets/compound/apt29/day2/zeek/individual_zeek_logs/UTICA-D_dns.log` | 7.121 | `df8fe9d68b1c4ef7fb504ac5e79766de171fffb0de1389802bac25ca2cea1a7b` | — |
| `datasets/compound/apt29/day2/zeek/individual_zeek_logs/UTICA-ONE-DRIVE_dns.log` | 3.258 | `ce47ed92ccec5d13727f392493bffe4be131dbb5544ebfc24307481f94356924` | — |
| `datasets/compound/apt29/emulationplans/apt29.xlsx` | 25.051 | `053e70c6ba95eac481b370f8b1545ec3f1f00306c828634741a8c7399719c228` | — |
| `datasets/compound/Log4Shell/pcap_log4shell_cve2021_44228_java_serialized.zip` | 62.064 | `4a9f3334f6a92ed6a39ada41415f12908d4712e089655ed258efd91160bb2d55` | — |
| `datasets/compound/Log4Shell/pcap_log4shell_cve2021_44228_jndi_reference.zip` | 3.439 | `8ca6128bb0f14c88d9c2bdd6bb29c6ecd8210e5f8c337a4b66d85c5672491c6a` | — |
| `datasets/compound/Log4Shell/securityauditing_log4shell_cve2021_44228_java_serialized_object.zip` | 5.336 | `959e1c5c8f84f843710c95889e1b1bd62651c4cc133e75cd54655235039f5c17` | — |
| `datasets/compound/Log4Shell/syslog_auoms_auditd_log4shell_cve2021_44228_jndi_reference.zip` | 4.392 | `20ca2d3371daca5bff0e6e1ede0c74c6f4df5c8696f959e5bbafb6f058a1b724` | — |
| `datasets/compound/Log4Shell/syslog_sysmon_log4shell_cve2021_44228_jndi_reference.zip` | 7.031 | `c667b9e7e3a7969e3ef612e65a7dd5f122c856aa5e8b89db935b82b18d2f8b69` | — |
| `datasets/compound/Log4Shell/sysmon_log4shell_cve2021_44228_java_serialized_object.zip` | 33.080 | `69ce1f900d72243fdca55a3e1af1c0fe149e5c535e6913035c0f772a0d2282c6` | — |
| `datasets/compound/Log4Shell/vminsights_vmconnection_log4shell_cve2021_44228_jndi_reference.zip` | 1.010 | `7982120483aacfc53405c1129aa74f65998e19d7a9dd82d8e1e1280c5ef74fcb` | — |
| `datasets/compound/GoldenSAMLADFSMailAccess/AADAuditEvents.Zip` | 1.788 | `c45f9b67de7ac1eede1e0f37d7448aadf76e0f238bd4403df047cc164fc8ea02` | — |
| `datasets/compound/GoldenSAMLADFSMailAccess/Microsoft365DefenderEvents.Zip` | 3.159 | `693a86732e0762c709b9c39ba81f1027ab8b1e24c781db6ee3f6ccef3ecf6ebe` | — |
| `datasets/compound/GoldenSAMLADFSMailAccess/OfficeActivityEvents.Zip` | 1.034 | `0348e0df9231aa311b2a71af6f9aae7d15bdf269ba4f1d0768bf8b666c8c8d03` | — |
| `datasets/compound/GoldenSAMLADFSMailAccess/WindowsEvents.Zip` | 7.544 | `d5ed3b0b8040ec2f7406a30d1d6051ee83b37634ec524205dcad0f5dfd5b616a` | — |
| `datasets/compound/_metadata/Log4Shell.yaml` | 2.977 | `59c576718d65b209eab79b54d50502d9582ca7022982080645c96da925546349` | — |
| `datasets/compound/_metadata/GoldenSAMLADFSMailAccess.yaml` | 1.807 | `b529b1dcbdc90e55501b92a9f94323d46624c1c58e3f8c35c936679a69a1614f` | — |
| `LICENSE` | 1.083 | `fce88163b60d67ecabd317b75f7638233e11cbe648fe608ebbf6c10161564686` | — |

- **Zeek APT29:** todos los registros de conn/dns comprobados como JSON por línea. Day1: NASHUA y SCRANTON, ts desde 2020-04-30 00:06:38.899710 hasta 00:45:00.760719 UTC. Day2: NEWYORK, SCRANTON y UTICA-A/C/D/ONE-DRIVE, ts desde 2020-05-01 07:02:02.186129 hasta 2020-05-02 02:16:53.661921 UTC. Las horquillas incluyen combined_zeek.log; no mezclar el combinado y los individuales sin deduplicar. Campos id_orig_h e id_resp_h; 1.332/1.332 apariciones de IP de conn/dns no globales en day1 y 2.833/2.844 en day2. Las restantes no acreditan ubicación del atacante.
- **Host day2:** apt29_evals_day2_manual_2020-05-02035409.json dentro del ZIP, **1.714.987.031 B** sin comprimir, 587.286 líneas. Sysmon, Security, PowerShell, System, BITS, Terminal Services, WMI y Firewall, entre otros. EventTime: 2020-05-02 03:50:47–04:29:22 (el campo no indica zona horaria). El rango de Zeek y el del host no se deben cruzar sin reconciliar relojes e identidades.
- **Log4Shell:** PCAP JNDI (7.958 B) y PCAPNG de objeto Java (96.840 B) dentro de sus ZIP; AUOMS/Auditd y Sysmon Linux encapsulados en JSONL de syslog, más Security/Sysmon Windows y conexiones VMInsights. TimeGenerated observado en los JSON: 2022-05-11 18:09:38.868Z a 2022-05-13 08:54:11.910Z, entre dos variantes. Etiquetas de técnica en YAML de escenario, no por paquete; no se inspeccionó el contenido de paquetes.
- **GoldenSAML:** JSONL de Azure AD Audit, Microsoft 365 Defender, Office Activity y Windows Events; marcas observadas entre 2021-08-02 13:05:32.770Z y 13:32:54.280Z. Metadatos por escenario (incluye T1606.002). Falta alinear las fases del plan con eventos concretos y revisar los adaptadores de las fuentes cloud.

## A2. CAM-LDS v2

| URL oficial | Licencia | Fecha de descarga | ROADMAP | Estado |
|---|---|---|---|---|
| [Zenodo 18861762](https://zenodo.org/records/18861762) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode.txt) | 2026-11-04 | FA.4 | **descargado** |

| Fichero | Bytes | SHA-256 | Verificación del editor |
|---|---:|---|---|
| `LICENSE` | 18.657 | `9ba9550ad48438d0836ddab3da480b3b69ffa0aac7b7878b5a0039e7ab429411` | — |
| `SOURCE.txt` | 292 | `55187cb146a2b04d4eac2ec0e0eeb2f2ac2881d821b5b8f63a0052f532a7aacb` | — |
| `scenario_1_sudo_sshkey.attackmate.json` | 22.315 | `f3aff8b17d29546880b877e46d80aefe419c5d79ad8ee722a439d3a0a1767222` | — |
| `scenario_1_sudo_sshkey.zip` | 173.530.479 | `fad3ecdcc92e1c5ec1b8d9c5c29d67464d2f64ce91a5676455bc021196d07037` | MD5 Zenodo coincide (2788b802adc9ed6f009b0d1f5b03c37e) |
| `scenario_3_ssh_apt.attackmate.json` | 34.322 | `bc115fb2c2f105fe80906fb4ae84c0aa1782d7ab3de25f214b65e86f0ce183d1` | — |
| `scenario_3_ssh_apt.zip` | 206.764.324 | `7fbb7379964987c0894ce95d2fa6e5fc635b57b68cf4e687c047aaa489a7e482` | MD5 Zenodo coincide (0837edd952382f1d917d5491775cd0af) |

Los dos ZIP tienen auditd, auth.log, syslog, Apache, journald y Suricata EVE JSON. Se extrajo exclusivamente el miembro exacto de cada escenario scenario_*/attacker/logs/attackmate.json, como JSONL de pasos con start-datetime y metadatos de técnica. Los registros de ejecución marcan **el comienzo del paso** y no etiquetan cada evento de host. Horas de inicio sin zona horaria explícita:

- scenario_1_sudo_sshkey: 38 registros de ejecución, 2025-09-22 08:58:43.027115–09:21:11.443693. Explotación de aplicación, abuso de sudo, persistencia con clave SSH.
- scenario_3_ssh_apt: 55 registros de ejecución, 2025-12-12 10:28:22.693190–10:49:13.762295. Movimiento lateral y etapas de impacto; reservar para evaluación.

No simula usuarios normales. Falta verificar la alineación de relojes y las evidencias por host; las franjas anteriores son de ejecución, no de toda la telemetría histórica empaquetada. No se descargó el corpus separado de PCAP.

## A3. Splunk Attack Data: auditd y cron

| URL oficial | Licencia | Fecha de descarga | ROADMAP | Estado |
|---|---|---|---|---|
| [Ficha T1053.003](https://research.splunk.com/attack_data/4bed5528-1ab0-11f0-a1c6-629be3538069/) | [Apache-2.0](https://github.com/splunk/attack_data/blob/c8af10d015d392fca97f9eb65181e9f06bc18e40/LICENSE) | 2026-11-04 | FA.4 | **descargado** |

| Fichero | Bytes | SHA-256 | Verificación del editor |
|---|---:|---|---|
| `LICENSE` | 11.344 | `8505946b2464fa90223996d99eecbc7639a86648ca071f0cac21695be2623a0a` | — |
| `SOURCE.txt` | 763 | `18ae258e917c5cbaaedbb1566aca387344f51f4b5365932b7541aaeffb674aa1` | — |
| `linux_auditd_crontab_edit_new.yml` | 461 | `7b3bc93b2d6b69b9c63bb714f7e19c792ff018884e56748533eae99d94494c85` | — |
| `linux_auditd_new_crontab.log` | 1.116 | `85029e322d6526382d393a06fa1b08263d673774c6060805c4a9fe5c9db5fe15` | SHA-256 Git LFS coincide (85029e322d6526382d393a06fa1b08263d673774c6060805c4a9fe5c9db5fe15) |

Tres líneas de texto auditd de tipo SYSCALL, con fecha reformateada dentro de msg=audit(...) e identificador de registro. Rango 2025-04-16 10:14:07.928–10:15:35.891; zona horaria sin verificar. El YAML marca la captura entera como T1053.003. Falta verificar el mapeo de este formato de fecha y el alcance de la evidencia sin registros PATH.

## A4. AttackMate Evaluation Data v4

| URL oficial | Licencia | Fecha de descarga | ROADMAP | Estado |
|---|---|---|---|---|
| [Zenodo 19810174](https://zenodo.org/records/19810174) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode.txt) | 2026-11-04 | FA.4 | **descargado** |

| Fichero | Bytes | SHA-256 | Verificación del editor |
|---|---:|---|---|
| `LICENSE` | 18.657 | `9ba9550ad48438d0836ddab3da480b3b69ffa0aac7b7878b5a0039e7ab429411` | — |
| `SOURCE.txt` | 493 | `71a72b823501bbe203a6fe90b957ec162b8f15f94d92fadbc4dd2e4c12ce8ede` | — |
| `lateral_movement_caldera_ssh.zip` | 92.442.422 | `0410cedbd7cb7aac280b47835f82b7f281da51433bced4e1197f512479df7c29` | MD5 Zenodo coincide (b7bb6676bd1424c079ec6dd72132918f) |
| `privilege_escalation_atomic.zip` | 93.843.241 | `7bd2193ce2901dfed033aa6347b471fbea138d3697f8e9c730be0ca42aebb8e5` | MD5 Zenodo coincide (fdb102503ceb032375c5ebbfbe140e0f) |
| `privilege_escalation_attackmate.zip` | 66.746.187 | `f595e38fc9e52c3f523f0245f674a94a3a0028fda27838d99225378984eb580a` | MD5 Zenodo coincide (f6c3d5b04f8855d2bd90be9d0143bf14) |
| `privilege_escalation_caldera_www_data.zip` | 68.794.133 | `797c51c9349efcbe6f4530d0b89f2c40f162ac267725b96c038b929b8953af43` | MD5 Zenodo coincide (d43e0b975cee184388def174f713a287) |

Cuatro ZIP: movimiento lateral por SSH de CALDERA y las tres capturas de escalada. Incluyen logs Linux de auditd, autenticación, syslog y journald. En los cuatro ZIP inspeccionados no aparecen miembros con extensión PCAP/PCAPNG; el depósito describe tráfico de red a nivel general. Etiquetas en los informes de operación de CALDERA, manifiesto JSONL de AttackMate o atomic_results.log; no por línea del log auditd.

| Variante | Ventana verificada en el registro de ejecución |
|---|---|
| CALDERA SSH | Informe lateral_movement_ssh_two_commands_report.json, inicio 2025-10-29 13:51:33 UTC; el campo finish es nulo. |
| Escalada Atomic | atomic_results.log, 2026-04-15 12:44:49–12:44:51 UTC; prueba T1053.003. |
| Escalada AttackMate | attackmate.json, 2025-10-24 12:54:06.811878–13:01:03.265508, zona no indicada. |
| Escalada CALDERA | Informes priv_esc_as_www_data_report.json y root_report.json, comienzos 2025-10-29 21:38:56 y 21:45:37 UTC, sin finish. |

Falta alinear las ejecuciones con registros de víctima y distinguir técnica de la herramienta de orquestación. Las horas se refieren a las operaciones, no a los logs rotados completos.

## A5 / B10. Orion 2026

| URL oficial | Licencia | Fecha de descarga | ROADMAP | Estado |
|---|---|---|---|---|
| [Universidade Estadual de Londrina](https://www.uel.br/grupos/orion/datasets/orion-2026.html) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode.txt) | 2026-11-04 (solo ficha y licencia) | FA.5 | **solo registrado en datos; ZIP bloqueados** |

| Fichero | Bytes | SHA-256 | Verificación del editor |
|---|---:|---|---|
| `LICENSE` | 18.657 | `9ba9550ad48438d0836ddab3da480b3b69ffa0aac7b7878b5a0039e7ab429411` | — |
| `SOURCE.txt` | 252 | `6f2e22d979bbb926b2743a122b6bf3dcf2c816321ed007f4cbbfc73d5450276c` | — |
| `orion-2026.html` | 17.724 | `3777587b87d0036d00cc2c45ae4b4b482089ce5d28f8aa75dd6bb9da6ce478cc` | — |

| Fichero oficial o fragmento propuesto | Tamaño | Suma publicada | Estado / alcance |
|---|---:|---|---|
| [dataset_orion_2026_csv.zip](https://www.uel.br/grupos/orion/datasets/dataset_orion_2026_csv.zip) | Sin verificar | SHA-256 9a7b7d2ed60cdbd6276d06e131b6622623777fab2afc60aba0febef949967f92 | Nivel A: el editor enlaza un ZIP global (≈25 millones de flujos). Solicitar o aislar 2025-11-03 (benigno) y 2025-11-06 (DDoS N–1), sin incorporar los otros días al piloto. |
| [dataset_orion_2026_pcap.zip](https://www.uel.br/grupos/orion/datasets/dataset_orion_2026_pcap.zip) | Sin verificar | SHA-256 f68f4120bbe8dff4fed7558a62af4fbdda351391ecdac7148e4aff0731980252 | Nivel B: el editor enlaza un ZIP global (≈338 millones de paquetes); no hay listado accesible de sus miembros. Interesa solo 2025-11-06. |

La ficha cubre 2025-11-03 a 2025-11-07: los dos primeros días benignos, el tercero DoS 1–1, el cuarto DDoS N–1, el quinto N–N. Los dos enlaces ZIP oficiales devuelven HTTP 403 tanto a HEAD como a una petición de rango. Por ello no se pudieron verificar los tamaños exactos, nombres y tamaños por día, formato de etiquetas ni checksums del contenido. Ningún ZIP descargado. Hace falta un enlace oficial accesible con tamaño antes de decidir si se puede adquirir el CSV; si el único ZIP CSV supera 10 GB, requiere OK explícito.

**Recomprobación 2026-11-04:** en la pestaña oficial, el botón CSV resuelve a la URL directa de la tabla (sin duplicar el directorio datasets). HEAD y GET limitado al primer byte devolvieron HTTP 403. La ficha no anuncia descargas separadas por día. El ZIP de datos sigue sin descargarse y no hay tamaño exacto verificable.

## A6. Splunk Attack Data: macOS Gatekeeper

| URL oficial | Licencia | Fecha de descarga | ROADMAP | Estado |
|---|---|---|---|---|
| [Ficha T1553.001](https://research.splunk.com/attack_data/fbcfb4fb-1be3-4348-87d3-60c68a0b6334/) | [Apache-2.0](https://github.com/splunk/attack_data/blob/c8af10d015d392fca97f9eb65181e9f06bc18e40/LICENSE) | 2026-11-04 | §3.4; relacionado con FA.4 | **descargado** |

| Fichero | Bytes | SHA-256 | Verificación del editor |
|---|---:|---|---|
| `LICENSE` | 11.344 | `8505946b2464fa90223996d99eecbc7639a86648ca071f0cac21695be2623a0a` | — |
| `SOURCE.txt` | 881 | `70e25f79f6ac5ec40c90d8857e36757b125254f54229c3e564372591332818fb` | — |
| `macos_gatekeeper_bypass_LSFileQuarantineEnabled.log` | 1.951 | `2e2e29b722ab46aed1c4fb5c3c6a570ad298b10ef269d62c1b0c5fcf7d00b828` | SHA-256 Git LFS coincide (2e2e29b722ab46aed1c4fb5c3c6a570ad298b10ef269d62c1b0c5fcf7d00b828) |
| `macos_gatekeeper_bypass_LSFileQuarantineEnabled.yml` | 608 | `5dacf9f5c182b446606c369b6af41f81f61f88d762462a056c6669e14cb8f1e3` | — |

Un registro JSON de osquery (tabla log_processes), hora unixTime 2025-12-15 15:33:40 UTC. YAML del editor: emulación por cambio de LSFileQuarantineEnabled en Info.plist, técnica T1553.001; el YAML está fechado el día 16. La etiqueta se refiere al caso y no prueba por sí sola la evasión efectiva. Falta verificar el mapeo de columnas de Endpoint Security y la evidencia de resultado.

## B7a. AIT Log Data Set v2

| URL oficial | Licencia | Fecha de descarga | ROADMAP | Estado |
|---|---|---|---|---|
| [Zenodo 5789064](https://zenodo.org/records/5789064) | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.txt) | — (texto de licencia guardado 2026-11-04) | FA.4; evidencia de P4 | **pendiente de OK** |

| Fichero | Bytes | SHA-256 | Verificación del editor |
|---|---:|---|---|
| `LICENSE` | 20.850 | `e66c269d4819aaab34b49ef5220c4ddab6756f21bb5180761a4eb8561f2b7bbd` | — |
| `SOURCE.txt` | 172 | `63aa34b4aec5c008ccf8a04017dbaee4fcc53743620271155cb3885f1f38e573` | — |

| Fichero oficial o fragmento propuesto | Tamaño | Suma publicada | Estado / alcance |
|---|---:|---|---|
| [russellmitchell.zip](https://zenodo.org/api/records/5789064/files/russellmitchell.zip/content) | 7.132.670.599 B | MD5 78e9b7d169b438f03816019b52ab3ff7 | Único escenario propuesto. |

Contiene auditoría y autenticación, DNS, web, Suricata y PCAP; las etiquetas remiten al número de línea y se generaron mediante reglas. Propuesta: conservar el ZIP y leer solo audit/auth/DNS y sus etiquetas. Rango exacto de eventos y tamaños extraídos pendientes. LICENSE contiene literalmente el texto oficial Attribution-NonCommercial-ShareAlike 4.0 International.

## B7b. AIT Alert Data Set

| URL oficial | Licencia | Fecha de descarga | ROADMAP | Estado |
|---|---|---|---|---|
| [Zenodo 8263181](https://zenodo.org/records/8263181) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode.txt) | 2026-11-04 | FA.4; prueba de correlación con alertas externas | **descargado** |

| Fichero | Bytes | SHA-256 | Verificación del editor |
|---|---:|---|---|
| `LICENSE` | 18.657 | `9ba9550ad48438d0836ddab3da480b3b69ffa0aac7b7878b5a0039e7ab429411` | — |
| `SOURCE.txt` | 266 | `234f43528d680675111117ee82042250398b27f4eceaa45487e58980cbed81f5` | — |
| `ait_ads.zip` | 96.202.946 | `9f0595c4ebe56ac9223763881f55369dd4f249a8108064e4ae108eb3309aeeb9` | MD5 Zenodo coincide (43db6b1f0996e0024befd617706c50e9) |
| `labels.csv` | 3.703 | `633e09b42772eabbbe5b48598220860eead60b7352efb01973fc45a5034290c0` | MD5 Zenodo coincide (60ff33796c77fd2136c4d1a4bc841bd9) |

El ZIP original tiene 16 ficheros de alertas, dos por cada uno de los ocho escenarios. Comprobación por muestra de los registros de russellmitchell: JSON por línea de AMiner (AnalysisComponent, LogData y AMiner) y Wazuh/Suricata (rule, decoder y @timestamp). El labels.csv original aporta 79 ventanas (scenario, attack, start, end; época Unix), del **2022-01-16 07:16:17 al 2022-02-08 11:15:01 UTC**. Para russellmitchell son 10 ventanas el **2022-01-24 de 03:01:00 a 14:50:40 UTC**. Son los límites de las etiquetas; las alertas incluyen fondo previo (la primera muestra Wazuh es de 2022-01-21). Falta contrastar las ventanas con el corpus crudo para evaluación. El ZIP se conserva sin extraer.

## B8. COMISET

| URL oficial | Licencia | Fecha de descarga | ROADMAP | Estado |
|---|---|---|---|---|
| [Zenodo 15375146](https://zenodo.org/records/15375146) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode.txt) | 2026-11-04 | FA.3 | **LAB descargado; REAL solo registrado** |

| Fichero | Bytes | SHA-256 | Verificación del editor |
|---|---:|---|---|
| `Comiset23_Lab_Environment_Dataset.zip` | 4.912.643.312 | `ad1d53a064565e6669d39b9b6628ef6ca1ab85ea75251bfa050f0a6a8a3baeb4` | MD5 Zenodo coincide (e838308bfa31fba1e273d500d588aba6) |
| `LICENSE` | 18.657 | `9ba9550ad48438d0836ddab3da480b3b69ffa0aac7b7878b5a0039e7ab429411` | — |
| `SOURCE.txt` | 321 | `1fa5ababe376cdae25856830bd85367c08673aa5e5b8afb63cddd0d8c11694b1` | — |

**LAB.** El ZIP conserva un único miembro dataset_comillas2.json de **159.730.026.735 B** sin comprimir. Se inspeccionaron en memoria hasta 4 MiB de salida; no se escribió el JSON a disco. JSONL con envoltorio de Elasticsearch (_index, _id y _source); los datos Windows de la muestra usan event_id, log_name, event_original_time y @timestamp dentro de _source. Los primeros 1.975 registros completos de esa comprobación abarcan **2022-11-16 08:16:55.209 a 12:37:28.368 UTC**; no es el rango completo. El editor documenta etiquetas ATT&CK para LAB. Falta localizar su representación en los registros etiquetados y comprobar la adaptación del envoltorio a los canales del TFG.

| Fichero oficial pendiente | Tamaño | Suma publicada | Estado |
|---|---:|---|---|
| [Comiset23_Real_Environment_Dataset.zip](https://zenodo.org/api/records/15375146/files/Comiset23_Real_Environment_Dataset.zip/content) | 31.701.737.521 B | MD5 1718e161dc50b8c49e00020b596974d3 | Solo registrado; fuera del OK. |

**REAL.** La [vista previa de Zenodo](https://zenodo.org/records/15375146/preview/Comiset23_Real_Environment_Dataset.zip) lista un JSON de **934,5 GB** expandidos. Se mantiene la propuesta de una muestra oficial de dos hosts durante una hora, con tope de 100.000 registros. Si se aprobase el ZIP completo, filtrar en streaming sin escribir el JSON entero.

## B9. CICDDoS2019

| URL oficial | Licencia | Fecha de descarga | ROADMAP | Estado |
|---|---|---|---|---|
| [UNB / CIC](https://www.unb.ca/cic/datasets/ddos-2019.html) | Términos del editor: uso y redistribución con cita al dataset y al artículo | — | FA.5 | **pendiente de OK; descarga oficial sin acceso** |

| Fichero oficial o fragmento propuesto | Tamaño | Suma publicada | Estado / alcance |
|---|---:|---|---|
| CSV de la variante DNS del segundo día (10:52–11:05, hora de la ficha) | Sin verificar | — | Flujos etiquetados CICFlowMeter; preferir archivo de la variante si el editor lo ofrece. |
| PCAP de ese mismo día, solo intervalo de DNS de reflexión | Sin verificar | — | Propuesta: filtrar 10:52–11:05 tras identificar reloj y destino. |

La ficha oficial enlaza a cicresearch.ca/CICDataset/CICDDoS2019/ por HTTP; el host no resuelve en la comprobación HTTPS desde WSL. No se pudieron verificar los nombres publicados ni los tamaños exactos de los archivos del día. No se descargó nada ni se recurrió a copias de terceros. Obtener enlace HTTPS oficial y presupuesto exacto antes del OK.

## C11. IoT-23

| URL oficial | Licencia | Fecha de descarga | ROADMAP | Estado |
|---|---|---|---|---|
| [Stratosphere Laboratory](https://www.stratosphereips.org/datasets-iot23) · [Zenodo 4743746](https://zenodo.org/records/4743746) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode.txt) | — | §3.4; relacionado con FA.1 y FA.5 | **solo registrado** |

| Fichero oficial o fragmento propuesto | Tamaño | Suma publicada | Estado / alcance |
|---|---:|---|---|
| iot_23_datasets_full.tar.gz | 21.510.801.277 B | MD5 7132e603f9750b8580b6cebdbcd43e9c | Original completo, no propuesto. |
| [iot_23_datasets_small.tar.gz](https://mcfp.felk.cvut.cz/publicDatasets/IoT-23-Dataset/iot_23_datasets_small.tar.gz) | 9.373.916.249 B | — | Solo flujos, tamaño HTTP oficial; sigue siendo más que el fragmento necesario. |
| [CTU-IoT-Malware-1-1.conn.log.labeled](https://mcfp.felk.cvut.cz/publicDatasets/IoT-23-Dataset/IndividualScenarios/CTU-IoT-Malware-Capture-1-1/bro/CTU-IoT-Malware-1-1.conn.log.labeled) | 1.008.889 B | — | Único fragmento mínimo propuesto, Zeek por flujo, sin PCAP. |

Las capturas originales abarcan 2018–2019. El archivo de muestra está listado por el editor en el escenario 1-1; falta verificar el rango temporal y composición exacta de esa muestra. No se descargó.

## C12. DARPA Transparent Computing (TC), E3

| URL oficial | Licencia | Fecha de descarga | ROADMAP | Estado |
|---|---|---|---|---|
| [DARPA / README-E3](https://github.com/darpa-i2o/Transparent-Computing/blob/master/README-E3.md) · [Distribución oficial THEIA](https://drive.google.com/drive/folders/1AWXy7GFGJWeJPGzvkT935kTfwBYzjhfC) | Dominio público, según README-E3 | — | §3.4; procedencia para el grafo | **solo registrado** |

| Fichero oficial o fragmento propuesto | Tamaño | Suma publicada | Estado / alcance |
|---|---:|---|---|
| [ta1-theia-e3-official-6r.json.tar.gz](https://drive.google.com/file/d/1Kadc6CUTb4opVSDE4x6RFFnEy0P1cRp0/view) | ≈1,44 GB (cifra de Drive) | — | Un único fragmento futuro: 10 minutos de la secuencia Firefox de THEIA E3 alrededor del inicio confirmado en el informe TA5.1; solo el host víctima y sus relaciones proceso–fichero–conexión. |

El archivo es un contenedor completo de JSON de procedencia CDM. El tamaño exacto del fragmento y su intervalo UTC requieren consultar el informe de verdad conocida y filtrar; no hay un archivo oficial de esos diez minutos. No se descargó el archivo. “TB” en la petición se interpreta como TC, nombre oficial del programa.

## Decisiones pendientes

- AIT v2 crudo (7.132.670.599 B) se pospone hasta el trabajo de exfiltración DNS. Para COMISET REAL, preferir una muestra oficial al ZIP de 31.701.737.521 B.
- Orion CSV, Orion PCAP y CICDDoS2019: hacen falta enlaces oficiales operativos y tamaños verificables. Recalcular el presupuesto antes de descargar. No se usaron espejos.
