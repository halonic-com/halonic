# Walks the run-again page (HAL-1202, flow 2.5) with the same version already
# installed in -InstallFolder, and saves a picture of each page:
#   - the page opens with Continue, and Continue is disabled while no box is ticked;
#   - without Repair it copies nothing, with Repair it copies Halonic again;
#   - both end on the finish page.
# The page has the sandbox box only when the installed sandbox fails its check,
# else the "is set up" line. In CI it has the box: the uninstall after the page
# walk removed the sandbox, and the silent install doesn't set it up. The first
# run sets it up again through the page.
# Whether files were copied shows by uninstall.exe: taken away first, a copy
# puts it back.
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
public static class R {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h, int id);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
  public static string Text(IntPtr h) { var s = new StringBuilder(200); GetWindowText(h, s, 200); return s.ToString(); }
}
'@

function Save-Picture([IntPtr]$h, [string]$name) {
  [R]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 700
  $r = New-Object R+RECT
  [R]::GetWindowRect($h, [ref]$r) | Out-Null
  $bmp = New-Object System.Drawing.Bitmap ($r.R - $r.L), ($r.B - $r.T)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size)
  $bmp.Save((Join-Path $OutFolder "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
function Wait-Button([IntPtr]$h, [string]$text, [int]$seconds) {
  foreach ($i in 1..($seconds * 2)) {
    if ([R]::Text([R]::GetDlgItem($h, 1)) -eq $text) { return }
    Start-Sleep -Milliseconds 500
  }
  Save-Picture $h "stuck-waiting-for-$($text -replace '\W', '')"
  throw "The button never said '$text'; it says '$([R]::Text([R]::GetDlgItem($h, 1)))'"
}
# The page's own controls sit on an inner dialog; finds one by its text.
function Find-Control([IntPtr]$h, [string]$text, [string]$class = 'Button') {
  $inner = [R]::FindWindowEx($h, [IntPtr]::Zero, '#32770', $null)
  return [R]::FindWindowEx($inner, [IntPtr]::Zero, $class, $text)
}
function Must-Find([IntPtr]$h, [string]$text) {
  $c = Find-Control $h $text
  if ($c -eq [IntPtr]::Zero) { throw "The page has no '$text'" }
  return $c
}
function Click([IntPtr]$c) { [R]::SendMessage($c, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null; Start-Sleep -Milliseconds 300 }
function Assert-Continue([IntPtr]$h, [bool]$enabled) {
  if ([R]::IsWindowEnabled([R]::GetDlgItem($h, 1)) -ne $enabled) { throw "Continue should be $(if ($enabled) { 'enabled' } else { 'disabled' })" }
}

$uninstaller = Join-Path $InstallFolder 'uninstall.exe'
$kept = Join-Path $env:TEMP 'halonic-uninstall-kept.exe'

# Opens the run-again page; returns the process and its window.
function Open-RunAgain([string]$picture) {
  $p = Start-Process $Setup -ArgumentList "/D=$InstallFolder" -PassThru
  $h = [IntPtr]::Zero
  foreach ($i in 1..120) {
    Start-Sleep -Milliseconds 500
    $p.Refresh()
    if ($p.MainWindowHandle -ne [IntPtr]::Zero) { $h = $p.MainWindowHandle; break }
  }
  if ($h -eq [IntPtr]::Zero) { throw 'The installer opened no window' }
  # The page waits for the sandbox check of the installed Halonic first.
  Wait-Button $h '&Continue' 90
  Save-Picture $h $picture
  return $p, $h
}
# Presses Continue, waits for the finish page, and closes it without starting Halonic.
function Finish([System.Diagnostics.Process]$p, [IntPtr]$h, [string]$picture) {
  Click ([R]::GetDlgItem($h, 1))
  Wait-Button $h '&Finish' 480
  Save-Picture $h $picture
  Click (Must-Find $h 'Start Halonic')
  Click ([R]::GetDlgItem($h, 1))
  if (-not $p.WaitForExit(30000)) { throw 'Finish did not close the installer' }
}

Move-Item $uninstaller $kept -Force
try {
  # 1. The boxes and Continue; then the sandbox alone (or nothing, if it is set up).
  $p, $h = Open-RunAgain '6-run-again'
  $sandbox = Find-Control $h 'Set up the agent sandbox (recommended)'
  $repair = Must-Find $h 'Repair Halonic'
  if ($sandbox -ne [IntPtr]::Zero) {
    Write-Output 'run again: the sandbox box is on the page'
    Assert-Continue $h $true
    Click $sandbox
    Assert-Continue $h $false
    Click $repair
    Assert-Continue $h $true
    Click $repair
    Click $sandbox
    Assert-Continue $h $true
    Finish $p $h '7-run-again-sandbox-finish'
    if (Test-Path $uninstaller) { throw 'Run again without Repair copied Halonic' }
  } else {
    Write-Output 'run again: the sandbox is already set up'
    if ((Find-Control $h '✓ The agent sandbox is set up.' 'Static') -eq [IntPtr]::Zero) { throw 'The page has neither the sandbox box nor its "is set up" line' }
    Assert-Continue $h $false
    $p | Stop-Process -Force
    $p.WaitForExit(20000) | Out-Null
  }

  # 2. Repair alone copies Halonic again.
  $p, $h = Open-RunAgain '8-run-again-repair'
  $sandbox = Find-Control $h 'Set up the agent sandbox (recommended)'
  if ($sandbox -ne [IntPtr]::Zero) { Click $sandbox }
  Click (Must-Find $h 'Repair Halonic')
  Assert-Continue $h $true
  Finish $p $h '9-run-again-repair-finish'
  if (-not (Test-Path $uninstaller)) { throw 'Repair did not copy Halonic again' }
} finally {
  Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($Setup)) -ErrorAction SilentlyContinue | Stop-Process -Force
  if (-not (Test-Path $uninstaller)) { Move-Item $kept $uninstaller -Force }
  Remove-Item $kept -ErrorAction SilentlyContinue
}
