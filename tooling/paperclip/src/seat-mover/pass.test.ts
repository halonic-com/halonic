import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import type { SeatApi } from "./api.ts";
import { type AgentRow, type SeatMoverMemory, seatMoverPass } from "./pass.ts";
import type { SeatResets } from "./reset.ts";
import type { ParkedRun, QuotaFailure } from "./runs.ts";
import { defaultSeatMoverSettings, type SeatMoverSettings } from "./settings.ts";

const now = new Date("2026-11-26T10:00:00.000Z");
const readAt = "2026-11-26T09:47:00.000Z";

/** Seat name → [5h %, week %]. */
type Usage = Record<string, [number, number]>;

const heartbeat = { enabled: true, intervalSec: 3600, maxConcurrentRuns: 6 };

function row(key: string, seat: string, status = "idle"): AgentRow {
  return {
    id: `a-${key}`,
    name: key[0]?.toUpperCase() + key.slice(1),
    urlKey: key,
    status,
    runtimeConfig: {
      heartbeat,
      aiConnection: {
        mode: "delegated",
        method: "subscription",
        provider: "anthropic",
        connectionId: `c-${seat}`,
        grantId: `g-${seat}`,
      },
    },
  };
}

/** A fake Paperclip: connections, seat readings, agents' configs, and every write it was sent. */
function world(usage: Usage, agents: AgentRow[], options: { dropHeartbeat?: boolean } = {}) {
  const configs = new Map(
    agents.map((agent) => [agent.id, structuredClone(agent.runtimeConfig ?? {})]),
  );
  const writes: string[] = [];
  const api: SeatApi = {
    connections: async () => ({
      connections: Object.keys(usage).map((name) => ({
        id: `c-${name}`,
        grantId: `g-${name}`,
        method: "subscription",
        status: "connected",
      })),
    }),
    seatReadings: async () => ({
      data: {
        seats: Object.entries(usage).map(([name, [session, week]]) => ({
          name,
          connectionId: `c-${name}`,
          reading: {
            at: readAt,
            error: null,
            usage: {
              session: { percent: session, resets: null },
              week: { percent: week, resets: "Nov 30, 8pm (UTC)" },
            },
          },
        })),
      },
    }),
    agent: async (agentId) => ({
      id: agentId,
      runtimeConfig: structuredClone(configs.get(agentId) ?? {}),
    }),
    setRuntimeConfig: async (agentId, runtimeConfig) => {
      const sent = structuredClone(runtimeConfig);
      const connectionId = (sent["aiConnection"] as { connectionId: string }).connectionId;
      writes.push(`move ${agentId} ${connectionId}`);
      if (options.dropHeartbeat === true && writes.length === 1) {
        delete sent["heartbeat"];
      }
      configs.set(agentId, sent);
    },
    cancelRun: async (runId) => {
      writes.push(`cancel ${runId}`);
    },
    recoveryActionFor: async (_issueId, runId) => `hold-${runId}`,
    resolveRecovery: async (issueId, body) => {
      writes.push(`resolve ${issueId} ${body["actionId"]} ${body["sourceIssueStatus"]}`);
    },
  };
  return { api, configs, writes };
}

function deps(
  fake: ReturnType<typeof world>,
  agents: AgentRow[],
  options: {
    settings?: Partial<SeatMoverSettings>;
    parked?: ParkedRun[];
    quota?: QuotaFailure[];
    resets?: SeatResets;
    memory?: { value: SeatMoverMemory };
  } = {},
) {
  const comments: string[] = [];
  const wakes: string[] = [];
  const memory = options.memory ?? { value: {} };
  return {
    comments,
    wakes,
    memory,
    deps: {
      companyId: "co",
      now,
      settings: {
        ...defaultSeatMoverSettings,
        logTask: "HAL-16116",
        boardTask: "HAL-9",
        ...options.settings,
      },
      api: fake.api,
      runs: {
        parked: async () => options.parked ?? [],
        quotaFailuresSince: async () => options.quota ?? [],
      },
      agents: async () => agents,
      resets: async () => options.resets ?? {},
      issueStatus: async () => "in_progress",
      wake: async (issueId: string) => {
        wakes.push(issueId);
      },
      comment: async (task: string, body: string) => {
        comments.push(`${task}: ${body}`);
      },
      memory: {
        get: async () => memory.value,
        set: async (value: SeatMoverMemory) => {
          memory.value = value;
        },
      },
      log: () => undefined,
      logError: () => undefined,
    },
  };
}

