import { verifies } from "@halonicjs/testing-spec";
import type { PluginDatabaseClient, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { describe, expect, test } from "vitest";
import type { SeatReading } from "../records.ts";
import { manifest } from "./manifest.ts";
import { seatUsage } from "./seat-usage.ts";
import { registerSeatUsageTool, type SeatUsageToolApi } from "./seat-usage-tool.ts";
import type { SeatReadStatus } from "./seats-reader.ts";
import { readSeatsSettings } from "./settings.ts";
import { databaseStoredReadings, type StoredSeatReadings } from "./stored-readings.ts";
import { plugin } from "./worker.ts";

// Made-up seats, agents and sign-ins only: no real folder, account or connection.
const signIns = ["/srv/seats/seat-a", "a@acme.test", "conn-secret-a", "/srv/seats/seat-b"];
const config = {
  seats: [
    {
      id: "seat-a",
      role: "pool",
      configDir: "/srv/seats/seat-a",
      account: "a@acme.test",
      connectionId: "conn-secret-a",
      resetGroup: "g1",
    },
    { id: "seat-b", role: "reserve", configDir: "/srv/seats/seat-b" },
  ],
  seatUsageAgents: ["agent-supervisor"],
};
const now = new Date("2026-11-22T10:30:00.000Z");

function reading(at: string, error?: SeatReading["error"]): SeatReading {
  return {
    seatId: "seat-a",
    at,
    error,
    session:
      error === undefined ? { usedPercent: 42, resetsAt: "2026-11-22T14:00:00.000Z" } : undefined,
    week: error === undefined ? { usedPercent: 63, resetsAt: undefined } : undefined,
    weekByModel:
      error === undefined ? { "Sonnet only": { usedPercent: 20, resetsAt: undefined } } : {},
  };
}

const stored: StoredSeatReadings[] = [
  {
    seatId: "seat-a",
    latest: reading("2026-11-22T10:21:00.000Z", "rate-limited"),
    lastGood: reading("2026-11-22T10:11:00.000Z"),
  },
];
const statuses: SeatReadStatus[] = [
  {
    seatId: "seat-a",
    nextReadAt: "2026-11-22T10:41:00.000Z",
    lastReadAt: "2026-11-22T10:21:00.000Z",
    readingAgeMs: 19 * 60_000,
    lastError: "rate-limited",
    alerts: ["other-account"],
    signInExpiresAt: undefined,
  },
];

type Handler = (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>;

/** Registers the tool on a fake context and counts how often the stored readings are read. */
function fakeTool(latest: () => Promise<StoredSeatReadings[]> = async () => stored) {
  const handlers: Handler[] = [];
  const logged: string[] = [];
  const reads = { stored: 0 };
  const ctx: SeatUsageToolApi = {
    tools: {
      register: (_name, _declaration, fn) => {
        handlers.push(fn);
      },
    },
    config: { get: async () => config },
    logger: {
      error: (message) => {
        logged.push(message);
      },
    },
  };
  registerSeatUsageTool(ctx, {
    stored: {
      latest: () => {
        reads.stored += 1;
        return latest();
      },
    },
    statuses: () => statuses,
    now: () => now,
  });
  const call = (agentId: string) => {
    const [handler] = handlers;
    if (handler === undefined) throw new Error("seat_usage isn't registered");
    return handler({}, { agentId, runId: "run-1", companyId: "acme", projectId: "" });
  };
  return { call, reads, logged };
}

verifies("paperclip.seats-usage-tool", () => {
  describe("seat_usage", () => {
    test("the plugin as installed lets no agent call it", async () => {
      const properties = manifest.instanceConfigSchema?.["properties"] as Record<
        string,
        { default?: unknown }
      >;
      expect(properties["seatUsageAgents"]?.default).toEqual([]);
      const harness = createTestHarness({ manifest, config: {} });
      await plugin.definition.setup(harness.ctx);
      const result = await harness.executeTool<ToolResult>("seat_usage", {});
      expect(result.error).toMatch(/only the agents the board lists/);
      expect(result.content).toBeUndefined();
    });

    test("refuses an agent the board didn't list, before reading anything", async () => {
      const { call, reads } = fakeTool();
      const result = await call("agent-someone");
      expect(result.error).toMatch(/only the agents the board lists/);
      expect(reads.stored).toBe(0);
    });

    test("gives a listed agent the newest state, the last good windows with their age and the alerts", async () => {
      const { call } = fakeTool();
      const result = await call("agent-supervisor");
      expect(result.data).toEqual({
        seats: [
          {
            seatId: "seat-a",
            role: "pool",
            resetGroup: "g1",
            state: "rate-limited",
            lastReadAt: "2026-11-22T10:21:00.000Z",
            readingAt: "2026-11-22T10:11:00.000Z",
            readingAgeMinutes: 19,
            session: { usedPercent: 42, resetsAt: "2026-11-22T14:00:00.000Z" },
            week: { usedPercent: 63, resetsAt: undefined },
            weekByModel: { "Sonnet only": { usedPercent: 20, resetsAt: undefined } },
            alerts: ["other-account"],
          },
          {
            seatId: "seat-b",
            role: "reserve",
            resetGroup: undefined,
            state: "no-reading",
            lastReadAt: undefined,
            readingAt: undefined,
            readingAgeMinutes: undefined,
            session: undefined,
            week: undefined,
            weekByModel: {},
            alerts: [],
          },
        ],
      });
      expect(result.content).toContain(
        "- seat-a (pool, reset group g1): rate-limited. session 42% used, resets 2026-11-22T14:00:00.000Z; week 63% used; Sonnet only 20% used. Read 19 min ago. Alerts: other-account.",
      );
      expect(result.content).toContain(
        "- seat-b (reserve): no-reading. No stored reading with windows yet.",
      );
    });

    test("never gives a folder, an account or a connection id", async () => {
      const { call } = fakeTool();
      const answer = JSON.stringify(await call("agent-supervisor"));
      for (const secret of signIns) {
        expect(answer).not.toContain(secret);
      }
    });

    test("keeps the database's message in the plugin's log, not in the answer", async () => {
      const { call, logged } = fakeTool(() => Promise.reject(new Error("relation missing")));
      const result = await call("agent-supervisor");
      expect(result.error).toMatch(/couldn't be read/);
      expect(result.error).not.toContain("relation missing");
      expect(logged.join("\n")).toContain("relation missing");
    });
  });

  describe("the stored readings", () => {
    test("are read with SELECTs on the plugin's own reading table only", async () => {
      const statements: string[] = [];
      const db: PluginDatabaseClient = {
        namespace: "plugin_seats_test",
        query: async (sql) => {
          statements.push(sql);
          return [] as never[];
        },
        execute: async (sql) => {
          statements.push(sql);
          return { rowCount: 0 };
        },
      };
      await databaseStoredReadings(db).latest();
      expect(statements).toHaveLength(2);
      for (const sql of statements) {
        expect(sql).toMatch(/^SELECT DISTINCT ON \(seat_id\) /);
        expect([...sql.matchAll(/\bFROM\s+(\S+)/gi)].map((match) => match[1])).toEqual([
          "plugin_seats_test.reading",
        ]);
      }
    });

    test("turn rows into readings with UTC times, the newest good one beside the newest", async () => {
      const latestRow = {
        seat_id: "seat-a",
        at: new Date("2026-11-22T10:21:00.000Z"),
        error: "rate-limited",
        week_by_model: {},
      };
      const goodRow = {
        seat_id: "seat-a",
        at: "2026-11-22 10:11:00+00",
        error: null,
        session_used_percent: 42,
        session_resets_at: new Date("2026-11-22T14:00:00.000Z"),
        week_used_percent: null,
        week_resets_at: null,
        week_by_model: '{"Sonnet only":{"usedPercent":20},"Opus":{}}',
      };
      let call = 0;
      const db = {
        namespace: "plugin_seats_test",
        query: async () => (call++ === 0 ? [latestRow] : [goodRow]) as never[],
        execute: async () => ({ rowCount: 0 }),
      } satisfies PluginDatabaseClient;
      const [entry] = await databaseStoredReadings(db).latest();
      expect(entry?.latest).toMatchObject({
        at: "2026-11-22T10:21:00.000Z",
        error: "rate-limited",
        session: undefined,
      });
      expect(entry?.lastGood).toEqual({
        seatId: "seat-a",
        at: "2026-11-22T10:11:00.000Z",
        error: undefined,
        session: { usedPercent: 42, resetsAt: "2026-11-22T14:00:00.000Z" },
        week: undefined,
        weekByModel: { "Sonnet only": { usedPercent: 20, resetsAt: undefined } },
      });
    });
  });

  test("keeps the settings' order and leaves out stored seats the settings no longer list", () => {
    const { seats } = readSeatsSettings(config);
    const usage = seatUsage(
      [...seats].reverse(),
      [...stored, { ...stored[0], seatId: "seat-gone" } as StoredSeatReadings],
      [],
      now,
    );
    expect(usage.map((seat) => seat.seatId)).toEqual(["seat-b", "seat-a"]);
  });
});
