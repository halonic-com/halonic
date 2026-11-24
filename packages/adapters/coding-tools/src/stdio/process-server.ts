// The coding tools server on a real process's standard input and output:
// the `coding-tools` mode of the CLI and of the agent host (HAL-17183).
// Standard output carries MCP lines only, so everything else the server
// has to say goes to standard error.

import { Readable } from "node:stream";
import { runCodingToolsServer } from "./server.ts";

/** The parts of a process the mode uses: Node's `process` by default. */
export interface CodingToolsProcess {
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: { write(text: string): unknown };
  readonly stderr: { write(text: string): unknown };
  readonly env: Readonly<Record<string, string | undefined>>;
  cwd(): string;
}

/**
 * Serves the coding tools server until standard input ends.
 *
 * @param args - the arguments after the `coding-tools` mode, as the harness passed them
 * @param codePaths - the runtime and the server's code, none of which may be writable from here
 * @returns the exit code: 0 at the end of the input, 1 when the server couldn't start or broke
 */
export async function serveCodingToolsOnProcess(
  args: readonly string[],
  codePaths: readonly string[],
  own: CodingToolsProcess = process,
): Promise<number> {
  const reportError = (error: unknown) => own.stderr.write(`${messageOf(error)}\n`);
  try {
    await runCodingToolsServer(
      { args, cwd: own.cwd(), env: own.env, codePaths, reportError },
      {
        input: Readable.toWeb(Readable.from(own.stdin)) as ReadableStream<Uint8Array>,
        write: (line) => own.stdout.write(`${line}\n`),
      },
    );
    return 0;
  } catch (error) {
    own.stderr.write(`The coding tools server stopped: ${messageOf(error)}\n`);
    return 1;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
