import { type RunEventBody, type RunSummary, summarize } from "@halonicjs/events";
import type { RunExecutor, SendOptions } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type RunEventRefusal, RunEventRefused, RunEvents } from "./run-events.ts";
import { MemoryRuns } from "./testing/memory-runs.ts";

const started: RunEventBody = {
  type: "run.started",
  hubId: "acme",
  workflowId: "support-reply",
  input: {},
  kind: "run",
  definitionsVersion: "v1",
};
const enteredReview: RunEventBody = { type: "state.entered", state: "review" };
const waiting: RunEventBody = {
  type: "run.waiting",
  state: "review",
  events: ["approve", "reject"],
};
const completed: RunEventBody = { type: "run.completed", state: "send", context: {} };
const failed: RunEventBody = { type: "run.failed", state: "review", error: "boom" };

const startedAt = "2026-11-10T10:00:00.000Z";

/** An error as the engine's `InputRefused` throws it. */
function engineRefused(code: string): Error {
  return Object.assign(new Error(`refused: ${code}`), { code });
}

/**
 * A `RunExecutor.send` that records what it gets and answers with the run's
 * summary from the store, or runs `onSend` first when a test sets it.
 */
class RecordingSend implements Pick<RunExecutor, "send"> {
  readonly sends: { runId: string; event: string; payload: unknown; options?: SendOptions }[] = [];
  onSend: (() => void) | null = null;

  readonly #store: MemoryRuns;

  constructor(store: MemoryRuns) {
    this.#store = store;
  }

  async send(
    runId: string,
    event: string,
    payload?: unknown,
    options?: SendOptions,
  ): Promise<RunSummary> {
    this.sends.push({ runId, event, payload, ...(options === undefined ? {} : { options }) });
    this.onSend?.();
    const summary = summarize(await this.#store.events(runId));
    if (summary === null) throw new Error("no summary");
    return summary;
  }
}

function given(bodies: readonly RunEventBody[]): {
  store: MemoryRuns;
  executor: RecordingSend;
  events: RunEvents;
} {
  const store = new MemoryRuns();
  store.add("run_a1", startedAt, bodies);
  const executor = new RecordingSend(store);
  return { store, executor, events: new RunEvents(executor, store) };
}

/** The refusal `send` throws, failing the test when it throws something else or nothing. */
async function refusalOf(send: Promise<unknown>): Promise<RunEventRefused> {
  const error: unknown = await send.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof RunEventRefused)) {
    throw new Error(`Expected a RunEventRefused, got ${String(error)}`);
  }
  return error;
}

verifies("app.run-send", () => {
  describe("sendEvent", () => {
    it("sends the event to a waiting run, naming no call, and returns its summary", async () => {
      const { executor, events } = given([started, enteredReview, waiting]);

      const summary = await events.sendEvent("run_a1", "approve");

      expect(executor.sends).toEqual([{ runId: "run_a1", event: "approve", payload: undefined }]);
      expect(summary.id).toBe("run_a1");
    });

    it("refuses a run that doesn't exist as not_found, and sends nothing", async () => {
      const { executor, events } = given([started, enteredReview, waiting]);

      const refused = await refusalOf(events.sendEvent("run_zz", "approve"));

      expect(errorKindOf(refused)).toBe("not_found");
      expect(refused.refusal).toEqual({ reason: "no-run" });
      expect(executor.sends).toEqual([]);
    });

    it("refuses a run that isn't waiting as conflict, with its summary", async () => {
      const { executor, events } = given([started, completed]);

      const refused = await refusalOf(events.sendEvent("run_a1", "approve"));

      expect(errorKindOf(refused)).toBe("conflict");
      expect(refused.refusal).toMatchObject({
        reason: "not-waiting",
        run: { status: "completed" },
      });
      expect(executor.sends).toEqual([]);
    });

    it("refuses a running run as conflict too", async () => {
      const { events } = given([started]);

      const refused = await refusalOf(events.sendEvent("run_a1", "approve"));

      expect(refused.refusal).toMatchObject({ reason: "not-waiting", run: { status: "running" } });
    });

    it("refuses an event the step doesn't take as invalid_input, with the step and what it takes", async () => {
      const { executor, events } = given([started, enteredReview, waiting]);

      const refused = await refusalOf(events.sendEvent("run_a1", "aprove"));

      expect(errorKindOf(refused)).toBe("invalid_input");
      expect(refused.refusal).toEqual<RunEventRefusal>({
        reason: "event-not-taken",
        step: "review",
        accepts: ["approve", "reject"],
      });
      expect(executor.sends).toEqual([]);
    });

    it("refuses a run that ended between the check and the send as conflict", async () => {
      const { store, executor, events } = given([started, enteredReview, waiting]);
      executor.onSend = () => {
        store.add("run_a1", startedAt, [started, enteredReview, waiting, failed]);
        throw engineRefused("engine.run-ended");
      };

      const refused = await refusalOf(events.sendEvent("run_a1", "approve"));

      expect(errorKindOf(refused)).toBe("conflict");
      expect(refused.refusal).toMatchObject({ reason: "not-waiting", run: { status: "failed" } });
      expect(refused.cause).toBeInstanceOf(Error);
    });

    it("refuses an event the engine doesn't take while the run still waits as invalid_input", async () => {
      const { executor, events } = given([started, enteredReview, waiting]);
      executor.onSend = () => {
        throw engineRefused("engine.input-not-accepted");
      };

      const refused = await refusalOf(events.sendEvent("run_a1", "approve"));

      expect(refused.refusal).toEqual({
        reason: "event-not-taken",
        step: "review",
        accepts: ["approve", "reject"],
      });
    });

    it("passes any other executor error through unchanged", async () => {
      const { executor, events } = given([started, enteredReview, waiting]);
      const down = new Error("The host can't be reached.");
      executor.onSend = () => {
        throw down;
      };

      await expect(events.sendEvent("run_a1", "approve")).rejects.toBe(down);
    });
  });
});
