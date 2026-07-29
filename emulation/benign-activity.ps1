<#
    Generador de actividad benigna para el laboratorio.
    Simula el uso normal de una estacion de trabajo: navegacion de ficheros,
    ejecucion de utilidades administrativas, consultas de red y ofimatica.
    Objetivo: producir telemetria de fondo realista y sostenida.
#>
param(
    [int]$Minutes = 60,
    [int]$MinPause = 3,
    [int]$MaxPause = 15
)

$fin = (Get-Date).AddMinutes($Minutes)
$n = 0
$rnd = New-Object System.Random

# Carpeta de trabajo simulada
$docs = "$env:USERPROFILE\Documents\Trabajo"
New-Item -ItemType Directory -Force -Path $docs | Out-Null

$acciones = @(
    { Get-ChildItem C:\Windows\System32 -File | Select-Object -First 20 | Out-Null },
    { Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 | Out-Null },
    { Get-Service | Where-Object Status -eq 'Running' | Out-Null },
    { ipconfig /all | Out-Null },
    { Test-NetConnection -ComputerName "www.microsoft.com" -Port 443 -WarningAction SilentlyContinue | Out-Null },
    { Get-ChildItem $env:USERPROFILE -Recurse -Depth 2 -ErrorAction SilentlyContinue | Out-Null },
    { systeminfo | Out-Null },
    { tasklist | Out-Null },
    { whoami /all | Out-Null },
    { Get-EventLog -LogName System -Newest 20 -ErrorAction SilentlyContinue | Out-Null },
    { net share | Out-Null },
    { Get-Volume | Out-Null },
    { $f = "$docs\informe_$(Get-Random -Max 9999).txt"
      "Datos de trabajo generados el $(Get-Date)" | Out-File $f
      Get-Content $f | Out-Null },
    { Get-ChildItem $docs | Where-Object { $_.LastWriteTime -lt (Get-Date).AddMinutes(-30) } |
        Remove-Item -Force -ErrorAction SilentlyContinue },
    { Get-Random -Count 100 -InputObject (1..1000) | Measure-Object -Sum | Out-Null },
    { [System.Net.Dns]::GetHostAddresses("github.com") | Out-Null },
    { Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion" | Out-Null },
    { Get-WmiObject Win32_OperatingSystem | Out-Null },
    { Get-ChildItem "C:\Program Files" -Directory | Out-Null },
    { $p = Start-Process notepad -PassThru; Start-Sleep 2; Stop-Process $p -Force -EA SilentlyContinue }
)

Write-Host "Generando actividad benigna durante $Minutes minutos..."
Write-Host "Inicio: $(Get-Date -Format 'HH:mm:ss')  |  Fin previsto: $($fin.ToString('HH:mm:ss'))"
Write-Host ""

while ((Get-Date) -lt $fin) {
    $accion = $acciones[$rnd.Next(0, $acciones.Count)]
    try { & $accion } catch { }
    $n++
    if ($n % 20 -eq 0) {
        $restante = [math]::Round(($fin - (Get-Date)).TotalMinutes, 1)
        Write-Host "  $(Get-Date -Format 'HH:mm:ss')  $n acciones  |  quedan $restante min"
    }
    Start-Sleep -Seconds $rnd.Next($MinPause, $MaxPause)
}

Write-Host ""
Write-Host "Completado: $n acciones ejecutadas."