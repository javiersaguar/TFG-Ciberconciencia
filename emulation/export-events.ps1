param(
    [string]$OutFile = "C:\Lab\telemetry.json",
    [int]$Hours = 24
)

$since = (Get-Date).AddHours(-$Hours)
$logs = @(
    "Microsoft-Windows-Sysmon/Operational",
    "Security",
    "Microsoft-Windows-PowerShell/Operational",
    "Windows PowerShell"
)

$total = 0
$sw = [System.IO.StreamWriter]::new($OutFile, $false, [System.Text.Encoding]::UTF8)

foreach ($log in $logs) {
    Write-Host "Exportando $log ..." -NoNewline
    $n = 0
    try {
        Get-WinEvent -FilterHashtable @{LogName=$log; StartTime=$since} -ErrorAction Stop | ForEach-Object {
            $x = [xml]$_.ToXml()
            $o = [ordered]@{
                EventID   = [int]$_.Id
                Channel   = $log
                Hostname  = $env:COMPUTERNAME
                TimeCreated = $_.TimeCreated.ToString("yyyy-MM-dd HH:mm:ss.fff")
                Level     = $_.LevelDisplayName
            }
            foreach ($d in $x.Event.EventData.Data) {
                if ($d.Name) { $o[$d.Name] = $d.'#text' }
            }
            $sw.WriteLine(($o | ConvertTo-Json -Compress -Depth 5))
            $n++
        }
    } catch {
        Write-Host " (sin eventos)" -NoNewline
    }
    Write-Host "  $n eventos"
    $total += $n
}

$sw.Close()
Write-Host ""
Write-Host "Total exportado: $total eventos -> $OutFile"