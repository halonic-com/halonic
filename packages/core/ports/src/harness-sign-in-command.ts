import type { HarnessSignIn } from "./harness.ts";

/**
 * The terminal a person types a sign-in into: PowerShell, the default
 * terminal on Windows, or `sh` and the shells that read it like `sh` elsewhere.
 */
export type SignInShell = "powershell" | "sh";

/**
 * A harness's sign-in for one agent, as a person types it into their own
 * terminal (requirement `ports.harness-sign-in-command`). Studio shows it
 * when it can't open a window, and `halonic doctor` shows it for each
 * agent that isn't signed in, so both print the same command.
 *
 * It makes the agent's folder first, because an agent that never ran has
 * none yet and Codex won't sign in to a folder that isn't there (HAL-15354);
 * in `sh` the folder is made only the user's, as the host makes it for a run.
 * Then it names the program as the person's `PATH` finds it and sets the
 * agent's folder for this command only. The folder is single-quoted, so the
 * shell takes it as it is: no variable, `~` or wildcard in it is expanded.
 *
 * @param signIn - the harness's own sign-in
 * @param settingsFolder - the agent's settings folder, absolute
 * @param shell - the terminal it is typed into
 *
 * @example
 * signInCommandText(claudeCodeSignIn, "/data/agents/writer", "sh");
 * // mkdir -p -m 700 '/data/agents/writer' && CLAUDE_CONFIG_DIR='/data/agents/writer' claude auth login
 * signInCommandText(claudeCodeSignIn, agentFolder, "powershell");
 * // New-Item -ItemType Directory -Force -Path '<agentFolder>' | Out-Null; $env:CLAUDE_CONFIG_DIR = '<agentFolder>'; claude auth login
 */
export function signInCommandText(
  signIn: HarnessSignIn,
  settingsFolder: string,
  shell: SignInShell,
): string {
  const words = [signIn.program, ...signIn.args].join(" ");
  if (shell === "powershell") {
    const folder = powerShellQuoted(settingsFolder);
    // `-Force` takes a folder that is there already; `Out-Null` keeps its listing off the screen.
    // `;`, not `&&`, because Windows PowerShell 5.1 has no `&&`.
    const makeFolder = `New-Item -ItemType Directory -Force -Path ${folder} | Out-Null`;
    return `${makeFolder}; $env:${signIn.folderVariable} = ${folder}; ${words}`;
  }
  const folder = shQuoted(settingsFolder);
  // `-m 700` applies to the agent's own folder; a folder that is there already keeps its mode.
  return `mkdir -p -m 700 ${folder} && ${signIn.folderVariable}=${folder} ${words}`;
}

/** PowerShell keeps a single-quoted string as it is, apart from `''` for one `'`. */
function powerShellQuoted(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}

/** `sh` keeps a single-quoted string as it is; a `'` closes it, so it is written `'\''`. */
function shQuoted(text: string): string {
  return `'${text.replaceAll("'", "'\\''")}'`;
}
