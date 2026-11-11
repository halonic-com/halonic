# Checks the installer's two stops before page 1 (HAL-1202, flow 2.5), with
# Halonic already installed in -InstallFolder:
#   - "Halonic is open": Cancel quits and leaves Halonic running; Retry after
#     closing Halonic goes on to the pages.
#   - an older installer: "A newer Halonic is already installed", OK quits and
#     installs nothing; a silent one stops too.
# It saves a picture of each message for the reviewer.
param(
  [Parameter(Mandatory)][string]$Setup,
  [Parameter(Mandatory)][string]$InstallFolder,
  [Parameter(Mandatory)][string]$Version,
  [Parameter(Mandatory)][string]$OutFolder
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $OutFolder | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class M {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h, int id);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  // A message box is a top-level window of the process with a static text of id 0xFFFF.
  public static IntPtr FindMessageBox(uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h) && GetDlgItem(h, 0xFFFF) != IntPtr.Zero) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static string Text(IntPtr h) {
    var s = new StringBuilder(1024); GetWindowText(h, s, 1024); return s.ToString();
  }
}
'@

function Wait-MessageBox([System.Diagnostics.Process]$p) {
  foreach ($i in 1..60) {
    Start-Sleep -Milliseconds 500
    $h = [M]::FindMessageBox([uint32]$p.Id)
    if ($h -ne [IntPtr]::Zero) { return $h }
    if ($p.HasExited) { throw "The installer quit with $($p.ExitCode) and showed no message" }
  }
  throw 'The installer showed no message'
}
function Save-Picture([IntPtr]$h, [string]$name) {
  [M]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 500
  $r = New-Object M+RECT
  [M]::GetWindowRect($h, [ref]$r) | Out-Null
  $bmp = New-Object System.Drawing.Bitmap ($r.R - $r.L), ($r.B - $r.T)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size)
  $bmp.Save((Join-Path $OutFolder "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
function Assert-Says([IntPtr]$h, [string]$expected) {
  $said = [M]::Text([M]::GetDlgItem($h, 0xFFFF))
  Write-Output "message: $said"
  if ($said -ne $expected) { throw "Expected the message '$expected'" }
}
# BM_CLICK on the button with this id (2 Cancel, 4 Retry; a lone OK is 2 too).
function Press([IntPtr]$h, [int]$id) {
  $b = [M]::GetDlgItem($h, $id)
  if ($b -eq [IntPtr]::Zero) { throw "The message has no button $id" }
  [M]::SendMessage($b, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
}
function Start-Setup([string[]]$arguments) {
  return Start-Process $Setup -ArgumentList $arguments -PassThru
}

$exe = Join-Path $InstallFolder 'Halonic.exe'
$open = 'Halonic is open. Close it, then press Retry.'

# 1. Halonic is open, Cancel: the installer quits and Halonic keeps running.
$app = Start-Process $exe -PassThru
Start-Sleep -Seconds 5
$p = Start-Setup "/D=$InstallFolder"
$h = Wait-MessageBox $p
Assert-Says $h $open
Save-Picture $h '4-halonic-is-open'
Press $h 2
if (-not $p.WaitForExit(20000)) { $p | Stop-Process -Force; throw 'Cancel did not quit the installer' }
if ($p.ExitCode -ne 1) { throw "Cancel quit with $($p.ExitCode), expected 1" }
$app.Refresh()
if ($app.HasExited) { throw 'The installer closed Halonic' }

# 2. Retry while it is still open asks again; Retry after closing it goes on.
$p = Start-Setup "/D=$InstallFolder"
$h = Wait-MessageBox $p
Press $h 4
Start-Sleep -Seconds 2
$h = Wait-MessageBox $p
Assert-Says $h $open
$app | Stop-Process -Force
$app.WaitForExit(20000) | Out-Null
Press $h 4
Start-Sleep -Seconds 3
if ($p.HasExited) { throw "Retry with Halonic closed quit the installer with $($p.ExitCode)" }
if ([M]::FindMessageBox([uint32]$p.Id) -ne [IntPtr]::Zero) { throw 'Retry with Halonic closed asked again' }
$p | Stop-Process -Force

# 3. An older installer: pretend 99.0.0 is installed.
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Halonic'
$before = (Get-Item $exe).LastWriteTimeUtc
Set-ItemProperty $key DisplayVersion '99.0.0'
try {
  $p = Start-Setup "/D=$InstallFolder"
  $h = Wait-MessageBox $p
  Assert-Says $h "A newer Halonic (99.0.0) is already installed. To go back to $Version, uninstall Halonic first."
  Save-Picture $h '5-newer-installed'
  Press $h 2
  if (-not $p.WaitForExit(20000)) { $p | Stop-Process -Force; throw 'OK did not quit the installer' }
  if ($p.ExitCode -ne 2) { throw "OK quit with $($p.ExitCode), expected 2" }

  $p = Start-Process $Setup -ArgumentList '/S', "/D=$InstallFolder" -Wait -PassThru
  if ($p.ExitCode -eq 0) { throw 'A silent older installer went ahead' }
  if ((Get-Item $exe).LastWriteTimeUtc -ne $before) { throw 'An older installer changed the installed Halonic' }
} finally {
  Set-ItemProperty $key DisplayVersion $Version
}
