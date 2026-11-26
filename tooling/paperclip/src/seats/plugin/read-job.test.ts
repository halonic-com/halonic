import { verifies } from "@halonicjs/testing-spec";
import { PLUGIN_RPC_ERROR_CODES, type ScopeKey } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import { runSeatsRead, type SeatsReadJobApi } from "./read-job.ts";
import { SeatsReader } from "./seats-reader.ts";
import type { SeatsStore } from "./store.ts";

// Made-up companies and seats only.
const configs: Record<string, Record<string, unknown>> = {
  acme: { seats: [{ id: "seat-a", role: "pool", configDir: "/srv/seats/a" }] },
  globex: { seats: [{ id: "seat-z", role: "pool", configDir: "/srv/seats/z" }] },
  initech: {},
};

function api(companyIds: readonly string[]) {
  const logs: string[] = [];
  const state = new Map<string, unknown>();
  const ctx: SeatsReadJobApi = {
    companies: { list: async () => companyIds.map((id) => ({ id }) as never) },
    config: {
      get: async (companyId) => {
        const config = companyId === undefined ? undefined : configs[companyId];
        if (config === undefined) {
          throw Object.assign(new Error("denied"), {
            code: PLUGIN_RPC_ERROR_CODES.INVOCATION_SCOPE_DENIED,
          });
        }
        return config;
      },
    },
    logger: {
      info: (message) => void logs.push(message),
      error: (message) => void logs.push(`error: ${message}`),
    },
    state: {
      set: async (key: ScopeKey, value) =>
        void state.set(`${key.scopeId}/${key.namespace}/${key.stateKey}`, value),
    },
  };
  return { ctx, logs, state };
}

function readerReading(read: string[], signInExpiresAt?: string) {
  const store: SeatsStore = {
    recordEvent: async () => undefined,
    recordReading: async () => undefined,
    manualResets: async () => [],
    removeOld: async () => undefined,
  };
  let now = new Date("2026-11-22T10:00:00.000Z");
  const reader = new SeatsReader({
    read: async (seat) => {
      read.push(seat.id);
      return {
        reading: {
          seatId: seat.id,
          at: now.toISOString(),
          error: "rate-limited",
          session: undefined,
          week: undefined,
          weekByModel: {},
        },
        signIn:
          signInExpiresAt === undefined
            ? undefined
            : { state: "signed-in", account: "matches", plan: "max", expiresAt: signInExpiresAt },
      };
    },
    store,
    now: () => now,
  });
  return { reader, later: () => (now = new Date("2026-11-22T10:05:00.000Z")) };
}

verifies("paperclip.seats-read-store", () => {
  test("reads only the first company that lists seats, and logs that there are two", async () => {
    const { ctx, logs } = api(["no-settings", "initech", "acme", "globex"]);
    const read: string[] = [];
    const { reader, later } = readerReading(read);

    await runSeatsRead(ctx, reader);
    later();
    await runSeatsRead(ctx, reader);

    expect(read).toEqual(["seat-a"]);
    expect(logs.filter((line) => line.startsWith("error:"))).toHaveLength(2);
    expect(logs).toContain("seats.read: 1 seats read, 1 without a reading (rate-limited).");
    expect(logs.join("\n")).not.toContain("/srv/");
  });

  test("stores each seat's sign-in expiry and read status, with seat ids only", async () => {
    const { ctx, state } = api(["acme"]);
    const { reader, later } = readerReading([], "2026-11-24T08:00:00.000Z");

    await runSeatsRead(ctx, reader);
    later();
    await runSeatsRead(ctx, reader);

    const stored = state.get("acme/seats-read/status");
    expect(stored).toEqual([
      expect.objectContaining({ seatId: "seat-a", signInExpiresAt: "2026-11-24T08:00:00.000Z" }),
    ]);
    expect(JSON.stringify(stored)).not.toContain("/srv/");
  });

  test("reads nothing and logs it once per worker when no company lists seats", async () => {
    const { ctx, logs } = api(["no-settings", "initech"]);
    const read: string[] = [];
    const { reader } = readerReading(read);

    await runSeatsRead(ctx, reader);
    await runSeatsRead(ctx, reader);

    expect(read).toEqual([]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("no company's settings list any seats");
  });
});
