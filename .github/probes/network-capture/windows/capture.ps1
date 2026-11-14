# Captures every packet of the Windows installer and app with pktmon, from
# before the silent install through first start, the update-check window and
# -IdleMinutes idle, to a self-test and a control fetch at the end. ETW
# (Microsoft-Windows-Kernel-Network and -Process, via logman and tracerpt, all
# part of Windows) runs beside pktmon and names the process of every
# connection, however short (HAL-8700). It writes capture.pcapng, net.xml and
# proc.xml (the ETW events), session.json (what report.mjs needs) and the logs
# to -Artifacts. Needs an administrator, which a hosted runner is.
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
$etwSessions = @{ HalonicNet = 'Microsoft-Windows-Kernel-Network'; HalonicProc = 'Microsoft-Windows-Kernel-Process' }
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

function Stop-Etw {
  foreach ($name in $etwSessions.Keys) {
    $file = Join-Path $Artifacts "$name.etl"
    logman stop $name -ets 2>&1 | Out-File (Join-Path $Artifacts "logman-$name.txt") -Encoding utf8
    if (-not (Test-Path $file)) { continue }
    $xml = Join-Path $Artifacts $(if ($name -eq 'HalonicNet') { 'net.xml' } else { 'proc.xml' })
    tracerpt $file -of XML -o $xml -summary (Join-Path $Artifacts "tracerpt-$name.txt") -report (Join-Path $Artifacts "tracerpt-$name-report.xml") -y -lr 2>&1 | Out-Null
    Remove-Item $file
  }
}

try {
  # ETW first, so no connection of the session starts before it; pktmon's
  # packets are matched to these events by address and port.
  foreach ($name in $etwSessions.Keys) {
    logman stop $name -ets 2>&1 | Out-Null
    logman start $name -p $etwSessions[$name] 0xffffffffffffffff 5 -ets -o (Join-Path $Artifacts "$name.etl") -max 512 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "logman did not start $name" }
  }
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
  foreach ($phase in @(@('firstStart', $FirstStartSeconds), @('updateCheck', ($UpdateWindowSeconds - $FirstStartSeconds)))) {
    Start-Sleep -Seconds $phase[1]
    if ($app.HasExited) { throw "Halonic quit during $($phase[0]) with exit code $($app.ExitCode)" }
    $phases[$phase[0]] = @{ start = $start; end = Now }
    $start = Now
  }

  Write-Output "Idle for $IdleMinutes minutes."
  Start-Sleep -Seconds ($IdleMinutes * 60)
  if ($app.HasExited) { throw "Halonic quit while idle with exit code $($app.ExitCode)" }
  $phases.idle = @{ start = $start; end = Now }

  # The self-test: a deliberate connection of under 100 ms from a program in
  # the install folder (a copy of curl.exe), to a host that isn't GitHub. The
  # report must find it in the ETW events and name it as Halonic, or it fails:
  # without this nothing shows that ETW closed the gap in the netstat sampling.
  $start = Now
  $selftest = Join-Path $installDir 'halonic-selftest.exe'
  Copy-Item (Join-Path $env:SystemRoot 'System32\curl.exe') $selftest
  $timer = [Diagnostics.Stopwatch]::StartNew()
  $q = Start-Process $selftest -ArgumentList '-s', '-m', '5', '-o', 'NUL', 'http://example.org/' -PassThru -Wait -WindowStyle Hidden
  $timer.Stop()
  Remove-Item $selftest
  [pscustomobject]@{ program = 'halonic-selftest.exe'; host = 'example.org'; port = 80; pid = $q.Id; exitCode = $q.ExitCode; milliseconds = $timer.ElapsedMilliseconds } |
    ConvertTo-Json | Set-Content (Join-Path $Artifacts 'selftest.json') -Encoding utf8
  Start-Sleep -Seconds 2
  $phases.selftest = @{ start = $start; end = Now }

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
  Stop-Etw
  [pscustomobject]@{ installDir = $installDir; setup = $Setup; phases = $phases } |
    ConvertTo-Json -Depth 4 | Set-Content (Join-Path $Artifacts 'session.json') -Encoding utf8
}
