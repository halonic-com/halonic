import { verifies } from "@halonicjs/testing-spec";
import type { PluginApiRequestInput } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import type { SeatNow, WindowNow } from "../placement-rules.ts";
import { handleSeatsRequest, type SeatsRouteDeps } from "./routes.ts";
import type { SeatsNow } from "./seats-now.ts";
import { reachesAt, type SeatsPage } from "./seats-page.ts";
import type { SeatReadStatus } from "./seats-reader.ts";
import { readSeatsSettings } from "./settings.ts";
import type { StoredSeatEvent } from "./store.ts";

// Made-up seats and agents only: no real folder, account or company.
const at = "2026-11-22T12:00:00.000Z";
const hoursFromNow = (hours: number) =>
  new Date(Date.parse(at) + hours * 60 * 60_000).toISOString();

const settings = {
  seats: ["seat-a", "seat-b", "seat-c", "seat-r"].map((id) => ({
    id,
    role: id === "seat-r" ? "reserve" : "pool",
    configDir: `/srv/seats/${id}`,
    account: `${id}@acme.test`,
    connectionId: `conn-${id}`,
  })),
};

function window(usedPercent: number, percentPerHour?: number, resetsInHours = 100): WindowNow {
  return { usedPercent, percentPerHour, resetsAt: hoursFromNow(resetsInHours) };
}

function seat(id: string, overrides: Partial<SeatNow> = {}): SeatNow {
  return {
    id,
    role: id === "seat-r" ? "reserve" : "pool",
    status: "active",
    resetGroup: undefined,
    manualResetUsed: false,
    readable: true,
    session: window(10, 0, 4),
    week: window(30, 0.5, 72),
    ...overrides,
  };
}

const twoAgents: SeatsNow = {
  seats: [
    seat("seat-a", { session: window(85, 5, 2) }),
    seat("seat-b", { week: window(70, 1, 24 * 8) }),
    seat("seat-c", { readable: false, week: window(50) }),
    seat("seat-r", { week: window(5) }),
  ],
  placements: new Map([
    ["agent-2", "seat-a"],
    ["agent-1", "seat-a"],
  ]),
  agentNames: new Map([
    ["agent-1", "Ada"],
    ["agent-2", "Bo"],
  ]),
};

const statusA: SeatReadStatus = {
  seatId: "seat-a",
  nextReadAt: hoursFromNow(1 / 6),
  lastReadAt: hoursFromNow(-1 / 6),
  readingAgeMs: 10 * 60_000 + 30_000,
  lastError: undefined,
  alerts: ["sign-in-expiring"],
  signInExpiresAt: hoursFromNow(20),
};

function setup(now: SeatsNow = twoAgents) {
  const events: StoredSeatEvent[] = [];
  const asked: string[] = [];
  const deps: SeatsRouteDeps = {
    readSettings: async () => readSeatsSettings(settings),
    store: {
      recordEvent: async (event) => void events.push(event),
      recordReading: async () => undefined,
      manualResets: async () => [],
      removeOld: async () => undefined,
    },
    now: () => new Date(at),
    reads: () => ({ readerStartedAt: hoursFromNow(-2), seats: [statusA] }),
    seatsNow: async (companyId) => {
      asked.push(companyId);
      return now;
    },
  };
  return { deps, events, asked };
}

function request(actor: PluginApiRequestInput["actor"]): PluginApiRequestInput {
  return {
    routeKey: "seats.page",
    method: "GET",
    path: "/seats/page",
    params: {},
    query: {},
    body: undefined,
    actor,
    companyId: "acme",
    headers: {},
  };
}

const board = { actorType: "user", actorId: "user-1", userId: "user-1" } as const;
const agent = { actorType: "agent", actorId: "agent-1", agentId: "agent-1" } as const;

async function boardPage(now?: SeatsNow): Promise<SeatsPage> {
  const response = await handleSeatsRequest(request(board), setup(now).deps);
  expect(response.status).toBe(200);
  return response.body as SeatsPage;
}

verifies("paperclip.seats-page", () => {
  test("refuses an agent before it reads anything", async () => {
    const { deps, asked } = setup();
    const response = await handleSeatsRequest(request(agent), deps);
    expect(response.status).toBe(403);
    expect(asked).toEqual([]);
  });

  test("counts the weekly points left over the readable pool seats only", async () => {
    const page = await boardPage();
    // seat-a 70 + seat-b 30; seat-c can't be read and seat-r is a reserve.
    expect(page.cards).toMatchObject({ poolPointsLeft: 100, poolSeatsUnreadable: 1 });
    expect(page.cards.poolPointsPerHour).toBe(1.5);
    expect(page.forecast).toBeUndefined();
  });

  test("lists only pool refills of the next 7 days, soonest first", async () => {
    const page = await boardPage();
    expect(page.refills).toEqual([
      { seatId: "seat-a", at: hoursFromNow(72), points: 30 },
      { seatId: "seat-c", at: hoursFromNow(100), points: 50 },
    ]);
    expect(page.cards.nextRefill).toEqual(page.refills[0]);
  });

  test("shows each seat's reads, sign-in expiry and agents by name, never a folder or account", async () => {
    const page = await boardPage();
    expect(page.readerStartedAt).toBe(hoursFromNow(-2));
    expect(page.seats.map((row) => row.seatId)).toEqual(["seat-a", "seat-b", "seat-c", "seat-r"]);
    expect(page.seats[0]).toMatchObject({
      readable: true,
      readingAgeMinutes: 10,
      nextReadAt: statusA.nextReadAt,
      signInExpiresAt: hoursFromNow(20),
      alerts: ["sign-in-expiring"],
      agents: [
        { agentId: "agent-1", name: "Ada" },
        { agentId: "agent-2", name: "Bo" },
      ],
    });
    expect(page.seats[1]).toMatchObject({ readingAgeMinutes: undefined, alerts: [], agents: [] });
    expect(JSON.stringify(page)).not.toMatch(/srv|acme\.test|conn-/);
  });

  test("shows the moves seats.check would propose, by name, and changes nothing", async () => {
    const { deps, events } = setup();
    const response = await handleSeatsRequest(request(board), deps);
    const page = response.body as SeatsPage;
    expect(page.proposal.moves).toEqual([
      {
        agent: { agentId: "agent-1", name: "Ada" },
        from: "seat-a",
        to: "seat-b",
        reason: "session-full",
      },
      {
        agent: { agentId: "agent-2", name: "Bo" },
        from: "seat-a",
        to: "seat-b",
        reason: "session-full",
      },
    ]);
    expect(page.movesEnabled).toBe(false);
    expect(events).toEqual([]);
  });

  test("says when a window reaches 80% and 90% before its reset", () => {
    expect(reachesAt(window(70, 20, 2), 80, at)).toBe(hoursFromNow(0.5));
    expect(reachesAt(window(70, 20, 2), 90, at)).toBe(hoursFromNow(1));
    expect(reachesAt(window(70, 20, 0.75), 80, at)).toBe(hoursFromNow(0.5));
    expect(reachesAt(window(70, 20, 0.75), 90, at)).toBeUndefined();
    expect(reachesAt(window(85, 20, 2), 80, at)).toBe(at);
    expect(reachesAt(window(70, undefined, 2), 80, at)).toBeUndefined();
    expect(reachesAt(window(70, 0, 2), 80, at)).toBeUndefined();
  });
});
