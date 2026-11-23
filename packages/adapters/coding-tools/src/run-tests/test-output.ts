// What `run_tests` tells the model about a test run: the exit code, the
// lines that say what failed, and the end of the output. The whole output
// stays in the log file, which the model can read on with `read_ranges`.

import type { SecretScrubber } from "@halonicjs/std";
import { cappedAnswer, cutLine } from "../answer-cap.ts";
import { textLines } from "../read/text-file.ts";
import type { CommandEnd } from "./start-command.ts";

/** Lines that say what failed, or sum a run up, in the common test runners' words. */
const tellingLine =
  /(FAIL|✗|×|AssertionError|Error:|expected|Expected|Received|failed|Tests\s+\d|Test Files|passed|error TS\d+)/;

/** The most characters of telling lines an answer holds. */
const maxTellingCharacters = 16_000;

/** How many lines from the output's end the answer holds. */
const lastLines = 15;

/** Terminal colour codes, which some runners print even with `NO_COLOR`. */
const colourCodes = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** One finished run, as the answer describes it. */
export interface TestRun {
  readonly command: string;
  readonly end: CommandEnd;
  readonly timeoutSeconds: number;
  /** The log file's path, as the model can pass it to `read_ranges`. */
  readonly logFile: string;
  /** Everything the command printed, as the log holds it. */
  readonly output: string;
}

/**
 * The answer for a test run (requirement `coding-tools.run-tests`), with
 * every secret the scrubber knows removed from what the command printed.
 */
export function testRunAnswer(run: TestRun, scrubber: SecretScrubber): string {
  const lines = textLines(scrubber.scrub(run.output).replace(colourCodes, ""));
  const cut = run.end.logCut ? ", cut at its size limit" : "";
  const parts = [
    outcome(run),
    `command: ${run.command}`,
    `full output: ${run.logFile} (${lines.length} lines${cut}; read more of it with read_ranges)`,
    "--- failures and summary ---",
    tellingLines(lines) || "(none found)",
    `--- last ${lastLines} lines ---`,
    lines
      .slice(-lastLines)
      .map((line) => cutLine(line))
      .join("\n"),
  ];
  return cappedAnswer(parts.join("\n"), "read the full output with read_ranges");
}

function outcome({ end, timeoutSeconds }: TestRun): string {
  if (end.stoppedBecause === "timeout") return `stopped: still running after ${timeoutSeconds} s`;
  if (end.stoppedBecause === "cancelled") return "stopped: the call was cancelled";
  return `exit code: ${end.exitCode ?? "none"}`;
}

/** The telling lines, each with the line before and three after, up to {@link maxTellingCharacters}. */
function tellingLines(lines: readonly string[]): string {
  const kept = new Set<number>();
  for (const [index, line] of lines.entries()) {
    if (!tellingLine.test(line)) continue;
    const last = Math.min(lines.length - 1, index + 3);
    for (let around = Math.max(0, index - 1); around <= last; around += 1) kept.add(around);
  }
  let text = "";
  for (const index of [...kept].sort((a, b) => a - b)) {
    const line = cutLine(lines[index] ?? "");
    if (text.length + line.length + 1 > maxTellingCharacters) break;
    text += `${line}\n`;
  }
  return text.trimEnd();
}
