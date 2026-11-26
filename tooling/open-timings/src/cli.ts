/**
 * The CI job's commands (HAL-19600), run by `measure-open.ps1`:
 *
 *   node src/cli.ts remember <devtools port> <workspace folder>
 *   node src/cli.ts summary <shell.log> [budget ms]
 */
import { existsSync, readFileSync } from "node:fs";
import { runCommand } from "./commands.ts";
import { evaluate, rememberScript, studioPage } from "./studio-page.ts";

process.exitCode = await runCommand(process.argv.slice(2), {
  print: (text) => console.log(text),
  readText: (file) => (existsSync(file) ? readFileSync(file, "utf8") : ""),
  remember: async (port, folder) =>
    evaluate(await studioPage(port, 120), rememberScript(folder, "Acme")),
});
