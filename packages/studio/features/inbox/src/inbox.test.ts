import type { RunSummary } from "@halonicjs/events";
import { createShell, type ServiceKey, type ServiceTarget } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { InboxRunsService, InboxService } from "./api.ts";
import { inboxFeature } from "./feature.ts";
import { Inbox, type InboxRuns } from "./inbox.ts";
import { isRunItem } from "./inbox-items.ts";
import { pendingApproval, waitingRun } from "./test-runs.test-helper.ts";

/** Runs whose waiting list a test sets, with each load answered when the test says. */
function fakeRuns(initial: readonly RunSummary[]) {
  let waiting = initial;
  const listeners = new Set<() => void>();
  const loads: { resolve: (runs: readonly RunSummary[]) => void; reject: (e: unknown) => void }[] =
    [];
  let manual = false;
  const send = vi.fn(async (runId: string) => waitingRun(runId));
  const runs: InboxRuns = {
    waiting: () =>
      manual
        ? new Promise((resolve, reject) => loads.push({ resolve, reject }))
        : Promise.resolve(waiting),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send,
  };
  return {
    runs,
    send,
    loads,
    listeners,
    /** Loads wait for the test to answer them from now on. */
    holdLoads: () => {
      manual = true;
    },
    /** Sets what waits and tells the Inbox, as the engine does when a run changes. */
    change: (next: readonly RunSummary[]) => {
      waiting = next;
      for (const listener of listeners) listener();
    },
  };
}

const notes = waitingRun("r1", {
  approvals: [pendingApproval("call-1", "notes-mcp__create_note", "2026-11-10T10:41:00.000Z")],
});
const review = waitingRun("r2", { waitingFor: { title: "Approve this reply?", body: "" } });

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

verifies("inbox.live", () => {
  it("loads what waits when it opens, and tells its listeners", async () => {
    const { runs } = fakeRuns([notes]);
    const inbox = new Inbox(runs);
    const listener = vi.fn();
    inbox.subscribe(listener);
    expect(inbox.state).toEqual({ items: [], loaded: false, error: undefined });

    await settled();
    expect(inbox.state.loaded).toBe(true);
    expect(inbox.state.items.map((item) => item.key)).toEqual(["r1:call-1"]);
    expect(inbox.signal()).toEqual({ mark: "count", value: 1, spoken: "1 waiting" });
    expect(listener).toHaveBeenCalled();
  });

  it("loads again when the runs change, such as an answer from another device", async () => {
    const fake = fakeRuns([notes]);
    const inbox = new Inbox(fake.runs);
    await settled();

    fake.change([]);
    await settled();
    expect(inbox.state.items).toEqual([]);
    expect(inbox.signal().value).toBe(0);
  });

  it("takes an answered item out before the next load, and a stale load doesn't bring it back", async () => {
    const fake = fakeRuns([notes, review]);
    const inbox = new Inbox(fake.runs);
    await settled();
    const [item] = inbox.state.items;
    if (item === undefined || !isRunItem(item)) throw new Error("expected a run's item");
    fake.holdLoads();

    await inbox.decisions.approve(item);
    expect(fake.send).toHaveBeenCalledWith("r1", "approve", undefined, { callId: "call-1" });
    expect(inbox.state.items.map((shown) => shown.key)).toEqual(["r2:review"]);
    expect(inbox.signal().value).toBe(1);

    // The load after the answer may still list the call: the engine hasn't moved on yet.
    fake.loads.shift()?.resolve([notes, review]);
    await settled();
    expect(inbox.state.items.map((shown) => shown.key)).toEqual(["r2:review"]);
  });

  it("shows a step again when the run comes back to it after your answer", async () => {
    const fake = fakeRuns([review]);
    const inbox = new Inbox(fake.runs);
    await settled();
    const [item] = inbox.state.items;
    if (item === undefined || !isRunItem(item)) throw new Error("expected a run's item");

    fake.change([]);
    await inbox.decisions.reject(item);
    await settled();
    expect(inbox.state.items).toEqual([]);

    fake.change([{ ...review, lastWaitingAt: "2026-11-10T11:30:00.000Z" }]);
    await settled();
    expect(inbox.state.items.map((shown) => shown.key)).toEqual(["r2:review"]);
  });

  it("keeps an item whose answer failed", async () => {
    const fake = fakeRuns([notes]);
    fake.send.mockRejectedValueOnce(new Error("The engine isn't answering."));
    const inbox = new Inbox(fake.runs);
    await settled();
    const [item] = inbox.state.items;
    if (item === undefined || !isRunItem(item)) throw new Error("expected a run's item");

    await expect(inbox.decisions.approve(item)).rejects.toThrow("The engine isn't answering.");
    expect(inbox.state.items).toHaveLength(1);
    expect(inbox.signal().value).toBe(1);
  });

  it("keeps the items and the count when a load fails, and says why until one succeeds", async () => {
    const fake = fakeRuns([notes, review]);
    const inbox = new Inbox(fake.runs);
    await settled();
    fake.holdLoads();
    const failure = new Error("The engine isn't answering.");

    void inbox.refresh();
    fake.loads.shift()?.reject(failure);
    await settled();
    expect(inbox.state.error).toBe(failure);
    expect(inbox.state.items).toHaveLength(2);
    expect(inbox.signal().value).toBe(2);

    void inbox.refresh();
    fake.loads.shift()?.resolve([review]);
    await settled();
    expect(inbox.state.error).toBeUndefined();
    expect(inbox.state.items).toHaveLength(1);
  });

  it("counts only the last load started when loads overlap", async () => {
    const fake = fakeRuns([]);
    const inbox = new Inbox(fake.runs);
    await settled();
    fake.holdLoads();

    void inbox.refresh();
    void inbox.refresh();
    const [slow, quick] = fake.loads;
    quick?.resolve([review]);
    await settled();
    slow?.resolve([notes, review]);
    await settled();
    expect(inbox.state.items.map((item) => item.key)).toEqual(["r2:review"]);
  });
});

