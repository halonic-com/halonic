# A signed release's installer starts the sandbox helper only when Windows
# trusts its signature and it names the release's publisher (HAL-16342). CI
# builds no signed release, so this packs CI's build again with a publisher,
# as `build-installer.ps1 -Step pack` does in a release, but with the helper
# left unsigned, as a swapped one would be (HAL-16540). Then, with the
# runner's administrator rights, where Windows shows no prompt:
#   - the install's pages end on "The setup stopped: the sandbox helper isn't
#     signed by Halonic", and no srt-sandbox account was made;
#   - a silent install with /SANDBOX=1 makes none either, and exits with 41
#     (HAL-16947);
#   - with a sandbox set up, the uninstaller's pages end on "The removal
#     stopped: …" with the same reason, and the sandbox is still there;
#   - a silent uninstall leaves it there too, and exits with 41.
# Run from the repo root after `build-installer.ps1` (both steps) has run. The
# last step of the job: it leaves the sandbox set up.
param(
  [Parameter(Mandatory)][string]$InstallFolder,
  [Parameter(Mandatory)][string]$OutFolder
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $OutFolder | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class S {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h, int id);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  public static string Text(IntPtr h) { var s = new StringBuilder(200); GetWindowText(h, s, 200); return s.ToString(); }
}
'@

