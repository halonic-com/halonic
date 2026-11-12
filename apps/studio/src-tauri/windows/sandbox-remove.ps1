# The uninstaller's sandbox removal (HAL-1202, flow 2.7). It runs the agent
# host's `--sandbox-remove`, asking Windows for administrator rights unless it
# already has them. When nothing was set up, it asks for nothing (checklist
# 2.8: no prompt when the sandbox was never set up).
#
# It prints one line, the reason, and exits with:
#   0   removed
#   10  Windows didn't give administrator rights (refused, closed, or no admin password)
#   11  the removal stopped (the reason is the removal's own words)
#   20  nothing was set up, so nothing was asked or removed
#
# "Set up" means the sandbox's Windows account or its group is there: the
# setup makes those first and the removal takes them last (HAL-6180, CHECK I9).
param(
  [Parameter(Mandatory)][string]$HostExe,
  [Parameter(Mandatory)][string]$ProfileFolder,
  # For an uninstaller that is already elevated or silent: no prompt.
  [switch]$NoElevate,
  # srt gives its own administrator prompt 120 seconds, so this is longer.
  [int]$RemoveSeconds = 300,
  # The names sandbox-runtime gives them; tests pass others.
  [string]$AccountName = 'srt-sandbox',
  [string]$GroupName = 'sandbox-runtime-users'
)
$ErrorActionPreference = 'Stop'

function Read-Json([string]$path) {
  if (-not (Test-Path $path)) { return $null }
  $line = Get-Content $path | Where-Object { $_.Trim() } | Select-Object -Last 1
  if (-not $line) { return $null }
  try { return $line | ConvertFrom-Json } catch { return $null }
}

# net.exe, not Get-LocalUser: the uninstaller is 32-bit, and the 32-bit
# PowerShell has no LocalAccounts module. cmd.exe drops net.exe's output,
# because with 'Stop' Windows PowerShell 5.1 ends the script on its stderr.
function Test-Net([string]$arguments) {
  & cmd.exe /c "net.exe $arguments >nul 2>&1"
  return $LASTEXITCODE -eq 0
}
$account = Test-Net "user `"$AccountName`""
$group = Test-Net "localgroup `"$GroupName`""
if (-not $account -and -not $group) { exit 20 }

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$elevated = ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# The removal's output goes to a file, because an elevated program's output
# can't be read from here.
$removeOut = Join-Path $env:TEMP "halonic-sandbox-remove-$PID.json"
Remove-Item $removeOut -ErrorAction SilentlyContinue
$line = "`"`"$HostExe`" --profile-folder `"$ProfileFolder`" --sandbox-remove > `"$removeOut`"`""
try {
  if ($elevated -or $NoElevate) {
    $p = Start-Process cmd.exe -ArgumentList '/c', $line -PassThru -WindowStyle Hidden
  } else {
    $p = Start-Process cmd.exe -ArgumentList '/c', $line -Verb RunAs -PassThru -WindowStyle Hidden
  }
} catch {
  # 1223 is Windows' "The operation was canceled by the user".
  if ($_.Exception.NativeErrorCode -eq 1223) { exit 10 }
  Write-Output ("the removal couldn't start: " + $_.Exception.Message)
  exit 11
}
if (-not $p.WaitForExit($RemoveSeconds * 1000)) {
  Write-Output "it didn't finish within $RemoveSeconds seconds"
  exit 11
}
$removal = Read-Json $removeOut
Remove-Item $removeOut -ErrorAction SilentlyContinue
if ($removal -and $removal.ok -eq $true) { exit 0 }
if ($removal -and $removal.reason) { Write-Output ([string]$removal.reason) }
else { Write-Output "the removal ended with code $($p.ExitCode) and no reason" }
exit 11
