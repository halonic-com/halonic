# The update test (HAL-1206, flow-install-update 4.5 and 4.6, failure path 2).
# Both installers are built with the test key's public half and the update
# address http://127.0.0.1:8765/latest.json, which this script serves.
#   1. 0.1.0 is installed, finds 0.1.1, downloads it and, on "Restart to
#      update", installs it and opens again as 0.1.1. A workspace file, a run
#      log and the settings are byte-for-byte the same afterwards, and the
#      install record is cleared by the new version's first start.
#   2. A 0.1.2 whose signature is made with another key is refused: the
#      state is signature-mismatch and 0.1.1 stays installed.
#   3. A 0.1.2 whose download fails changes nothing either.
# The updater is driven through the Studio page's own update_* commands
# (update-driver.mjs), so the test takes the path a person takes.
param(
  [Parameter(Mandatory)][string]$OldSetup,
  [Parameter(Mandatory)][string]$NewSetup,
  [Parameter(Mandatory)][string]$Key,
  [Parameter(Mandatory)][string]$OtherKey,
  [Parameter(Mandatory)][string]$Serve
)
$ErrorActionPreference = 'Stop'
$port = 8765
$devtools = 9222
$address = "http://127.0.0.1:$port"
$dir = Join-Path $env:LOCALAPPDATA 'Programs\Halonic'
$profileFolder = Join-Path $env:LOCALAPPDATA 'halonic'
$record = Join-Path $profileFolder 'updates\updater.json'
$driver = Join-Path $PSScriptRoot 'update-driver.mjs'
$studio = Resolve-Path (Join-Path $PSScriptRoot '../..')

# The test key has no password. Signs with --app-version, as the release
# does: the app requires the signature to name the version.
function Get-Signature([string]$File, [string]$Version, [string]$KeyFile) {
  Push-Location $studio
  try {
    pnpm exec tauri signer sign --app-version $Version --private-key-path $KeyFile --password '' $File | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "signing $File failed" }
  } finally { Pop-Location }
  $text = (Get-Content "$File.sig" -Raw).Trim()
  Remove-Item "$File.sig"
  $text
}

function Set-Manifest([string]$Version, [string]$FileName, [string]$Signature) {
  $manifest = [ordered]@{
    version   = $Version
    notes     = "Update test $Version"
    pub_date  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    platforms = @{ 'windows-x86_64' = @{ url = "$address/$FileName"; signature = $Signature } }
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $Serve 'latest.json') -Encoding utf8NoBOM
}

function Invoke-Driver {
  node $driver $devtools @args | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "update-driver $args failed" }
}

# Started from this shell, so WebView2 opens its DevTools port for the driver.
function Start-Halonic {
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$devtools"
  try { Start-Process (Join-Path $dir 'Halonic.exe') | Out-Null }
  finally { Remove-Item Env:\WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS }
}

function Stop-Halonic {
  Get-Process Halonic, halonic-agent-host -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2
}

# Halonic.exe's version, as major.minor.patch: Windows may add a fourth part.
function Get-InstalledVersion {
  $text = (Get-Item (Join-Path $dir 'Halonic.exe')).VersionInfo.ProductVersion
  (($text -split '[.+-]')[0..2]) -join '.'
}

function Assert-UserData([hashtable]$Before) {
  foreach ($file in $Before.Keys) {
    $now = (Get-FileHash $file -Algorithm SHA256).Hash
    if ($now -ne $Before[$file]) { throw "$file changed" }
  }
  Write-Output "user data unchanged: $($Before.Count) files"
}

New-Item -ItemType Directory -Force $Serve | Out-Null
$server = Start-Process python -ArgumentList '-m', 'http.server', "$port", '--bind', '127.0.0.1', '--directory', $Serve -PassThru -WindowStyle Hidden
try {
  # Halonic 0.1.0, and the user's data from using it.
  $p = Start-Process $OldSetup -ArgumentList '/S' -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "the 0.1.0 installer exited with $($p.ExitCode)" }
  if ((Get-InstalledVersion) -ne '0.1.0') { throw "installed $(Get-InstalledVersion), not 0.1.0" }
  $workspace = Join-Path $env:RUNNER_TEMP 'update-workspace'
  $seeded = @{
    (Join-Path $profileFolder 'settings\host.json')                      = '{"version":1,"values":{}}'
    (Join-Path $profileFolder 'workspaces\update-test\runs\run-1.jsonl') = '{"type":"run.started","runId":"run-1"}'
    (Join-Path $workspace 'halonic.yaml')                                = 'name: update-test'
  }
  $before = @{}
  foreach ($file in $seeded.Keys) {
    New-Item -ItemType Directory -Force (Split-Path $file) | Out-Null
    Set-Content $file $seeded[$file] -Encoding utf8NoBOM
    $before[$file] = (Get-FileHash $file -Algorithm SHA256).Hash
  }

  # 1. 0.1.0 updates to 0.1.1 on "Restart to update" and opens again.
  $newName = Split-Path $NewSetup -Leaf
  Copy-Item $NewSetup (Join-Path $Serve $newName)
  Set-Manifest '0.1.1' $newName (Get-Signature (Join-Path $Serve $newName) '0.1.1' $Key)
  Start-Halonic
  Invoke-Driver wait ready 300
  Invoke-Driver call update_restart
  $reopened = $false
  foreach ($i in 1..90) {
    Start-Sleep -Seconds 2
    if ((Get-InstalledVersion) -eq '0.1.1' -and (Get-Process Halonic -ErrorAction SilentlyContinue)) {
      $reopened = $true
      break
    }
  }
  if (-not $reopened) { throw "Halonic didn't reopen as 0.1.1 (installed: $(Get-InstalledVersion))" }
  $entry = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Halonic'
  if ($entry.DisplayVersion -ne '0.1.1') { throw "the uninstall entry says $($entry.DisplayVersion)" }
  # The new version's first start reads the install record and clears it.
  $cleared = $false
  foreach ($i in 1..30) {
    Start-Sleep -Seconds 2
    $saved = Get-Content $record -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
    if ($saved -and -not $saved.install) { $cleared = $true; break }
  }
  if (-not $cleared) { throw "0.1.1 didn't clear the install record: $(Get-Content $record -Raw)" }
  Assert-UserData $before
  Stop-Halonic

  # 2. A signature from another key: refused, deleted, nothing installed.
  Set-Manifest '0.1.2' $newName (Get-Signature (Join-Path $Serve $newName) '0.1.2' $OtherKey)
  Start-Halonic
  Invoke-Driver wait signature-mismatch 300
  Stop-Halonic
  if ((Get-InstalledVersion) -ne '0.1.1') { throw "a bad signature changed the install to $(Get-InstalledVersion)" }
  Assert-UserData $before

  # 3. A download that fails: nothing changes.
  Set-Manifest '0.1.2' 'missing-setup.exe' (Get-Signature (Join-Path $Serve $newName) '0.1.2' $Key)
  Start-Halonic
  Invoke-Driver wait download-failed 300
  Stop-Halonic
  if ((Get-InstalledVersion) -ne '0.1.1') { throw "a failed download changed the install to $(Get-InstalledVersion)" }
  Assert-UserData $before
  Write-Output 'update test passed'
} finally {
  Stop-Halonic
  $server | Stop-Process -Force -ErrorAction SilentlyContinue
  $uninstall = Join-Path $dir 'uninstall.exe'
  if (Test-Path $uninstall) { Start-Process $uninstall -ArgumentList '/S' -Wait | Out-Null }
}
