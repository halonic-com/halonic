import { platform } from "node:process";
import { systemProcessTable } from "./resource-probe.ts";

/** How many times the two real process-table tests may run on Windows before they fail. */
export const windowsRetry = platform === "win32" ? 1 : 0;

/**
 * Starts the process-table reader once, ahead of the tests, on Windows only. A cold PowerShell
 * and WMI start on a loaded runner can take most of the adapter's 15 s limit; this pays that cost
 * outside any assertion. Nothing is asserted: a failure here is left for the tests to report.
 */
export async function warmProcessTable(): Promise<void> {
  if (platform !== "win32") return;
  try {
    await systemProcessTable()();
  } catch {
    // The tests read the table again and report the failure themselves.
  }
}
