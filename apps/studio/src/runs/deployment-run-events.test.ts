import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DeploymentCallRefused,
  type DeploymentCalls,
  type DeploymentStreamMessage,
  type DeploymentStreamOpening,
} from "./deployment-calls.ts";
import {
  type FollowEnd,
  type FollowedEvent,
  followDeploymentRun,
  healthyStreamMs,
  reconnectDelays,
} from "./deployment-run-events.ts";

/** One stream of the fake deployment: what it opens with, then the messages it sends. */
type Script =
  | { readonly open: "refused"; readonly status: number }
  | { readonly open: "unreachable" }
  | {
      readonly open: "opened";
      readonly messages: readonly DeploymentStreamMessage[];
      readonly later?: true;
    };

/** A run event as the server sends it. */
function run(seq: number): DeploymentStreamMessage {
  return {
    type: "event",
    event: "run",
    data: JSON.stringify({ seq, type: "step.done" }),
    id: String(seq),
  };
}

const end: DeploymentStreamMessage = { type: "event", event: "end", data: "" };
const brokeOff: DeploymentStreamMessage = {
  type: "failed",
  message: "the server's stream broke off",
};

/**
 * A fake deployment that answers each opening with the next script, and records the `after` each
 * one asked from. A script marked `later` keeps its messages until the test sends them.
 */
function fakeDeployment(scripts: readonly Script[]) {
  const afters: (number | undefined)[] = [];
  const hungUp: number[] = [];
  let held: (() => void) | undefined;
  const calls: DeploymentCalls = {
    request: async () => ({ status: 200, body: null }),
    openEvents: async (_run, after, onMessage): Promise<DeploymentStreamOpening> => {
      const index = afters.length;
      afters.push(after);
      const script = scripts[index] ?? { open: "unreachable" };
      if (script.open === "unreachable") throw new DeploymentCallRefused("notAnswering");
      if (script.open === "refused")
        return { kind: "refused", answer: { status: script.status, body: null } };
      const deliver = () => {
        for (const message of script.messages) onMessage(message);
      };
      if (script.later) held = deliver;
      else queueMicrotask(deliver);
      return { kind: "opened", end: () => hungUp.push(index) };
    },
  };
  return { calls, afters, hungUp, sendHeld: () => held?.() };
}

