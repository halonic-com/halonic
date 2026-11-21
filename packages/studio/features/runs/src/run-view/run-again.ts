import type { RunEvent } from "@halonicjs/events";
import { errorKindOf } from "@halonicjs/std";
import { type EngineWords, startFailureOf, withFullStop } from "@halonicjs/studio-shell";
import { useRef, useState } from "react";
import type { RunStartHost, SourcedRun } from "../api.ts";
import { runPageWords } from "../run-words.ts";

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

/** Why the last **Run again** didn't start. */
export interface RunAgainProblem {
  /** The error, which the page words. */
  readonly error: unknown;
  /** The start came from the failure's own **Try again**, so the new failure takes focus (C533-1). */
  readonly retried: boolean;
}

/** What **Run again** is on the page: the button's click, and why the last click didn't start a run. */
export interface RunAgain {
  /** Starts the run and opens it; busy until it has started. Never rejects: a failure is `problem`. */
  readonly start: () => Promise<void>;
  /** {@link RunAgain.start} from the failure's **Try again**: a new failure is `retried`. */
  readonly tryAgain: () => Promise<void>;
  /** True while a start is pending; a click then does nothing, wherever the button is. */
  readonly busy: boolean;
  /**
   * Why the last start failed. It stays while the next start is pending, so the failure's **Try
   * again** stays in place, busy, and keeps focus, and goes once a run has started.
   */
  readonly problem: RunAgainProblem | undefined;
  /**
   * While the last start was refused because the workspace isn't trusted yet (`denied`) and the
   * host can ask: opens the trust check, and once the person trusts it, the problem goes.
   */
  readonly review: (() => Promise<"trusted" | "declined">) | undefined;
}

/**
 * **Run again** for `run`: a new run of the same workflow with the same input, opened when it has
 * started. `undefined` when the page can't do it ({@link inputToRunAgain}, or no host or no way to
 * open a run). A failed start is said through `announce` once, when it happens: the reason, then
 * the next step when there is one (rule E4, C533-1).
 */
export function useRunAgain(
  host: RunStartHost | undefined,
  run: SourcedRun | undefined,
  log: readonly RunEvent[] | undefined,
  openRun: ((runId: string) => void) | undefined,
  engine: EngineWords,
  announce?: (line: string) => void,
): RunAgain | undefined {
  const [problem, setProblem] = useState<RunAgainProblem>();
  const [busy, setBusy] = useState(false);
  // A ref, so two clicks in the same render still start one run.
  const pending = useRef(false);
  const input = run === undefined ? undefined : inputToRunAgain(run, log);
  if (host === undefined || openRun === undefined || run === undefined || input === undefined) {
    return undefined;
  }
  const { hubId, workflowId } = run.summary;
  const begin = async (retried: boolean) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const started = await host.startRun({ hubId, workflowId }, input);
      setProblem(undefined);
      openRun(started.runId);
    } catch (error) {
      setProblem({ error, retried });
      announce?.(failedLine(error, engine));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const { askTrust } = host;
  const review =
    askTrust === undefined || problem === undefined || errorKindOf(problem.error) !== "denied"
      ? undefined
      : async () => {
          const answer = await askTrust();
          if (answer === "trusted") setProblem(undefined);
          return answer;
        };
  return { start: () => begin(false), tryAgain: () => begin(true), busy, problem, review };
}

/** "Couldn't start the run: *reason*", then the next step when there is one. */
function failedLine(error: unknown, engine: EngineWords): string {
  const failure = startFailureOf(error, engine.notAnswering);
  const step = failure.fix === undefined ? "" : ` ${withFullStop(failure.fix)}`;
  return `${runPageWords.runAgainFailed(failure.reason)}${step}`;
}
