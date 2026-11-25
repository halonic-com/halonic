# Walks the installer's pages and saves a picture of each, so a reviewer can
# see what a person sees (HAL-1202). It runs the installer with its pages, in
# the runner's desktop session, presses Next, I Agree on Microsoft's licence
# page, and waits for the finish page.
# The sandbox step runs for real here; on a runner it is already elevated.
#
# -NoSandbox clears the sandbox box and presses Install instead: then no
# licence page may show and no vcruntime140.dll may be installed (HAL-17810).
# With the box ticked, the licence page must show Microsoft's own licence, and
# the pinned DLL must be in the install folder and beside srt-win. Before
# that, it clears the desktop shortcut box, presses Back on the licence page
# and checks the box is still cleared (HAL-17872).
param(
  [Parameter(Mandatory)][string]$Setup,
  [Parameter(Mandatory)][string]$InstallFolder,
  [Parameter(Mandatory)][string]$OutFolder,
  [switch]$NoSandbox
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
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, StringBuilder l);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, int m, IntPtr w, IntPtr l);
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
# Posts the press (WM_COMMAND for button 1) rather than sending it: the page it
# leaves may run its own message loop, so SendMessage would only return once
# that page is left.
function Press([IntPtr]$h) { [W]::PostMessage($h, 0x111, [IntPtr]1, [W]::GetDlgItem($h, 1)) | Out-Null }
# The page's own controls sit on an inner dialog.
function Inner([IntPtr]$h) { return [W]::FindWindowEx($h, [IntPtr]::Zero, '#32770', $null) }
# The licence page's text box (MUI's control 1000), as the person reads it.
function Licence-Text([IntPtr]$h) {
  $box = [W]::GetDlgItem((Inner $h), 1000)
  $length = [int][W]::SendMessage($box, 0x000E, [IntPtr]::Zero, [IntPtr]::Zero)
  $s = New-Object System.Text.StringBuilder ($length + 1)
  [W]::SendMessage($box, 0x000D, [IntPtr]($length + 1), $s) | Out-Null
  return $s.ToString()
}
# A box on the install page, by its words.
function Find-Box([IntPtr]$h, [string]$words) {
  $box = [W]::FindWindowEx((Inner $h), [IntPtr]::Zero, 'Button', $words)
  if ($box -eq [IntPtr]::Zero) { throw "The install page has no box '$words'" }
  return $box
}
# BM_GETCHECK: 1 when the box is ticked.
function Box-Checked([IntPtr]$box) { return [int][W]::SendMessage($box, 0xF0, [IntPtr]::Zero, [IntPtr]::Zero) -eq 1 }
function Runtime-Files { return @(Get-ChildItem $InstallFolder -Recurse -File -Filter 'vcruntime140*' -ErrorAction SilentlyContinue) }

$pin = Get-Content (Join-Path $PSScriptRoot 'vcruntime.json') -Raw | ConvertFrom-Json
$p = Start-Process $Setup -ArgumentList "/D=$InstallFolder" -PassThru
# The install page comes first, its sandbox box ticked, so its button says
# Next. Look for the window that shows it, not just the first one: .onInit
# runs the rollback guard (HAL-5404 S3) before the pages, and a window seen
# while it runs isn't the installer's page.
$h = [IntPtr]::Zero; $m = [IntPtr]::Zero
foreach ($i in 1..80) {
  Start-Sleep -Milliseconds 500
  $p.Refresh()
  $m = $p.MainWindowHandle
  if ($m -ne [IntPtr]::Zero -and (Button-Text $m) -eq '&Next >') { $h = $m; break }
}
if ($h -eq [IntPtr]::Zero) { throw "The installer showed no install page with the sandbox box ticked; its window says '$(Button-Text $m)'" }
Wait-Button $h '&Next >' 20

