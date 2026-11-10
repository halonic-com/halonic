import { commands } from "./generated/commands.ts";
import { LineReader } from "./output/line-reader.ts";
import { exitOnceWritten } from "./output/stop.ts";
import { runCli } from "./run-cli.ts";

// The `halonic` program: the real process's arguments, folder and output streams.
process.exitCode = await runCli(
  process.argv.slice(2),
  {
    cwd: process.cwd(),
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  },
  Object.values(commands),
  {
    terminal: {
      env: process.env,
      platform: process.platform,
      stdoutIsTerminal: process.stdout.isTTY === true,
      stderrIsTerminal: process.stderr.isTTY === true,
      stderr: {
        write: (text) => process.stderr.write(text),
        columns: () => process.stderr.columns,
      },
      ...(process.stdin.isTTY === true ? { questions: stdinQuestions() } : {}),
    },
    stop: {
      signals: process,
      exitNow: exitOnceWritten([process.stdout, process.stderr], (code) => process.exit(code)),
    },
  },
);

/** Questions on the real terminal: written to stderr, answered on stdin. */
function stdinQuestions() {
  const lines = new LineReader(process.stdin);
  return {
    write: (text: string) => process.stderr.write(text),
    readLine: (signal?: AbortSignal) => lines.readLine(signal),
  };
}
