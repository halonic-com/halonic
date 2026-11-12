# Fetches the pinned vcruntime140.dll (HAL-8068, S-9 of HAL-7414) into
# binaries/, where the installer ships it next to the sandbox helper. The
# helper copies it beside srt-win in Program Files, because a clean Windows
# has no Visual C++ runtime and srt-win imports it.
#
# windows/vcruntime.json pins Microsoft's Visual C++ Redistributable by
# SHA-256, and the DLL inside it by SHA-256; the helper has the DLL's hash
# built in (tests/runtime_hash.rs keeps the two equal). Anything that doesn't
# match stops the build. Needs 7-Zip (`7z`) on PATH, as the GitHub runners have.
#
# Run from apps/studio/src-tauri on Windows x64:  pwsh windows/fetch-vcruntime.ps1
$ErrorActionPreference = 'Stop'
$shell = Split-Path -Parent $PSScriptRoot
$pin = Get-Content (Join-Path $PSScriptRoot 'vcruntime.json') -Raw | ConvertFrom-Json
$bin = Join-Path $shell 'binaries'
New-Item -ItemType Directory -Force $bin | Out-Null
$out = Join-Path $bin 'vcruntime140.dll'

$work = Join-Path ([IO.Path]::GetTempPath()) "halonic-vcruntime-$([guid]::NewGuid())"
New-Item -ItemType Directory $work | Out-Null
try {
  $redist = Join-Path $work 'VC_redist.x64.exe'
  Invoke-WebRequest -Uri $pin.redistributable.url -OutFile $redist
  if ((Get-FileHash $redist -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.redistributable.sha256) {
    throw "the Visual C++ Redistributable isn't the pinned one (windows/vcruntime.json)"
  }
  # The installer's own packages are a cabinet attached after its program:
  # the last one in the file.
  $bytes = [IO.File]::ReadAllBytes($redist)
  $start = -1
  for ($i = $bytes.Length - 8; $i -ge 0; $i--) {
    if ($bytes[$i] -eq 0x4D -and $bytes[$i + 1] -eq 0x53 -and $bytes[$i + 2] -eq 0x43 -and $bytes[$i + 3] -eq 0x46 -and
        $bytes[$i + 4] -eq 0 -and $bytes[$i + 5] -eq 0 -and $bytes[$i + 6] -eq 0 -and $bytes[$i + 7] -eq 0) { $start = $i; break }
  }
  if ($start -lt 0) { throw 'no attached cabinet in the Visual C++ Redistributable' }
  $attached = Join-Path $work 'attached.cab'
  [IO.File]::WriteAllBytes($attached, $bytes[$start..($bytes.Length - 1)])
  $packages = Join-Path $work 'packages'
  & 7z x -y "-o$packages" $attached | Out-Null
  if ($LASTEXITCODE -ne 0) { throw '7z could not open the attached cabinet' }
  $name = $pin.files.x64.name
  foreach ($package in Get-ChildItem $packages -File) {
    & 7z e -y "-o$work" $package.FullName $name 2>$null | Out-Null
    if (Test-Path (Join-Path $work $name)) { break }
  }
  $found = Join-Path $work $name
  if (-not (Test-Path $found)) { throw "$name isn't in the Visual C++ Redistributable" }
  if ((Get-FileHash $found -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.files.x64.sha256) {
    throw "$name isn't the pinned file (windows/vcruntime.json)"
  }
  Copy-Item $found $out -Force
} finally {
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output "vcruntime140.dll $($pin.redistributable.version): $out"
