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
 * It names the program as the person's `PATH` finds it and sets the
 * agent's folder for this command only. The folder is single-quoted, so the
 * shell takes it as it is: no variable, `~` or wildcard in it is expanded.
 *
 * @param signIn - the harness's own sign-in
 * @param settingsFolder - the agent's settings folder, absolute
 * @param shell - the terminal it is typed into
 *
 * @example
 * signInCommandText(claudeCodeSignIn, "/data/agents/writer", "sh");
 * // CLAUDE_CONFIG_DIR='/data/agents/writer' claude auth login
 * signInCommandText(claudeCodeSignIn, agentFolder, "powershell");
 * // $env:CLAUDE_CONFIG_DIR = '<agentFolder>'; claude auth login
 */
export function signInCommandText(
  signIn: HarnessSignIn,
  settingsFolder: string,
  shell: SignInShell,
): string {
  const words = [signIn.program, ...signIn.args].join(" ");
  if (shell === "powershell") {
    // PowerShell keeps a single-quoted string as it is, apart from `''` for one `'`.
    const folder = `'${settingsFolder.replaceAll("'", "''")}'`;
    return `$env:${signIn.folderVariable} = ${folder}; ${words}`;
  }
  // `sh` keeps a single-quoted string as it is; a `'` closes it, so it is written `'\''`.
  const folder = `'${settingsFolder.replaceAll("'", "'\\''")}'`;
  return `${signIn.folderVariable}=${folder} ${words}`;
}
