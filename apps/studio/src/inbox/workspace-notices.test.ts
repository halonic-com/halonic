import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceNotices } from "./workspace-notices.ts";

const now = new Date(2026, 10, 16, 12, 0);

/** A routine run of Daily summary that failed at 06:00 on 16 Nov. */
function failedRun(): RunSummary {
  const endedAt = new Date(2026, 10, 16, 6, 0).toISOString();
  return {
    id: "r1",
    hubId: "acme",
    workflowId: "daily",
    kind: "run",
    status: "failed",
    state: null,
    startedAt: endedAt,
    endedAt,
    usage: { inputTokens: 0, outputTokens: 0 },
    cost: 0,
    unpricedCalls: 0,
    subscriptionCalls: 0,
    statesVisited: [],
    context: {},
    error: null,
    reason: "provider",
    definitionsVersion: "v1",
    trigger: { type: "schedule", routineId: "acme/daily", at: endedAt },
    parentRunId: null,
    waitingOn: null,
    accepts: [],
    answerLabels: {},
    nextTimer: null,
    waitingFor: null,
  } as unknown as RunSummary;
}

function storage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

function setup(
  location = "/work/acme",
  shared = storage(),
  routines = ["acme/daily"],
  budget: number | undefined = undefined,
  summaries: RunSummary[] = [failedRun()],
) {
  const listeners = new Set<() => void>();
  const runs = {
    list: async () => summaries.map((summary) => ({ summary })),
    routine: (key: string) => (routines.includes(key) ? { name: "Daily summary" } : undefined),
    monthlyBudget: () => budget,
    currency: () => "EUR",
    workflow: (hubId: string, id: string) =>
      hubId === "acme" && id === "daily" ? { name: "Daily digest" } : undefined,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  const notices = new WorkspaceNotices({ runs, storage: shared, location, now: () => now });
  return { notices, shared, listeners, runs };
}

/** The cause of a run the monthly budget stopped (`engine.budget-stops`): it has no row of its own. */
const monthStop = {
  kind: "limit_reached",
  code: "budget.month",
  detail: { limit: "50", spent: "50.5", currency: "EUR" },
} as const;

verifies("studio.inbox-notices", () => {
  it("gives the failed routine run as a notice named by its routine", async () => {
    const { notices } = setup();
    expect((await notices.list()).map((one) => one.title)).toEqual([
      "Daily summary failed at 06:00",
    ]);
  });

  it("adds the month's budget notice when the month's runs have used up the monthly budget", async () => {
    const spent = {
      ...failedRun(),
      id: "r2",
      cost: 50.5,
      trigger: null,
      reason: "budget",
      cause: monthStop,
    };
    const { notices } = setup("/work/acme", storage(), [], 50, [spent as RunSummary]);
    const listed = await notices.list();
    expect(listed.map((one) => one.kind)).toEqual(["budget-month"]);
    expect(listed[0]?.title).toContain("reached its budget of €50.00");
  });

  it("never hides the month's budget notice for a dismissal kept from before it lost its ×", async () => {
    const spent = {
      ...failedRun(),
      id: "r2",
      cost: 50.5,
      trigger: null,
      reason: "budget",
      cause: monthStop,
    };
    const kept = storage({
      "halonic.inbox-dismissed-notices:/work/acme": JSON.stringify(["budget-month:2026-11:50"]),
    });
    const { notices } = setup("/work/acme", kept, [], 50, [spent as RunSummary]);
    expect((await notices.list()).map((one) => one.kind)).toEqual(["budget-month"]);
  });

  it("names the run by its workflow, not the routine's key, when the routine is gone", async () => {
    const { notices } = setup("/work/acme", storage(), []);
    expect((await notices.list()).map((one) => one.title)).toEqual([
      "Daily digest failed at 06:00",
    ]);
  });

  it("hides a dismissed notice, tells the listeners, and keeps it hidden in a new window", async () => {
    const shared = storage();
    const first = setup("/work/acme", shared).notices;
    const heard = vi.fn();
    first.subscribe(heard);
    const [notice] = await first.list();
    first.dismiss(notice?.key ?? "");
    expect(heard).toHaveBeenCalledOnce();
    expect(await first.list()).toEqual([]);
    expect(await setup("/work/acme", shared).notices.list()).toEqual([]);
  });

  it("keeps what another window of the same workspace dismissed", async () => {
    const shared = storage();
    const first = setup("/work/acme", shared).notices;
    const second = setup("/work/acme", shared).notices;
    first.dismiss("a");
    second.dismiss("b");
    expect(
      JSON.parse(shared.getItem("halonic.inbox-dismissed-notices:/work/acme") ?? "[]"),
    ).toEqual(["a", "b"]);
  });

  it("forgets a dismissal whose notice is gone", async () => {
    const shared = storage();
    const { notices } = setup("/work/acme", shared);
    const [notice] = await notices.list();
    expect(notice).toBeDefined();
    notices.dismiss(notice?.key ?? "");
    notices.dismiss("gone");
    await notices.list();
    expect(
      JSON.parse(shared.getItem("halonic.inbox-dismissed-notices:/work/acme") ?? "[]"),
    ).toEqual([notice?.key]);
  });

  it("keeps another window's dismissal when it forgets a gone one", async () => {
    const shared = storage();
    const first = setup("/work/acme", shared).notices;
    first.dismiss("gone");
    const second = setup("/work/acme", shared).notices;
    const [notice] = await second.list();
    expect(notice).toBeDefined();
    second.dismiss(notice?.key ?? "");
    await first.list();
    expect(
      JSON.parse(shared.getItem("halonic.inbox-dismissed-notices:/work/acme") ?? "[]"),
    ).toEqual([notice?.key]);
  });

  it("keeps the dismissal to its workspace folder", async () => {
    const shared = storage();
    const acme = setup("/work/acme", shared).notices;
    acme.dismiss((await acme.list())[0]?.key ?? "");
    expect(await setup("/work/beta", shared).notices.list()).toHaveLength(1);
  });

  it("passes the runs' changes on to the listeners until they stop", () => {
    const { notices, listeners } = setup();
    const stop = notices.subscribe(() => {});
    expect(listeners.size).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
  });

  describe("when storage refuses", () => {
    it("hides the dismissed notice for the session", async () => {
      const refusing = {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("full");
        },
      };
      const { runs } = setup();
      const notices = new WorkspaceNotices({
        runs,
        storage: refusing,
        location: "/work/acme",
        now: () => now,
      });
      notices.dismiss((await notices.list())[0]?.key ?? "");
      expect(await notices.list()).toEqual([]);
    });
  });

  it("ignores a stored value that isn't a list of keys", async () => {
    const shared = storage({ "halonic.inbox-dismissed-notices:/work/acme": "{oops" });
    expect(await setup("/work/acme", shared).notices.list()).toHaveLength(1);
  });
});
