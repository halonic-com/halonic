# The installer's "Set up the agent sandbox" step (HAL-1202, flow 2.3 steps 3
# and 4). It runs the agent host's `--sandbox-setup`, the same command
# Settings › Agent sandbox and `halonic sandbox setup` run (HAL-1451): the
# host asks Windows for administrator rights itself, once, through Halonic's
# signed helper, and then checks the sandbox as the person installing. This
# script elevates nothing.
#
# It prints one line, the reason, and exits with:
#   0   set up, and the check passed
#   10  Windows didn't give administrator rights (refused, closed, or no admin password)
#   11  the setup stopped (the reason is the setup's own words)
#   12  it was set up but the check didn't pass (the reason is the check's)
#
# Nothing is undone after a failure: the setup stays, so running this again can
# pass without another prompt (flow 2.3, CHECK I5).
param(
  [Parameter(Mandatory)][string]$HostExe,
  [Parameter(Mandatory)][string]$ProfileFolder,
  # srt gives its own administrator prompt 120 seconds, so this is longer.
  [int]$SetupSeconds = 300
)
$ErrorActionPreference = 'Stop'

function Read-Json([string]$path) {
  if (-not (Test-Path $path)) { return $null }
  $line = Get-Content $path | Where-Object { $_.Trim() } | Select-Object -Last 1
  if (-not $line) { return $null }
  try { return $line | ConvertFrom-Json } catch { return $null }
}

$out = Join-Path $env:TEMP "halonic-sandbox-setup-$PID.json"
Remove-Item $out -ErrorAction SilentlyContinue
try {
  $p = Start-Process $HostExe -ArgumentList '--profile-folder', "`"$ProfileFolder`"", '--sandbox-setup' `
    -RedirectStandardOutput $out -PassThru -WindowStyle Hidden
} catch {
  Write-Output ("the setup couldn't start: " + $_.Exception.Message)
  exit 11
}
# Without reading the handle first, ExitCode can be empty once it exits.
$null = $p.Handle
if (-not $p.WaitForExit($SetupSeconds * 1000)) {
  Write-Output "it didn't finish within $SetupSeconds seconds"
  exit 11
}
$setup = Read-Json $out
Remove-Item $out -ErrorAction SilentlyContinue
if ($setup -and $setup.ok -eq $true) { exit 0 }
if ($setup -and $setup.outcome -eq 'cancelled') { exit 10 }
if ($setup -and $setup.reason) { Write-Output ([string]$setup.reason) }
else { Write-Output "the setup ended with code $($p.ExitCode) and no reason" }
if ($setup -and $setup.outcome -eq 'check_failed') { exit 12 }
exit 11
