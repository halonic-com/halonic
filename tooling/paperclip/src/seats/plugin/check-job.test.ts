import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { SeatReading } from "../records.ts";
import { type CheckJobApi, type CheckJobDeps, runSeatsCheck } from "./check-job.ts";
import type { AgentNow } from "./paperclip-tables.ts";

// Made-up company, seats, folders, connections, agents and task only.
const baseSettings = {
  seats: [
    { id: "seat-a", role: "pool", configDir: "/srv/seats/a", connectionId: "conn-a" },
    { id: "seat-b", role: "pool", configDir: "/srv/seats/b", connectionId: "conn-b" },
  ],
  proposalTaskId: "task-1",
};

function agent(agentId: string, connectionId: string): AgentNow {
  return {
    agentId,
    name: `Agent ${agentId.slice(-1)}`,
    configDir: undefined,
    connectionId,
    model: "claude-made-up",
    cap: 1,
    runningRuns: 0,
    queuedRuns: 0,
    openTasks: 1,
  };
}

function reading(seatId: string, at: string, sessionPercent: number): SeatReading {
  return {
    seatId,
    at,
    error: undefined,
    session: { usedPercent: sessionPercent, resetsAt: "2026-11-22T14:00:00.000Z" },
    week: { usedPercent: 30, resetsAt: "2026-11-27T10:00:00.000Z" },
    weekByModel: {},
  };
}

/** A fake plugin context that keeps the posted comments and the saved state. */
function setup(settings: Record<string, unknown> = baseSettings) {
  const posted: { issueId: string; body: string; companyId: string }[] = [];
  const state = new Map<string, unknown>();
  const reads = { readings: 0 };
  let seatAPercent = 85;
  let now = new Date("2026-11-22T10:05:00.000Z");
  const ctx: CheckJobApi = {
    companies: { list: async () => [{ id: "acme" } as never] },
    config: { get: async () => settings },
    logger: { info: () => undefined, error: () => undefined },
    issues: {
      createComment: async (issueId, body, companyId) => {
        posted.push({ issueId, body, companyId });
        return {} as never;
      },
    },
    state: {
      get: async (key) => state.get(JSON.stringify(key)) ?? null,
      set: async (key, value) => void state.set(JSON.stringify(key), value),
    },
  };
  const deps: CheckJobDeps = {
    tables: { agentsNow: async () => [agent("agent-1", "conn-a"), agent("agent-2", "conn-b")] },
    readings: {
      since: async () => {
        reads.readings += 1;
        const at = now.toISOString();
        return [reading("seat-a", at, seatAPercent), reading("seat-b", at, 10)];
      },
    },
    store: { manualResets: async () => [] },
    now: () => now,
  };
  const later = (percent: number) => {
    seatAPercent = percent;
    now = new Date(now.getTime() + 10 * 60_000);
  };
  return { ctx, deps, posted, reads, later };
}

verifies("paperclip.seats-check-job", () => {
  test("posts the proposed moves on the board's task, once while they stay the same", async () => {
    const { ctx, deps, posted, later } = setup();

    await runSeatsCheck(ctx, deps);
    later(86);
    await runSeatsCheck(ctx, deps);

    expect(posted).toHaveLength(1);
    expect(posted[0]?.issueId).toBe("task-1");
    expect(posted[0]?.companyId).toBe("acme");
    expect(posted[0]?.body).toContain("Nothing has moved");
    expect(posted[0]?.body).toContain("- Agent 1: seat-a → seat-b (5-hour window at 85%).");
    expect(posted.map((post) => post.body).join("\n")).not.toMatch(/\/srv\/|conn-/);
  });

  test("posts moves again when they went away and came back", async () => {
    const { ctx, deps, posted, later } = setup();

    await runSeatsCheck(ctx, deps);
    later(40);
    await runSeatsCheck(ctx, deps);
    later(90);
    await runSeatsCheck(ctx, deps);

    expect(posted).toHaveLength(2);
    expect(posted[1]?.body).toContain("(5-hour window at 90%)");
  });

  test("tries a failed post again at the next run", async () => {
    const { ctx, deps, posted, later } = setup();
    const createComment = ctx.issues.createComment;
    let fail = true;
    const flaky: CheckJobApi = {
      ...ctx,
      issues: {
        createComment: async (...args) => {
          if (fail) {
            fail = false;
            throw new Error("the host is busy");
          }
          return await createComment(...args);
        },
      },
    };

    await expect(runSeatsCheck(flaky, deps)).rejects.toThrow("the host is busy");
    later(85);
    await runSeatsCheck(flaky, deps);

    expect(posted).toHaveLength(1);
  });

  test("reads and posts nothing until the board sets a task", async () => {
    const { proposalTaskId: _, ...withoutTask } = baseSettings;
    const { ctx, deps, posted, reads } = setup(withoutTask);

    await runSeatsCheck(ctx, deps);

    expect(reads.readings).toBe(0);
    expect(posted).toEqual([]);
  });

  test("proposes only, even with Move agents on", async () => {
    const { ctx, deps, posted } = setup({ ...baseSettings, movesEnabled: true });

    await runSeatsCheck(ctx, deps);

    expect(posted[0]?.body).toContain("Nothing has moved: the board applies these.");
  });
});
