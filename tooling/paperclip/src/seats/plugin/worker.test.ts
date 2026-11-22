import { verifies } from "@halonicjs/testing-spec";
import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { expect, test } from "vitest";
import { manifest } from "./manifest.ts";
import { databaseStore } from "./store.ts";
import { plugin } from "./worker.ts";

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
    const writes: { sql: string; params: unknown[] | undefined }[] = [];
    const db: PluginDatabaseClient = {
      namespace: "plugin_seats_test",
      query: async () => [],
      execute: async (sql, params) => {
        writes.push({ sql, params });
        return { rowCount: 1 };
      },
    };
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
