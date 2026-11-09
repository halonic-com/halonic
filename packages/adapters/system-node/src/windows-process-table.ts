import { Buffer } from "node:buffer";
import {
  baseName,
  type ReadProcessTable,
  type RunProgram,
  tableReadBy,
  wholeNumber,
} from "./process-table.ts";
import type { ProcessRow } from "./process-tree.ts";

/**
 * One tab-separated line per process: pid, parent pid, working set in
 * bytes, start time in milliseconds since 1601 (empty when Windows doesn't
 * say), then the name, last because it may hold spaces.
 * `Get-CimInstance` ships with Windows PowerShell 5.1 on every supported
 * Windows; `wmic` is gone from recent Windows 11. Windows PowerShell 5.1
 * writes to a pipe in the OEM code page, so the script asks for UTF-8 first
 * or names with other than ASCII letters would come out garbled.
 */
export const windowsProcessScript = [
  "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
  "Get-CimInstance -ClassName Win32_Process | ForEach-Object {",
  "  $started = if ($_.CreationDate) { [long][math]::Floor($_.CreationDate.ToFileTimeUtc() / 10000) } else { '' }",
  '  "$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.WorkingSetSize)`t$started`t$($_.Name)"',
  "}",
].join("\n");

/**
 * Windows PowerShell by its full path under the Windows folder. Windows
 * looks in the working folder first for a bare program name, and that
 * folder may be a repository nobody has checked.
 */
export function windowsPowerShell(windowsFolder: string): string {
  return `${windowsFolder}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
}

/**
 * The arguments that run `script` in Windows PowerShell without a profile
 * or prompts. The script goes in as UTF-16 Base64 (`-EncodedCommand`), so
 * its quotes survive Windows' command-line quoting unchanged.
 */
export function powerShellArguments(script: string): string[] {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded];
}

/**
 * Reads the process table on Windows with `Get-CimInstance Win32_Process`.
 * Starting PowerShell takes a few hundred milliseconds, so callers ask for
 * the table when a person asks, not on a timer.
 *
 * @param windowsFolder - the Windows folder, from the `SystemRoot` variable
 */
export function windowsProcessTable(run: RunProgram, windowsFolder: string): ReadProcessTable {
  return async () => {
    const { output, pid } = await run(
      windowsPowerShell(windowsFolder),
      powerShellArguments(windowsProcessScript),
    );
    // PowerShell, and the `conhost` Windows starts below it, are children of the engine.
    return tableReadBy(parseWindowsProcesses(output), pid);
  };
}

/**
 * The processes in the output of {@link windowsProcessScript}. `.exe` is
 * taken off each name, so `claude.exe` reads as `claude` as it does on
 * macOS and Linux. Lines that don't fit are left out.
 */
export function parseWindowsProcesses(output: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of output.split(/\r?\n/)) {
    const [pidText, parentText, memoryText, startedText, ...nameParts] = line.split("\t");
    const pid = wholeNumber(pidText);
    const parentPid = wholeNumber(parentText);
    const memoryBytes = wholeNumber(memoryText);
    const name = baseName(nameParts.join("\t").trim()).replace(/\.exe$/i, "");
    if (pid === undefined || parentPid === undefined || memoryBytes === undefined) continue;
    if (name === "") continue;
    const startedAt = wholeNumber(startedText);
    rows.push({
      pid,
      parentPid,
      name,
      memoryBytes,
      ...(startedAt === undefined ? {} : { startedAt }),
    });
  }
  return rows;
}
