# Builds the Windows installer and gives it the name settled on HAL-1119:
# Halonic-<version>-windows-x64-setup.exe, in dist/ at the repo root.
#
# It is a separate config (tauri.installer.conf.json) on purpose: it names
# the agent host as an external binary, and tauri-build refuses to build
# when that file is missing, which would break every plain `cargo` build.
#
# Run from apps/studio/src-tauri on Windows x64:  pwsh windows/build-installer.ps1
$ErrorActionPreference = 'Stop'
$shell = Split-Path -Parent $PSScriptRoot
$repo = (Resolve-Path (Join-Path $shell '../../..')).Path
$triple = 'x86_64-pc-windows-msvc'

$version = (Get-Content (Join-Path $shell 'tauri.conf.json') -Raw | ConvertFrom-Json).version

# The agent host, as one executable (apps/agent-host README, "Build one executable").
Push-Location $repo
try {
  pnpm --filter '@halonicjs/app-agent-host' build:sea
  if ($LASTEXITCODE -ne 0) { throw 'build:sea failed' }
} finally { Pop-Location }
$bin = Join-Path $shell 'binaries'
New-Item -ItemType Directory -Force $bin | Out-Null
Copy-Item (Join-Path $repo 'apps/agent-host/dist/halonic-agent-host.exe') (Join-Path $bin "halonic-agent-host-$triple.exe") -Force

Push-Location $shell
try {
  pnpm exec tauri build --config tauri.installer.conf.json --bundles nsis --target $triple
  if ($LASTEXITCODE -ne 0) { throw 'tauri build failed' }
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
