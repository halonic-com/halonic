import { versionPlaceholder } from "./version.ts";

/**
 * One command of a recording: what is typed, and how the take is paced
 * for reading. Pacing only moves time; it never changes what is printed.
 */
export interface RecordedCommand {
  /** The command line as typed. `{name}` is filled from `set` before it is typed. */
  readonly run: string;
  /** Seconds spent typing the command, before Enter. */
  readonly typing: number;
  /** Seconds the prompt rests after this command's output, before the next command is typed. */
  readonly hold: number;
  /** The longest wait between Enter and the first output, in seconds; longer waits (a program starting up) are cut to this. */
  readonly maxWaitForOutput?: number;
  /** The step label in the window bar that lights up when this command is typed. */
  readonly step?: string;
  /** Values the command needs from the session so far: name → a shell command whose output is the value. Runs unseen. */
  readonly set?: Readonly<Record<string, string>>;
}

/** A recording: the terminal, the commands in order and the pacing of the take. */
export interface Recording {
  /** The title in the window bar. `{version}` is filled from what the captured `halonic --version` printed. */
  readonly title: string;
  /** What the recording shows, in words: the SVG's accessible name. */
  readonly alt: string;
  readonly columns: number;
  readonly rows: number;
  /** Seconds before the first command is typed. */
  readonly startDelay: number;
  /** Seconds the last frame is held, with a blinking cursor, before the recording rests. */
  readonly rest: number;
  /** Seeds the small unevenness in the typing, so every render of one capture is the same. */
  readonly seed: number;
  readonly commands: readonly RecordedCommand[];
}

const variableName = /^[a-z][a-z0-9_]*$/;

/** Reads and checks a recording file. Throws with the field that is wrong. */
export function parseRecording(text: string): Recording {
  const value: unknown = JSON.parse(text);
  if (!isObject(value)) throw new Error("A recording file holds one JSON object.");
  const commands = value["commands"];
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error("A recording needs at least one command in `commands`.");
  }
  const title = requireString(value, "title");
  for (const [placeholder] of title.matchAll(/\{[^}]*\}/g)) {
    if (placeholder !== versionPlaceholder) {
      throw new Error(
        `recording.title uses ${placeholder}; the only value a title can show is ${versionPlaceholder}.`,
      );
    }
  }
  return {
    title,
    alt: requireString(value, "alt"),
    columns: requireWholeNumber(value, "columns"),
    rows: requireWholeNumber(value, "rows"),
    startDelay: requireSeconds(value, "startDelay"),
    rest: requireSeconds(value, "rest"),
    seed: requireWholeNumber(value, "seed"),
    commands: commands.map((command, index) => parseCommand(command, index)),
  };
}

function parseCommand(value: unknown, index: number): RecordedCommand {
  if (!isObject(value)) throw new Error(`commands[${index}] must be an object.`);
  const where = `commands[${index}]`;
  const run = requireString(value, "run", where);
  const set = parseSet(value["set"], where);
  for (const [, name] of run.matchAll(/\{([^}]*)\}/g)) {
    if (name === undefined || set[name] === undefined) {
      throw new Error(`${where}.run uses {${name}}, but ${where}.set doesn't define it.`);
    }
  }
  return {
    run,
    typing: requireSeconds(value, "typing", where),
    hold: requireSeconds(value, "hold", where),
    ...optionalSeconds(value, "maxWaitForOutput", where),
    ...(typeof value["step"] === "string" ? { step: value["step"] } : {}),
    ...(Object.keys(set).length > 0 ? { set } : {}),
  };
}

function parseSet(value: unknown, where: string): Readonly<Record<string, string>> {
  if (value === undefined) return {};
  if (!isObject(value)) throw new Error(`${where}.set must map names to shell commands.`);
  const set: Record<string, string> = {};
  for (const [name, command] of Object.entries(value)) {
    if (!variableName.test(name))
      throw new Error(`${where}.set: "${name}" isn't a valid name (a-z, 0-9, _).`);
    if (typeof command !== "string")
      throw new Error(`${where}.set.${name} must be a shell command.`);
    set[name] = command;
  }
  return set;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: Record<string, unknown>, key: string, where = "recording"): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0)
    throw new Error(`${where}.${key} must be a text.`);
  return field;
}

function requireWholeNumber(value: Record<string, unknown>, key: string): number {
  const field = value[key];
  if (typeof field !== "number" || !Number.isInteger(field) || field <= 0) {
    throw new Error(`recording.${key} must be a whole number above 0.`);
  }
  return field;
}

function requireSeconds(value: Record<string, unknown>, key: string, where = "recording"): number {
  const field = value[key];
  if (typeof field !== "number" || !Number.isFinite(field) || field < 0) {
    throw new Error(`${where}.${key} must be a number of seconds, 0 or more.`);
  }
  return field;
}

function optionalSeconds(
  value: Record<string, unknown>,
  key: string,
  where: string,
): Record<string, number> {
  return value[key] === undefined ? {} : { [key]: requireSeconds(value, key, where) };
}
