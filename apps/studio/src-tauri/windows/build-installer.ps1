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
#
# -AgentHost names an executable to ship in place of the agent host. The
# update test builds a 0.1.2 whose host is a stand-in that never answers, so
# the shell never proves it starts.
#
# -Runtime names a folder holding the WSL runtime runtime-archive.sh packed
# (halonic-runtime.tar.gz and halonic-runtime.json). The installer then puts
# both next to Halonic.exe, where the shell finds the runtime it installs in
# Halonic's distro (HAL-15136). Tauri refuses a resource whose file is
# missing, so they come in through their own config (tauri.runtime.conf.json)
# and a build without -Runtime ships no runtime. Both steps need it: the
# build checks the resources, the pack packs them.
#
# -Image names a folder holding Halonic's WSL image as infra/wsl-image's
# build.sh writes it (halonic-wsl.tar.gz, and sizes.json, whose sha256 pins
# it). The installer then puts the image next to Halonic.exe, where the
# shell finds it for the WSL setup (HAL-16773). sizes.json only checks the
# build: nothing reads it on the PC, so it isn't shipped. Like the runtime,
# the image has its own config (tauri.image.conf.json), and both steps need it.
param(
  [ValidateSet('all', 'build', 'pack')]
  [string]$Step = 'all',
  [string]$Config,
  [string]$AgentHost,
  [string]$Runtime,
  [string]$Image
)
$ErrorActionPreference = 'Stop'
# The release workflow sets HALONIC_SANDBOX_SIGNER to an empty string for an
# unsigned run. Cargo's option_env! reads that as a publisher with no name, and
# the helper would then refuse its own copy with exit 35 (HAL-9057). Unset, it
# means no publisher, as in dev builds.
if (-not $env:HALONIC_SANDBOX_SIGNER) { Remove-Item Env:HALONIC_SANDBOX_SIGNER -ErrorAction SilentlyContinue }
$shell = Split-Path -Parent $PSScriptRoot
$repo = (Resolve-Path (Join-Path $shell '../../..')).Path
$triple = 'x86_64-pc-windows-msvc'
$bin = Join-Path $shell 'binaries'
# Tauri packs the external binaries from here, not from its target folder, so
# this is the copy that must be signed.
$packedHelper = Join-Path $bin "halonic-sandbox-elevate-$triple.exe"

