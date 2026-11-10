import type { Runner } from "@halonicjs/adapter-sandbox-srt";

/**
 * The lines sandbox-runtime's debug log writes when its proxy refuses a
 * connection, such as
 * `[SandboxDebug] No matching config rule, denying: platform.claude.com:443`.
 */
const deniedLine =
  /^\[SandboxDebug\] (?:No matching config rule, denying|Denied by config rule): (.+)$/;

/**
 * The `host:port` a line of sandbox-runtime's debug log says it refused, or
 * `undefined` for every other line.
 *
 * @example
 * deniedHost("[SandboxDebug] No matching config rule, denying: platform.claude.com:443"); // "platform.claude.com:443"
 * deniedHost("Not logged in · Please run /login"); // undefined
 */
export function deniedHost(line: string): string | undefined {
  return deniedLine.exec(line.trim())?.[1];
}

/** A sandbox runner whose refused connections can be read once its programs have ended. */
export interface DeniedHostsRunner extends Runner {
  /**
   * The `host:port` of each refused connection so far, in the order they
   * came, repeats included: a later program refused at the same host must
   * still show up in what came after it started.
   */
  readonly denied: readonly string[];
}

/**
 * Wraps sandbox-srt's runner so the check learns which hosts the sandbox
 * refused (requirement `harness-checks.denied-hosts`). The session doesn't
 * report refused connections yet, so this turns on sandbox-runtime's debug
 * log for the launcher, which runs outside the fence, and reads the refusals
 * from the program's error output. The program's output is otherwise
 * passed on unchanged, and nothing else of it is kept.
 */
export function deniedHostsRunner(base: Runner): DeniedHostsRunner {
  const denied: string[] = [];
  const note = (line: string): void => {
    const host = deniedHost(line);
    if (host !== undefined) denied.push(host);
  };
  return {
    denied,
    async run(request) {
      const program = await base.run({
        ...request,
        launcherEnv: { ...request.launcherEnv, SRT_DEBUG: "1" },
      });
      return { ...program, stderr: program.stderr.pipeThrough(lineWatcher(note)) };
    },
  };
}

/** Passes bytes through unchanged, and hands each whole line of text to `onLine`. */
export function lineWatcher(
  onLine: (line: string) => void,
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  let partial = "";
  const takeLines = (text: string): void => {
    const lines = (partial + text).split(/\r?\n/);
    partial = lines.pop() ?? "";
    for (const line of lines) onLine(line);
  };
  return new TransformStream({
    transform(chunk, controller) {
      takeLines(decoder.decode(chunk, { stream: true }));
      controller.enqueue(chunk);
    },
    flush() {
      takeLines(decoder.decode());
      if (partial !== "") onLine(partial);
    },
  });
}
