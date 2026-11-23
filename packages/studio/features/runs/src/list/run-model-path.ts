// Which models a run's replies came from (requirement `runs.sample-chip`): the Inbox's wait card
// and a Runs row carry the "Sample answers" chip on `sample`, and "You did it" picks its cost line
// from it. It reads the run's own log, not the workspace's current model, so a run on Sample
// answers keeps its chip after a real model is picked, and the other way round.

import { ranOnTestModel } from "@halonicjs/app";
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
  const isTestModel = (providerId: string) => source.isTestModel?.(providerId) === true;
  const providers = log.flatMap((event) => (event.type === "llm.request" ? [event.provider] : []));
  const known = providers.every(
    (provider) =>
      source.providerKind(provider) !== undefined &&
      (source.isTestModel === undefined || source.isTestModel(provider) !== undefined),
  );
  if (providers.length === 0) return { path: undefined, known };
  // The same check as the CLI's line (`cli.sample-answers`), so the two never disagree.
  if (ranOnTestModel(log, isTestModel)) return { path: "sample", known };
  const cloud = providers.some(
    (provider) =>
      !isTestModel(provider) &&
      // Ollama always runs on this computer, as the run page's waiting line counts it.
      provider !== "ollama" &&
      source.providerKind(provider) !== "local",
  );
  return { path: cloud ? "cloud" : "local", known };
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

/** A run that may carry the chip, with its standing, which tells when to read its log again. */
export interface SampleCandidate {
  readonly id: string;
  /** Such as `needs-you` or `done`: a run that went on after an answer may have called a model. */
  readonly standing: string;
}

/** How many logs the Runs page reads at once, so a long list doesn't read hundreds together. */
export const sampleReadsAtOnce = 4;

/**
 * Of these runs, the ones on Sample answers, read again when a run comes, goes or changes its
 * standing; empty until they are read. The logs are read {@link sampleReadsAtOnce} at a time. A
 * log that can't be read leaves its run out, logged to the console.
 */
export function useSampleRuns(
  source: RunsSource | undefined,
  runs: readonly SampleCandidate[],
): ReadonlySet<string> {
  const [samples, setSamples] = useState<ReadonlySet<string>>(() => new Set());
  const key = runs.map((run) => `${run.id}:${run.standing}`).join(" ");
  useEffect(() => {
    if (source === undefined || key === "") return;
    let current = true;
    const ids = key.split(" ").map((each) => each.slice(0, each.lastIndexOf(":")));
    void sampleIds(source, ids, () => current).then((found) => {
      if (current) setSamples(new Set(found));
    });
    return () => {
      current = false;
    };
  }, [source, key]);
  return key === "" ? new Set() : samples;
}

/**
 * The ids on Sample answers, reading the logs a few at a time; it stops starting reads once
 * `wanted` says the answer is no longer wanted.
 */
async function sampleIds(
  source: RunsSource,
  ids: readonly string[],
  wanted: () => boolean,
): Promise<string[]> {
  const found = new Set<string>();
  let next = 0;
  const reader = async () => {
    while (next < ids.length && wanted()) {
      const runId = ids[next] ?? "";
      next += 1;
      try {
        if ((await runModelPath(source, runId)) === "sample") found.add(runId);
      } catch (error) {
        console.error("Couldn't read the run's models.", error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(sampleReadsAtOnce, ids.length) }, reader));
  // Back in the list's order, whichever read finished first.
  return ids.filter((id) => found.has(id));
}
