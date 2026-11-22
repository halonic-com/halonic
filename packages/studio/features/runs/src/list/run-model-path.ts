// Which models a run's replies came from (requirement `runs.sample-chip`): the Inbox's wait card
// and a Runs row carry the "Sample answers" chip on `sample`, and "You did it" picks its cost line
// from it. It reads the run's own log, not the workspace's current model, so a run on Sample
// answers keeps its chip after a real model is picked, and the other way round.

import type { RunEvent } from "@halonicjs/events";
import { useEffect, useState } from "react";
import { DamagedRunLog, type RunsSource } from "../api.ts";

/**
 * Where a run's model calls went: all to the test model (`sample`), all to models on this
 * computer, the test model aside (`local`), or at least one past it (`cloud`).
 */
export type RunModelPath = "sample" | "local" | "cloud";

/** The chip's one name, on the Runs row and the Inbox card, as the header chip says it. */
export const sampleAnswersWord = "Sample answers";

/** The answers for ended runs, by source, so two open workspaces never share one. */
const endedPaths = new WeakMap<RunsSource, Map<string, RunModelPath | undefined>>();

const endEvents: ReadonlySet<RunEvent["type"]> = new Set([
  "run.completed",
  "run.failed",
  "run.cant-try",
]);

/**
 * The run's model path from its log, or `undefined` when it made no model call. `sample` only when
 * every `llm.request` went to a test model; a run that mixed one with a real model is `local` or
 * `cloud` by its real calls. A source without `isTestModel` never answers `sample`. The answer for
 * an ended run is kept, since its calls can't change; a run still going or waiting is read again
 * each time, since it may call a model after an answer. Rejects when the log can't be read.
 *
 * @example
 * await runModelPath(source, "01JD8Q…"); // "sample"
 */
export async function runModelPath(
  source: RunsSource,
  runId: string,
): Promise<RunModelPath | undefined> {
  const kept = endedPaths.get(source);
  if (kept?.has(runId)) return kept.get(runId);
  const log = await readLog(source, runId);
  const { path, known } = pathOf(source, log);
  if (known && log.some((event) => endEvents.has(event.type))) {
    endedPaths.set(source, (kept ?? new Map()).set(runId, path));
  }
  return path;
}

/** The log as far as it can be read: a damaged line still leaves the calls before it. */
async function readLog(source: RunsSource, runId: string): Promise<readonly RunEvent[]> {
  try {
    return await source.log(runId);
  } catch (error) {
    if (error instanceof DamagedRunLog) return error.events;
    throw error;
  }
}

/**
 * The path of the log's model calls, and whether the workspace knew every provider they name: a
 * provider it doesn't know (its files not read yet, or removed) counts as `cloud`, unkept.
 */
function pathOf(
  source: RunsSource,
  log: readonly RunEvent[],
): { readonly path: RunModelPath | undefined; readonly known: boolean } {
  let known = true;
  let sawCall = false;
  let sawReal = false;
  let sawCloud = false;
  for (const event of log) {
    if (event.type !== "llm.request") continue;
    sawCall = true;
    const test = source.isTestModel?.(event.provider);
    const kind = source.providerKind(event.provider);
    if (kind === undefined || (source.isTestModel !== undefined && test === undefined)) {
      known = false;
    }
    if (test === true) continue;
    sawReal = true;
    // Ollama always runs on this computer, as the run page's waiting line counts it.
    if (event.provider !== "ollama" && kind !== "local") sawCloud = true;
  }
  if (!sawCall) return { path: undefined, known };
  if (!sawReal) return { path: "sample", known };
  return { path: sawCloud ? "cloud" : "local", known };
}

/**
 * The model path of one run, read when the run or the source changes; `undefined` until it is
 * read, without a source or run, and when the log can't be read (logged to the console).
 */
export function useRunModelPath(
  source: RunsSource | undefined,
  runId: string | undefined,
): RunModelPath | undefined {
  const [read, setRead] = useState<{ readonly runId: string; readonly path?: RunModelPath }>();
  useEffect(() => {
    if (source === undefined || runId === undefined) return;
    let current = true;
    runModelPath(source, runId).then(
      (path) => {
        if (current) setRead(path === undefined ? { runId } : { runId, path });
      },
      (error: unknown) => console.error("Couldn't read the run's models.", error),
    );
    return () => {
      current = false;
    };
  }, [source, runId]);
  return read !== undefined && read.runId === runId ? read.path : undefined;
}

/**
 * Of the runs with these ids, the ones on Sample answers, read again when the ids change; empty
 * until they are read. A log that can't be read leaves its run out, logged to the console.
 */
export function useSampleRuns(
  source: RunsSource | undefined,
  runIds: readonly string[],
): ReadonlySet<string> {
  const [samples, setSamples] = useState<ReadonlySet<string>>(() => new Set());
  const key = runIds.join(" ");
  useEffect(() => {
    if (source === undefined || key === "") return;
    let current = true;
    const ids = key.split(" ");
    const reads = ids.map((runId) =>
      runModelPath(source, runId).then(
        (path) => (path === "sample" ? [runId] : []),
        (error: unknown) => {
          console.error("Couldn't read the run's models.", error);
          return [];
        },
      ),
    );
    void Promise.all(reads).then((found) => {
      if (current) setSamples(new Set(found.flat()));
    });
    return () => {
      current = false;
    };
  }, [source, key]);
  return key === "" ? new Set() : samples;
}
