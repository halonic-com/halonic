import { RunTargetNotFound } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { answerStartRun, type ServedRunStarts } from "./serve-run-start.ts";

const request = { op: "start-run", hubId: "support", workflowId: "support-reply", input: {} };

/** A served start on a trusted workspace whose executor answers with `start`. */
function starts(
  start: ServedRunStarts["executor"]["start"],
  trusted = true,
): ServedRunStarts & { readonly started: unknown[] } {
  const started: unknown[] = [];
  return {
    started,
    executor: {
      start: async (asked) => {
        started.push(asked);
        return await start(asked);
      },
    },
    trust: {
      check: async () =>
        trusted
          ? { state: "trusted", message: "Trusted." }
          : { state: "changed", message: "A connector changed since you trusted Acme." },
    },
  };
}

const startedRun: ServedRunStarts["executor"]["start"] = async () =>
  ({ id: "run_mfx3k2a1_a1b2c3d4" }) as Awaited<ReturnType<ServedRunStarts["executor"]["start"]>>;

verifies("cli.local-engine-lock", () => {
  it("starts the workflow and answers with the run's id", async () => {
    const served = starts(startedRun);

    expect(await answerStartRun(served, request)).toEqual({
      ok: true,
      runId: "run_mfx3k2a1_a1b2c3d4",
    });
    expect(served.started).toEqual([{ hubId: "support", workflowId: "support-reply", input: {} }]);
  });

  it("starts nothing on a workspace that isn't trusted, and says why", async () => {
    const served = starts(startedRun, false);

    expect(await answerStartRun(served, request)).toEqual({
      ok: false,
      reason: "not-trusted",
      message: "A connector changed since you trusted Acme.",
    });
    expect(served.started).toEqual([]);
  });

  it("answers not-found for a workflow serve doesn't have", async () => {
    const served = starts(async () => {
      throw new RunTargetNotFound("workflow", "support-reply", "No workflow support-reply.");
    });

    expect(await answerStartRun(served, request)).toEqual({ ok: false, reason: "not-found" });
  });

  it("gives why the start failed, such as nothing live", async () => {
    const served = starts(async () => {
      throw new Error("Nothing is live yet.");
    });

    expect(await answerStartRun(served, request)).toEqual({
      ok: false,
      reason: "not-started",
      message: "Nothing is live yet.",
    });
  });

  it("leaves every other request to the device console", async () => {
    const served = starts(startedRun);

    expect(await answerStartRun(served, { op: "devices" })).toBeNull();
    expect(await answerStartRun(served, { ...request, input: [] })).toBeNull();
    expect(served.started).toEqual([]);
  });
});
