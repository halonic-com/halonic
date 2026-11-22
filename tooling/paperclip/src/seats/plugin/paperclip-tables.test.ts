import { verifies } from "@halonicjs/testing-spec";
import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import { databaseHistoryStore } from "./history-store.ts";
import { manifest } from "./manifest.ts";
import { databaseTables } from "./paperclip-tables.ts";

// Made-up company, agents and folders only.
function recordingDb(rows: Record<string, unknown>[]) {
  const statements: { sql: string; params: unknown[] | undefined }[] = [];
  const db: PluginDatabaseClient = {
    namespace: "plugin_seats_test",
    query: async (sql, params) => {
      statements.push({ sql, params });
      return rows as never[];
    },
    execute: async (sql, params) => {
      statements.push({ sql, params });
      return { rowCount: 1 };
    },
  };
  return { db, statements };
}

/** The `schema.table` names a statement reads or writes. */
function tablesIn(sql: string): string[] {
  return [...sql.matchAll(/\b(?:from|join|into|update)\s+([a-z_0-9]+\.[a-z_0-9]+)/gi)].map(
    (match) => match[1] ?? "",
  );
}

verifies("paperclip.seats-history", () => {
  test("reads only the core tables the manifest names, and only the sign-in fields of the settings", async () => {
    const { db, statements } = recordingDb([]);
    const tables = databaseTables(db);
    await tables.agentsNow("acme");
    await tables.costRowsSince("acme", "2026-11-22T09:00:00.000Z");
    const allowed = (manifest.database?.coreReadTables ?? []).map((table) => `public.${table}`);
    for (const { sql, params } of statements) {
      expect(sql.trim()).toMatch(/^SELECT /);
      expect(tablesIn(sql).every((table) => allowed.includes(table))).toBe(true);
      expect(params?.[0]).toBe("acme");
      // Never a whole settings column: each use picks a field out of it.
      expect(sql).not.toMatch(/(adapter_config|runtime_config)\s*(,|AS|\n|$)/);
    }
  });

  test("turns database rows into agents and cost rows with UTC times", async () => {
    const { db } = recordingDb([
      {
        agent_id: "agent-1",
        name: "Agent One",
        config_dir: null,
        connection_id: "conn-a",
        model: null,
        cap: "2",
        running_runs: 1,
        queued_runs: 0,
        open_tasks: 4,
        run_id: "run-1",
        occurred_at: new Date("2026-11-22T10:04:00.000Z"),
        input_tokens: 100,
        cached_input_tokens: null,
        output_tokens: 5,
      },
    ]);
    const tables = databaseTables(db);
    expect(await tables.agentsNow("acme")).toEqual([
      {
        agentId: "agent-1",
        name: "Agent One",
        configDir: undefined,
        connectionId: "conn-a",
        model: "",
        cap: 2,
        runningRuns: 1,
        queuedRuns: 0,
        openTasks: 4,
      },
    ]);
    expect((await tables.costRowsSince("acme", "2026-11-22T10:00:00.000Z"))[0]).toEqual({
      agentId: "agent-1",
      runId: "run-1",
      model: "",
      occurredAt: "2026-11-22T10:04:00.000Z",
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 5,
    });
  });

  test("the history store writes only into the plugin's own schema and replaces a usage bucket", async () => {
    const { db, statements } = recordingDb([]);
    const store = databaseHistoryStore(db);
    await store.placementsSince("2026-11-22T09:00:00.000Z");
    await store.savePlacementChanges({
      closed: [
        {
          agentId: "agent-1",
          seatId: "seat-a",
          from: "2026-11-22T09:00:00.000Z",
          to: "2026-11-22T10:00:00.000Z",
          source: "observed",
        },
      ],
      opened: [
        {
          agentId: "agent-1",
          seatId: "seat-b",
          from: "2026-11-22T10:00:00.000Z",
          to: undefined,
          source: "observed",
        },
      ],
    });
    await store.saveUsage([
      {
        agentId: "agent-1",
        seatId: undefined,
        model: "claude-made-up",
        bucketStart: "2026-11-22T10:00:00.000Z",
        inputTokens: 1,
        cachedInputTokens: 2,
        outputTokens: 3,
        runs: 1,
      },
    ]);
    await store.recordActivity([
      {
        agentId: "agent-1",
        at: "2026-11-22T10:00:00.000Z",
        runningRuns: 0,
        queuedRuns: 1,
        openTasks: 2,
        cap: undefined,
        model: "claude-made-up",
      },
    ]);
    expect(statements).toHaveLength(5);
    for (const { sql } of statements) {
      expect(tablesIn(sql).every((table) => table.startsWith("plugin_seats_test."))).toBe(true);
    }
    expect(statements[3]?.sql).toContain("DO UPDATE SET input_tokens = EXCLUDED.input_tokens");
    expect(statements[3]?.params?.[1]).toBeNull();
    expect(statements[4]?.params?.[5]).toBeNull();
  });
});
