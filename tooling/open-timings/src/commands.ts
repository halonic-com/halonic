import { openProblem, parseTimings } from "./parse-timings.ts";
import { formatSummary, OPEN_BUDGET_MS } from "./summary.ts";

/** What the commands read and write; `cli.ts` gives the real ones. */
export interface CommandIo {
  print(text: string): void;
  /** The file's text, or "" when it doesn't exist. */
  readText(file: string): string;
  /** Puts `folder` in the Studio's Recent on DevTools `port`; answers what the page said. */
  remember(port: number, folder: string): Promise<unknown>;
}

/** The usage line, printed for an unknown command. */
export const USAGE =
  "usage: cli.ts remember <devtools port> <folder> | summary <shell.log> [budget ms]";

/**
 * Runs one command and answers its exit code: `remember <port> <folder>`, or `summary <shell.log>
 * [budget ms]`, which prints the timings table as Markdown and answers 1 when the open is flagged.
 */
export async function runCommand(args: readonly string[], io: CommandIo): Promise<number> {
  const [command, first = "", second] = args;
  if (command === "remember" && second !== undefined) {
    io.print(String(await io.remember(Number(first), second)));
    return 0;
  }
  if (command === "summary") {
    const budget = second === undefined ? OPEN_BUDGET_MS : Number(second);
    const timings = parseTimings(io.readText(first));
    io.print(formatSummary(timings, budget));
    return openProblem(timings, budget) === undefined ? 0 : 1;
  }
  io.print(USAGE);
  return 2;
}
