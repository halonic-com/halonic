import type { RunEvent, RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { WorkspaceSandboxRefusals } from "./workspace-sandbox-refusals.ts";

const failedEvent = (sandboxReason?: string) =>
  ({
    runId: "r1",
    seq: 2,
    at: "2026-11-16T08:00:00Z",
    type: "run.failed",
    state: "draft",
    error: "not ready",
    reason: "sandbox-not-ready",
    ...(sandboxReason === undefined ? {} : { sandboxReason }),
  }) as RunEvent;

verifies("studio.sandbox-refusals", () => {
  it("lists the summaries of the workspace's runs", async () => {
    const summary = { id: "r1" } as RunSummary;
    const refusals = new WorkspaceSandboxRefusals({
      list: async () => [{ summary }],
      log: async () => [],
      subscribe: () => () => {},
    });
    expect(await refusals.runs()).toEqual([summary]);
  });

  it("reads the reason code from the run's last run.failed, or nothing", async () => {
    const logs: Record<string, RunEvent[]> = {
      a: [failedEvent("bubblewrap-missing")],
      b: [failedEvent()],
      c: [],
    };
    const refusals = new WorkspaceSandboxRefusals({
      list: async () => [],
      log: async (id) => logs[id] ?? [],
      subscribe: () => () => {},
    });
    expect(await refusals.reasonOf("a")).toBe("bubblewrap-missing");
    expect(await refusals.reasonOf("b")).toBeUndefined();
    expect(await refusals.reasonOf("c")).toBeUndefined();
  });

  it("passes subscriptions to the runs", () => {
    const stop = vi.fn();
    const subscribe = vi.fn(() => stop);
    const refusals = new WorkspaceSandboxRefusals({
      list: async () => [],
      log: async () => [],
      subscribe,
    });
    const listener = () => {};
    expect(refusals.subscribe(listener)).toBe(stop);
    expect(subscribe).toHaveBeenCalledWith(listener);
  });
});
