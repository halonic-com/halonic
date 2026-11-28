import { RunTargetNotFound } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { answerStartRun, type ServedRunStarts } from "./serve-run-start.ts";

const request = { op: "start-run", hubId: "support", workflowId: "support-reply", input: {} };

/** What `serve` sent to its `--debug` lines. */
let logged: unknown[] = [];
const answer = (served: ServedRunStarts, asked: unknown) => {
  logged = [];
  return answerStartRun(served, asked, (error) => logged.push(error));
};

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

    expect(await answer(served, request)).toEqual({
      ok: true,
      runId: "run_mfx3k2a1_a1b2c3d4",
    });
    expect(served.started).toEqual([{ hubId: "support", workflowId: "support-reply", input: {} }]);
  });

  it("starts nothing on a workspace that isn't trusted, and says why", async () => {
    const served = starts(startedRun, false);

    expect(await answer(served, request)).toEqual({
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

    expect(await answer(served, request)).toEqual({ ok: false, reason: "not-found" });
  });

  it("gives the sentence of Halonic's own check that refused the start", async () => {
    const served = starts(async () => {
      throw new KindedError("unavailable", "The sandbox can't start on this computer.");
    });

    expect(await answer(served, request)).toEqual({
      ok: false,
      reason: "not-started",
      message: "The sandbox can't start on this computer.",
    });
    expect(logged).toEqual([]);
  });

  it("keeps any other failure's text in serve's --debug lines", async () => {
    const failure = new Error("EACCES: permission denied, open 'runs/run_mfx3k2a1_a1b2c3d4'");
    const served = starts(async () => {
      throw failure;
    });

    expect(await answer(served, request)).toEqual({ ok: false, reason: "not-started" });
    expect(logged).toEqual([failure]);
  });

  it("leaves every other request to the device console", async () => {
    const served = starts(startedRun);

    expect(await answer(served, { op: "devices" })).toBeNull();
    expect(await answer(served, { ...request, input: [] })).toBeNull();
    expect(await answer(served, { ...request, harness: "codex" })).toBeNull();
    expect(served.started).toEqual([]);
  });
});