describe("Inbox", () => {
  it("stops watching the runs when its workspace closes", async () => {
    const fake = fakeRuns([notes]);
    const inbox = new Inbox(fake.runs);
    await settled();
    expect(fake.listeners.size).toBe(1);

    inbox.dispose();
    expect(fake.listeners.size).toBe(0);
  });

  it("drops a load still on its way when its workspace closes, and loads nothing after", async () => {
    const fake = fakeRuns([notes]);
    fake.holdLoads();
    const inbox = new Inbox(fake.runs);
    const listener = vi.fn();
    inbox.subscribe(listener);

    inbox.dispose();
    fake.loads[0]?.resolve([notes]);
    await settled();
    await inbox.refresh();
    expect(fake.loads).toHaveLength(1);
    expect(inbox.state.loaded).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
});

/** A minimal workspace registry; the Studio uses `ServiceRegistry` from `@halonicjs/app`. */
class WorkspaceServices implements ServiceTarget {
  readonly #services = new Map<string, unknown>();
  provide<Service>(key: ServiceKey<Service>, service: Service): void {
    this.#services.set(key.name, service);
  }
  get<Service>(key: ServiceKey<Service>): Service {
    return this.#services.get(key.name) as Service;
  }
  has(key: ServiceKey<unknown>): boolean {
    return this.#services.has(key.name);
  }
}

describe("inboxFeature", () => {
  it("is registered under its folder name", () => {
    expect(inboxFeature.id).toBe("inbox");
  });

  it("builds the workspace's Inbox from the runs the app provides", async () => {
    const shell = createShell({ features: [inboxFeature], hostServices: [InboxRunsService] });
    const workspace = new WorkspaceServices();
    workspace.provide(InboxRunsService, fakeRuns([notes]).runs);

    shell.services.instantiate(workspace);
    await settled();
    expect(workspace.get(InboxService).signal().value).toBe(1);
  });
});
