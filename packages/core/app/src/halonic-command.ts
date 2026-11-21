import { shellWord } from "@halonicjs/std";

/** A Windows drive path, `C:\…`, with its drive letter. */
const drivePath = /^(?<drive>[A-Za-z]):[\\/]/u;

/** A Windows network share, `\\server\…`. */
const networkShare = /^\\\\/u;

/**
 * True for a Windows folder: a drive path (`C:\…`) or a network share (`\\server\…`). Studio
 * can't answer a run of a Windows folder from a terminal at all: the CLI runs only in WSL 2,
 * and Studio keeps the folder's runs in the Windows profile, where WSL doesn't look (D-A,
 * HAL-12822).
 */
export function isWindowsFolder(folder: string | undefined): boolean {
  return folder !== undefined && (drivePath.test(folder) || networkShare.test(folder));
}

/**
 * A `halonic` command Studio shows to copy, with `--dir` and the workspace's folder after the
 * command's words, so it works from a new terminal wherever that opens (D1, HAL-12725). The folder
 * and each argument are one POSIX shell word each, quoted when they need it. On Windows the CLI
 * runs only in WSL 2, so a drive path is written as WSL sees it, `<drive>:\Acme` as
 * `/mnt/<drive>/Acme`; WSL can't open a network share by its path, so a share gets no command
 * (D-A, HAL-12822). Every screen that shows a command builds it here, never with its own string.
 *
 * @param folder - the workspace folder's absolute path; `undefined` where the app doesn't give
 *   one, and the command then names no folder
 * @param command - the words after `halonic`, such as `runs send`
 * @param args - what follows `--dir`, such as the run id and the event
 * @returns the command, or `undefined` when no terminal can reach the folder
 * @example
 * halonicCommand("/acme/Acme sample", "runs send", ["6ab5ad", "approve"]);
 * // 'halonic runs send --dir "/acme/Acme sample" 6ab5ad approve'
 */
export function halonicCommand(
  folder: string | undefined,
  command: string,
  args: readonly string[] = [],
): string | undefined {
  const words = ["halonic", command];
  if (folder !== undefined) {
    const terminalFolder = folderInTerminal(folder);
    if (terminalFolder === undefined) return undefined;
    words.push("--dir", shellWord(terminalFolder));
  }
  words.push(...args.map(shellWord));
  return words.join(" ");
}

/** The folder as the CLI's terminal names it: WSL's `/mnt/<drive>/…` for a drive path. */
function folderInTerminal(folder: string): string | undefined {
  if (networkShare.test(folder)) return undefined;
  const drive = drivePath.exec(folder)?.groups?.["drive"];
  if (drive === undefined) return folder;
  const rest = folder.slice(drive.length + 2).replaceAll("\\", "/");
  return `/mnt/${drive.toLowerCase()}/${rest}`;
}

/**
 * The `halonic run` command that starts a run of the workspace, as {@link halonicCommand} builds
 * it. `undefined` for a Windows folder: a run started in WSL 2 lands in the Linux profile, and
 * Studio lists the runs of the Windows profile, so the run would never show up in Studio (D-A2,
 * HAL-12847).
 *
 * @param folder - the workspace folder's absolute path, or `undefined` where the app gives none
 * @param workflow - the workflow to run; absent while its name isn't known
 * @returns the command, or `undefined` when a run it starts wouldn't show up in Studio
 */
export function startRunCommand(
  folder: string | undefined,
  workflow?: string | undefined,
): string | undefined {
  if (isWindowsFolder(folder)) return undefined;
  return halonicCommand(folder, "run", workflow === undefined ? [] : [workflow]);
}

/**
 * The `halonic tools review` command that reviews a connector's listed tools, as
 * {@link halonicCommand} builds it. `undefined` for a Windows folder: the CLI in WSL 2 keeps the
 * approvals in the Linux profile, and Studio reads those of the Windows profile, so an approval
 * made there would never count in Studio (D-A, HAL-12822).
 *
 * @param folder - the workspace folder's absolute path, or `undefined` where the app gives none
 * @param connectorId - the connector's id, as the command takes it
 * @returns the command, or `undefined` when an approval it makes wouldn't count in Studio
 */
export function reviewToolsCommand(
  folder: string | undefined,
  connectorId: string,
): string | undefined {
  if (isWindowsFolder(folder)) return undefined;
  return halonicCommand(folder, "tools review", [connectorId]);
}
