import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { PlacementChanges } from "../placements.ts";
import type { AgentActivity, AgentUsage, Placement } from "../records.ts";
import type { CostRow } from "../usage-buckets.ts";
import { runSeatsHistory } from "./history-job.ts";
import type { HistoryStore } from "./history-store.ts";
import type { AgentNow, PaperclipTables } from "./paperclip-tables.ts";
import type { ReadJobApi } from "./read-job.ts";

// Made-up company, seats, folders, connections and agents only.
const settings = {
  seats: [
    { id: "seat-a", role: "pool", configDir: "/srv/seats/a", connectionId: "conn-a" },
    { id: "seat-b", role: "pool", configDir: "/srv/seats/b", connectionId: "conn-b" },
  ],
};

function api() {
  const logs: string[] = [];
  const ctx: ReadJobApi = {
    companies: { list: async () => [{ id: "acme" } as never] },
    config: { get: async () => settings },
    logger: { info: (message) => void logs.push(message), error: () => undefined },
  };
  return { ctx, logs };
}

function agent(agentId: string, connectionId: string | undefined): AgentNow {
  return {
    agentId,
    name: undefined,
    configDir: undefined,
    connectionId,
    model: "claude-made-up",
    cap: 2,
    runningRuns: 1,
    queuedRuns: 0,
    openTasks: 3,
  };
}

function cost(occurredAt: string, runId: string): CostRow {
  return {
    agentId: "agent-1",
    runId,
    model: "claude-made-up",
    occurredAt,
    inputTokens: 100,
    cachedInputTokens: 10,
    outputTokens: 5,
  };
}

/** A store that keeps rows in memory, keyed the way the tables are. */
function memoryStore() {
  const placements = new Map<string, Placement>();
  const usage = new Map<string, AgentUsage>();
  const activity: AgentActivity[] = [];
  const store: HistoryStore = {
    placementsSince: async () => [...placements.values()],
    savePlacementChanges: async (changes: PlacementChanges) => {
      for (const placement of [...changes.closed, ...changes.opened]) {
        placements.set(`${placement.agentId} ${placement.from}`, placement);
      }
    },
    saveUsage: async (buckets) => {
      for (const bucket of buckets) {
        usage.set(`${bucket.agentId} ${bucket.seatId} ${bucket.bucketStart}`, bucket);
      }
    },
    recordActivity: async (rows) => void activity.push(...rows),
  };
  return { store, placements, usage, activity };
}

verifies("paperclip.seats-history", () => {
  test("places agents, moves them and sums their tokens on the seat they were on", async () => {
    const { ctx, logs } = api();
    const memory = memoryStore();
    let agents = [agent("agent-1", "conn-a"), agent("agent-2", "conn-other")];
    let costs: CostRow[] = [];
    let now = new Date("2026-11-22T10:00:00.000Z");
    const tables: PaperclipTables = {
      agentsNow: async () => agents,
      costRowsSince: async (_companyId, since) => costs.filter((row) => row.occurredAt >= since),
    };
    const deps = { tables, store: memory.store, now: () => now };

    await runSeatsHistory(ctx, deps);
    agents = [agent("agent-1", "conn-b"), agent("agent-2", "conn-other")];
    costs = [cost("2026-11-22T10:04:00.000Z", "run-1"), cost("2026-11-22T10:06:00.000Z", "run-2")];
    now = new Date("2026-11-22T10:10:00.000Z");
    await runSeatsHistory(ctx, deps);
    costs = [...costs, cost("2026-11-22T10:12:00.000Z", "run-3")];
    now = new Date("2026-11-22T10:20:00.000Z");
    await runSeatsHistory(ctx, deps);

    expect([...memory.placements.values()]).toEqual([
      {
        agentId: "agent-1",
        seatId: "seat-a",
        from: "2026-11-22T10:00:00.000Z",
        to: "2026-11-22T10:10:00.000Z",
        source: "observed",
      },
      {
        agentId: "agent-1",
        seatId: "seat-b",
        from: "2026-11-22T10:10:00.000Z",
        to: undefined,
        source: "observed",
      },
    ]);
    expect(
      [...memory.usage.values()].map((bucket) => [bucket.seatId, bucket.bucketStart, bucket.runs]),
    ).toEqual([
      ["seat-a", "2026-11-22T10:00:00.000Z", 2],
      ["seat-b", "2026-11-22T10:10:00.000Z", 1],
    ]);
    expect(memory.activity.map((row) => [row.agentId, row.at])).toEqual([
      ["agent-1", "2026-11-22T10:00:00.000Z"],
      ["agent-1", "2026-11-22T10:10:00.000Z"],
      ["agent-1", "2026-11-22T10:20:00.000Z"],
    ]);
    expect(logs.join("\n")).not.toMatch(/conn-|\/srv\//);
    expect(JSON.stringify([...memory.placements.values(), memory.activity])).not.toMatch(
      /conn-|\/srv\//,
    );
  });
});
