#Requires -Version 5.1
# Health probe for monitoring / Task Scheduler recovery. Exits 0 healthy, 1 degraded.
# Usage: powershell -File healthcheck.ps1 [-ApiUrl http://127.0.0.1:5070] [-SiteUrl http://127.0.0.1:3001]
param([string]$ApiUrl = 'http://127.0.0.1:5070', [string]$SiteUrl = 'http://127.0.0.1:3001')
$ErrorActionPreference = 'Stop'
$fail = 0
try {
  $h = Invoke-RestMethod -Uri "$ApiUrl/healthz" -TimeoutSec 10
  if (-not $h.ok) { Write-Output 'FAIL healthz not ok'; $fail = 1 } else { Write-Output 'healthz ok' }
} catch { Write-Output "FAIL healthz: $($_.Exception.Message)"; $fail = 1 }
try {
  $r = Invoke-WebRequest -Uri "$ApiUrl/readyz" -TimeoutSec 10 -UseBasicParsing
  if ($r.StatusCode -ne 200) { Write-Output "FAIL readyz $($r.StatusCode)"; $fail = 1 } else { Write-Output 'readyz ok' }
} catch {
  $code = $_.Exception.Response.StatusCode.value__ 2>$null
  Write-Output "FAIL readyz: $($_.Exception.Message) (http $code)"; $fail = 1
}
try {
  $s = Invoke-WebRequest -Uri $SiteUrl -TimeoutSec 10 -UseBasicParsing
  if ($s.StatusCode -ne 200) { Write-Output "FAIL site $($s.StatusCode)"; $fail = 1 } else { Write-Output 'site ok' }
} catch { Write-Output "FAIL site: $($_.Exception.Message)"; $fail = 1 }
exit $fail
