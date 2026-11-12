import type { SandboxExit, SandboxProcess } from "@halonicjs/ports";

/** What a program printed and how it ended. */
export interface Finished {
  stdout: string;
  stderr: string;
  exit: SandboxExit;
}

/**
 * Runs `process` to its end and collects what it printed. Its input is
 * closed at once: the probe programs read none.
 *
 * @throws when it doesn't end within `timeoutMs`; the program and everything it started is killed
 */
export async function runToEnd(process: SandboxProcess, timeoutMs: number): Promise<Finished> {
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void process.kill();
  }, timeoutMs);
  try {
    void process.stdin.close().catch(() => undefined);
    const [stdout, stderr, exit] = await Promise.all([
      readAll(process.stdout),
      readAll(process.stderr),
      process.exited,
    ]);
    if (timedOut) throw new Error(`the probe program didn't end within ${timeoutMs} ms`);
    return { stdout, stderr, exit };
  } finally {
    clearTimeout(timer);
    await process.kill();
  }
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

/**
 * The line of the program's error output that says what went wrong: the
 * first one that names an error, else the first line.
 */
export function errorLine(errors: string): string {
  const lines = errors
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return lines.find((line) => /^[A-Za-z]*Error\b/.test(line)) ?? lines[0] ?? "";
}
