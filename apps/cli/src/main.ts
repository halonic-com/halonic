import { commands } from "./generated/commands.ts";
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
);
