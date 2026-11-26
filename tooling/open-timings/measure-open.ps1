# Starts the installed Studio, lets it reopen examples/acme, closes it and
# writes the `timings` lines of studio/shell.log to the job summary as a table
# (HAL-19600). Fails only when opening takes longer than the 10 s budget, or
# never answers: shared runners have no Halonic WSL distro and vary, so a
# tight gate would be flaky.
#
# Studio takes no folder from its arguments (security review HAL-14212), so
# the folder gets there as a person's would: picked once (the profile's
# picked-folders.json), in Recent and shown in Studio's window at the last
# quit. A first start puts it in Recent through WebView2's DevTools port; the
# second start, the one measured, reopens it by itself.
param(
  [Parameter(Mandatory)][string]$InstallFolder
)
$ErrorActionPreference = 'Stop'

# The repo's pinned Node, through pnpm: the runner's own can't run .ts.
$repo = Resolve-Path (Join-Path $PSScriptRoot '../..')
$cli = Join-Path $PSScriptRoot 'src/cli.ts'
$profileFolder = Join-Path $env:RUNNER_TEMP 'open-timings-profile'
$workspace = Join-Path $env:RUNNER_TEMP 'acme'
$log = Join-Path $profileFolder 'studio\shell.log'
$devtools = 9333

# A copy, so the engine writes nothing into the checkout.
Remove-Item $profileFolder, $workspace -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $repo 'examples/acme') $workspace -Recurse
$location = (Get-Item $workspace).FullName
New-Item -ItemType Directory -Force (Join-Path $profileFolder 'studio') | Out-Null
# No identity: the shell takes it on the first reopen, as for an entry from
# before it read them on Windows.
@{ version = 1; folders = @(@{ location = $location }) } | ConvertTo-Json -Depth 4 |
  Set-Content (Join-Path $profileFolder 'studio\picked-folders.json') -Encoding utf8NoBOM
# Without a saved choice, Windows starts the agent host in Halonic's WSL
# distro, which the runner lacks: the start is refused and writes no `start`
# or `ready` line. A saved `srt` choice starts it beside the shell instead.
New-Item -ItemType Directory -Force (Join-Path $profileFolder 'sandbox') | Out-Null
@{ backend = 'srt'; chosenAt = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json |
  Set-Content (Join-Path $profileFolder 'sandbox\sandbox-setting.json') -Encoding utf8NoBOM

# WebView2's registry policy beats the shell's own browser arguments; the
# per-user key alone opened no port on the runner, so both, as test-update.ps1
# does (the runner is an administrator). Only the first start needs the port.
$policyKeys = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments', 'HKCU:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
$env:HALONIC_HOME = $profileFolder
$exe = Join-Path $InstallFolder 'Halonic.exe'

function Stop-Halonic {
  Get-Process Halonic, halonic-agent-host -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2
}

try {
  foreach ($key in $policyKeys) {
    New-Item -Path $key -Force | Out-Null
    New-ItemProperty -Path $key -Name 'Halonic.exe' -Value "--remote-debugging-port=$devtools" -PropertyType String -Force | Out-Null
  }
  Start-Process $exe | Out-Null
  pnpm --dir $repo exec node $cli remember $devtools $location | Out-Host
  if ($LASTEXITCODE -ne 0) {
    # What ran and what listened, so a failure tells "no port" from "no page".
    Get-Process Halonic, halonic-agent-host, msedgewebview2 -ErrorAction SilentlyContinue | Format-Table Name, Id, StartTime | Out-Host
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -in '127.0.0.1', '::1', '0.0.0.0', '::' } | Sort-Object LocalPort | Format-Table LocalAddress, LocalPort, OwningProcess | Out-Host
    Get-CimInstance Win32_Process -Filter "Name like 'msedgewebview2%'" -ErrorAction SilentlyContinue | Select-Object -First 2 -ExpandProperty CommandLine | Out-Host
    Get-Content $log -ErrorAction SilentlyContinue | Select-Object -Last 40 | Out-Host
    throw 'Could not put the workspace in Recent'
  }
  # WebView2 writes localStorage to disk a few seconds after a change.
  Start-Sleep -Seconds 10
  Stop-Halonic
} finally {
  foreach ($key in $policyKeys) { Remove-ItemProperty -Path $key -Name 'Halonic.exe' -ErrorAction SilentlyContinue }
}

# The measured start: a fresh log, then wait for a window's engine line and
# the agent host's, which the shell starts only once the page's engine is ready.
Remove-Item $log -ErrorAction SilentlyContinue
Start-Process $exe | Out-Null
foreach ($i in 1..60) {
  Start-Sleep -Seconds 2
  if ((Test-Path $log) -and
    (Select-String -Path $log -Pattern "timings: a window's engine" -Quiet) -and
    (Select-String -Path $log -Pattern 'timings: the agent host started' -Quiet)) { break }
}
Stop-Halonic
if (-not (Select-String -Path $log -Pattern 'timings: the agent host started' -Quiet -ErrorAction SilentlyContinue)) {
  # Not a failure, but the table then lacks `start` and `ready`: say why.
  Write-Output 'No agent host start line; the end of shell.log:'
  Get-Content $log -ErrorAction SilentlyContinue | Select-Object -Last 40 | Out-Host
}
Remove-Item Env:HALONIC_HOME

$summary = pnpm --silent --dir $repo exec node $cli summary $log
$flagged = $LASTEXITCODE
$summary | Out-Host
if ($env:GITHUB_STEP_SUMMARY) { $summary | Add-Content $env:GITHUB_STEP_SUMMARY -Encoding utf8 }
if ($flagged -ne 0) {
  Get-Content $log -ErrorAction SilentlyContinue | Select-Object -Last 40 | Out-Host
  throw 'Opening examples/acme was flagged; see the job summary'
}
