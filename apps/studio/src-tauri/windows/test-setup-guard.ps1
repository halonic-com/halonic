# Tests the rollback guard, setup-guard.ps1 (HAL-5404 S3), against a fake
# srt machine key under HKCU, so nothing of a real sandbox is touched. Run it
# with Windows PowerShell, as the installer runs the guard:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows/test-setup-guard.ps1
$ErrorActionPreference = 'Stop'
$guard = Join-Path $PSScriptRoot 'setup-guard.ps1'
. $guard

$keyPath = "Software\halonic-test-setup-guard-$PID"
$work = Join-Path ([IO.Path]::GetTempPath()) "halonic-setup-guard-$PID"
New-Item -ItemType Directory -Force $work | Out-Null
$base = [Microsoft.Win32.RegistryKey]::OpenBaseKey('CurrentUser', [Microsoft.Win32.RegistryView]::Registry64)

# Sets the fake key's MarkerVersion; $null removes the whole key.
function Set-Marker($value, [Microsoft.Win32.RegistryValueKind]$kind = 'DWord') {
  $base.DeleteSubKeyTree($keyPath, $false)
  if ($null -eq $value) { return }
  $key = $base.CreateSubKey($keyPath)
  try {
    if ($value -ne '') { $key.SetValue('MarkerVersion', $value, $kind) }
  } finally { $key.Close() }
}

function Assert-Guard([string]$name, [string]$version, [int]$expected) {
  $code, $reason = Invoke-SetupGuard -SetupVersion $version -Hive CurrentUser -KeyPath $keyPath
  Write-Output "${name}: $code, '$reason'"
  if ($code -ne $expected) { throw "${name}: expected $expected" }
}

try {
  Set-Marker 2; Assert-Guard 'marker below' '3' 0
  Set-Marker 3; Assert-Guard 'marker equal' '3' 0
  Set-Marker 4; Assert-Guard 'marker above' '3' 1
  Set-Marker 4 'QWord'; Assert-Guard 'marker above, as a QWORD' '3' 1
  Set-Marker $null; Assert-Guard 'no sandbox key' '3' 0
  # srt's uninstall with --keep-user keeps its key but removes the marker.
  Set-Marker ''; Assert-Guard 'key without a marker' '3' 0
  Set-Marker '4' 'String'; Assert-Guard 'marker not a number' '3' 2
  Set-Marker 2; Assert-Guard 'no setup version' '' 2
  Set-Marker 2; Assert-Guard 'setup version not a number' 'three' 2

  # A kept installer's record, and a version kept before records existed.
  $record = Join-Path $work 'Halonic-0.1.0.srt-setup'
  $missing = Read-SetupRecord $record
  if ($missing -ne '3') { throw "a missing record reads as '$missing', not 3" }
  Set-Marker 4; Assert-Guard 'missing record, marker above' $missing 1
  Set-Content $record "4`r`n" -Encoding ASCII
  Set-Marker 4; Assert-Guard 'record of 4, marker 4' (Read-SetupRecord $record) 0

  # The script itself, as the installer runs it, on this computer's real key:
  # whatever is set up here is at most setup version 99, and a bad number
  # can't be checked. (No -SetupVersion at all: Windows PowerShell drops an
  # empty argument to a program, so -SetupVersion '' would leave it without a
  # value.)
  $out = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $guard -SetupVersion 99 | Out-String).Trim()
  Write-Output "script, 99: exit $LASTEXITCODE, '$out'"
  if ($LASTEXITCODE -ne 0) { throw 'script, 99: expected exit 0' }
  $out = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $guard -RecordFile $record | Out-String).Trim()
  Write-Output "script, record of 4: exit $LASTEXITCODE, '$out'"
  if ($LASTEXITCODE -ne 0) { throw 'script, record of 4: expected exit 0' }
  $out = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $guard | Out-String).Trim()
  Write-Output "script, no setup version: exit $LASTEXITCODE, '$out'"
  if ($LASTEXITCODE -ne 2) { throw 'script, no setup version: expected exit 2' }
  $global:LASTEXITCODE = 0
  Write-Output 'setup guard: every case gave the expected answer'
} finally {
  $base.DeleteSubKeyTree($keyPath, $false)
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
