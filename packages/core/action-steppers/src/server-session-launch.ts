import { err, ok, type Result } from "@halonicjs/std";
import { serverSessionTaskPattern } from "./server-session-block.ts";
import { type ServerTarget, validateServerTarget } from "./server-target.ts";

/**
 * The desktop shell's command that opens a server session. Only Studio's
 * desktop app names it; no agent tool, engine or bridge does (plan on
 * HAL-17834, section 4).
 */
export const serverSessionCommand = "server_session_open";

/** The folder in the user's home on the server that holds briefs while a session reads them. */
export const serverSessionBriefFolder = ".halonic/briefs";

function checkTask(task: string): Result<string, string> {
  return serverSessionTaskPattern.test(task) ? ok(task) : err("the task id isn't like HAL-1234");
}

/**
 * The prompt `claude` starts with: a constant that names the brief's file,
 * so no task text is ever in a command line, on either computer.
 */
export function serverSessionPrompt(task: string): string {
  return `Read the file ${serverSessionBriefFolder}/${task}.md and follow it.`;
}

/**
 * What the server runs to receive the brief on its input. The sweep runs only
 * after the copy worked and only touches old briefs in the brief folder. A
 * sweep that fails doesn't fail the upload: the copy has already worked.
 */
export function remoteUploadCommand(task: string): string {
  const file = `${serverSessionBriefFolder}/${task}.md`;
  const sweep = `find ${serverSessionBriefFolder} -maxdepth 1 -type f -name "HAL-*.md" -mmin +60 -delete`;
  return [
    "umask 077",
    `mkdir -p ${serverSessionBriefFolder}`,
    `cat > ${file}`,
    `{ ${sweep} || true; }`,
  ].join(" && ");
}

/**
 * What the server runs to start Claude Code: no flag, so the session asks
 * for permission as Claude Code always does, then the brief is deleted.
 */
export function remoteRunCommand(task: string): string {
  return `claude "${serverSessionPrompt(task)}"; rm -f ${serverSessionBriefFolder}/${task}.md`;
}

function sshOptions(target: ServerTarget): string {
  return target.port === undefined ? "" : `-p ${target.port} `;
}

/**
 * Renders the launcher the shell writes next to `brief-<task>.md` and opens
 * in a terminal (plan on HAL-17834, section 2). It holds no path: it moves
 * into its own folder through `$0` and uses relative names, so a profile
 * folder with a quote or a `%` in its name can't change what runs. Every
 * value in it has passed `validateServerTarget` and the task pattern, and is
 * single-quoted anyway. The remote commands assume a POSIX-like login shell
 * on the server (sh, bash, zsh), not csh or tcsh.
 *
 * @returns the script, or why the target or task id is refused
 *
 * @example
 * const script = renderServerSessionLauncher({ host: "build.acme.example", user: "ops" }, "HAL-1234");
 */
export function renderServerSessionLauncher(
  target: ServerTarget,
  task: string,
): Result<string, string> {
  const checkedTarget = validateServerTarget(target);
  if (!checkedTarget.ok) return checkedTarget;
  const checkedTask = checkTask(task);
  if (!checkedTask.ok) return checkedTask;
  const { host, user } = checkedTarget.value;
  const options = sshOptions(checkedTarget.value);
  const destination = `'${user}@${host}'`;
  return ok(
    [
      "#!/bin/sh",
      'cd -- "$(dirname -- "$0")" || exit 1',
      `ssh ${options}-- ${destination} '${remoteUploadCommand(task)}' < ./brief-${task}.md`,
      "upload=$?",
      `rm -f -- ./brief-${task}.md ./run-${task}.command ./run-${task}.sh`,
      'if [ "$upload" -ne 0 ]; then',
      "  echo 'Halonic: the brief could not be copied to the server, so Claude Code was not started.'",
      "  exit 1",
      "fi",
      `exec ssh -t ${options}-- ${destination} '${remoteRunCommand(task)}'`,
      "",
    ].join("\n"),
  );
}

function guideServer(target: ServerTarget | undefined): string {
  if (target === undefined) return "<user>@<your server>";
  const checked = validateServerTarget(target);
  if (!checked.ok) return "<user>@<your server>";
  return `${sshOptions(checked.value)}-- ${checked.value.user}@${checked.value.host}`;
}

/**
 * The manual guide for a `server-session` block: what to do by hand where
 * the desktop app can't open a terminal (Windows in v1, no terminal found,
 * or Paperclip without Halonic). It names the server only when it's known
 * and passes `validateServerTarget`, so a refused setting is never put in a
 * command the user copies.
 */
export function renderServerSessionGuide(brief: string, target?: ServerTarget): string {
  const server = guideServer(target);
  return [
    `1. Open a terminal and run: ssh ${server}`,
    "2. On the server, run: claude",
    "3. Paste the brief below as your first message.",
    "",
    brief,
  ].join("\n");
}
