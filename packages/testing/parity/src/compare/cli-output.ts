import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CliRecording } from "../recording.ts";
import { deepEqual } from "./compare.ts";
import type { ComparedRun, LogEvent } from "./run-logs.ts";

/**
 * One CLI call as both sides are compared: its command, exit code, output,
 * and every run it stored, in the order they started. A run's summary holds
 * only its id, so the run-log rules that rename IDs reach it.
 */
export interface ComparedCall {
  /** `test` or `run`, the first argument. */
  readonly command: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly runs: readonly ComparedRun[];
}

/** One stored run of a call, as either CLI left it: its id and every event in order. */
export interface StoredRun {
  readonly id: string;
  readonly events: readonly unknown[];
}

/** One call the new CLI made, named as the old call it repeats. */
export interface NewCliCall {
  readonly name: string;
  readonly command: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /** Every run the call stored, in any order. */
  readonly runs: readonly StoredRun[];
}

/** One CLI call of a fixture: its old and its new result, before any rule. */
export interface CliComparison {
  /** The call's name, the way `cli-calls.ts` and a known gap name it. */
  readonly call: string;
  readonly old: ComparedCall;
  readonly new: ComparedCall;
}

const childRunIds = (run: StoredRun): string[] =>
  (run.events as LogEvent[])
    .filter((event) => event["type"] === "workflow.started")
    .map((event) => String(event["childRunId"]));

/**
 * The runs in the order they started: each run that no stored run started,
 * by id, each followed by the runs it started, in the order its log started
 * them. Every run of one call starts at the same fixed time, so the log is
 * the only order there is.
 */
export function inStartOrder(runs: readonly StoredRun[]): StoredRun[] {
  const byId = new Map(runs.map((run) => [run.id, run]));
  const started = new Set(runs.flatMap(childRunIds));
  const ordered: StoredRun[] = [];
  const visit = (run: StoredRun) => {
    ordered.push(run);
    for (const id of childRunIds(run)) {
      const child = byId.get(id);
      if (child !== undefined) visit(child);
    }
  };
  [...runs]
    .filter((run) => !started.has(run.id))
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))
    .forEach(visit);
  return ordered;
}

function comparedCall(
  call: Pick<NewCliCall, "command" | "exitCode" | "stdout" | "stderr">,
  runs: readonly StoredRun[],
): ComparedCall {
  return {
    command: call.command,
    exitCode: call.exitCode,
    stdout: call.stdout,
    stderr: call.stderr,
    runs: inStartOrder(runs).map((run) => ({
      summary: { id: run.id },
      events: run.events as LogEvent[],
    })),
  };
}

/**
 * Pairs each golden call with the new call of the same name. A call only one
 * side made is paired with an exit code of -1 and nothing else on the other
 * side, so it always differs.
 */
export function pairCliCalls(golden: CliRecording, fresh: readonly NewCliCall[]): CliComparison[] {
  const missing: ComparedCall = { command: "", exitCode: -1, stdout: "", stderr: "", runs: [] };
  const olds = new Map(
    golden.calls.map((call) => [
      call.name,
      comparedCall({ ...call, command: call.args[0] ?? "" }, call.runs),
    ]),
  );
  const news = new Map(fresh.map((call) => [call.name, comparedCall(call, call.runs)]));
  return [...new Set([...olds.keys(), ...news.keys()])].map((call) => ({
    call,
    old: olds.get(call) ?? missing,
    new: news.get(call) ?? missing,
  }));
}

/** Whether two calls are exactly the same: command, exit code, output, every run and its events in order. */
export function sameCall(a: ComparedCall, b: ComparedCall): boolean {
  return deepEqual(a, b);
}

/** Reads a fixture's golden CLI calls, `cli.json` in its folder (only the base has them). */
export function readCliRecording(folder: string): CliRecording {
  return JSON.parse(readFileSync(join(folder, "cli.json"), "utf8")) as CliRecording;
}
