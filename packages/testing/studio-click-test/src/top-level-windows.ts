/**
 * A PowerShell script that prints, one per line, the process image of every
 * visible top-level window whose process image is named `$env:CLICK_TEST_EXE`,
 * such as `Halonic Inbox.exe`. Window managers such as FancyZones key a window
 * on that image, which is why the Inbox and the Messenger have frames of their
 * own (HAL-20480): `GetWindowThreadProcessId` gives the window's process, and
 * its path the image. Child windows, such as Halonic's page inside a frame,
 * aren't top-level, so they don't count.
 */
export const topLevelWindowsScript = `
Add-Type -Namespace ClickTest -Name Windows -MemberDefinition @'
public delegate bool EnumWindowsProc(System.IntPtr window, System.IntPtr data);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool EnumWindows(EnumWindowsProc callback, System.IntPtr data);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool IsWindowVisible(System.IntPtr window);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern uint GetWindowThreadProcessId(System.IntPtr window, out uint processId);
'@
$images = [System.Collections.Generic.List[string]]::new()
$each = [ClickTest.Windows+EnumWindowsProc]{
  param($window, $data)
  if ([ClickTest.Windows]::IsWindowVisible($window)) {
    $id = [uint32]0
    [void][ClickTest.Windows]::GetWindowThreadProcessId($window, [ref]$id)
    $image = (Get-Process -Id $id -ErrorAction SilentlyContinue).Path
    if ($image -and [IO.Path]::GetFileName($image) -eq $env:CLICK_TEST_EXE) { $images.Add($image) }
  }
  $true
}
[void][ClickTest.Windows]::EnumWindows($each, [IntPtr]::Zero)
$images
`;

/** The images {@link topLevelWindowsScript} printed, one per window. */
export function parseTopLevelWindows(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
