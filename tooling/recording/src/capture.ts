import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Cast, CastEvent } from "./asciicast.ts";
import type { RecordedCommand, Recording } from "./recording.ts";
import { versionFromOutput } from "./version.ts";

/**
 * The driver tells the capture where each command starts with a private
 * escape sequence (an OSC that terminals ignore). The capture takes these
 * out again, so the cast holds only what the terminal really showed.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: escape codes are what this finds
const markerPattern = /\x1b\]5179;([^\x07]*)\x07/g;

/** A `{name}` in a command: a value the recording's `set` fills in. */
const placeholder = /\{([a-z][a-z0-9_]*)\}/g;

/** What to capture and where the program under test lives. */
export interface CaptureOptions {
  readonly recording: Recording;
  /** The folder put first on `PATH`: the one that holds the `halonic` to record. */
  readonly binFolder: string;
}

/**
 * Runs the recording's commands for real in a clean home folder, inside
 * `script` (util-linux), and returns what the terminal showed with its real
 * timing. The environment is rebuilt from nothing, so no shell profile,
 * alias or key of the machine leaks into the take.
 */
export function captureSession(options: CaptureOptions): Cast {
  const home = mkdtempSync(join(tmpdir(), "halonic-recording-home-"));
  const logs = mkdtempSync(join(tmpdir(), "halonic-recording-logs-"));
  try {
    const { columns, rows } = options.recording;
    writeFileSync(join(logs, "driver.sh"), driverScript(options.recording));
    const result = spawnSync(
      "script",
      [
        "--quiet",
        "--echo",
        "never",
        "--log-out",
        join(logs, "output"),
        "--log-timing",
        join(logs, "timing"),
        "--command",
        `stty cols ${columns} rows ${rows}; exec bash --norc --noprofile ${join(logs, "driver.sh")}`,
      ],
      {
        cwd: home,
        env: cleanEnvironment(home, options.binFolder),
        stdio: ["ignore", "ignore", "inherit"],
      },
    );
    if (result.error !== undefined)
      throw new Error(`Couldn't start script (util-linux): ${result.error.message}`);
    const log = readFileSync(join(logs, "output"));
    const timing = readFileSync(join(logs, "timing"), "utf8");
    // Reading the log first names the command that failed, which says more than the exit code.
    const cast = castFromScriptLog(log, timing, options.recording);
    if (result.status !== 0)
      throw new Error(`The captured session ended with exit code ${result.status}.`);
    return cast;
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(logs, { recursive: true, force: true });
  }
}

/**
 * Runs `halonic --version` once, off camera, in the same clean environment
 * as the take, and returns what it printed. Stops when it fails or prints no
 * version: a halonic without `--version` (before PR #1883) can't be recorded,
 * because the window bar's version comes from here.
 */
