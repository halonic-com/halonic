/**
 * Reads the `timings` lines Studio's shell writes to `shell.log` (`studio.src-tauri.open-timings`,
 * HAL-19531) into rows of a step and its milliseconds (`open-timings.summary`).
 *
 * A line is `<UTC time> timings: <text>`; the texts are the shell's fixed sentences, so a line
 * whose text is none of them is skipped rather than guessed at.
 */

/** One row of the table: a step and how many milliseconds it took. */
export interface TimingRow {
  readonly step: string;
  readonly ms: number;
}

/** What the `timings` lines of one log say about Studio's start and its first open. */
export interface OpenTimings {
  /** The rows, in the table's order: `start` and its steps, `ready`, `engine`, `open`. */
  readonly rows: readonly TimingRow[];
  /** From the page's load to the first window's engine answer; undefined when unknown. */
  readonly openMs: number | undefined;
  /** How long the first window's engine took to answer or be refused; undefined when no line said. */
  readonly engineMs: number | undefined;
  /** The fixed kind of the first engine's refusal, such as `engine_failed`; undefined when it answered. */
  readonly refused: string | undefined;
}

const SOURCE = /^\S+ timings: (.*)$/;
const HOST_START = /^the agent host started [^:]+: (.*) \((\d+) ms in all\)$/;
const STEP = /^(.+) (\d+) ms$/;
const READY = /^Studio's start was ready (\d+) ms after the page loaded$/;
const ENGINE =
  /^a window's engine (?:answered in|was refused \(([a-z_]+)\) after) (\d+) ms(?:, asked (\d+) ms after the page loaded)?$/;

interface Engine {
  readonly took: number;
  readonly asked: number | undefined;
  readonly refused: string | undefined;
}

interface Seen {
  start?: readonly TimingRow[];
  ready?: number;
  engine?: Engine;
}

/** The timings in `log`, the text of a `shell.log`; only the first start and the first engine count. */
export function parseTimings(log: string): OpenTimings {
  const seen: Seen = {};
  for (const line of log.split(/\r?\n/)) {
    const text = SOURCE.exec(line)?.[1];
    if (text !== undefined) note(seen, text);
  }
  const engine = seen.engine;
  const openMs =
    engine === undefined || engine.asked === undefined ? undefined : engine.asked + engine.took;
  const rows: TimingRow[] = [...(seen.start ?? [])];
  if (seen.ready !== undefined) rows.push({ step: "ready", ms: seen.ready });
  if (engine !== undefined) rows.push({ step: "engine", ms: engine.took });
  if (openMs !== undefined) rows.push({ step: "open", ms: openMs });
  return { rows, openMs, engineMs: engine?.took, refused: engine?.refused };
}

function note(seen: Seen, text: string): void {
  const start = HOST_START.exec(text);
  if (start !== null) {
    seen.start ??= startRows(start[1] ?? "", Number(start[2]));
    return;
  }
  const ready = READY.exec(text);
  if (ready !== null) {
    seen.ready ??= Number(ready[1]);
    return;
  }
  const engine = ENGINE.exec(text);
  if (engine !== null) {
    seen.engine ??= {
      refused: engine[1],
      took: Number(engine[2]),
      asked: engine[3] === undefined ? undefined : Number(engine[3]),
    };
  }
}

/** `start` with the whole, then `start: <step>` for each step when there is more than one. */
function startRows(steps: string, whole: number): readonly TimingRow[] {
  const parts = steps.split(", ").flatMap((part) => {
    const step = STEP.exec(part);
    return step === null ? [] : [{ step: `start: ${step[1]}`, ms: Number(step[2]) }];
  });
  return parts.length > 1
    ? [{ step: "start", ms: whole }, ...parts]
    : [{ step: "start", ms: whole }];
}

/** Why the open is flagged: over `budgetMs`, refused, or never answered; undefined when it is fine. */
export function openProblem(timings: OpenTimings, budgetMs: number): string | undefined {
  if (timings.engineMs === undefined) return "no window's engine answered";
  if (timings.refused !== undefined) return `the window's engine was refused (${timings.refused})`;
  // Without the page's load, the engine's own wait is the least the open took.
  const took = timings.openMs ?? timings.engineMs;
  if (took > budgetMs) return `opening took ${took} ms, over the ${budgetMs} ms budget`;
  return undefined;
}
