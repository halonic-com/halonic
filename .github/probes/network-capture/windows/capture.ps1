# Captures every packet of the Windows installer and app with pktmon, from
# before the silent install through first start, the update-check window and
# -IdleMinutes idle, to a control fetch of example.com at the end. It writes
# capture.pcapng, session.json (what report.mjs needs) and the logs to
# -Artifacts. Needs an administrator, which a hosted runner is.
#
# The app is only started: nobody clicks through onboarding here, so nothing
# the app does after onboarding is in the capture.
param(
  [Parameter(Mandatory)][string]$Setup,
  [Parameter(Mandatory)][string]$Artifacts,
  [ValidateRange(0, 30)][int]$IdleMinutes = 10,
  [int]$FirstStartSeconds = 30,
  [int]$UpdateWindowSeconds = 120
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$Setup = (Resolve-Path $Setup).Path
New-Item -ItemType Directory -Force $Artifacts | Out-Null
$Artifacts = (Resolve-Path $Artifacts).Path
$etl = Join-Path $Artifacts 'capture.etl'
$pcapng = Join-Path $Artifacts 'capture.pcapng'
$samples = Join-Path $Artifacts 'processes.json'
$stopFile = Join-Path $env:RUNNER_TEMP 'sampler.stop'
$installDir = Join-Path $env:LOCALAPPDATA 'Programs\Halonic'
$epoch = [datetime]'1970-01-01T00:00:00Z'
function Now { [long]([datetime]::UtcNow - $epoch).TotalMilliseconds }
$phases = [ordered]@{}
$app = $null
$sampler = $null
$capturing = $false

function Stop-Capture {
  if (-not $script:capturing) { return }
  $script:capturing = $false
  pktmon counters | Out-File (Join-Path $Artifacts 'pktmon-counters.txt') -Encoding utf8
  pktmon stop | Out-File (Join-Path $Artifacts 'pktmon-stop.txt') -Encoding utf8
  pktmon etl2pcap $etl --out $pcapng
  if (-not (Test-Path $pcapng)) { throw 'pktmon wrote no pcapng' }
  pktmon etl2txt $etl --out (Join-Path $Artifacts 'capture.txt') | Out-Null
  Remove-Item $etl
}

try {
  # The runner's own traffic is in the capture too; the report sorts it out by process.
  pktmon stop 2>&1 | Out-Null
  pktmon filter remove
  pktmon reset
  # NICs only: every packet once per card, not once per layer of the stack.
  pktmon start --capture --comp nics --pkt-size 0 --file-size 1024 --file-name $etl
  if ($LASTEXITCODE -ne 0) { throw 'pktmon did not start' }
  $capturing = $true
  Remove-Item $stopFile -ErrorAction SilentlyContinue
  $sampler = Start-Process pwsh -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile', '-File', (Join-Path $here 'sample.ps1'), '-Out', $samples, '-StopFile', $stopFile
  Start-Sleep -Seconds 5

  Write-Output 'Installing silently.'
  $start = Now
  $p = Start-Process $Setup -ArgumentList '/S' -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "The installer exited with $($p.ExitCode)" }
  $phases.install = @{ start = $start; end = Now }

  Write-Output 'Starting Halonic.'
  $start = Now
  $app = Start-Process (Join-Path $installDir 'Halonic.exe') -PassThru
  foreach ($phase in @(@('firstStart', $FirstStartSeconds), @('updateCheck', $UpdateWindowSeconds - $FirstStartSeconds))) {
    Start-Sleep -Seconds $phase[1]
    if ($app.HasExited) { throw "Halonic quit during $($phase[0]) with exit code $($app.ExitCode)" }
    $phases[$phase[0]] = @{ start = $start; end = Now }
    $start = Now
  }

  Write-Output "Idle for $IdleMinutes minutes."
  Start-Sleep -Seconds ($IdleMinutes * 60)
  if ($app.HasExited) { throw "Halonic quit while idle with exit code $($app.ExitCode)" }
  $phases.idle = @{ start = $start; end = Now }

  # The control, inside the same capture: a lookup of example.com and a
  # connection to it must show up, or a clean result would mean nothing.
  $start = Now
  node (Join-Path $here '../control.mjs') (Join-Path $Artifacts 'control.json')
  if ($LASTEXITCODE -ne 0) { throw 'The control fetch of example.com failed.' }
  Start-Sleep -Seconds 2
  $phases.control = @{ start = $start; end = Now }
}
finally {
  # What is still running before the app is stopped, for the record.
  Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($installDir) } | Select-Object Id, Name, Path |
    Format-Table | Out-String | Set-Content (Join-Path $Artifacts 'left-running.txt')
  if ($app -and -not $app.HasExited) { taskkill /PID $app.Id /T /F | Out-Null }
  New-Item -ItemType File $stopFile -Force | Out-Null
  if ($sampler) { $sampler.WaitForExit(30000) | Out-Null }
  Stop-Capture
  [pscustomobject]@{ installDir = $installDir; setup = $Setup; phases = $phases } |
    ConvertTo-Json -Depth 4 | Set-Content (Join-Path $Artifacts 'session.json') -Encoding utf8
}
