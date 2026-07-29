# capture-manifest.ps1
param(
    [Parameter(Mandatory=$true)] [string]   $Tecnica,
    [Parameter(Mandatory=$true)] [string[]] $TestNumbers,
    [string] $ManifestPath = "C:\Lab\manifest.csv",
    [int]    $PostWaitSeconds = 3
)

if (-not (Test-Path $ManifestPath)) {
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($ManifestPath,
        "Tecnica,Test,Nombre,InicioUtc,FinUtc,Inicio,Fin`r`n", $utf8NoBom)
}

foreach ($num in $TestNumbers) {
    Write-Host "[*] $Tecnica-$num ..." -ForegroundColor Yellow

    $nombre = ""
    try {
        $det = Invoke-AtomicTest $Tecnica -TestNumbers $num -ShowDetailsBrief 2>&1 | Out-String
        if ($det -match "$Tecnica-$num\s+(.+)") { $nombre = $matches[1].Trim() }
    } catch { }

    $inicio = Get-Date
    try { Invoke-AtomicTest $Tecnica -TestNumbers $num 2>&1 | Out-Null }
    catch { Write-Host "    [!] Error: $_" -ForegroundColor Red }
    Start-Sleep -Seconds $PostWaitSeconds
    $fin = Get-Date

    [PSCustomObject]@{
        Tecnica   = $Tecnica
        Test      = $num
        Nombre    = $nombre
        InicioUtc = $inicio.ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss.fff")
        FinUtc    = $fin.ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss.fff")
        Inicio    = $inicio.ToString("yyyy-MM-dd HH:mm:ss.fff")
        Fin       = $fin.ToString("yyyy-MM-dd HH:mm:ss.fff")
    } | Export-Csv $ManifestPath -NoTypeInformation -Append -Encoding UTF8

    Write-Host ("    ventana: {0} -> {1}  ({2})" -f `
        $inicio.ToString("HH:mm:ss"), $fin.ToString("HH:mm:ss"), $nombre) -ForegroundColor Green
}
Write-Host ""
Write-Host "Manifiesto -> $ManifestPath" -ForegroundColor Cyan