function Save-Picture([IntPtr]$h, [string]$name) {
  [S]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 700
  $r = New-Object S+RECT
  [S]::GetWindowRect($h, [ref]$r) | Out-Null
  $bmp = New-Object System.Drawing.Bitmap ($r.R - $r.L), ($r.B - $r.T)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size)
  $bmp.Save((Join-Path $OutFolder "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
function Button-Text([IntPtr]$h) { return [S]::Text([S]::GetDlgItem($h, 1)) }
function Wait-Button([IntPtr]$h, [string]$text, [int]$seconds) {
  foreach ($i in 1..($seconds * 2)) {
    if ((Button-Text $h) -eq $text -and [S]::IsWindowEnabled([S]::GetDlgItem($h, 1))) { return }
    Start-Sleep -Milliseconds 500
  }
  Save-Picture $h "stuck-waiting-for-$($text -replace '\W', '')"
  throw "The button never said '$text'; it says '$(Button-Text $h)'"
}
function Must-Find([IntPtr]$h, [string]$text, [string]$class) {
  $inner = [S]::FindWindowEx($h, [IntPtr]::Zero, '#32770', $null)
  $c = [S]::FindWindowEx($inner, [IntPtr]::Zero, $class, $text)
  if ($c -eq [IntPtr]::Zero) { throw "The page has no '$text'" }
  return $c
}
function Click([IntPtr]$c) { [S]::SendMessage($c, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null; Start-Sleep -Milliseconds 300 }
function Wait-Closed([IntPtr]$h, [int]$seconds, [string]$what) {
  foreach ($i in 1..($seconds * 2)) {
    if (-not [S]::IsWindow($h)) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "$what did not close its window"
}
function Sandbox-IsSetUp {
  & net.exe user srt-sandbox *> $null
  return $LASTEXITCODE -eq 0
}
function Assert-NothingStarted([string]$what) {
  if (Sandbox-IsSetUp) { throw "$what started the unsigned helper: there is an srt-sandbox account" }
  if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\HalonicAgentSandbox') { throw "$what started the unsigned helper: it left an Installed apps entry" }
}

# 1. Pack. The same environment `build-installer.ps1` gives NSIS, with
# HALONIC_HELPER_SIGNED=yes and a publisher, but without its check that the
# helper is signed: that check is what stops a release, and here the
# installer's own check is the one under test. No -Runtime config: the
# runtime adds nothing to this test.
$shell = Split-Path -Parent $PSScriptRoot
$repo = (Resolve-Path (Join-Path $shell '../../..')).Path
$triple = 'x86_64-pc-windows-msvc'
$version = (Get-Content (Join-Path $shell 'tauri.conf.json') -Raw | ConvertFrom-Json).version
$helper = Join-Path $shell "binaries/halonic-sandbox-elevate-$triple.exe"
if ((Get-AuthenticodeSignature $helper).Status -eq 'Valid') { throw 'The packed helper is signed, so this test proves nothing' }
$env:HALONIC_SRT_SETUP_VERSION = [string](Get-Content (Join-Path $repo 'packages/adapters/sandbox-srt/windows-setup-version.json') -Raw | ConvertFrom-Json).setupVersion
$env:HALONIC_SETUP_GUARD = Join-Path $PSScriptRoot 'setup-guard.ps1'
$env:HALONIC_VCRUNTIME = Join-Path $shell 'binaries/vcruntime140.dll'
$env:HALONIC_VCRUNTIME_LICENCE = Join-Path $shell 'binaries/vcruntime-licence.rtf'
$env:HALONIC_SANDBOX_SIGNER = 'Halonic'
$env:HALONIC_HELPER_SIGNED = 'yes'
Push-Location $shell
try {
  pnpm exec tauri bundle --config tauri.installer.conf.json --bundles nsis --target $triple
  if ($LASTEXITCODE -ne 0) { throw 'tauri bundle failed' }
} finally { Pop-Location }
foreach ($name in 'HALONIC_SANDBOX_SIGNER', 'HALONIC_HELPER_SIGNED', 'HALONIC_SRT_SETUP_VERSION', 'HALONIC_SETUP_GUARD', 'HALONIC_VCRUNTIME', 'HALONIC_VCRUNTIME_LICENCE') { Remove-Item "Env:$name" }
# Outside dist/, where the other steps find the installer by a wildcard.
$setup = Join-Path $env:RUNNER_TEMP 'Halonic-publisher-unsigned-helper-setup.exe'
Copy-Item (Join-Path $shell "target/$triple/release/bundle/nsis/Halonic_${version}_x64-setup.exe") $setup -Force

if (Sandbox-IsSetUp) { throw 'The sandbox is set up before this test, so it proves nothing' }

# 2. The install's pages, with the sandbox box ticked as it starts.
$p = Start-Process $setup -ArgumentList "/D=$InstallFolder" -PassThru
$h = [IntPtr]::Zero
foreach ($i in 1..80) {
  Start-Sleep -Milliseconds 500
  $p.Refresh()
  $m = $p.MainWindowHandle
  if ($m -ne [IntPtr]::Zero -and (Button-Text $m) -eq '&Next >') { $h = $m; break }
}
if ($h -eq [IntPtr]::Zero) { throw 'The installer showed no install page with the sandbox box ticked' }
Wait-Button $h '&Next >' 20
# Posted, not sent: the install page runs its own message loop. Microsoft's
# licence page follows, as the sandbox box is ticked (HAL-17810).
[S]::PostMessage($h, 0x111, [IntPtr]1, [S]::GetDlgItem($h, 1)) | Out-Null
Wait-Button $h 'I &Agree' 20
Click ([S]::GetDlgItem($h, 1))
Wait-Button $h '&Finish' 480
Save-Picture $h '20-unsigned-helper-finish'
Must-Find $h "The setup stopped: the sandbox helper isn't signed by Halonic" 'Static' | Out-Null
Click (Must-Find $h 'Start Halonic' 'Button')
Click ([S]::GetDlgItem($h, 1))
if (-not $p.WaitForExit(30000)) { throw 'The installer did not close after Finish' }
Assert-NothingStarted 'The install'

# 3. A silent install from an elevated prompt.
# Halonic is installed, but the sandbox isn't, so it exits with the
# installer's own code for a refused helper (installer.nsi, HAL-16947).
$refusedExit = 41
$p = Start-Process $setup -ArgumentList '/S', '/SANDBOX=1', "/D=$InstallFolder" -Wait -PassThru
if ($p.ExitCode -ne $refusedExit) { throw "The silent install exited with $($p.ExitCode), not $refusedExit" }
if (-not (Test-Path (Join-Path $InstallFolder 'uninstall.exe'))) { throw 'The silent install left no uninstaller' }
Assert-NothingStarted 'The silent install with /SANDBOX=1'

# 4. The uninstaller's pages, with a sandbox to remove. The helper the agent
# host starts expects no publisher, so it sets the sandbox up.
$out = & (Join-Path $InstallFolder 'halonic-agent-host.exe') --profile-folder (Join-Path $env:RUNNER_TEMP 'unsigned-helper-profile') --sandbox-setup
if ($LASTEXITCODE -ne 0) { throw "The sandbox setup before the uninstall failed: $out" }
if (-not (Sandbox-IsSetUp)) { throw 'The sandbox account is missing after the setup' }
# It copies itself to a temporary folder and runs from there, so its window
# is found by its title.
Start-Process (Join-Path $InstallFolder 'uninstall.exe') | Out-Null
$h = [IntPtr]::Zero
foreach ($i in 1..60) {
  Start-Sleep -Milliseconds 500
  $h = [S]::FindWindow('#32770', 'Halonic Uninstall')
  if ($h -ne [IntPtr]::Zero) { break }
}
if ($h -eq [IntPtr]::Zero) { throw 'The uninstaller opened no window' }
Wait-Button $h '&Uninstall' 20
Click ([S]::GetDlgItem($h, 1))
Wait-Button $h '&Close' 300
Save-Picture $h '21-unsigned-helper-uninstalled'
Must-Find $h "The removal stopped: the sandbox helper isn't signed by Halonic" 'Static' | Out-Null
Click ([S]::GetDlgItem($h, 1))
Wait-Closed $h 15 'Close'
if (-not (Sandbox-IsSetUp)) { throw 'The uninstall removed the sandbox, so it started the unsigned helper' }

# 5. A silent uninstall from an elevated prompt, the sandbox still set up.
# Installed again first, silently and without /SANDBOX, which starts no helper.
$p = Start-Process $setup -ArgumentList '/S', "/D=$InstallFolder" -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "The silent install without /SANDBOX exited with $($p.ExitCode)" }
# `_?=` runs it in place: otherwise it copies itself to a temporary folder,
# starts that copy and exits with 0 at once, so its exit code says nothing.
$uninstaller = Join-Path $InstallFolder 'uninstall.exe'
$p = Start-Process $uninstaller -ArgumentList '/S', "_?=$InstallFolder" -Wait -PassThru
if ($p.ExitCode -ne $refusedExit) { throw "The silent uninstall exited with $($p.ExitCode), not $refusedExit" }
if (Test-Path (Join-Path $InstallFolder 'Halonic.exe')) { throw 'The silent uninstall left Halonic installed' }
if (-not (Sandbox-IsSetUp)) { throw 'The silent uninstall removed the sandbox, so it started the unsigned helper' }
# Run in place, it can't delete itself or its folder.
Remove-Item -Recurse -Force $InstallFolder
$global:LASTEXITCODE = 0
Write-Output "unsigned helper: the installs and uninstalls started nothing, said it isn't signed by Halonic, and the silent ones exited with $refusedExit"
