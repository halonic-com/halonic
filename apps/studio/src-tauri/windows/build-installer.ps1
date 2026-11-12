# Builds the Windows installer and gives it the name settled on HAL-1119:
# Halonic-<version>-windows-x64-setup.exe, in dist/ at the repo root.
#
# It is a separate config (tauri.installer.conf.json) on purpose: it names
# the agent host and the sandbox helper as external binaries, and tauri-build refuses to build
# when that file is missing, which would break every plain `cargo` build.
#
# It runs in two steps, which a release runs in different jobs (HAL-7491):
# `-Step build` builds the app and the programs it ships, and `-Step pack`
# packs them into the installer. Between the two, the release signs the
# sandbox helper, so the helper inside the installer is signed too, not only
# the setup .exe around it. Without -Step, both run, as in CI.
#
# Run from apps/studio/src-tauri on Windows x64:  pwsh windows/build-installer.ps1
#
# -Config names one more Tauri config file, merged last. The update test
# (HAL-1206) builds 0.1.0 and 0.1.1 with it, each with a test updater key and
# a local update address; a `version` in it names the installer too.
param(
  [ValidateSet('all', 'build', 'pack')]
  [string]$Step = 'all',
  [string]$Config
)
$ErrorActionPreference = 'Stop'
$shell = Split-Path -Parent $PSScriptRoot
$repo = (Resolve-Path (Join-Path $shell '../../..')).Path
$triple = 'x86_64-pc-windows-msvc'
$bin = Join-Path $shell 'binaries'
# Tauri packs the external binaries from here, not from its target folder, so
# this is the copy that must be signed.
$packedHelper = Join-Path $bin "halonic-sandbox-elevate-$triple.exe"

$version = (Get-Content (Join-Path $shell 'tauri.conf.json') -Raw | ConvertFrom-Json).version
$configs = @('--config', 'tauri.installer.conf.json')
if ($Config) {
  $Config = (Resolve-Path $Config).Path
  $extra = Get-Content $Config -Raw | ConvertFrom-Json
  if ($extra.version) { $version = $extra.version }
  $configs += @('--config', $Config)
}

if ($Step -ne 'pack') {
  # The agent host, as one executable (apps/agent-host README, "Build one executable").
  Push-Location $repo
  try {
    pnpm --filter '@halonicjs/app-agent-host' build:sea
    if ($LASTEXITCODE -ne 0) { throw 'build:sea failed' }
  } finally { Pop-Location }
  New-Item -ItemType Directory -Force $bin | Out-Null
  Copy-Item (Join-Path $repo 'apps/agent-host/dist/halonic-agent-host.exe') (Join-Path $bin "halonic-agent-host-$triple.exe") -Force

  # The sandbox's elevated helper (HAL-1451), with the static C runtime so it
  # never loads a vcruntime140.dll from the app folder, and the srt-win.exe it
  # copies into Program Files and checks against the hash built into it. Both
  # go next to Halonic.exe, as in the files Scoop unpacks. Its own target
  # folder, because RUSTFLAGS would rebuild the shell's crates otherwise.
  $callerFlags = $env:RUSTFLAGS
  $env:RUSTFLAGS = '-C target-feature=+crt-static'
  try {
    cargo build --locked --release -p halonic-sandbox-elevate --target $triple --target-dir (Join-Path $shell 'target/elevate')
    if ($LASTEXITCODE -ne 0) { throw 'the sandbox helper did not build' }
  } finally {
    if ($null -eq $callerFlags) { Remove-Item Env:RUSTFLAGS } else { $env:RUSTFLAGS = $callerFlags }
  }
  Copy-Item (Join-Path $shell "target/elevate/$triple/release/halonic-sandbox-elevate.exe") $packedHelper -Force
  $srtWin = Join-Path $repo 'packages/adapters/sandbox-srt/node_modules/@anthropic-ai/sandbox-runtime/vendor/srt-win/x64/srt-win.exe'
  Copy-Item $srtWin (Join-Path $bin 'srt-win.exe') -Force

  # The licences of the npm libraries the app and the agent host bundle
  # (HAL-6225) and of the Rust crates the app links for $triple (HAL-6962).
  # Built for the whole workspace, like the CLI release, so a library either
  # one pulls in is never left out. The folder is emptied first, so a failed
  # run can't ship an older file; Tauri fails the build when the file is
  # missing.
  $legal = Join-Path $shell 'legal'
  Remove-Item $legal -Recurse -Force -ErrorAction SilentlyContinue
  Push-Location $repo
  try {
    pnpm check:sbom --name halonic-studio --version $version --out $legal --notices --cargo apps/studio/src-tauri --cargo-target $triple
    if ($LASTEXITCODE -ne 0) { throw 'check:sbom failed' }
  } finally { Pop-Location }

  # The app itself, not yet packed.
  Push-Location $shell
  try {
    pnpm exec tauri build @configs --no-bundle --target $triple
    if ($LASTEXITCODE -ne 0) { throw 'tauri build failed' }
  } finally { Pop-Location }
}

if ($Step -eq 'build') { return }

# A release build has its publisher built in (HALONIC_SANDBOX_SIGNER) and
# must ship the helper signed by it: its UAC prompt shows that publisher, and
# the copy it leaves for Installed apps is checked against it. The release
# signs it between the two steps (HAL-7491); a helper that isn't signed by
# that publisher stops the build here rather than ship. Dev and CI builds set
# no publisher.
if ($env:HALONIC_SANDBOX_SIGNER) {
  $signature = Get-AuthenticodeSignature $packedHelper
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.GetNameInfo('SimpleName', $false) -ne $env:HALONIC_SANDBOX_SIGNER) {
    throw "the sandbox helper isn't signed by $env:HALONIC_SANDBOX_SIGNER ($($signature.Status)); sign it before it is packed (HAL-7491)"
  }
}

Push-Location $shell
try {
  pnpm exec tauri bundle @configs --bundles nsis --target $triple
  if ($LASTEXITCODE -ne 0) { throw 'tauri bundle failed' }
} finally { Pop-Location }

# Tauri has no setting for the final name, so it is renamed here. Signing is
# done later on the renamed file, so the rename can't break a signature.
$built = Join-Path $shell "target/$triple/release/bundle/nsis/Halonic_${version}_x64-setup.exe"
if (-not (Test-Path $built)) { throw "The installer isn't at $built" }
$dist = Join-Path $repo 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$out = Join-Path $dist "Halonic-$version-windows-x64-setup.exe"
Copy-Item $built $out -Force
Write-Output "Installer: $out ($([math]::Round((Get-Item $out).Length / 1MB, 1)) MB)"