$version = (Get-Content (Join-Path $shell 'tauri.conf.json') -Raw | ConvertFrom-Json).version
$configs = @('--config', 'tauri.installer.conf.json')
if ($Runtime) {
  # The manifest pins the archive, as the shell checks before it installs it,
  # so a mismatched pair stops the build rather than ship.
  $Runtime = (Resolve-Path $Runtime).Path
  $runtimeArchive = Join-Path $Runtime 'halonic-runtime.tar.gz'
  $runtimeManifest = Join-Path $Runtime 'halonic-runtime.json'
  foreach ($f in $runtimeArchive, $runtimeManifest) {
    if (-not (Test-Path $f -PathType Leaf)) { throw "-Runtime: $f is missing" }
  }
  $pinned = (Get-Content $runtimeManifest -Raw | ConvertFrom-Json).sha256
  $actual = (Get-FileHash $runtimeArchive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($pinned -ne $actual) { throw "-Runtime: halonic-runtime.json pins $pinned, the archive is $actual" }
  New-Item -ItemType Directory -Force $bin | Out-Null
  Copy-Item $runtimeArchive, $runtimeManifest $bin -Force
  $configs += @('--config', 'tauri.runtime.conf.json')
}
if ($Image) {
  # wsl --import doesn't check the image, so a truncated or mixed-up
  # artifact stops the build here rather than fail a setup on the PC.
  $Image = (Resolve-Path $Image).Path
  $imageArchive = Join-Path $Image 'halonic-wsl.tar.gz'
  $imageSizes = Join-Path $Image 'sizes.json'
  foreach ($f in $imageArchive, $imageSizes) {
    if (-not (Test-Path $f -PathType Leaf)) { throw "-Image: $f is missing" }
  }
  $imagePinned = (Get-Content $imageSizes -Raw | ConvertFrom-Json).sha256
  $imageActual = (Get-FileHash $imageArchive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($imagePinned -ne $imageActual) { throw "-Image: sizes.json pins $imagePinned, the image is $imageActual" }
  New-Item -ItemType Directory -Force $bin | Out-Null
  Copy-Item $imageArchive $bin -Force
  $configs += @('--config', 'tauri.image.conf.json')
}
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
  $hostExe = if ($AgentHost) { (Resolve-Path $AgentHost).Path } else { Join-Path $repo 'apps/agent-host/dist/halonic-agent-host.exe' }
  Copy-Item $hostExe (Join-Path $bin "halonic-agent-host-$triple.exe") -Force

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
  # srt-win imports vcruntime140.dll, which a clean Windows doesn't have. The
  # pinned, hash-checked copy goes next to the helper, which puts it beside
  # srt-win in Program Files. It is named vcruntime140.dll.pinned there, so
  # nothing started from the app folder can load it from there (HAL-8068).
  # The installer copies it, and first shows Microsoft's licence for it, only
  # when the sandbox step is chosen (HAL-17810).
  # -Target is a guard for later: $triple is x64 only, and the fetch refuses
  # anything else until an arm64 installer exists (HAL-8151).
  & (Join-Path $PSScriptRoot 'fetch-vcruntime.ps1') -Target $triple

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
  # The Microsoft runtime the installer ships beside the helper is not an npm
  # library or a crate, so check:sbom doesn't list it (HAL-8151).
  $notices = Join-Path $legal 'THIRD-PARTY-NOTICES.txt'
  Add-Content $notices "`n$('=' * 72)`n" -Encoding utf8
  Add-Content $notices (Get-Content (Join-Path $PSScriptRoot 'vcruntime-notice.txt') -Raw) -Encoding utf8

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

# The installer's rollback guard (HAL-5404 S3) needs the Windows setup version
# its srt needs, from the one record, and packs setup-guard.ps1.
$setupVersion = [string](Get-Content (Join-Path $repo 'packages/adapters/sandbox-srt/windows-setup-version.json') -Raw | ConvertFrom-Json).setupVersion
if ($setupVersion -notmatch '^[1-9][0-9]*$') { throw "srt's Windows setup version '$setupVersion' isn't a whole number above zero" }
$env:HALONIC_SRT_SETUP_VERSION = $setupVersion
$env:HALONIC_SETUP_GUARD = Join-Path $PSScriptRoot 'setup-guard.ps1'
# The DLL and Microsoft's licence for it, which the installer packs outside
# Tauri's resources: it installs them only for the sandbox step (HAL-17810).
foreach ($f in 'vcruntime140.dll', 'vcruntime-licence.rtf') {
  if (-not (Test-Path (Join-Path $bin $f) -PathType Leaf)) { throw "$f is missing from binaries/; fetch-vcruntime.ps1 writes it" }
}
$env:HALONIC_VCRUNTIME = Join-Path $bin 'vcruntime140.dll'
$env:HALONIC_VCRUNTIME_LICENCE = Join-Path $bin 'vcruntime-licence.rtf'
# A signed release's installer starts the helper only when it is signed by
# HALONIC_SANDBOX_SIGNER (HAL-16342). NSIS can't tell an unset variable from
# a name, so this says whether there is one.
$env:HALONIC_HELPER_SIGNED = if ($env:HALONIC_SANDBOX_SIGNER) { 'yes' } else { 'no' }

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

# Every program in the installer must be unsigned or validly signed: a
# signature broken by a later change looks like tampering to Smart App Control
# and antivirus (HAL-20055). 7-Zip unpacks NSIS installers.
$unpacked = Join-Path ([System.IO.Path]::GetTempPath()) "halonic-installer-$version"
Remove-Item -Recurse -Force $unpacked -ErrorAction SilentlyContinue
try {
  & 7z x -y "-o$unpacked" $out | Out-Null
  if ($LASTEXITCODE -ne 0) { throw '7z could not unpack the installer' }
  # The security directory first: Authenticode calls one that holds no
  # certificate "not signed", which would pass below. The check writes every
  # program it finds to $programs, so Authenticode also sees programs with
  # other names, such as vcruntime140.dll.pinned.
  $programs = "$unpacked.programs.txt"
  node (Join-Path $repo 'apps/agent-host/scripts/check-signatures.ts') $unpacked $programs
  if ($LASTEXITCODE -ne 0) { throw 'a program in the installer has a broken security directory' }
  foreach ($program in Get-Content -LiteralPath $programs) {
    $status = (Get-AuthenticodeSignature -LiteralPath $program).Status
    Write-Output "Authenticode $status`: $($program.Substring($unpacked.Length + 1))"
    if ($status -ne 'NotSigned' -and $status -ne 'Valid') { throw "$program in the installer: signature is $status" }
  }
  # The WebView2 bootstrapper ships inside the installer (embedBootstrapper),
  # which runs it on a PC without WebView2. Unsigned would pass above, so it
  # must be validly signed by Microsoft here (HAL-20166).
  $bootstrapper = Get-ChildItem $unpacked -Recurse -File -Filter 'MicrosoftEdgeWebview2Setup.exe' | Select-Object -First 1
  if (-not $bootstrapper) { throw 'the WebView2 bootstrapper is missing from the installer' }
  $signature = Get-AuthenticodeSignature -LiteralPath $bootstrapper.FullName
  $signer = if ($signature.SignerCertificate) { $signature.SignerCertificate.GetNameInfo('SimpleName', $false) } else { '' }
  if ($signature.Status -ne 'Valid' -or $signer -ne 'Microsoft Corporation') {
    throw "the WebView2 bootstrapper in the installer: signature is $($signature.Status), signer '$signer'"
  }
  Write-Output "$($bootstrapper.Name): Authenticode $($signature.Status), signed by $signer"
} finally { Remove-Item -Recurse -Force $unpacked, "$unpacked.programs.txt" -ErrorAction SilentlyContinue }
