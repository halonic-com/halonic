# Walks the installer's pages and saves a picture of each, so a reviewer can
# see what a person sees (HAL-1202). It runs the installer with its pages, in
# the runner's desktop session, presses Install, and waits for the finish page.
# The sandbox step runs for real here; on a runner it is already elevated.
param(
  [Parameter(Mandatory)][string]$Setup,
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
public static class W {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h, int id);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
}
'@

function Save-Picture([IntPtr]$h, [string]$name) {
  [W]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 700
  $r = New-Object W+RECT
  [W]::GetWindowRect($h, [ref]$r) | Out-Null
  $w = $r.R - $r.L; $t = $r.B - $r.T
  $bmp = New-Object System.Drawing.Bitmap $w, $t
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($r.L, $r.T, 0, 0, (New-Object System.Drawing.Size $w, $t))
  $bmp.Save((Join-Path $OutFolder "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
function Button-Text([IntPtr]$h) {
  $b = [W]::GetDlgItem($h, 1)
  $s = New-Object System.Text.StringBuilder 100
  [W]::GetWindowText($b, $s, 100) | Out-Null
  return $s.ToString()
}
function Wait-Button([IntPtr]$h, [string]$text, [int]$seconds) {
  foreach ($i in 1..($seconds * 2)) {
    if ((Button-Text $h) -eq $text -and [W]::IsWindowEnabled([W]::GetDlgItem($h, 1))) { return }
    Start-Sleep -Milliseconds 500
  }
  Save-Picture $h "stuck-waiting-for-$($text -replace '\W', '')"
  throw "The button never said '$text'; it says '$(Button-Text $h)'"
}

$p = Start-Process $Setup -ArgumentList "/D=$InstallFolder" -PassThru
$h = [IntPtr]::Zero
foreach ($i in 1..60) {
  Start-Sleep -Milliseconds 500
  $p.Refresh()
  if ($p.MainWindowHandle -ne [IntPtr]::Zero) { $h = $p.MainWindowHandle; break }
}
if ($h -eq [IntPtr]::Zero) { throw 'The installer opened no window' }
Wait-Button $h '&Install' 20
Save-Picture $h '1-install'
[W]::SendMessage([W]::GetDlgItem($h, 1), 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
# The step lines while they run: the copy is quick, so look soon after pressing.
Start-Sleep -Seconds 2
Save-Picture $h '2-installing'
Wait-Button $h '&Finish' 480
Save-Picture $h '3-finish'
# Finish with "Start Halonic" ticked, then stop what it opened.
[W]::SendMessage([W]::GetDlgItem($h, 1), 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
Start-Sleep -Seconds 5
Get-Process Halonic -ErrorAction SilentlyContinue | Stop-Process -Force
if (-not $p.WaitForExit(30000)) { $p | Stop-Process -Force }
# Take it off again, so the silent install after this starts from nothing. The
# runner is an administrator, so this also removes the sandbox the walk set up.
Start-Process (Join-Path $InstallFolder 'uninstall.exe') -ArgumentList '/S' -Wait
Start-Sleep -Seconds 8