verifies("paperclip.seat-mover-job", () => {
  describe("shadow", () => {
    test("plans and comments once per changed plan, and moves nobody", async () => {
      const agents = [row("kim", "A")];
      const fake = world({ A: [85, 10], B: [20, 10] }, agents);
      const run = deps(fake, agents, { settings: { mode: "shadow" } });
      await seatMoverPass(run.deps);
      await seatMoverPass(run.deps);
      expect(fake.writes).toEqual([]);
      expect(run.comments).toHaveLength(1);
      expect(run.comments[0]).toContain("Seat mover (shadow, nobody moved)");
      expect(run.comments[0]).toContain(
        "Kim: A seat (5h 85%, week 10%) → B seat (5h 20%, week 10%)",
      );
    });

    test("off reads nothing", async () => {
      const fake = world({}, []);
      const run = deps(fake, [], { settings: { mode: "off" } });
      run.deps.api.connections = () => Promise.reject(new Error("read while off"));
      expect(await seatMoverPass(run.deps)).toBeUndefined();
    });
  });

  describe("act", () => {
    test("sends the agent's whole runtimeConfig with only the seat changed, and logs the batch", async () => {
      const agents = [row("kim", "A")];
      const fake = world({ A: [85, 10], B: [20, 10] }, agents);
      const run = deps(fake, agents, { settings: { mode: "act" } });
      await seatMoverPass(run.deps);
      expect(fake.writes).toEqual(["move a-kim c-B"]);
      expect(fake.configs.get("a-kim")).toEqual({
        heartbeat,
        aiConnection: {
          mode: "delegated",
          method: "subscription",
          provider: "anthropic",
          connectionId: "c-B",
          grantId: "g-B",
        },
      });
      expect(run.comments).toEqual([expect.stringContaining("HAL-16116: **Seat mover (act)**")]);
    });

    test("puts the heartbeat back when the move lost it", async () => {
      const agents = [row("kim", "A")];
      const fake = world({ A: [85, 10], B: [20, 10] }, agents, { dropHeartbeat: true });
      await seatMoverPass(deps(fake, agents, { settings: { mode: "act" } }).deps);
      expect(fake.writes).toEqual(["move a-kim c-B", "move a-kim c-B"]);
      expect(fake.configs.get("a-kim")?.["heartbeat"]).toEqual(heartbeat);
    });

    test("leaves an agent someone else moved since the read", async () => {
      const agents = [row("kim", "A")];
      const fake = world({ A: [85, 10], B: [20, 10], C: [30, 10] }, agents);
      fake.configs.set("a-kim", {
        ...fake.configs.get("a-kim"),
        aiConnection: { mode: "delegated", connectionId: "c-C" },
      });
      await seatMoverPass(deps(fake, agents, { settings: { mode: "act" } }).deps);
      expect(fake.writes).toEqual([]);
    });

    test("doesn't send a later move whose target relied on an earlier one that failed", async () => {
      // Liam (reviewer, past its 70% stop) leaves Two for Empty, which frees Two for Kim.
      const agents = [row("liam", "Two"), row("kim", "Full")];
      const usage: Usage = { Two: [72, 10], Full: [85, 10], Empty: [10, 10] };
      const settings = { mode: "act", targetHeadroomPercent: 5 } as const;
      const working = world(usage, agents);
      await seatMoverPass(deps(working, agents, { settings }).deps);
      expect(working.writes).toEqual(["move a-liam c-Empty", "move a-kim c-Two"]);

      const fake = world(usage, agents);
      const send = fake.api.setRuntimeConfig;
      fake.api.setRuntimeConfig = (agentId, config) =>
        agentId === "a-liam" ? Promise.reject(new Error("refused")) : send(agentId, config);
      await seatMoverPass(deps(fake, agents, { settings }).deps);
      // Liam stayed, so Kim would join a reviewer's seat: not sent.
      expect(fake.writes).toEqual([]);
    });

    test("releases runs still parked on the seat an agent left: cancel, resolve the hold, wake the task once", async () => {
      const agents = [row("kim", "B")];
      const fake = world({ A: [100, 10], B: [20, 10] }, agents);
      const later = "2026-11-26T12:00:00.000Z";
      const parked: ParkedRun[] = [
        { id: "r1", agentId: "a-kim", issueId: "i1", connectionId: "c-A", retryAt: later },
        { id: "r2", agentId: "a-kim", issueId: "i1", connectionId: "c-A", retryAt: later },
        {
          id: "r3",
          agentId: "a-kim",
          issueId: "i2",
          connectionId: "c-A",
          retryAt: "2026-11-26T10:10:00.000Z",
        },
      ];
      const run = deps(fake, agents, { settings: { mode: "act" }, parked });
      await seatMoverPass(run.deps);
      expect(fake.writes).toEqual([
        "cancel r1",
        "resolve i1 hold-r1 todo",
        "cancel r2",
        "resolve i1 hold-r2 todo",
      ]);
      expect(run.wakes).toEqual(["i1"]);
      expect(run.comments).toEqual([expect.stringContaining("Released 2 parked runs")]);
    });

    test("a parked run that names no seat moves the agent once and is released, so it doesn't move every pass", async () => {
      const agents = [row("kim", "A")];
      const fake = world({ A: [30, 10], B: [20, 10] }, agents);
      const parked: ParkedRun[] = [
        { id: "r", agentId: "a-kim", issueId: "i", connectionId: undefined, retryAt: undefined },
      ];
      const run = deps(fake, agents, { settings: { mode: "act" }, parked });
      await seatMoverPass(run.deps);
      expect(fake.writes).toEqual(["move a-kim c-B", "cancel r", "resolve i hold-r todo"]);
      expect(run.wakes).toEqual(["i"]);
      // The next pass still reads the run (and the agent on A): the move is two hours old only later.
      await seatMoverPass(run.deps);
      expect(fake.writes).toHaveLength(3);
    });

    test("tells the board once when an agent must move and no seat may take it, and moves nobody", async () => {
      const agents = [row("kim", "A")];
      const fake = world({ A: [85, 10], Admin: [0, 0], Week: [0, 95] }, agents);
      const run = deps(fake, agents, { settings: { mode: "act" } });
      await seatMoverPass(run.deps);
      await seatMoverPass(run.deps);
      expect(fake.writes).toEqual([]);
      expect(run.comments).toEqual([
        expect.stringMatching(
          /^HAL-9: \*\*Seat mover: no legal seat\.\*\* Kim stays on the A seat/,
        ),
      ]);
    });
  });
});

