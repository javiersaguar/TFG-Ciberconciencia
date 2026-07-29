# capture-all-t1547.ps1 - Ejecuta y captura TODOS los tests de T1547.001
param(
    [string]$DatasetPath = "C:\Lab\dataset_atomic_clean.csv"
)

# Crear CSV si no existe
if (-not (Test-Path $DatasetPath)) {
    "Timestamp,Tecnica,Proceso,ProcesoPadre,LineaComando,Etiqueta" | 
        Out-File $DatasetPath -Encoding utf8
}

# Mapeo de tests T1547.001: número -> descripción y patrón de captura
$tests = @(
    @{ Numero="2";  Nombre="Reg Key RunOnce";                          Patron="*reg*add*RunOnce*" },
    @{ Numero="3";  Nombre="PowerShell Registry RunOnce";              Patron="*Set-ItemProperty*RunOnce*" },
    @{ Numero="4";  Nombre="Suspicious vbs file run from startup";     Patron="*copy*vbs*Startup*" },
    @{ Numero="5";  Nombre="Suspicious jse file run from startup";     Patron="*copy*jse*Startup*" },
    @{ Numero="6";  Nombre="Suspicious bat file run from startup";     Patron="*copy*bat*Startup*" },
    @{ Numero="7";  Nombre="Executable Shortcut Link to Startup";      Patron="*shortcut*Startup*" },
    @{ Numero="8";  Nombre="Add persistence via Recycle bin";          Patron="*reg*add*Recycle*" },
    @{ Numero="9";  Nombre="SystemBC Malware-as-a-Service Registry";   Patron="*reg*add*SystemBC*" },
    @{ Numero="10"; Nombre="Change Startup Folder HKLM";                 Patron="*reg*add*Common*Startup*" },
    @{ Numero="11"; Nombre="Change Startup Folder HKCU";                 Patron="*reg*add*Shell*Folders*Startup*" },
    @{ Numero="12"; Nombre="HKCU Policy Settings Explorer Run Key";    Patron="*reg*add*Policies*Explorer*Run*" },
    @{ Numero="13"; Nombre="HKLM Policy Settings Explorer Run Key";     Patron="*reg*add*Policies*Explorer*Run*" },
    @{ Numero="14"; Nombre="Winlogon Userinit";                        Patron="*reg*add*Userinit*" },
    @{ Numero="15"; Nombre="Winlogon Shell";                           Patron="*reg*add*Winlogon*Shell*" },
    @{ Numero="16"; Nombre="secedit Run key HKLM";                     Patron="*secedit*Run*" },
    @{ Numero="17"; Nombre="Modify BootExecute Value";                 Patron="*reg*add*BootExecute*" },
    @{ Numero="18"; Nombre="RDP logon session execution";                Patron="*reg*add*Shadow*" },
    @{ Numero="19"; Nombre="Boot Verification Program";                  Patron="*reg*add*BootVerification*" },
    @{ Numero="20"; Nombre="Add persistence via Windows Context Menu"; Patron="*reg*add*ContextMenu*" }
)

$Tecnica = "T1547.001"
$totalCapturados = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CAPTURA MASIVA: $Tecnica" -ForegroundColor Cyan
Write-Host "  Tests a ejecutar: $($tests.Count)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($test in $tests) {
    Write-Host "[*] Test $($test.Numero): $($test.Nombre)" -ForegroundColor Yellow
    
    $inicio = Get-Date
    
    # Ejecutar atómico
    try {
        $null = Invoke-AtomicTest $Tecnica -TestNumbers $test.Numero 2>&1
    } catch {
        Write-Host "    [!] Error ejecutando test: $_" -ForegroundColor Red
        continue
    }
    
    Start-Sleep -Seconds 2
    
    # Buscar eventos que coincidan con el patrón
    $eventos = Get-WinEvent -FilterHashtable @{
        LogName='Microsoft-Windows-Sysmon/Operational'
        StartTime=$inicio.AddSeconds(-1)
        EndTime=(Get-Date).AddSeconds(2)
        ID=1
    } -ErrorAction SilentlyContinue | ForEach-Object {
        $x = [xml]$_.ToXml()
        $cmdLine = ($x.Event.EventData.Data | Where-Object {$_.Name -eq "CommandLine"}).'#text'
        $image = ($x.Event.EventData.Data | Where-Object {$_.Name -eq "Image"}).'#text'
        $parentImage = ($x.Event.EventData.Data | Where-Object {$_.Name -eq "ParentImage"}).'#text'
        
        if ($cmdLine -like $test.Patron) {
            [PSCustomObject]@{
                Timestamp = $_.TimeCreated.ToString("yyyy-MM-dd HH:mm:ss")
                Tecnica = $Tecnica
                Proceso = $image
                ProcesoPadre = $parentImage
                LineaComando = $cmdLine
                Etiqueta = "malicioso"
            }
        }
    }
    
    if ($eventos) {
        $eventos | Export-Csv $DatasetPath -NoTypeInformation -Append
        $totalCapturados += $eventos.Count
        Write-Host "    [+] Capturados: $($eventos.Count) eventos" -ForegroundColor Green
    } else {
        Write-Host "    [!] Sin coincidencias para patron: $($test.Patron)" -ForegroundColor DarkGray
    }
    
    Write-Host ""
    Start-Sleep -Seconds 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  COMPLETADO" -ForegroundColor Cyan
Write-Host "  Total eventos capturados: $totalCapturados" -ForegroundColor Cyan
Write-Host "  Dataset: $DatasetPath" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Resumen final
Write-Host ""
Write-Host "Contenido del dataset:" -ForegroundColor Yellow
Import-Csv $DatasetPath | Group-Object Tecnica | Select-Object Name, Count | Format-Table