// A run `halonic run` hands to the running `serve` over its console channel
// (`cli.local-engine-lock`, HAL-19396): `serve` holds the workspace's engine, so it starts the run
// on that engine, with the checks a run started from the served Studio gets, and the run shows in
// the phone's Inbox like any other. The channel opens only for the user who could run it anyway.

import type { TrustGate } from "@halonicjs/host-server";
import { isRunTargetNotFound, type RunExecutor } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { printable } from "../../output/printable.ts";

/** The console request that starts a run: the workflow by its hub, and the run's input. */
export interface StartRunRequest {
  readonly op: "start-run";
  readonly hubId: string;
  readonly workflowId: string;
  readonly input: Record<string, unknown>;
}

/** What starts a served run: the executor and trust gate the server's start route uses. */
export interface ServedRunStarts {
  /** The executor the server's routes start runs on, which reads the live version. */
  readonly executor: Pick<RunExecutor, "start">;
  /** Asked for every start, as the server's start route asks it. */
  readonly trust: TrustGate;
}

/**
 * The answer to a `start-run` request: `ok` with the run's id as soon as it started, since a
 * console reply has to come within seconds and a run may take minutes; or `ok: false` with why
 * nothing started. `null` for any other request, which the device console answers.
 */
export async function answerStartRun(
  starts: ServedRunStarts,
  request: unknown,
  logError: (error: unknown) => void,
): Promise<Readonly<Record<string, unknown>> | null> {
  if (!isStartRun(request)) return null;
  // A trust check that throws is a start that failed, as the server's start route takes it; left
  // outside the `try`, it would close the connection unanswered and `run` would refuse instead.
  try {
    const decision = await starts.trust.check();
    if (decision.state !== "trusted") {
      return { ok: false, reason: "not-trusted", message: printable(decision.message) };
    }
    const { hubId, workflowId, input } = request;
    const run = await starts.executor.start({ hubId, workflowId, input });
    return { ok: true, runId: run.id };
  } catch (error) {
    if (isRunTargetNotFound(error)) return { ok: false, reason: "not-found" };
    // Only a sentence Halonic's own checks wrote, such as a sandbox that can't start, goes back
    // to `run`; any other text stays in `serve`'s `--debug` lines.
    if (error instanceof KindedError) {
      return { ok: false, reason: "not-started", message: printable(error.message) };
    }
    logError(error);
    return { ok: false, reason: "not-started" };
  }
}

/** The fields of a {@link StartRunRequest}; a request with any other is the device console's to refuse. */
const startRunFields = new Set(["op", "hubId", "workflowId", "input"]);

function isStartRun(request: unknown): request is StartRunRequest {
  if (typeof request !== "object" || request === null) return false;
  if (Object.keys(request).some((key) => !startRunFields.has(key))) return false;
  const { op, hubId, workflowId, input } = request as Partial<Record<string, unknown>>;
  return (
    op === "start-run" &&
    typeof hubId === "string" &&
    typeof workflowId === "string" &&
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input)
  );
}
