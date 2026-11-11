# The installer's "Set up the agent sandbox" step (HAL-1202, flow 2.3 steps 3
# and 4). It runs the agent host's one-time setup, asking Windows for
# administrator rights unless it already has them, and then runs the same
# sandbox check Settings uses, as the person installing.
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
  # For an installer that is already elevated or silent: no prompt.
  [switch]$NoElevate,
  [int]$CheckSeconds = 60,
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

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$elevated = ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# 1. The setup. Its output goes to a file, because an elevated program's
#    output can't be read from here.
$setupOut = Join-Path $env:TEMP "halonic-sandbox-setup-$PID.json"
Remove-Item $setupOut -ErrorAction SilentlyContinue
$line = "`"`"$HostExe`" --profile-folder `"$ProfileFolder`" --sandbox-setup > `"$setupOut`"`""
try {
  if ($elevated -or $NoElevate) {
    $p = Start-Process cmd.exe -ArgumentList '/c', $line -PassThru -WindowStyle Hidden
  } else {
    $p = Start-Process cmd.exe -ArgumentList '/c', $line -Verb RunAs -PassThru -WindowStyle Hidden
  }
} catch {
  # 1223 is Windows' "The operation was canceled by the user".
  if ($_.Exception.NativeErrorCode -eq 1223) { exit 10 }
  Write-Output ("The setup couldn't start: " + $_.Exception.Message)
  exit 11
}
if (-not $p.WaitForExit($SetupSeconds * 1000)) {
  Write-Output "it didn't finish within $SetupSeconds seconds"
  exit 11
}
$setup = Read-Json $setupOut
Remove-Item $setupOut -ErrorAction SilentlyContinue
if (-not $setup -or $setup.ok -ne $true) {
  if ($setup -and $setup.reason) { Write-Output ([string]$setup.reason) }
  else { Write-Output "the setup ended with code $($p.ExitCode) and no reason" }
  exit 11
}

# 2. The check, as the person installing, with a time limit.
$checkOut = Join-Path $env:TEMP "halonic-sandbox-check-$PID.json"
Remove-Item $checkOut -ErrorAction SilentlyContinue
$c = Start-Process $HostExe -ArgumentList '--profile-folder', "`"$ProfileFolder`"", '--sandbox-check' `
  -RedirectStandardOutput $checkOut -PassThru -WindowStyle Hidden
if (-not $c.WaitForExit($CheckSeconds * 1000)) {
  $c | Stop-Process -Force
  Write-Output "it didn't answer within $CheckSeconds seconds"
  exit 12
}
$check = Read-Json $checkOut
Remove-Item $checkOut -ErrorAction SilentlyContinue
if ($check -and $check.ok -eq $true) { exit 0 }
if ($check -and $check.missing) { Write-Output (($check.missing | ForEach-Object { [string]$_ }) -join '; ') }
else { Write-Output "the check ended with code $($c.ExitCode) and no answer" }
exit 12
