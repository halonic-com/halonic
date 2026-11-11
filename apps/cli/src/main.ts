import { EnvSecrets } from "@halonicjs/adapter-env-secrets";
import { profileFolder } from "@halonicjs/profile";
import { commands } from "./generated/commands.ts";
import { readGlobalOptions } from "./global-options.ts";
import { LineReader } from "./output/line-reader.ts";
import { exitOnceWritten, quietOnClosedPipe } from "./output/stop.ts";
import { runCli } from "./run-cli.ts";
import { recoverSandboxSessions } from "./sandbox-journals.ts";
import { nodeProfileEnvironment } from "./workspace-runs.ts";

// A reader that stops reading, such as `head`, ends the output, not the command.
quietOnClosedPipe(process.stdout);
quietOnClosedPipe(process.stderr);

// Before any session opens, undo what a crashed run left in its git folders.
// It never throws; with `--debug` it says what it couldn't undo.
await recoverSandboxSessions(
  () => profileFolder(nodeProfileEnvironment()),
  undefined,
  readGlobalOptions(process.argv.slice(2)).options.debug
    ? (line) => process.stderr.write(`${line}\n`)
    : undefined,
);

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
    // `runCli` wraps it, so every key a command reads is scrubbed from what it prints.
    secrets: new EnvSecrets(process.env),
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
