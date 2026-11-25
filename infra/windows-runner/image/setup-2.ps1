# Second step of the image build, run over SSH after setup-1's restart. Installs WSL, Node and the
# GitHub Actions runner, each from a pinned URL and checked against its SHA-256 (the digest its
# publisher lists). `wsl --install` over SSH only reaches the built-in stub ("not installed"), and
# api.github.com answers 403 to the server's IP (HAL-17807), so WSL comes from its release MSI.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$state = Join-Path $env:SystemDrive 'halonic-win'
$wslVersion = '3.0.5'
$wslSha256 = '2313efc5873e3f8552f42e77f950fabd913c0289078fa89d2100f3421a525eaa'
# Node: the version the repo's lockfile pins (devEngines); digest from nodejs.org's SHASUMS256.txt.
$nodeVersion = '26.13.0'
$nodeSha256 = '0e5ee99c7cbf922887f04af268e3665990748945336a44956f47cc0df695b6df'
$runnerVersion = '2.338.2'
$runnerSha256 = 'a1f17aa987fc8158bc7521d284912267a0d01b7c2c4684b33c86783b5e8221cc'

# Get-Pinned <url> <sha256> <file>: downloads the file and fails unless its SHA-256 matches.
function Get-Pinned([string]$Url, [string]$Sha256, [string]$OutFile) {
  Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
  $actual = (Get-FileHash $OutFile -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $Sha256) { throw "$(Split-Path $OutFile -Leaf) SHA-256 is $actual, expected $Sha256" }
}

# Install-Msi <msi> <name>: a quiet install with a log; 3010 means done, restart needed.
function Install-Msi([string]$Msi, [string]$Name) {
  $install = Start-Process msiexec.exe -ArgumentList '/i', $Msi, '/qn', '/norestart', '/l*v', "$state\$Name-msi.log" -Wait -PassThru
  if ($install.ExitCode -ne 0 -and $install.ExitCode -ne 3010) { throw "$Name MSI failed with $($install.ExitCode)" }
  Remove-Item $Msi
}

if (-not (Test-Path "$state\setup-1.done")) { throw 'setup-1.ps1 has not finished' }
foreach ($file in 'run-job.ps1', 'job-started.ps1', 'job-started.mjs') {
  if (-not (Test-Path "$state\$file")) { throw "$file wasn't copied to $state" }
}

Get-Pinned "https://github.com/microsoft/WSL/releases/download/$wslVersion/wsl.$wslVersion.0.x64.msi" $wslSha256 "$state\wsl.msi"
Install-Msi "$state\wsl.msi" 'wsl'
# wsl.exe writes UTF-16; this only has to show the versions in the build log.
& wsl.exe --version
if ($LASTEXITCODE -ne 0) { throw "wsl --version failed with $LASTEXITCODE" }
& wsl.exe --set-default-version 2
if ($LASTEXITCODE -ne 0) { throw "wsl --set-default-version failed with $LASTEXITCODE" }

Get-Pinned "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-x64.msi" $nodeSha256 "$state\node.msi"
Install-Msi "$state\node.msi" 'node'
$node = & "$env:ProgramFiles\nodejs\node.exe" --version
if ($node -ne "v$nodeVersion") { throw "node --version says $node, expected v$nodeVersion" }

# The runner runs from here (run-job.ps1); each job VM starts from this copy with no registration.
$runner = Join-Path $env:SystemDrive 'actions-runner'
$zip = "$state\actions-runner.zip"
Get-Pinned "https://github.com/actions/runner/releases/download/v$runnerVersion/actions-runner-win-x64-$runnerVersion.zip" $runnerSha256 $zip
if (Test-Path $runner) { Remove-Item $runner -Recurse -Force }
Expand-Archive $zip -DestinationPath $runner
Remove-Item $zip
if (-not (Test-Path "$runner\run.cmd")) { throw "the runner zip has no run.cmd" }
Write-Output "node $node, actions runner $runnerVersion"