function follow(calls: DeploymentCalls, after?: number) {
  const events: FollowedEvent[] = [];
  const ends: FollowEnd[] = [];
  const handle = followDeploymentRun({
    calls,
    runId: "run_1",
    ...(after === undefined ? {} : { after }),
    onEvent: (event) => events.push(event),
    onEnd: (ended) => ends.push(ended),
  });
  return { events, ends, handle, seqs: () => events.map((event) => event.seq) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

verifies("studio.deployment-calls", () => {
  describe("followDeploymentRun", () => {
    it("resumes after a dropped stream from the last event, and loses or repeats none", async () => {
      const deployment = fakeDeployment([
        { open: "opened", messages: [run(1), run(2), run(3), brokeOff] },
        // The replay overlaps: the server sends 2 and 3 again.
        { open: "opened", messages: [run(2), run(3), run(4), run(5), end, { type: "end" }] },
      ]);
      const followed = follow(deployment.calls);
      await vi.advanceTimersByTimeAsync(0);
      expect(followed.seqs()).toEqual([1, 2, 3]);
      await vi.advanceTimersByTimeAsync(reconnectDelays[0] ?? 0);
      expect(deployment.afters).toEqual([undefined, 3]);
      expect(followed.seqs()).toEqual([1, 2, 3, 4, 5]);
      expect(followed.events[3]).toEqual({ seq: 4, data: { seq: 4, type: "step.done" } });
      expect(followed.ends).toEqual([{ kind: "ended" }]);
    });

    it("starts after the event the page already has", async () => {
      const deployment = fakeDeployment([{ open: "opened", messages: [run(7), run(8), end] }]);
      const followed = follow(deployment.calls, 7);
      await vi.advanceTimersByTimeAsync(0);
      expect(deployment.afters).toEqual([7]);
      expect(followed.seqs()).toEqual([8]);
    });

    it("waits longer before each new try, and gives up after the last", async () => {
      const deployment = fakeDeployment([]);
      const followed = follow(deployment.calls);
      await vi.advanceTimersByTimeAsync(0);
      for (const [index, delay] of reconnectDelays.entries()) {
        expect(deployment.afters).toHaveLength(index + 1);
        await vi.advanceTimersByTimeAsync(delay - 1);
        expect(deployment.afters).toHaveLength(index + 1);
        await vi.advanceTimersByTimeAsync(1);
      }
      expect(deployment.afters).toHaveLength(reconnectDelays.length + 1);
      expect(followed.ends).toEqual([
        { kind: "failed", error: new DeploymentCallRefused("notAnswering") },
      ]);
    });

    it("starts the count again once an event comes", async () => {
      const deployment = fakeDeployment([
        { open: "unreachable" },
        { open: "unreachable" },
        { open: "opened", messages: [run(1), brokeOff] },
        { open: "opened", messages: [run(2), end] },
      ]);
      const followed = follow(deployment.calls);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync((reconnectDelays[0] ?? 0) + (reconnectDelays[1] ?? 0));
      expect(deployment.afters).toEqual([undefined, undefined, undefined]);
      // The event reset the count, so the next try waits the first delay again.
      await vi.advanceTimersByTimeAsync(reconnectDelays[0] ?? 0);
      expect(deployment.afters).toEqual([undefined, undefined, undefined, 1]);
      expect(followed.ends).toEqual([{ kind: "ended" }]);
    });

    it("counts a stream that stayed open a minute as working", async () => {
      const deployment = fakeDeployment([
        { open: "unreachable" },
        { open: "opened", messages: [brokeOff], later: true },
        { open: "opened", messages: [end] },
      ]);
      follow(deployment.calls);
      await vi.advanceTimersByTimeAsync(reconnectDelays[0] ?? 0);
      expect(deployment.afters).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(healthyStreamMs);
      deployment.sendHeld();
      // Back to the first delay, not the second.
      await vi.advanceTimersByTimeAsync(reconnectDelays[0] ?? 0);
      expect(deployment.afters).toHaveLength(3);
    });

    it("ends without another try when the server refuses the stream", async () => {
      const deployment = fakeDeployment([{ open: "refused", status: 404 }]);
      const followed = follow(deployment.calls);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(deployment.afters).toHaveLength(1);
      expect(followed.ends).toEqual([{ kind: "refused", status: 404 }]);
    });

    it("ends without another try when the shell refuses the call", async () => {
      const calls: DeploymentCalls = {
        request: async () => ({ status: 200, body: null }),
        openEvents: async () => {
          throw new DeploymentCallRefused("notSignedIn");
        },
      };
      const followed = follow(calls);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(followed.ends).toEqual([
        { kind: "failed", error: new DeploymentCallRefused("notSignedIn") },
      ]);
    });

    it("logs an onEnd that throws rather than leave it unhandled", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const deployment = fakeDeployment([{ open: "refused", status: 404 }]);
      followDeploymentRun({
        calls: deployment.calls,
        runId: "run_1",
        onEvent: () => {},
        onEnd: () => {
          throw new Error("the run view has gone");
        },
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(logged).toHaveBeenCalledWith(
        "Following a run's events failed.",
        new Error("the run view has gone"),
      );
      logged.mockRestore();
    });
  });
});

describe("followDeploymentRun's stop", () => {
  it("hangs up on the open stream and ends nothing", async () => {
    const deployment = fakeDeployment([{ open: "opened", messages: [run(1)], later: true }]);
    const followed = follow(deployment.calls);
    await vi.advanceTimersByTimeAsync(0);
    followed.handle.stop();
    expect(deployment.hungUp).toEqual([0]);
    deployment.sendHeld();
    expect(followed.events).toEqual([]);
    expect(followed.ends).toEqual([]);
  });
});
