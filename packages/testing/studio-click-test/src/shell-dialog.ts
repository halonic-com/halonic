import { spawn } from "node:child_process";

/**
 * Presses a button in a native dialog the Studio shell shows, such as its "Approve this?" before
 * a risky approve is sent (HAL-20441). WebDriver reaches only the page, and the shell's dialog is
 * a Windows task dialog the page can't draw or answer, so the click test finds it with Windows UI
 * Automation, as a screen reader would, and invokes the button a person would click (HAL-21189).
 * The dialog is a top-level window or, owned by Studio's window, one of its children; its button
 * is looked for only inside it, so the search never walks the WebView's own tree.
 *
 * Run 46170065817 found the dialog, but a control-view search for a Button named Approve found
 * nothing in it. Run 46173800785 showed why: the task dialog's buttons are Win32 push buttons
 * (CCPushButton) that UI Automation lists as panes without an Invoke pattern, and Enter on the
 * dialog left it open. So the script walks the dialog's raw tree for the element of that name and
 * invokes it if it can; otherwise it sends the button's own window BM_CLICK, as a mouse click
 * would. If the dialog is still open after that, it prints what the dialog holds for the job log.
 */
const pressScript = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$automation = [System.Windows.Automation.AutomationElement]
$children = [System.Windows.Automation.TreeScope]::Children
$invokable = [System.Windows.Automation.InvokePattern]::Pattern
$walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
$dialogIs = New-Object System.Windows.Automation.AndCondition(
  (New-Object System.Windows.Automation.PropertyCondition($automation::ControlTypeProperty, [System.Windows.Automation.ControlType]::Window)),
  (New-Object System.Windows.Automation.PropertyCondition($automation::NameProperty, $env:CLICK_TEST_DIALOG)))
function Find-Dialog {
  $root = $automation::RootElement
  $found = $root.FindFirst($children, $dialogIs)
  if ($null -ne $found) { return $found }
  foreach ($window in $root.FindAll($children, [System.Windows.Automation.Condition]::TrueCondition)) {
    $found = $window.FindFirst($children, $dialogIs)
    if ($null -ne $found) { return $found }
  }
  return $null
}
Add-Type -Namespace ClickTest -Name Native -MemberDefinition '[DllImport("user32.dll")] public static extern System.IntPtr SendMessage(System.IntPtr window, int message, System.IntPtr wParam, System.IntPtr lParam);'
$buttonClick = 0x00F5
function Find-Button($element, $depth) {
  $child = $walker.GetFirstChild($element)
  while ($null -ne $child) {
    $current = $child.Current
    $script:seen += "$($current.ControlType.ProgrammaticName) '$($current.Name)' ($($current.ClassName))"
    if ($current.Name -eq $env:CLICK_TEST_BUTTON) { return $child }
    if ($depth -lt 8) {
      $inner = Find-Button $child ($depth + 1)
      if ($null -ne $inner) { return $inner }
    }
    $child = $walker.GetNextSibling($child)
  }
  return $null
}
function Press($button) {
  $pattern = $null
  if ($button.TryGetCurrentPattern($invokable, [ref]$pattern)) {
    $pattern.Invoke()
    return
  }
  $handle = $button.Current.NativeWindowHandle
  if ($handle -eq 0) { throw "$env:CLICK_TEST_BUTTON has neither an Invoke pattern nor a window to click." }
  [void][ClickTest.Native]::SendMessage([System.IntPtr]$handle, $buttonClick, [System.IntPtr]::Zero, [System.IntPtr]::Zero)
  [Console]::Out.WriteLine("Sent BM_CLICK to $env:CLICK_TEST_BUTTON's window.")
}
$deadline = (Get-Date).AddMilliseconds([int]$env:CLICK_TEST_WAIT_MS)
do {
  $dialog = Find-Dialog
  if ($null -ne $dialog) {
    $script:seen = @()
    $button = Find-Button $dialog 0
    if ($null -eq $button) {
      [Console]::Out.WriteLine("No $env:CLICK_TEST_BUTTON; the dialog holds: " + ($script:seen -join '; '))
      exit 4
    }
    Press $button
    Start-Sleep -Milliseconds 1000
    if ($null -eq (Find-Dialog)) { exit 0 }
    [Console]::Out.WriteLine("The dialog stayed open after pressing $env:CLICK_TEST_BUTTON; it holds: " + ($script:seen -join '; '))
    exit 4
  }
  Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)
exit 3
`;

/** The script's exit code when no such dialog showed in time. */
const notShown = 3;

/**
 * Presses `button` in the shell's native dialog titled `dialog`, waiting at most `waitMs` for it
 * to show. Resolves to why it couldn't, or undefined once pressed.
 */
export async function pressShellDialog(
  dialog: string,
  button: string,
  waitMs: number,
): Promise<string | undefined> {
  const { code, output } = await runPowershell(pressScript, {
    CLICK_TEST_DIALOG: dialog,
    CLICK_TEST_BUTTON: button,
    CLICK_TEST_WAIT_MS: String(waitMs),
  });
  const said = output.trim() === "" ? "" : ` ${output.trim()}`;
  if (code === 0) {
    // How the button was pressed, when not by name, goes to the job log for whoever looks next.
    if (said !== "") console.log(`Shell dialog "${dialog}":${said}`);
    return undefined;
  }
  if (code === notShown) {
    return `The shell's "${dialog}" dialog with ${button} didn't show within ${waitMs / 1000} s.${said}`;
  }
  return `Pressing ${button} in the shell's "${dialog}" dialog exited ${code}.${said}`;
}

/** Runs a PowerShell script with `values` in its environment; resolves to its exit code and output. */
async function runPowershell(
  script: string,
  values: Record<string, string>,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", script], {
      env: { ...process.env, ...values },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, output }));
  });
}
