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

/**
 * Where typing goes: the foreground window's process image, then `page` when the keyboard focus
 * is in a child of that window (such as Halonic's page inside a frame), `window` when it is on the
 * window itself, or `none`. A frame shares its input queue with Halonic's page (HAL-20468), so
 * typing right after a frame starts must reach the page, not stop at the frame (HAL-20480).
 */
export const keyboardFocusScript = `
Add-Type -Namespace ClickTest -Name Focus -MemberDefinition @'
[System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
public struct GuiThreadInfo {
  public int Size; public int Flags; public System.IntPtr Active; public System.IntPtr Focus;
  public System.IntPtr Capture; public System.IntPtr MenuOwner; public System.IntPtr MoveSize;
  public System.IntPtr Caret; public int Left; public int Top; public int Right; public int Bottom;
}
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern System.IntPtr GetForegroundWindow();
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool GetGUIThreadInfo(uint thread, ref GuiThreadInfo info);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern bool IsChild(System.IntPtr parent, System.IntPtr window);
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern uint GetWindowThreadProcessId(System.IntPtr window, out uint processId);
'@
$foreground = [ClickTest.Focus]::GetForegroundWindow()
$id = [uint32]0
$thread = [ClickTest.Focus]::GetWindowThreadProcessId($foreground, [ref]$id)
$info = New-Object ClickTest.Focus+GuiThreadInfo
$info.Size = [System.Runtime.InteropServices.Marshal]::SizeOf($info)
$where = 'none'
if ([ClickTest.Focus]::GetGUIThreadInfo($thread, [ref]$info) -and $info.Focus -ne [IntPtr]::Zero) {
  if ($info.Focus -eq $foreground) { $where = 'window' }
  elseif ([ClickTest.Focus]::IsChild($foreground, $info.Focus)) { $where = 'page' }
}
"$([IO.Path]::GetFileName((Get-Process -Id $id -ErrorAction SilentlyContinue).Path))|$where"
`;

/** Where typing goes, as {@link keyboardFocusScript} prints it. */
export interface KeyboardFocus {
  /** The foreground window's process image, such as `Halonic Inbox.exe`; empty when unknown. */
  readonly image: string;
  /** Whether the keyboard focus is in the window's page, on the window itself, or nowhere. */
  readonly focus: "page" | "window" | "none";
}

/** Reads {@link keyboardFocusScript}'s output; anything else is no focus. */
export function parseKeyboardFocus(output: string): KeyboardFocus {
  const [image = "", focus = ""] = output.trim().split("|");
  if (focus === "page" || focus === "window") return { image, focus };
  return { image, focus: "none" };
}
