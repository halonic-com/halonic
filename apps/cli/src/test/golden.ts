import { sep } from "node:path";
import type { CliCommand } from "../command.ts";
import { type CliExit, runCli, type Terminal } from "../run-cli.ts";
import { captureIo } from "./capture-io.ts";
import { manualClock } from "./manual-clock.ts";

/**
 * The three ways the design's checklist runs every output (cli-output
 * section 5): on a terminal with colour, with `NO_COLOR=1`, and with `--json`.
 */
export const goldenModes = ["colour", "noColour", "json"] as const;

/**
 * Room for a test that runs whole workflows or several commands, such as a
 * golden run (one run per mode). Those take 1–3 s on a quiet machine and
 * passed Vitest's 5 s default on a loaded runner (HAL-5399, HAL-5473). It is
 * 30 s, not 20 s, because a test's own timeout replaces the 30 s CI gives
 * every test on Windows, where one golden run took 16 s. A real hang still
 * fails.
 */
export const heavyTestTimeout = 30_000;

/** One of {@link goldenModes}. */
export type GoldenMode = (typeof goldenModes)[number];

/** What one command line printed in one mode, and how it exited. */
export interface GoldenOutput {
  readonly exit: CliExit;
  readonly stdout: readonly string[];
  readonly stderr: readonly string[];
}

/** One command line's output in every {@link GoldenMode}. */
export type GoldenRun = Readonly<Record<GoldenMode, GoldenOutput>>;

/**
 * The commands a golden run uses. They are made again for each mode, so a
 * command's fixtures (its run ids, its times, the files it reads) start from
 * the same fixed values every time, and the three outputs can only differ in
 * how they are printed.
 */
export type GoldenCommands = () => readonly CliCommand[];

const utf8 = { LANG: "en_US.UTF-8" };

/** The terminal each mode runs on. None draws a live line, so no output depends on time. */
const terminals: Readonly<Record<GoldenMode, Terminal>> = {
  colour: {
    env: { ...utf8, FORCE_COLOR: "1" },
    platform: "linux",
    stdoutIsTerminal: true,
    stderrIsTerminal: true,
  },
  noColour: {
    env: { ...utf8, NO_COLOR: "1" },
    platform: "linux",
    stdoutIsTerminal: true,
    stderrIsTerminal: true,
  },
  json: { env: utf8, platform: "linux", stdoutIsTerminal: false, stderrIsTerminal: false },
};

/**
 * Runs one command line in every {@link GoldenMode}, in-process, from `cwd`,
 * on a clock that never moves. Compare the result with a golden file through
 * {@link goldenText}, and check it with {@link checklistProblems}.
 *
 * @param args - the command line after `halonic`, without `--json`; the json
 *   mode adds it
 */
export async function runGolden(
  args: readonly string[],
  commands: GoldenCommands,
  cwd = "/work",
): Promise<GoldenRun> {
  const run = async (mode: GoldenMode): Promise<GoldenOutput> => {
    const io = captureIo(cwd);
    const modeArgs = mode === "json" ? withJson(args) : args;
    const setup = { terminal: terminals[mode], clock: manualClock() };
    const exit = await runCli(modeArgs, io, commands(), setup);
    return { exit, stdout: io.stdout, stderr: io.stderr };
  };
  return { colour: await run("colour"), noColour: await run("noColour"), json: await run("json") };
}

/** `--json` before a `--`, where the CLI reads it, or at the end. */
function withJson(args: readonly string[]): readonly string[] {
  const end = args.indexOf("--");
  if (end === -1) {
    return [...args, "--json"];
  }
  return [...args.slice(0, end), "--json", ...args.slice(end)];
}

/**
 * A golden run as text for a golden file: each mode's exit code, stdout and
 * stderr, with every escape code shown as `\e`, so a reviewer reads the
 * colours in the diff.
 */
export function goldenText(args: readonly string[], run: GoldenRun): string {
  const sections = goldenModes.map((mode) => {
    const { exit, stdout, stderr } = run[mode];
    return [
      `## ${modeTitles[mode]}: halonic ${args.join(" ")}`,
      `exit ${exit}`,
      "stdout:",
      ...indented(stdout, mode),
      "stderr:",
      ...indented(stderr, mode),
    ].join("\n");
  });
  return `${sections.join("\n\n")}\n`;
}

const modeTitles: Readonly<Record<GoldenMode, string>> = {
  colour: "colour",
  noColour: "NO_COLOR",
  json: "--json",
};

function indented(lines: readonly string[], mode: GoldenMode): string[] {
  return lines
    .flatMap((line) => line.split("\n"))
    .map((line) => `  ${showEscapes(withSlashes(line, mode))}`);
}

/** A `\` between folders, but not the one that starts a `\u001b` code from `printable`. */
const textSeparator = /\\(?!u[0-9a-f]{4})/gu;

/** The same `\` inside a JSON string, where it is written `\\`. */
const jsonSeparator = /\\\\(?!u[0-9a-f]{4})/gu;

/**
 * A printed line with `/` between folders on every system, so one golden
 * file holds on Windows too. The CLI shows paths with the system's separator
 * (cli-output 1.2): `.\acme` and, in `--json`, `".\\acme"` on Windows both
 * read `./acme` here. Elsewhere the line stays exactly as printed.
 *
 * @param separator - the system's separator; a test passes `\` to check Windows anywhere
 */
export function withSlashes(line: string, mode: GoldenMode, separator: string = sep): string {
  if (separator === "/") {
    return line;
  }
  return line.replace(mode === "json" ? jsonSeparator : textSeparator, "/");
}

function showEscapes(text: string): string {
  return text.replaceAll("\u001b", "\\e");
}
