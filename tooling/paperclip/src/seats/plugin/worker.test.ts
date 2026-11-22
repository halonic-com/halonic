import { verifies } from "@halonicjs/testing-spec";
import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { expect, test } from "vitest";
import type { SeatReading } from "../records.ts";
import { manifest } from "./manifest.ts";
import { databaseStore } from "./store.ts";
import { commandEnv, plugin } from "./worker.ts";

verifies("paperclip.seats-routes", () => {
  test("the worker answers routes through the board check once it has started", async () => {
    const onApiRequest = plugin.definition.onApiRequest;
    if (onApiRequest === undefined) {
      throw new Error("the seats worker has no route handler");
    }
    const input = {
      routeKey: "seats.list",
      method: "GET",
      path: "/seats",
      params: {},
      query: {},
      body: undefined,
      actor: { actorType: "agent", actorId: "agent-1", agentId: "agent-1" },
      companyId: "acme",
      headers: {},
    } as const;
    expect((await onApiRequest(input)).status).toBe(503);
    await plugin.definition.setup(createTestHarness({ manifest }).ctx);
    expect((await onApiRequest(input)).status).toBe(403);
  });

  test("the store writes events into the plugin's own schema", async () => {
    const { db, writes } = recordingDb();
    await databaseStore(db).recordEvent({
      seatId: "seat-a",
      kind: "manual-reset",
      at: "2026-11-22T11:00:00.000Z",
      by: "board",
      boardUserId: undefined,
    });
    expect(writes).toEqual([
      {
        sql: expect.stringContaining("INSERT INTO plugin_seats_test.event "),
        params: ["seat-a", "manual-reset", "2026-11-22T11:00:00.000Z", "board", null],
      },
    ]);
  });
});

function recordingDb() {
  const writes: { sql: string; params: unknown[] | undefined }[] = [];
  const db: PluginDatabaseClient = {
    namespace: "plugin_seats_test",
    query: async () => [],
    execute: async (sql, params) => {
      writes.push({ sql, params });
      return { rowCount: 1 };
    },
  };
  return { db, writes };
}

verifies("paperclip.seats-read-store", () => {
  test("the store keeps a reading's windows in their columns", async () => {
    const { db, writes } = recordingDb();
    const reading: SeatReading = {
      seatId: "seat-a",
      at: "2026-11-22T10:01:00.000Z",
      error: undefined,
      session: { usedPercent: 23, resetsAt: "2026-11-22T15:00:00.000Z" },
      week: undefined,
      weekByModel: { "Sonnet only": { usedPercent: 12, resetsAt: undefined } },
    };
    await databaseStore(db).recordReading(reading);
    expect(writes[0]?.sql).toContain("INSERT INTO plugin_seats_test.reading ");
    expect(writes[0]?.params).toEqual([
      "seat-a",
      "2026-11-22T10:01:00.000Z",
      null,
      23,
      "2026-11-22T15:00:00.000Z",
      null,
      null,
      JSON.stringify({ "Sonnet only": { usedPercent: 12 } }),
    ]);
  });

  test("old rows go by each record's retention, and an open placement stays", async () => {
    const { db, writes } = recordingDb();
    await databaseStore(db).removeOld(new Date("2026-11-22T10:00:00.000Z"));
    const cutoffs = writes.map((write) => [write.sql.split(" WHERE ")[0], write.params?.[0]]);
    expect(cutoffs).toEqual([
      ["DELETE FROM plugin_seats_test.reading", "2026-11-15T10:00:00.000Z"],
      ["DELETE FROM plugin_seats_test.event", "2026-11-15T10:00:00.000Z"],
      ["DELETE FROM plugin_seats_test.placement", "2026-11-15T10:00:00.000Z"],
      ["DELETE FROM plugin_seats_test.agent_usage", "2026-11-08T10:00:00.000Z"],
      ["DELETE FROM plugin_seats_test.agent_activity", "2026-11-15T10:00:00.000Z"],
    ]);
    expect(writes[2]?.sql).toContain("to_at IS NOT NULL");
  });
});

verifies("paperclip.seats-read", () => {
  test("claude gets only PATH and HOME from the worker's environment", () => {
    const env = { PATH: "/usr/bin", HOME: "/var/lib/seats", ANTHROPIC_API_KEY: "made-up" };
    expect(commandEnv(env)).toEqual({ PATH: "/usr/bin", HOME: "/var/lib/seats" });
  });
});
