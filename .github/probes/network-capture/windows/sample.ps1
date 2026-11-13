# Records which process owns which connection, all through the capture, since
# pktmon's packets name no process. It reads `netstat -ano` every 0.2 s and
# the process table every second, and keeps the first and last time each
# connection and process was seen. It writes them to -Out as JSON when -StopFile
# appears. A connection shorter than a sample is missed; the report lists its
# packets as "no process in the samples".
param(
  [Parameter(Mandatory)][string]$Out,
  [Parameter(Mandatory)][string]$StopFile
)
$ErrorActionPreference = 'Stop'
$epoch = [datetime]'1970-01-01T00:00:00Z'
$connections = @{}
$processes = @{}
$tick = 0
while (-not (Test-Path $StopFile)) {
  $now = [long]([datetime]::UtcNow - $epoch).TotalMilliseconds
  foreach ($line in (netstat -ano)) {
    if ($line -notmatch '^\s*(TCP|UDP)\s+(\S+)\s+(\S+)\s+(?:([A-Z_]+)\s+)?(\d+)\s*$') { continue }
    if ($Matches[4] -eq 'LISTENING') { continue }
    $key = "$($Matches[1]) $($Matches[2]) $($Matches[3])"
    $entry = $connections[$key]
    if (-not $entry) {
      $connections[$key] = [pscustomobject]@{ proto = $Matches[1]; local = $Matches[2]; remote = $Matches[3]; pid = [int]$Matches[5]; first = $now; last = $now }
    } else {
      $entry.last = $now
      # TIME_WAIT has pid 0: keep the pid the connection had.
      if ($entry.pid -eq 0) { $entry.pid = [int]$Matches[5] }
    }
  }
  if ($tick % 5 -eq 0) {
    foreach ($p in (Get-CimInstance Win32_Process)) {
      $key = "$($p.ProcessId) $($p.CreationDate.Ticks)"
      $entry = $processes[$key]
      if (-not $entry) {
        $processes[$key] = [pscustomobject]@{ pid = [int]$p.ProcessId; ppid = [int]$p.ParentProcessId; name = $p.Name; path = $p.ExecutablePath; first = $now; last = $now }
      } else { $entry.last = $now }
    }
  }
  $tick++
  Start-Sleep -Milliseconds 200
}
[pscustomobject]@{ connections = @($connections.Values); processes = @($processes.Values) } |
  ConvertTo-Json -Depth 4 -Compress | Set-Content -Path $Out -Encoding utf8