verifies("paperclip.seat-mover-job", () => {
  describe("the board's audit rules (26 Nov)", () => {
    test("a seat another agent's run is parked waiting for takes nobody", async () => {
      const agents = [row("kim", "Full"), row("mara", "B")];
      const fake = world({ Full: [85, 10], B: [10, 10], C: [50, 10] }, agents);
      const parked: ParkedRun[] = [
        { id: "p", agentId: "a-mara", issueId: "i", connectionId: "c-B", retryAt: undefined },
      ];
      await seatMoverPass(deps(fake, agents, { settings: { mode: "act" }, parked }).deps);
      expect(fake.writes.filter((write) => write.startsWith("move a-kim"))).toEqual([
        "move a-kim c-C",
      ]);
    });

    test("the mover remembers each move and keeps the agent there for two hours unless its seat is full", async () => {
      const agents = [row("kim", "Full")];
      const fake = world({ Full: [85, 10], B: [10, 10] }, agents);
      const run = deps(fake, agents, { settings: { mode: "act" } });
      await seatMoverPass(run.deps);
      expect(run.memory.value.movedAt).toEqual({ "a-kim": now.toISOString() });

      // Priya is the third heavy agent on A: she moves only once her last move is two hours old.
      const heavy = [row("elena", "A"), row("mateo", "A"), row("priya", "A")];
      const at = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
      const recent = world({ A: [10, 10], B: [10, 10] }, heavy);
      const recentMemory = { value: { movedAt: { "a-priya": at(30) } } };
      await seatMoverPass(
        deps(recent, heavy, { settings: { mode: "act" }, memory: recentMemory }).deps,
      );
      expect(recent.writes).toEqual([]);
      const old = world({ A: [10, 10], B: [10, 10] }, heavy);
      const oldMemory = { value: { movedAt: { "a-priya": at(150) } } };
      await seatMoverPass(deps(old, heavy, { settings: { mode: "act" }, memory: oldMemory }).deps);
      expect(old.writes).toEqual(["move a-priya c-B"]);
      expect(oldMemory.value.movedAt).toEqual({ "a-priya": now.toISOString() });
    });

    test("the 5-hour reading of a seat a run failed on in the last 30 minutes doesn't count: its agents leave", async () => {
      // The Leo seat's 09:47 reading lags at 76%; a run had failed on its quota at 09:40.
      const agents = [row("elena", "Leo"), row("tomas", "Leo"), row("kim", "B")];
      const fake = world({ Leo: [76, 38], B: [10, 10], C: [20, 10] }, agents);
      const quota: QuotaFailure[] = [{ connectionId: "c-Leo", at: "2026-11-26T09:40:00.000Z" }];
      const run = deps(fake, agents, { settings: { mode: "act" }, quota });
      await seatMoverPass(run.deps);
      expect(fake.writes).toEqual(["move a-elena c-B", "move a-tomas c-C"]);
    });

    test("a paused agent is never moved, even off a full seat", async () => {
      const agents = [row("kim", "Full", "paused")];
      const fake = world({ Full: [100, 99], B: [10, 10] }, agents);
      await seatMoverPass(deps(fake, agents, { settings: { mode: "act" } }).deps);
      expect(fake.writes).toEqual([]);
    });
  });
});

