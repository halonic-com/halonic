import type { RunEvent } from "@halonicjs/events";
import { useRef, useState } from "react";
import type { RunStartHost, SourcedRun } from "../api.ts";
import { loadFailureReason } from "../load-failure.ts";

/**
 * The input a **Run again** starts with: the one `run.started` logged. `undefined` where the run
 * can't be run again: it is still going or waiting, it is a test run (the Tests start those), it
 * runs a single agent, or its log isn't read yet.
 */
export function inputToRunAgain(
  run: SourcedRun,
  log: readonly RunEvent[] | undefined,
): Record<string, unknown> | undefined {
  const { summary } = run;
  const ended = summary.status === "completed" || summary.status === "failed";
  if (!ended || summary.kind !== "run" || summary.workflowId.startsWith("agent:")) {
    return undefined;
  }
  const started = log?.find((event) => event.type === "run.started");
  return started?.type === "run.started" ? started.input : undefined;
}

/** What **Run again** is on the page: the button's click, and why the last click didn't start a run. */
export interface RunAgain {
  /** Starts the run and opens it; busy until it has started. Never rejects: a failure is `problem`. */
  readonly start: () => Promise<void>;
  /** True while a start is pending; a click then does nothing, wherever the button is. */
  readonly busy: boolean;
  /** Why the last start failed, in the engine's words, until the next one. */
  readonly problem: string | undefined;
}

/**
 * **Run again** for `run`: a new run of the same workflow with the same input, opened when it has
 * started. `undefined` when the page can't do it ({@link inputToRunAgain}, or no host or no way to
 * open a run).
 */
export function useRunAgain(
  host: RunStartHost | undefined,
  run: SourcedRun | undefined,
  log: readonly RunEvent[] | undefined,
  openRun: ((runId: string) => void) | undefined,
): RunAgain | undefined {
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  // A ref, so two clicks in the same render still start one run.
  const pending = useRef(false);
  const input = run === undefined ? undefined : inputToRunAgain(run, log);
  if (host === undefined || openRun === undefined || run === undefined || input === undefined) {
    return undefined;
  }
  const { hubId, workflowId } = run.summary;
  const start = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setProblem(undefined);
    try {
      const started = await host.startRun({ hubId, workflowId }, input);
      openRun(started.runId);
    } catch (error) {
      setProblem(loadFailureReason(error));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { start, busy, problem };
}
