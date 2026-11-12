# Walks the uninstaller's pages (HAL-1202, flow 2.7) for the Halonic installed
# in -InstallFolder, and saves a picture of each page:
#   - "Uninstall Halonic?" opens with the settings box unticked and Cancel as
#     the default button, and Enter cancels: nothing is removed;
#   - with the box ticked, Uninstall removes Halonic, the agent sandbox, the
#     trust records and the harness settings, and keeps the runs;
#   - it ends on "Halonic is uninstalled", which says the sandbox is removed.
# The runner is an administrator, so the removal needs no prompt here; the
# refused prompt needs a desktop Windows machine.
param(
  [Parameter(Mandatory)][string]$InstallFolder,
  [Parameter(Mandatory)][string]$OutFolder
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $OutFolder | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class U {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct GUITHREADINFO {
    public int cbSize, flags; public IntPtr active, focus, capture, menuOwner, moveSize, caret; public RECT rcCaret;
  }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h, int id);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint thread, ref GUITHREADINFO info);
  public static string Text(IntPtr h) { var s = new StringBuilder(200); GetWindowText(h, s, 200); return s.ToString(); }
  public static IntPtr Focus(IntPtr h) {
    var info = new GUITHREADINFO(); info.cbSize = Marshal.SizeOf(info);
    GetGUIThreadInfo(GetWindowThreadProcessId(h, IntPtr.Zero), ref info);
    return info.focus;
  }
}
'@

function Save-Picture([IntPtr]$h, [string]$name) {
  [U]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 700
  $r = New-Object U+RECT
  [U]::GetWindowRect($h, [ref]$r) | Out-Null
  $bmp = New-Object System.Drawing.Bitmap ($r.R - $r.L), ($r.B - $r.T)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size)
  $bmp.Save((Join-Path $OutFolder "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
function Wait-Button([IntPtr]$h, [string]$text, [int]$seconds) {
  foreach ($i in 1..($seconds * 2)) {
    if ([U]::Text([U]::GetDlgItem($h, 1)) -eq $text) { return }
    Start-Sleep -Milliseconds 500
  }
  Save-Picture $h "stuck-waiting-for-$($text -replace '\W', '')"
  throw "The button never said '$text'; it says '$([U]::Text([U]::GetDlgItem($h, 1)))'"
}
function Find-Control([IntPtr]$h, [string]$text, [string]$class = 'Button') {
  $inner = [U]::FindWindowEx($h, [IntPtr]::Zero, '#32770', $null)
  return [U]::FindWindowEx($inner, [IntPtr]::Zero, $class, $text)
}
function Must-Find([IntPtr]$h, [string]$text, [string]$class = 'Button') {
  $c = Find-Control $h $text $class
  if ($c -eq [IntPtr]::Zero) { throw "The page has no '$text'" }
  return $c
}
function Click([IntPtr]$c) { [U]::SendMessage($c, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null; Start-Sleep -Milliseconds 300 }
function Wait-Closed([IntPtr]$h, [int]$seconds, [string]$what) {
  foreach ($i in 1..($seconds * 2)) {
    if (-not [U]::IsWindow($h)) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "$what did not close the uninstaller"
}
function Sandbox-IsSetUp {
  & net.exe user srt-sandbox *> $null
  return $LASTEXITCODE -eq 0
}

# The uninstaller copies itself to a temporary folder and runs from there, so
# its window is found by its title, not by the process started here.
function Open-Uninstaller([string]$picture) {
  Start-Process (Join-Path $InstallFolder 'uninstall.exe') | Out-Null
  $h = [IntPtr]::Zero
  foreach ($i in 1..60) {
    Start-Sleep -Milliseconds 500
    $h = [U]::FindWindow('#32770', 'Halonic Uninstall')
    if ($h -ne [IntPtr]::Zero) { break }
  }
  if ($h -eq [IntPtr]::Zero) { throw 'The uninstaller opened no window' }
  Wait-Button $h '&Uninstall' 20
  Save-Picture $h $picture
  return $h
}

# A profile with what the settings box removes and what it keeps.
$profileFolder = Join-Path $env:RUNNER_TEMP 'uninstall-profile'
foreach ($f in 'trust\a.json', 'workspaces\k1\harness-settings\clerk\claude\s.json', 'workspaces\k1\runs\r1.log') {
  $path = Join-Path $profileFolder $f
  New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
  Set-Content $path 'x'
}
$env:HALONIC_HOME = $profileFolder

# The removal must have something to remove: set the sandbox up if an earlier
# step didn't.
if (-not (Sandbox-IsSetUp)) {
  $out = & (Join-Path $InstallFolder 'halonic-agent-host.exe') --profile-folder $profileFolder --sandbox-setup
  if ($LASTEXITCODE -ne 0) { throw "The sandbox setup before the uninstall failed: $out" }
}
if (-not (Sandbox-IsSetUp)) { throw 'The sandbox account is missing after the setup' }

# 1. The page; Enter cancels and removes nothing.
$h = Open-Uninstaller '10-uninstall'
Must-Find $h "Your workspaces are folders of plain files. Halonic doesn't touch them." 'Static' | Out-Null
$box = Must-Find $h "Also remove Halonic's settings on this computer"
if ([int][U]::SendMessage($box, 0xF0, [IntPtr]::Zero, [IntPtr]::Zero) -ne 0) { throw 'The settings box starts ticked' }
# DM_GETDEFID: DC_HASDEFID in the high word, the button's id in the low one.
$def = [int64][U]::SendMessage($h, 0x400, [IntPtr]::Zero, [IntPtr]::Zero) -band 0xFFFF
if ($def -ne 2) { throw "The default button is $def, not Cancel (2)" }
$cancel = [U]::GetDlgItem($h, 2)
if ([U]::Text($cancel) -ne '&Cancel') { throw "The Cancel button says '$([U]::Text($cancel))'" }
if ([U]::Focus($h) -ne $cancel) { throw 'Cancel does not have the focus' }
[U]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 500
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
Wait-Closed $h 15 'Enter'
if (-not (Test-Path (Join-Path $InstallFolder 'Halonic.exe'))) { throw 'Enter on the uninstall page removed Halonic' }
if (-not (Sandbox-IsSetUp)) { throw 'Enter on the uninstall page removed the sandbox' }

# 2. Ticked, then Uninstall: the last page, and what is gone and what stays.
$h = Open-Uninstaller '11-uninstall-again'
Click (Must-Find $h "Also remove Halonic's settings on this computer")
Save-Picture $h '11-uninstall-settings-ticked'
Click ([U]::GetDlgItem($h, 1))
Wait-Button $h '&Close' 300
Save-Picture $h '12-uninstalled'
Must-Find $h '✓ The agent sandbox is removed.' 'Static' | Out-Null
Click ([U]::GetDlgItem($h, 1))
Wait-Closed $h 15 'Close'

if (Sandbox-IsSetUp) { throw 'The sandbox account is still there after uninstalling' }
if (Test-Path (Join-Path $InstallFolder 'Halonic.exe')) { throw 'Halonic.exe is still there after uninstalling' }
if (Test-Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Halonic') { throw 'The uninstall entry is still there' }
if (Test-Path (Join-Path $profileFolder 'trust')) { throw 'The trust records are still there' }
if (Test-Path (Join-Path $profileFolder 'workspaces\k1\harness-settings')) { throw 'The harness settings are still there' }
if (-not (Test-Path (Join-Path $profileFolder 'workspaces\k1\runs\r1.log'))) { throw 'The settings box removed the runs' }
Write-Output 'uninstall: Enter cancelled; Uninstall removed Halonic, the sandbox and the settings, and kept the runs'
