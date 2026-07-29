param(
    [Parameter(Mandatory=$true)]
    [string]$Tecnica,
    [Parameter(Mandatory=$true)]
    [string]$TestNumber,
    [string]$DatasetPath = "C:\Lab\dataset_atomic_clean.csv",
    [string]$PatternComando = "*reg*add*Run*"
)

if (-not (Test-Path $DatasetPath)) {
    "Timestamp,Tecnica,Proceso,ProcesoPadre,LineaComando,Etiqueta" | 
        Out-File $DatasetPath -Encoding utf8
}

Write-Host "[*] Ejecutando $Tecnica-$TestNumber..."

$inicio = Get-Date
$output = Invoke-AtomicTest $Tecnica -TestNumbers $TestNumber 2>&1
$fin = Get-Date

Start-Sleep -Seconds 2

$eventosTecnica = Get-WinEvent -FilterHashtable @{
    LogName='Microsoft-Windows-Sysmon/Operational'
    StartTime=$inicio.AddSeconds(-1)
    EndTime=$fin.AddSeconds(5)
    ID=1
} -ErrorAction SilentlyContinue | ForEach-Object {
    $x = [xml]$_.ToXml()
    $cmdLine = ($x.Event.EventData.Data | Where-Object {$_.Name -eq "CommandLine"}).'#text'
    $image = ($x.Event.EventData.Data | Where-Object {$_.Name -eq "Image"}).'#text'
    $parentImage = ($x.Event.EventData.Data | Where-Object {$_.Name -eq "ParentImage"}).'#text'
    
    if ($cmdLine -like $PatternComando) {
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

if ($eventosTecnica) {
    $eventosTecnica | Export-Csv $DatasetPath -NoTypeInformation -Append
    Write-Host "[+] Capturados $($eventosTecnica.Count) eventos" -ForegroundColor Green
    $eventosTecnica | Format-Table -AutoSize
} else {
    Write-Host "[!] No se encontraron eventos con patrón: $PatternComando" -ForegroundColor Yellow
}