if ($NoSandbox) {
  $box = Find-Box $h 'Set up the agent sandbox (recommended)'
  [W]::SendMessage($box, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
  Wait-Button $h '&Install' 10
  Save-Picture $h '4-install-no-sandbox'
  Press $h
  # Straight to the steps: the licence page must never show.
  foreach ($i in 1..960) {
    $text = Button-Text $h
    if ($text -eq 'I &Agree') { Save-Picture $h 'licence-without-sandbox'; throw 'The licence page showed with the sandbox box cleared' }
    if ($text -eq '&Finish' -and [W]::IsWindowEnabled([W]::GetDlgItem($h, 1))) { break }
    Start-Sleep -Milliseconds 500
  }
  Wait-Button $h '&Finish' 5
  Save-Picture $h '5-finish-no-sandbox'
  $found = Runtime-Files
  if ($found.Count -gt 0) { throw "An install without the sandbox installed $($found.FullName -join ', ')" }
  Write-Output 'without the sandbox: no licence page, and no vcruntime140 file in the install folder'
} else {
  Save-Picture $h '0-install'
  # Back from the licence page keeps the person's choices (HAL-17872): clear
  # the shortcut box, go on, come back, and both boxes are as they were left.
  $shortcut = Find-Box $h 'Add a desktop shortcut'
  [W]::SendMessage($shortcut, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
  if ((Box-Checked $shortcut)) { throw 'The desktop shortcut box stayed ticked after a click' }
  Press $h
  Wait-Button $h 'I &Agree' 20
  [W]::PostMessage($h, 0x111, [IntPtr]3, [W]::GetDlgItem($h, 3)) | Out-Null
  Wait-Button $h '&Next >' 20
  if ((Box-Checked (Find-Box $h 'Add a desktop shortcut'))) { Save-Picture $h 'back-shortcut-ticked'; throw 'Back from the licence page ticked the desktop shortcut box again' }
  if (-not (Box-Checked (Find-Box $h 'Set up the agent sandbox (recommended)'))) { throw 'Back from the licence page cleared the sandbox box' }
  Write-Output 'Back from the licence page: the desktop shortcut box stays cleared'
  Press $h
  Wait-Button $h 'I &Agree' 20
  Save-Picture $h '1-licence'
  # Microsoft's licence, not ours: its title, its own ID at the end, and no
  # word of Halonic's. fetch-vcruntime.ps1 checked the file's SHA-256.
  $shown = Licence-Text $h
  foreach ($words in 'MICROSOFT SOFTWARE LICENSE TERMS', 'MICROSOFT VISUAL C++ 2015 - 2022 RUNTIME', 'EULA ID: Cpp_2015-2022_ENU.1033') {
    if (-not $shown.Contains($words)) { throw "The licence page doesn't show '$words'; it shows: $shown" }
  }
  if ($shown.Contains('Halonic')) { throw "The licence page shows words of Halonic's own: $shown" }
  Press $h
  # The step lines while they run: the copy is quick, so look soon after pressing.
  Start-Sleep -Seconds 2
  Save-Picture $h '2-installing'
  Wait-Button $h '&Finish' 480
  Save-Picture $h '3-finish'
  # The pinned DLL, under the name nothing loads, and beside srt-win.
  $placed = @((Join-Path $InstallFolder 'vcruntime140.dll.pinned'), (Join-Path $env:ProgramFiles 'Halonic Sandbox\vcruntime140.dll'))
  foreach ($f in $placed) {
    if (-not (Test-Path $f)) { throw "An install with the sandbox left no $f" }
    if ((Get-FileHash $f -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.files.x64.sha256) { throw "$f isn't the pinned vcruntime140.dll" }
  }
  Write-Output 'with the sandbox: Microsoft''s licence page, and the pinned vcruntime140.dll installed'
}
# Finish with "Start Halonic" ticked, then stop what it opened.
[W]::SendMessage([W]::GetDlgItem($h, 1), 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
Start-Sleep -Seconds 5
Get-Process Halonic -ErrorAction SilentlyContinue | Stop-Process -Force
if (-not $p.WaitForExit(30000)) { $p | Stop-Process -Force }
# Take it off again, so the next install starts from nothing. The runner is an
# administrator, so this also removes the sandbox the walk set up.
Start-Process (Join-Path $InstallFolder 'uninstall.exe') -ArgumentList '/S' -Wait
Start-Sleep -Seconds 8
