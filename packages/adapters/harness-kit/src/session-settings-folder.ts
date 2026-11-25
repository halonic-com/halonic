// The settings writer of a sandbox whose disk isn't this computer's, such as
// a Cloudflare container (requirement `harness-kit.session-settings-folder`).
// Every operation is a fixed `sh` script started in the session: the path
// goes in as the script's argument and a file's text on its standard input,
// so neither is ever read as part of a command. Web-safe: it uses only the
// session, so the Worker builds one per harness call and no two runs share it.

import type { SandboxSession } from "@halonicjs/ports";
import { outputTail } from "./output-tail.ts";
import type { SettingsFolderWriter } from "./settings-files.ts";

/** The most a read gives back. Settings files are small; a bigger file is refused, not cut. */
export const sessionReadLimitBytes = 1_048_576;

/** How much of a failed script's standard error its error keeps. */
const keptErrorCharacters = 2_048;

/** The exit code the read script gives for a missing file. */
const missingExitCode = 3;

/** The scripts, each reading its path as `$1`. */
const scripts = {
  read: `if [ -e "$1" ] || [ -L "$1" ]; then exec cat -- "$1"; fi; exit ${missingExitCode}`,
  // The temporary file sits next to its target, so `mv` is a rename on one
  // disk, and the trap removes it when any step fails.
  write: [
    "set -e",
    'mkdir -p -- "$(dirname -- "$1")"',
    'temporary=$(mktemp "$1.tmp.XXXXXX")',
    "trap 'rm -f -- \"$temporary\"' EXIT",
    'cat > "$temporary"',
    'mv -f -- "$temporary" "$1"',
    "trap - EXIT",
  ].join("\n"),
  // Names end with a NUL byte, the one character a name can't hold.
  list: [
    '[ -d "$1" ] || exit 0',
    'for entry in "$1"/* "$1"/.[!.]* "$1"/..?*; do',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: `${entry##*/}` is the shell's, not a template's; `basename` would drop a name's trailing newlines.
    '  if [ -e "$entry" ] || [ -L "$entry" ]; then printf \'%s\\0\' "${entry##*/}"; fi',
    "done",
  ].join("\n"),
  remove: 'rm -rf -- "$1"',
  exists: '[ -e "$1" ] || [ -L "$1" ]',
} as const;

type Operation = keyof typeof scripts;

/** What a script gave back. */
interface ScriptResult {
  readonly code: number | null;
  readonly output: Uint8Array;
  /** The end of its standard error, which says why it failed. */
  readonly errorTail: string;
}

/**
 * Whether `path` is an absolute POSIX path inside `root`, or `root` itself
 * when `orSame`. A path with an empty, `.` or `..` part is never inside:
 * nothing here resolves one, so such a path is refused rather than cleaned.
 */
function insideRoot(root: string, path: string, orSame: boolean): boolean {
  if (!path.startsWith("/")) return false;
  const parts = path.slice(1).split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return false;
  if (path === root) return orSame;
  return path.startsWith(root.endsWith("/") ? root : `${root}/`);
}

/** Reads `stream` to its end, refusing more than `limitBytes`. */
async function readAll(
  stream: ReadableStream<Uint8Array>,
  limitBytes: number,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of stream) {
    length += chunk.byteLength;
    if (length > limitBytes) throw new Error(`The file is over ${limitBytes} bytes.`);
    chunks.push(chunk);
  }
  const all = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return all;
}

/** Sends `text` to `stdin` and closes it; with no text, only closes it. */
async function sendInput(
  stdin: WritableStream<Uint8Array>,
  text: string | undefined,
): Promise<void> {
  const writer = stdin.getWriter();
  if (text !== undefined) await writer.write(new TextEncoder().encode(text));
  await writer.close();
}

/**
 * A {@link SettingsFolderWriter} that works inside `session`'s sandbox. It
 * reaches only the profile's settings folder and temp folder: a path outside
 * them, or one with a `.` or `..` part, is refused before anything starts,
 * and writing or removing either folder itself is refused too.
 *
 * @example
 * const settings = sessionSettingsFolder(session);
 * await settings.write("/halonic/home/.claude/settings.json", "{}\n");
 */
export function sessionSettingsFolder(session: SandboxSession): SettingsFolderWriter {
  const { settingsFolder, tempFolder } = session.profile;
  const roots = settingsFolder === null ? [tempFolder] : [settingsFolder, tempFolder];

  const run = async (operation: Operation, path: string, input?: string): Promise<ScriptResult> => {
    const orSame = operation !== "write" && operation !== "remove";
    if (!roots.some((root) => insideRoot(root, path, orSame))) {
      throw new Error(
        `The settings writer refuses ${path}: it may only reach ${roots.join(" and ")}.`,
      );
    }
    const started = await session.start({
      program: "sh",
      args: ["-c", scripts[operation], "sh", path],
    });
    // A script that fails before it reads its input, such as a write whose folder can't be made,
    // closes the pipe first: sending then fails with a broken pipe. Its exit code and error output
    // say why, so the sending error is kept only for a script that otherwise succeeded.
    const inputSent = sendInput(started.stdin, input).then(
      () => null,
      (error: unknown) => error,
    );
    let output: Uint8Array;
    let errorTail: string;
    try {
      [output, errorTail] = await Promise.all([
        readAll(started.stdout, sessionReadLimitBytes),
        outputTail(started.stderr, keptErrorCharacters),
      ]);
    } catch (error) {
      // A read over the limit: the script must not run on unwatched.
      await started.kill();
      throw error;
    }
    const exit = await started.exited;
    const inputError = await inputSent;
    if (exit.code === 0 && inputError !== null) throw inputError;
    return { code: exit.code, output, errorTail };
  };

  const failed = (operation: Operation, path: string, result: ScriptResult): Error => {
    return new Error(
      `The settings writer's ${operation} of ${path} failed with exit code ${String(result.code)}: ${result.errorTail.trim()}`,
    );
  };

  return {
    async read(path) {
      const result = await run("read", path);
      if (result.code === missingExitCode) return null;
      if (result.code !== 0) throw failed("read", path, result);
      return new TextDecoder().decode(result.output);
    },
    async write(path, text) {
      const result = await run("write", path, text);
      if (result.code !== 0) throw failed("write", path, result);
    },
    async list(folder) {
      const result = await run("list", folder);
      if (result.code !== 0) throw failed("list", folder, result);
      const names = new TextDecoder().decode(result.output).split("\0");
      return names.filter((name) => name !== "");
    },
    async remove(path) {
      const result = await run("remove", path);
      if (result.code !== 0) throw failed("remove", path, result);
    },
    async exists(path) {
      const result = await run("exists", path);
      if (result.code === 0) return true;
      if (result.code === 1) return false;
      throw failed("exists", path, result);
    },
  };
}
