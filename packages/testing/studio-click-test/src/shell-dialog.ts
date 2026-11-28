import { spawn } from "node:child_process";

/**
 * Presses a button in a native dialog the Studio shell shows, such as its "Approve this?" before
 * a risky approve is sent (HAL-20441). WebDriver reaches only the page, and the shell's dialog is
 * a Windows task dialog the page can't draw or answer, so the click test finds it with Windows UI
 * Automation, as a screen reader would, and invokes the button a person would click (HAL-21189).
 * The dialog is a top-level window or, owned by Studio's window, one of its children; its button
 * is looked for only inside it, so the search never walks the WebView's own tree.
 */
const pressScript = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$automation = [System.Windows.Automation.AutomationElement]
$children = [System.Windows.Automation.TreeScope]::Children
function Named($type, $name) {
  New-Object System.Windows.Automation.AndCondition(
    (New-Object System.Windows.Automation.PropertyCondition($automation::ControlTypeProperty, $type)),
    (New-Object System.Windows.Automation.PropertyCondition($automation::NameProperty, $name)))
}
$dialogIs = Named ([System.Windows.Automation.ControlType]::Window) $env:CLICK_TEST_DIALOG
$buttonIs = Named ([System.Windows.Automation.ControlType]::Button) $env:CLICK_TEST_BUTTON
$deadline = (Get-Date).AddMilliseconds([int]$env:CLICK_TEST_WAIT_MS)
do {
  $root = $automation::RootElement
  $dialog = $root.FindFirst($children, $dialogIs)
  if ($null -eq $dialog) {
    foreach ($window in $root.FindAll($children, [System.Windows.Automation.Condition]::TrueCondition)) {
      $dialog = $window.FindFirst($children, $dialogIs)
      if ($null -ne $dialog) { break }
    }
  }
  if ($null -ne $dialog) {
    $button = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $buttonIs)
    if ($null -ne $button) {
      $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
      exit 0
    }
    [Console]::Out.WriteLine("The dialog showed without the button.")
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
  if (code === 0) return undefined;
  const said = output.trim() === "" ? "" : ` ${output.trim()}`;
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