verifies("paperclip.seat-mover-reset", () => {
  describe("after the board reset a seat", () => {
    // The One seat's reading (09:47) and its quota failure (09:55) both came before the reset at 09:58.
    const usage: Usage = { One: [100, 40], Two: [20, 10] };
    const quota: QuotaFailure[] = [{ connectionId: "c-One", at: "2026-11-26T09:55:00.000Z" }];
    const resets: SeatResets = { "c-One": "2026-11-26T09:58:00.000Z" };

    test("a reading or quota failure from before the reset moves nobody off the seat", async () => {
      const agents = [row("kim", "One")];
      const fake = world(usage, agents);
      await seatMoverPass(deps(fake, agents, { settings: { mode: "act" }, quota, resets }).deps);
      expect(fake.writes).toEqual([]);

      const unreset = world(usage, agents);
      await seatMoverPass(deps(unreset, agents, { settings: { mode: "act" }, quota }).deps);
      expect(unreset.writes).toEqual(["move a-kim c-Two"]);
    });

    test("a parked run whose retry is already due doesn't move its agent", async () => {
      const agents = [row("kim", "Two")];
      const fake = world({ One: [10, 10], Two: [10, 10] }, agents);
      const due: ParkedRun[] = [
        {
          id: "r",
          agentId: "a-kim",
          issueId: "i",
          connectionId: "c-Two",
          retryAt: now.toISOString(),
        },
      ];
      await seatMoverPass(deps(fake, agents, { settings: { mode: "act" }, parked: due }).deps);
      expect(fake.writes).toEqual([]);
    });
  });
});
