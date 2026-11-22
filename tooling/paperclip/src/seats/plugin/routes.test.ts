import { verifies } from "@halonicjs/testing-spec";
import type { PluginApiRequestInput } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import { manifest } from "./manifest.ts";
import { handleSeatsRequest, type SeatsRouteDeps } from "./routes.ts";
import { readSeatsSettings } from "./settings.ts";
import type { StoredSeatEvent } from "./store.ts";

// Made-up seats only: no real folder, account or company.
const config = {
  seats: [
    {
      id: "seat-a",
      role: "pool",
      configDir: "/srv/seats/seat-a",
      account: "a@acme.test",
      resetGroup: "g1",
    },
    { id: "seat-b", role: "paid-api", configDir: "/srv/seats/seat-b" },
  ],
};

function setup(settings: Record<string, unknown> = config) {
  const events: StoredSeatEvent[] = [];
  const settingsRead: string[] = [];
  const deps: SeatsRouteDeps = {
    readSettings: async (companyId) => {
      settingsRead.push(companyId);
      return readSeatsSettings(settings);
    },
    store: {
      recordEvent: async (event) => void events.push(event),
      recordReading: async () => undefined,
      manualResets: async () => events.filter((event) => event.kind === "manual-reset"),
      removeOld: async () => undefined,
    },
    now: () => new Date("2026-11-22T11:00:00.000Z"),
    reads: () => ({ readerStartedAt: "2026-11-22T10:00:00.000Z", seats: [] }),
    seatsNow: async () => ({ seats: [], placements: new Map(), agentNames: new Map() }),
  };
  return { deps, events, settingsRead };
}

function request(
  routeKey: string,
  actor: PluginApiRequestInput["actor"],
  params: Record<string, string> = {},
): PluginApiRequestInput {
  return {
    routeKey,
    method: "GET",
    path: "/seats",
    params,
    query: {},
    body: undefined,
    actor,
    companyId: "acme",
    headers: {},
  };
}

const board = { actorType: "user", actorId: "user-1", userId: "user-1" } as const;
const agent = { actorType: "agent", actorId: "agent-1", agentId: "agent-1" } as const;

verifies("paperclip.seats-routes", () => {
  test("every route the manifest declares is board-only", () => {
    expect(manifest.apiRoutes?.map((route) => [route.routeKey, route.auth])).toEqual([
      ["seats.list", "board"],
      ["seats.page", "board"],
      ["seats.manual-reset", "board"],
    ]);
  });

  test("refuses an agent before it reads anything", async () => {
    const { deps, events, settingsRead } = setup();
    const response = await handleSeatsRequest(request("seats.list", agent), deps);
    expect(response.status).toBe(403);
    expect(settingsRead).toEqual([]);
    const reset = await handleSeatsRequest(
      request("seats.manual-reset", agent, { seatId: "seat-a" }),
      deps,
    );
    expect(reset.status).toBe(403);
    expect(events).toEqual([]);
  });

  test("lists seats without their folder or account, with moves off", async () => {
    const { deps } = setup();
    const response = await handleSeatsRequest(request("seats.list", board), deps);
    expect(response).toEqual({
      status: 200,
      body: {
        seats: [
          { id: "seat-a", role: "pool", resetGroup: "g1" },
          { id: "seat-b", role: "paid-api", resetGroup: undefined },
        ],
        movesEnabled: false,
        reads: { readerStartedAt: "2026-11-22T10:00:00.000Z", seats: [] },
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/srv|acme\.test/);
  });

  test("records a manual reset by the board user, now", async () => {
    const { deps, events } = setup();
    const response = await handleSeatsRequest(
      request("seats.manual-reset", board, { seatId: "seat-a" }),
      deps,
    );
    expect(response.status).toBe(201);
    expect(events).toEqual([
      {
        seatId: "seat-a",
        kind: "manual-reset",
        at: "2026-11-22T11:00:00.000Z",
        by: "board",
        boardUserId: "user-1",
      },
    ]);
  });

  test("refuses a manual reset for a seat that isn't in the settings", async () => {
    const { deps, events } = setup();
    const response = await handleSeatsRequest(
      request("seats.manual-reset", board, { seatId: "seat-z" }),
      deps,
    );
    expect(response.status).toBe(404);
    expect(events).toEqual([]);
  });
});

verifies("paperclip.seats-check-job", () => {
  const sharedGroup = {
    seats: [
      ...config.seats,
      { id: "seat-c", role: "pool", configDir: "/srv/seats/seat-c", resetGroup: "g1" },
      { id: "seat-d", role: "pool", configDir: "/srv/seats/seat-d", resetGroup: "g2" },
    ],
  };
  const reset = (seatId: string) => request("seats.manual-reset", board, { seatId });

  test("refuses a second manual reset in one reset group, and stores nothing", async () => {
    const { deps, events } = setup(sharedGroup);
    expect((await handleSeatsRequest(reset("seat-a"), deps)).status).toBe(201);
    const second = await handleSeatsRequest(reset("seat-c"), deps);
    expect(second.status).toBe(409);
    expect(JSON.stringify(second.body)).toContain("seat-a");
    expect(events.map((event) => event.seatId)).toEqual(["seat-a"]);
  });

  test("lets another reset group, and a seat without a group, record their own", async () => {
    const { deps, events } = setup(sharedGroup);
    for (const seatId of ["seat-a", "seat-d", "seat-b"]) {
      expect((await handleSeatsRequest(reset(seatId), deps)).status).toBe(201);
    }
    expect((await handleSeatsRequest(reset("seat-b"), deps)).status).toBe(409);
    expect(events.map((event) => event.seatId)).toEqual(["seat-a", "seat-d", "seat-b"]);
  });
});
