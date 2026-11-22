# The rollback guard (HAL-5404 S3): may a Halonic whose srt needs Windows
# setup version -SetupVersion run on this computer, as far as the sandbox is
# concerned? An srt release that raises its setup version changes what is set
# up machine-wide, and an older srt doesn't know how to undo that or the
# grants it kept. So going back across a raise is refused: the user removes
# the sandbox with the newer Halonic first (Settings › Agent sandbox).
#
# It reads one value, the setup version the sandbox on this computer was set
# up with: `MarkerVersion` under srt's machine key, which `srt-win user status`
# reports as `marker_version` (the sandbox-windows CI job checks the two agree
# for the pinned srt). It runs no program: srt-win.exe sits in the per-user
# install folder, which the user can write, and the installer may have
# administrator rights. It prints one line, the reason, and exits with:
#   0  no sandbox on this computer, or one set up for -SetupVersion or lower
#   1  the sandbox was set up for a newer version: refuse
#   2  it can't tell: the value can't be read or isn't a whole number
#
# -RecordFile reads the setup version from a kept installer's record
# (`updates\installers\Halonic-<version>.srt-setup`) in place of
# -SetupVersion. A missing record is from a version before the record, and
# those all pinned an srt with setup version 3 (0.0.81 and 0.0.82).
#
# -SetUpAgain asks another question, for an update that raises the setup
# version (HAL-5404): is a sandbox set up for an older one? See
# Invoke-SetUpAgainCheck.
#
# The installer runs it from its own plugins folder (installer.nsi,
# CheckSetupVersion). Dot-sourced, it only defines its functions, so
# test-setup-guard.ps1 can point them at a key of its own.
param(
  [string]$SetupVersion,
  [string]$RecordFile,
  [switch]$SetUpAgain
)

# The setup version of the versions kept before the record existed.
$setupVersionBeforeRecords = '3'

function Read-SetupRecord([string]$RecordFile) {
  if (-not (Test-Path -LiteralPath $RecordFile -PathType Leaf)) { return $setupVersionBeforeRecords }
  return ([string](Get-Content -LiteralPath $RecordFile -Raw)).Trim()
}

# Reads the setup version and srt's marker: @(code, reason) when that
# already answers (2: can't tell, 0: no sandbox), else @($null, wanted, marker).
function Read-Marker([string]$SetupVersion, [Microsoft.Win32.RegistryHive]$Hive, [string]$KeyPath) {
  $wanted = 0
  if (-not [int]::TryParse($SetupVersion, [ref]$wanted) -or $wanted -lt 1) {
    return @(2, "the setup version '$SetupVersion' isn't a whole number")
  }
  try {
    # The 64-bit view: the installer and its PowerShell may be 32-bit.
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($Hive, [Microsoft.Win32.RegistryView]::Registry64)
    $key = $base.OpenSubKey($KeyPath)
    if ($null -eq $key) { return @(0, 'no sandbox is set up on this computer') }
    try { $marker = $key.GetValue('MarkerVersion') } finally { $key.Close() }
  } catch {
    return @(2, ("the sandbox's setup version can't be read: " + $_.Exception.Message))
  }
  if ($null -eq $marker) { return @(0, 'no sandbox is set up on this computer') }
  if ($marker -isnot [int] -and $marker -isnot [long]) {
    return @(2, "the sandbox's setup version isn't a whole number")
  }
  return @($null, $wanted, $marker)
}

function Invoke-SetupGuard([string]$SetupVersion, [Microsoft.Win32.RegistryHive]$Hive, [string]$KeyPath) {
  # $second is the reason when $code answers, else the wanted setup version.
  $code, $second, $marker = Read-Marker $SetupVersion $Hive $KeyPath
  if ($null -ne $code) { return @($code, $second) }
  $wanted = $second
  if ($marker -le $wanted) { return @(0, "the sandbox was set up for setup version $marker") }
  return @(1, "the sandbox was set up for setup version $marker, newer than setup version $wanted")
}

# -SetUpAgain (HAL-5404): whether an update to a Halonic whose srt needs
# -SetupVersion sets the sandbox up again. 0 only when a sandbox is set up
# for an older setup version; 1 when none is set up or it is already set up
# for this one or a newer one; 2 when it can't tell. The update's own number
# in latest.json isn't signed, so this decides, not the number Studio got.
function Invoke-SetUpAgainCheck([string]$SetupVersion, [Microsoft.Win32.RegistryHive]$Hive, [string]$KeyPath) {
  $code, $second, $marker = Read-Marker $SetupVersion $Hive $KeyPath
  if ($code -eq 2) { return @(2, $second) }
  if ($null -ne $code) { return @(1, $second) }
  $wanted = $second
  if ($marker -lt $wanted) { return @(0, "the sandbox was set up for setup version $marker, older than setup version $wanted") }
  return @(1, "the sandbox is already set up for setup version $marker")
}

if ($MyInvocation.InvocationName -eq '.') { return }

if ($RecordFile) { $SetupVersion = Read-SetupRecord $RecordFile }
if ($SetUpAgain) {
  $code, $reason = Invoke-SetUpAgainCheck -SetupVersion $SetupVersion -Hive LocalMachine -KeyPath 'SOFTWARE\sandbox-runtime'
} else {
  $code, $reason = Invoke-SetupGuard -SetupVersion $SetupVersion -Hive LocalMachine -KeyPath 'SOFTWARE\sandbox-runtime'
}
Write-Output $reason
exit $code
