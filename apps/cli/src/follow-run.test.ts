import { RunFollowStopped } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { followUntilStopped } from "./follow-run.ts";

/** No workspace files: these runs stop before any step, so nothing is looked up. */
const workspace = { files: [] } as unknown as LoadedWorkspace;

/** The engine's two signals, neither aborted. */
function signals() {
  const ctrlC = new AbortController();
  const stuck = new AbortController();
  return { ctrlC, stuck, engine: { signal: ctrlC.signal, stuck: stuck.signal } };
}

verifies("cli.run", () => {
  it("returns what the follow returned", async () => {
    const { engine } = signals();

    expect(await followUntilStopped(engine, workspace, async () => "ended")).toBe("ended");
  });

  it("passes the engine's signal to the follow", async () => {
    const { engine } = signals();
    let given: AbortSignal | undefined;

    await followUntilStopped(engine, workspace, async (signal) => {
      given = signal;
    });

    expect(given).toBe(engine.signal);
  });

  it("turns a stopped follow into Stopped. when no step had finished", async () => {
    const { engine } = signals();

    const stopped = await followUntilStopped(engine, workspace, async () => {
      throw new RunFollowStopped("run_01jd8q", [], undefined, { cancelled: true });
    });

    expect(stopped).toEqual({ stopped: true, json: {} });
  });

  it("throws the stuck step's error rather than a stopped result", async () => {
    const { engine, stuck } = signals();
    const stepError = new Error("The model server keeps refusing.");
    stuck.abort(stepError);

    const thrown = await followUntilStopped(engine, workspace, async () => {
      throw new RunFollowStopped("run_01jd8q", [], undefined, { cancelled: true });
    }).catch((error: unknown) => error);

    expect(thrown).toBe(stepError);
  });

  it("lets an AbortError from before the start through, for runCli's Stopped.", async () => {
    const { engine } = signals();
    const aborted = new DOMException("Stopped before the start.", "AbortError");

    const thrown = await followUntilStopped(engine, workspace, async () => {
      throw aborted;
    }).catch((error: unknown) => error);

    expect(thrown).toBe(aborted);
  });
});