export function captureVersion(binFolder: string): string {
  const home = mkdtempSync(join(tmpdir(), "halonic-recording-home-"));
  try {
    const result = spawnSync("halonic", ["--version"], {
      cwd: home,
      env: cleanEnvironment(home, binFolder),
      encoding: "utf8",
    });
    if (result.error !== undefined)
      throw new Error(`Couldn't start halonic from ${binFolder}: ${result.error.message}`);
    const printed = `${result.stdout}${result.stderr}`.trim();
    if (result.status !== 0) {
      throw new Error(
        `halonic --version failed with exit ${result.status} and printed: ${printed.split("\n")[0] ?? ""}\n  The take needs a halonic that prints its version.`,
      );
    }
    versionFromOutput(printed);
    return `${printed}\n`;
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function cleanEnvironment(home: string, binFolder: string): NodeJS.ProcessEnv {
  return {
    HOME: home,
    PATH: `${binFolder}:/usr/local/bin:/usr/bin:/bin`,
    SHELL: "/bin/bash",
    TERM: "xterm-256color",
    LANG: "C.UTF-8",
    ...(process.env["TZ"] === undefined ? {} : { TZ: process.env["TZ"] }),
  };
}

/**
 * The bash script that plays the session. It prints the prompt and echoes
 * each command, as an interactive shell would, then runs the command.
 * Typing speed isn't simulated here: pacing does that afterwards.
 */
export function driverScript(recording: Recording): string {
  const lines = [
    "# Made by @halonicjs/tooling-recording. Plays the session that `script` records.",
    'cd "$HOME"',
    "prompt() {",
    '  local here="$PWD"',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: bash's own expansion, written literally
    '  if [ "$here" = "$HOME" ]; then here="~"; elif [ "${here#"$HOME"/}" != "$here" ]; then here="~/${here#"$HOME"/}"; fi',
    "  printf '\\033[2m%s\\033[22m \\033[34m$\\033[39m ' \"$here\"",
    "}",
    "prompt",
  ];
  for (const command of recording.commands) lines.push(...commandLines(command));
  return `${lines.join("\n")}\n`;
}

function commandLines(command: RecordedCommand): string[] {
  const shown = shellDoubleQuoted(command.run);
  const lines: string[] = [];
  for (const [name, source] of Object.entries(command.set ?? {})) {
    // Unseen: its errors would land on the recorded screen. An empty value stops the capture by name.
    lines.push(
      `${name}=$( (${source}) 2>/dev/null ) && [ -n "$${name}" ] || { printf '\\033]5179;failed;set ${name}\\007'; exit 1; }`,
    );
  }
  lines.push(
    `printf '\\033]5179;type;%s\\007' ${shown}`,
    `printf '%s\\n' ${shown}`,
    "printf '\\033]5179;enter\\007'",
    command.run.replaceAll(placeholder, (_, name: string) => `"${shellVariable(name)}"`),
    `status=$?; [ "$status" -eq 0 ] || printf '\\033]5179;failed;%s\\007' "$status"`,
    "printf '\\n'",
    "prompt",
  );
  return lines;
}

/** The command as a double-quoted bash word, with `{name}` left to expand. */
function shellDoubleQuoted(text: string): string {
  const escaped = text.replaceAll(/[\\"$`]/g, (character) => `\\${character}`);
  return `"${escaped.replaceAll(placeholder, (_, name: string) => shellVariable(name))}"`;
}

/** `${name}`, which bash expands to the variable's value. */
function shellVariable(name: string): string {
  return ["$", "{", name, "}"].join("");
}

/** One write `script` recorded: its time and its byte range in the log. */
interface Chunk {
  readonly time: number;
  readonly start: number;
  readonly end: number;
}

/**
 * Turns `script`'s output log and its classic timing file (`<delay> <bytes>`
 * per write) into a cast: output events with their real times, and a marker
 * event, labelled with the command, where each command is typed.
 */
export function castFromScriptLog(log: Uint8Array, timing: string, recording: Recording): Cast {
  const bytes = Buffer.from(log);
  const headerEnd = bytes.indexOf(0x0a);
  if (!bytes.subarray(0, headerEnd).toString("utf8").startsWith("Script started")) {
    throw new Error("The output log doesn't start with script's header line.");
  }
  const data = bytes.subarray(headerEnd + 1);
  const chunks = readTiming(timing, data.length);
  const events = splitAtMarkers(data, chunks);
  return {
    header: {
      version: 2,
      width: recording.columns,
      height: recording.rows,
      timestamp: Math.floor(Date.now() / 1000),
      title: recording.title,
      env: { TERM: "xterm-256color", SHELL: "/bin/bash" },
    },
    events,
  };
}

function readTiming(timing: string, available: number): Chunk[] {
  const chunks: Chunk[] = [];
  let time = 0;
  let offset = 0;
  for (const line of timing.split("\n")) {
    if (line.trim() === "") continue;
    const [delay, length] = line.trim().split(/\s+/).map(Number);
    if (
      delay === undefined ||
      length === undefined ||
      Number.isNaN(delay) ||
      Number.isNaN(length)
    ) {
      throw new Error(
        `The timing line "${line}" isn't "<delay> <bytes>". Use script's classic timing format.`,
      );
    }
    time += delay;
    chunks.push({ time, start: offset, end: offset + length });
    offset += length;
  }
  if (offset > available)
    throw new Error("The timing file describes more output than the log holds.");
  const firstTime = chunks[0]?.time ?? 0;
  return chunks.map((chunk) => ({ ...chunk, time: chunk.time - firstTime }));
}

interface Marker {
  readonly start: number;
  readonly end: number;
  readonly fields: readonly string[];
}

function findMarkers(data: Buffer): Marker[] {
  // latin1 keeps one character per byte, so match positions are byte offsets.
  return [...data.toString("latin1").matchAll(markerPattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    fields: Buffer.from(match[1] ?? "", "latin1")
      .toString("utf8")
      .split(";"),
  }));
}

/**
 * Walks the output in order. Text between markers becomes output events,
 * cut again wherever `script` saw a new write, so each piece keeps the time
 * it really appeared. A marker can't share an event with text, which keeps
 * each typed command in events of its own.
 */
function splitAtMarkers(data: Buffer, chunks: readonly Chunk[]): CastEvent[] {
  const recordedEnd = chunks.at(-1)?.end ?? 0;
  const markers = findMarkers(data.subarray(0, recordedEnd));
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const events: CastEvent[] = [];
  const pushOutput = (start: number, end: number): void => {
    for (const chunk of chunks) {
      const from = Math.max(start, chunk.start);
      const to = Math.min(end, chunk.end);
      if (from >= to) continue;
      const text = decoder.decode(data.subarray(from, to), { stream: true });
      if (text !== "") events.push({ time: chunk.time, kind: "o", data: text });
    }
  };
  let position = 0;
  for (const marker of markers) {
    pushOutput(position, marker.start);
    // A marker counts from its last byte: only then has the terminal seen all of it.
    const lastByte = marker.end - 1;
    const chunk = chunks.find(
      (candidate) => candidate.start <= lastByte && lastByte < candidate.end,
    );
    const event = markerEvent(marker, chunk?.time ?? 0);
    if (event !== undefined) events.push(event);
    position = marker.end;
  }
  pushOutput(position, recordedEnd);
  return events;
}

function markerEvent(marker: Marker, time: number): CastEvent | undefined {
  const [kind, ...rest] = marker.fields;
  if (kind === "type") return { time, kind: "m", data: rest.join(";") };
  if (kind === "enter") return undefined;
  if (kind === "failed")
    throw new Error(
      `A command in the session failed (${rest.join(";")}). Fix it before recording.`,
    );
  throw new Error(`Unknown capture marker "${kind}".`);
}
