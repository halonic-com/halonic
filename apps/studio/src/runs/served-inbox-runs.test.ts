import type { RunSummary } from "@halonicjs/events";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { type PageFetch, ServedInboxRuns } from "./served-inbox-runs.ts";
import { type PollTimer, runsPollInterval } from "./workspace-runs.ts";

function waitingRun(id: string, lastSeq = 3): RunSummary {
  return {
    id,
    status: "waiting",
    lastSeq,
    accepts: ["approve", "reject"],
    approvals: [],
  } as unknown as RunSummary;
}

/** A timer the test ticks by hand. */
function manualTimer() {
  const ticks = new Set<() => void>();
  const timer: PollTimer = {
    every: (ms, tick) => {
      expect(ms).toBe(runsPollInterval);
      ticks.add(tick);
      return () => ticks.delete(tick);
    },
  };
  return {
    timer,
    active: () => ticks.size,
    tick: async () => {
      for (const tick of [...ticks]) tick();
      await vi.waitFor(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

verifies("studio.served-inbox-runs", () => {
  describe("waiting", () => {
    it("lists the runs /api/waiting-runs gives", async () => {
      const paths: string[] = [];
      const runs = new ServedInboxRuns({
        fetch: async (path) => {
          paths.push(path);
          return Response.json({ runs: [waitingRun("a"), waitingRun("b")] });
        },
      });
      expect((await runs.waiting()).map((run) => run.id)).toEqual(["a", "b"]);
      expect(paths).toEqual(["/api/waiting-runs"]);
    });

    it.each([
      [401, "unauthenticated"],
      [403, "denied"],
      [404, "not_found"],
      [429, "limit_reached"],
      [500, "unavailable"],
    ])("fails as the kind of a %i", async (status, kind) => {
      const runs = new ServedInboxRuns({
        fetch: async () => Response.json({ code: "x", message: "secret text" }, { status }),
      });
      const error = await errorOf(runs.waiting());
      expect(error).toBeInstanceOf(KindedError);
      expect((error as KindedError).kind).toBe(kind);
      expect((error as KindedError).message).not.toContain("secret text");
    });

    it.each([
      ["no answer", () => Promise.reject(new TypeError("offline"))],
      ["a page that isn't JSON", async () => new Response("<html></html>")],
      ["no list", async () => Response.json({})],
      [
        "a run that doesn't wait",
        async () => Response.json({ runs: [{ ...waitingRun("a"), status: "running" }] }),
      ],
      ["a half-known run", async () => Response.json({ runs: [{ id: "a", status: "waiting" }] })],
    ])("fails as unavailable on %s", async (_what, answer) => {
      const runs = new ServedInboxRuns({ fetch: answer as PageFetch });
      expect(((await errorOf(runs.waiting())) as KindedError).kind).toBe("unavailable");
    });
  });

  describe("agentName", () => {
    function servedWith(...answers: unknown[]) {
      const queue = [...answers];
      return new ServedInboxRuns({ fetch: async () => Response.json(queue.shift()) });
    }

    it("names an agent as the list names it, and no other", async () => {
      const runs = servedWith({ runs: [waitingRun("a")], agents: { writer: "Writer" } });
      expect(runs.agentName("writer")).toBeUndefined();
      await runs.waiting();
      expect(runs.agentName("writer")).toBe("Writer");
      expect(runs.agentName("sorter")).toBeUndefined();
      expect(runs.agentName("constructor")).toBeUndefined();
      expect(runs.agentName("__proto__")).toBeUndefined();
    });

    it("takes an id an object has, such as `__proto__`, only as a name's key", async () => {
      const runs = new ServedInboxRuns({
        fetch: async () =>
          new Response(`{"runs":[],"agents":{"__proto__":"Proto","constructor":"Builder"}}`),
      });
      await runs.waiting();
      expect(runs.agentName("__proto__")).toBe("Proto");
      expect(runs.agentName("constructor")).toBe("Builder");
      expect(runs.agentName("toString")).toBeUndefined();
    });

    it("never fails the list for names it can't read, and keeps the last good ones", async () => {
      const runs = servedWith(
        { runs: [waitingRun("a")], agents: { writer: "Writer", sorter: 7 } },
        { runs: [waitingRun("a")], agents: ["Writer"] },
        { runs: [waitingRun("a")] },
        { runs: [waitingRun("a")], agents: {} },
      );
      await runs.waiting();
      expect(runs.agentName("writer")).toBe("Writer");
      expect(runs.agentName("sorter")).toBeUndefined();
      for (const _ of [1, 2]) {
        expect(await runs.waiting()).toHaveLength(1);
        expect(runs.agentName("writer")).toBe("Writer");
      }
      await runs.waiting();
      expect(runs.agentName("writer")).toBeUndefined();
    });
  });

  describe("send", () => {
    it("posts the answer with its call to the run's address", async () => {
      const calls: { path: string; init: RequestInit | undefined }[] = [];
      const runs = new ServedInboxRuns({
        fetch: async (path, init) => {
          calls.push({ path, init });
          return Response.json(waitingRun("run/1"));
        },
      });
      const summary = await runs.send("run/1", "reject", { comment: "no" }, { callId: "c1" });
      expect(summary.id).toBe("run/1");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.path).toBe("/api/runs/run%2F1/events");
      expect(calls[0]?.init?.method).toBe("POST");
      expect(new Headers(calls[0]?.init?.headers).get("content-type")).toBe("application/json");
      expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
        event: "reject",
        payload: { comment: "no" },
        callId: "c1",
      });
    });

    it("leaves out a payload and a call it wasn't given", async () => {
      let body = "";
      const runs = new ServedInboxRuns({
        fetch: async (_path, init) => {
          body = String(init?.body);
          return Response.json(waitingRun("a"));
        },
      });
      await runs.send("a", "approve");
      expect(JSON.parse(body)).toEqual({ event: "approve" });
    });

    it("names the wait step it answers, so a late answer can't answer the next one", async () => {
      let body = "";
      const runs = new ServedInboxRuns({
        fetch: async (_path, init) => {
          body = String(init?.body);
          return Response.json(waitingRun("a"));
        },
      });
      await runs.send("a", "escalate", undefined, {
        wait: { state: "review", since: "2026-11-20T09:00:00.000Z" },
      });
      expect(JSON.parse(body)).toEqual({
        event: "escalate",
        wait: { state: "review", since: "2026-11-20T09:00:00.000Z" },
      });
    });

    it.each([
      [409, "conflict"],
      [404, "not_found"],
      [403, "denied"],
      [400, "invalid_input"],
    ])("fails as the kind of a %i", async (status, kind) => {
      const runs = new ServedInboxRuns({
        fetch: async () => Response.json({ code: "x", message: "secret text" }, { status }),
      });
      const error = (await errorOf(runs.send("a", "approve"))) as KindedError;
      expect(error.kind).toBe(kind);
      expect(error.message).not.toContain("secret text");
    });

    it("fails when the answer is another run's", async () => {
      const runs = new ServedInboxRuns({ fetch: async () => Response.json(waitingRun("other")) });
      expect(((await errorOf(runs.send("a", "approve"))) as KindedError).kind).toBe("unavailable");
    });

    it("fails as unavailable when the computer never answers", async () => {
      const runs = new ServedInboxRuns({
        timeoutMs: 20,
        fetch: (_path, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("t", "TimeoutError")),
            );
          }),
      });
      expect(((await errorOf(runs.send("a", "approve"))) as KindedError).kind).toBe("unavailable");
    });

    it("fails as unavailable when the computer can't be reached", async () => {
      const runs = new ServedInboxRuns({ fetch: () => Promise.reject(new TypeError("offline")) });
      expect(((await errorOf(runs.send("a", "approve"))) as KindedError).kind).toBe("unavailable");
    });
  });

  describe("subscribe", () => {
    function polled(initial: RunSummary[]) {
      let list = initial;
      let failing = false;
      const clock = manualTimer();
      const focus = new Set<() => void>();
      const runs = new ServedInboxRuns({
        timer: clock.timer,
        onFocus: (listener) => {
          focus.add(listener);
          return () => focus.delete(listener);
        },
        fetch: async () => {
          if (failing) throw new TypeError("offline");
          return Response.json({ runs: list });
        },
      });
      return {
        runs,
        clock,
        focus,
        settle: () => new Promise((resolve) => setTimeout(resolve, 0)),
        set: (next: RunSummary[]) => {
          list = next;
        },
        fail: (value: boolean) => {
          failing = value;
        },
      };
    }

    it("tells its listeners only when a waiting run appeared, moved on or went", async () => {
      const world = polled([waitingRun("a")]);
      const heard = vi.fn();
      world.runs.subscribe(heard);
      await world.settle(); // subscribing learns the list at once
      await world.clock.tick();
      expect(heard).not.toHaveBeenCalled();
      world.set([waitingRun("a"), waitingRun("b")]);
      await world.clock.tick();
      expect(heard).toHaveBeenCalledTimes(1);
      world.set([waitingRun("a", 9), waitingRun("b")]);
      await world.clock.tick();
      expect(heard).toHaveBeenCalledTimes(2);
      world.set([]);
      await world.clock.tick();
      expect(heard).toHaveBeenCalledTimes(3);
    });

    it("hears a change between subscribing and the first tick", async () => {
      const world = polled([waitingRun("a")]);
      const heard = vi.fn();
      world.runs.subscribe(heard);
      await world.settle();
      world.set([waitingRun("a"), waitingRun("b")]);
      await world.clock.tick();
      expect(heard).toHaveBeenCalledTimes(1);
    });

    it("tells its listeners after the next good poll when the first one failed", async () => {
      const world = polled([waitingRun("a")]);
      const heard = vi.fn();
      world.fail(true);
      world.runs.subscribe(heard);
      await world.settle();
      world.fail(false);
      await world.clock.tick();
      expect(heard).toHaveBeenCalledTimes(1);
      await world.clock.tick();
      expect(heard).toHaveBeenCalledTimes(1);
    });

    it("reads the list again when the window comes to the front", async () => {
      const world = polled([waitingRun("a")]);
      const heard = vi.fn();
      world.runs.subscribe(heard);
      await world.settle();
      world.set([]);
      for (const listener of world.focus) listener();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(heard).toHaveBeenCalledTimes(1);
    });

    it("keeps polling after a poll fails", async () => {
      const world = polled([waitingRun("a")]);
      const heard = vi.fn();
      world.runs.subscribe(heard);
      await world.settle();
      world.fail(true);
      await world.clock.tick();
      world.fail(false);
      world.set([]);
      await world.clock.tick();
      // Once as it starts to fail, once as it works again with the run gone.
      expect(heard).toHaveBeenCalledTimes(2);
    });

    it("tells its listeners once when a list that worked starts to fail, and again when it works", async () => {
      // After a sign-out the Inbox has to load again to learn why, and again once you're back.
      const world = polled([waitingRun("a")]);
      const heard = vi.fn();
      world.runs.subscribe(heard);
      await world.settle();
      world.fail(true);
      await world.clock.tick();
      expect(heard).toHaveBeenCalledTimes(1);
      await world.clock.tick();
      await world.clock.tick();
      expect(heard).toHaveBeenCalledTimes(1);
      world.fail(false);
      await world.clock.tick();
      expect(heard).toHaveBeenCalledTimes(2);
      await world.clock.tick();
      expect(heard).toHaveBeenCalledTimes(2);
    });

    it("stops polling when the last listener leaves, and after dispose", async () => {
      const world = polled([]);
      const stop = world.runs.subscribe(() => {});
      const other = world.runs.subscribe(() => {});
      expect(world.clock.active()).toBe(1);
      stop();
      expect(world.clock.active()).toBe(1);
      other();
      expect(world.clock.active()).toBe(0);
      expect(world.focus.size).toBe(0);
      await world.runs.dispose();
      world.runs.subscribe(() => {});
      expect(world.clock.active()).toBe(0);
    });
  });
});
