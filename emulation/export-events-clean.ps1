# export-events-clean.ps1
param(
    [string]$OutFile = "C:\Lab\telemetry_clean.json",
    [int]$Hours = 24
)

$since = (Get-Date).AddHours(-$Hours)

# StreamWriter SIN BOM (evita \ufeff al leer con pandas)
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$sw = [System.IO.StreamWriter]::new($OutFile, $false, $utf8NoBom)
$total = 0

function Export-Log {
    param($LogName, $Ids, $Channel)
    $n = 0
    try {
        Get-WinEvent -FilterHashtable @{
            LogName = $LogName; StartTime = $since; ID = $Ids
        } -ErrorAction Stop | ForEach-Object {
            $x = [xml]$_.ToXml()
            $o = [ordered]@{
                EventID     = [int]$_.Id
                Channel     = $Channel
                Hostname    = $env:COMPUTERNAME
                TimeCreated = $_.TimeCreated.ToString("yyyy-MM-dd HH:mm:ss.fff")
                Level       = $_.LevelDisplayName
            }
            foreach ($d in $x.Event.EventData.Data) {
                if ($d.Name) { $o[$d.Name] = $d.'#text' }
            }
            $script:sw.WriteLine(($o | ConvertTo-Json -Compress -Depth 5))
            $n++
        }
    } catch {
        Write-Host "  (sin eventos en $LogName)" -ForegroundColor DarkGray
    }
    Write-Host ("  {0,-45} {1} eventos" -f $LogName, $n)
    return $n
}

Write-Host "Exportando telemetria desde $since ..." -ForegroundColor Cyan
$total += Export-Log 'Microsoft-Windows-Sysmon/Operational' @(1,3,7,8,10,11,12,13,22) 'Microsoft-Windows-Sysmon/Operational'
$total += Export-Log 'Security' @(4688) 'Security'
$total += Export-Log 'Microsoft-Windows-PowerShell/Operational' @(4103,4104) 'Microsoft-Windows-PowerShell/Operational'

$sw.Close()
Write-Host ""
Write-Host "Total: $total eventos -> $OutFile" -ForegroundColor Green