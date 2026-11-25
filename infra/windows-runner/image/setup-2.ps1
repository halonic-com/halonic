# Second step of the image build, run over SSH after setup-1's restart. Installs WSL from its MSI.
# `wsl --install` over SSH only reaches the built-in stub ("not installed"), and api.github.com
# answers 403 to the server's IP (HAL-17807), so the MSI comes from a pinned direct release URL
# and is checked against its SHA-256 (the digest GitHub lists for the asset).
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$state = Join-Path $env:SystemDrive 'halonic-win'
$wslVersion = '3.0.5'
$wslSha256 = '2313efc5873e3f8552f42e77f950fabd913c0289078fa89d2100f3421a525eaa'

if (-not (Test-Path "$state\setup-1.done")) { throw 'setup-1.ps1 has not finished' }
$msi = "$state\wsl.msi"
$url = "https://github.com/microsoft/WSL/releases/download/$wslVersion/wsl.$wslVersion.0.x64.msi"
Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing
$actual = (Get-FileHash $msi -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $wslSha256) { throw "wsl.msi SHA-256 is $actual, expected $wslSha256" }

$install = Start-Process msiexec.exe -ArgumentList '/i', $msi, '/qn', '/norestart', '/l*v', "$state\wsl-msi.log" -Wait -PassThru
if ($install.ExitCode -ne 0 -and $install.ExitCode -ne 3010) { throw "WSL MSI failed with $($install.ExitCode)" }
Remove-Item $msi

# wsl.exe writes UTF-16; this only has to show the versions in the build log.
& wsl.exe --version
if ($LASTEXITCODE -ne 0) { throw "wsl --version failed with $LASTEXITCODE" }
& wsl.exe --set-default-version 2
if ($LASTEXITCODE -ne 0) { throw "wsl --set-default-version failed with $LASTEXITCODE" }
