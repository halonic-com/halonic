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
# The installer runs it from its own plugins folder (installer.nsi,
# CheckSetupVersion). Dot-sourced, it only defines its functions, so
# test-setup-guard.ps1 can point them at a key of its own.
param(
  [string]$SetupVersion,
  [string]$RecordFile
)

# The setup version of the versions kept before the record existed.
$setupVersionBeforeRecords = '3'

function Read-SetupRecord([string]$RecordFile) {
  if (-not (Test-Path -LiteralPath $RecordFile -PathType Leaf)) { return $setupVersionBeforeRecords }
  return ([string](Get-Content -LiteralPath $RecordFile -Raw)).Trim()
}

function Invoke-SetupGuard([string]$SetupVersion, [Microsoft.Win32.RegistryHive]$Hive, [string]$KeyPath) {
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
  if ($marker -le $wanted) { return @(0, "the sandbox was set up for setup version $marker") }
  return @(1, "the sandbox was set up for setup version $marker, newer than setup version $wanted")
}

if ($MyInvocation.InvocationName -eq '.') { return }

if ($RecordFile) { $SetupVersion = Read-SetupRecord $RecordFile }
$code, $reason = Invoke-SetupGuard -SetupVersion $SetupVersion -Hive LocalMachine -KeyPath 'SOFTWARE\sandbox-runtime'
Write-Output $reason
exit $code
