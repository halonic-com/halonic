import { verifies } from "@halonicjs/testing-spec";
import type { PluginApiRequestInput } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import type { SeatNow, WindowNow } from "../placement-rules.ts";
import { handleSeatsRequest, type SeatsRouteDeps } from "./routes.ts";
import type { SeatsNow } from "./seats-now.ts";
import type { SeatReadStatus } from "./seats-reader.ts";
import type { SeatsSummary } from "./seats-summary.ts";
import { readSeatsSettings } from "./settings.ts";

// Made-up seats and agents only: no real folder, account, connection or company.
const at = "2026-11-22T12:00:00.000Z";
const hoursFromNow = (hours: number) =>
  new Date(Date.parse(at) + hours * 60 * 60_000).toISOString();

const settings = {
  seats: ["seat-a", "seat-b", "seat-c"].map((id) => ({
    id,
    role: "pool",
    configDir: `/srv/seats/${id}`,
    account: `${id}@acme.test`,
    connectionId: `conn-${id}`,
  })),
};

function window(usedPercent: number, percentPerHour: number, resetsInHours: number): WindowNow {
  return { usedPercent, percentPerHour, resetsAt: hoursFromNow(resetsInHours) };
}

function seat(id: string, overrides: Partial<SeatNow>): SeatNow {
  return {
    id,
    role: "pool",
    status: "active",
    resetGroup: undefined,
    manualResetUsed: false,
    readable: true,
    session: window(10, 0, 4),
    week: window(30, 0, 72),
    ...overrides,
  };
}

const seatsNowState: SeatsNow = {
  seats: [
    seat("seat-a", { session: window(85, 5, 2), manualResetUsed: true }),
    seat("seat-b", { readable: false, session: undefined }),
    seat("seat-c", {}),
  ],
  placements: new Map([["agent-1", "seat-a"]]),
  agentNames: new Map([["agent-1", "Ada"]]),
};

const statusA: SeatReadStatus = {
  seatId: "seat-a",
  nextReadAt: hoursFromNow(1 / 6),
  lastReadAt: hoursFromNow(-1 / 6),
  readingAgeMs: 10 * 60_000,
  lastError: undefined,
  alerts: ["sign-in-expiring"],
  signInExpiresAt: hoursFromNow(20),
};

const statusB: SeatReadStatus = {
  ...statusA,
  seatId: "seat-b",
  readingAgeMs: undefined,
  lastError: "signed-out",
  alerts: [],
};

function setup() {
  const asked: string[] = [];
  const unknownAsked: string[] = [];
  const deps: SeatsRouteDeps = {
    readSettings: async (companyId) => {
      asked.push(companyId);
      return readSeatsSettings(settings);
    },
    store: {
      recordEvent: async () => undefined,
      recordReading: async () => undefined,
      manualResets: async () => [],
      removeOld: async () => undefined,
    },
    now: () => new Date(at),
    reads: () => ({ readerStartedAt: hoursFromNow(-2), seats: [statusA, statusB] }),
    seatsNow: async () => seatsNowState,
    unknownSeatRuns: async (_companyId, since) => {
      unknownAsked.push(since);
      return 3;
    },
  };
  return { deps, asked, unknownAsked };
}

function request(
  actor: PluginApiRequestInput["actor"],
  query: Record<string, string | string[]> = {},
): PluginApiRequestInput {
  return {
    routeKey: "seats.summary",
    method: "GET",
    path: "/seats/summary",
    params: {},
    query: { companyId: "acme", ...query },
    body: undefined,
    actor,
    companyId: "acme",
    headers: {},
  };
}

const board = { actorType: "user", actorId: "user-1", userId: "user-1" } as const;
const agent = { actorType: "agent", actorId: "agent-1", agentId: "agent-1" } as const;

async function boardSummary(): Promise<SeatsSummary> {
  const response = await handleSeatsRequest(request(board), setup().deps);
  expect(response.status).toBe(200);
  return response.body as SeatsSummary;
}

verifies("paperclip.seats-summary", () => {
  test("refuses an agent's key with 403 before it reads anything", async () => {
    const { deps, asked } = setup();
    const response = await handleSeatsRequest(request(agent), deps);
    expect(response.status).toBe(403);
    expect(asked).toEqual([]);
  });

  test("gives each seat's label, windows, resets and when they reach 90%", async () => {
    const summary = await boardSummary();
    expect(summary.at).toBe(at);
    expect(summary.seats[0]).toEqual({
      id: "seat-a",
      label: "seat-a",
      role: "pool",
      asOf: hoursFromNow(-1 / 6),
      readable: true,
      lastError: undefined,
      windows: [
        {
          kind: "five-hour",
          label: "5-hour window",
          usedPercent: 85,
          resetsAt: hoursFromNow(2),
          reaches90At: hoursFromNow(1),
        },
        {
          kind: "week",
          label: "Week",
          usedPercent: 30,
          resetsAt: hoursFromNow(72),
          reaches90At: undefined,
        },
      ],
      agents: [{ agentId: "agent-1", name: "Ada" }],
      manualResetUsed: true,
    });
    expect(summary.seats[1]).toMatchObject({
      label: "seat-b",
      asOf: undefined,
      readable: false,
      lastError: "signed-out",
      windows: [{ kind: "week", usedPercent: 30 }],
    });
  });

  test("carries no folder, account, connection id or sign-in expiry", async () => {
    const text = JSON.stringify(await boardSummary());
    expect(text).not.toMatch(/\/srv|acme\.test|conn-seat/);
    expect(text).not.toMatch(/configDir|account|connectionId|signInExpiresAt|alerts/);
    expect(text).not.toContain(hoursFromNow(20));
  });

  test("gives the proposal seats.check would post now, as plain text with its time", async () => {
    const { proposal } = await boardSummary();
    expect(proposal?.at).toBe(at);
    expect(proposal?.text).toContain("Ada: seat-a → seat-c");
    expect(proposal?.text).not.toContain("**");
  });
});

verifies("paperclip.seats-summary-fields", () => {
  test("gives a seat whose newest read failed the time that read ran", async () => {
    const summary = await boardSummary();
    expect(summary.seats[1]?.lastError).toBe("signed-out");
    expect(summary.seats[1]?.failedReadAt).toBe(hoursFromNow(-1 / 6));
  });

  test("gives no failed-read time to a seat whose newest read was good, or never ran", async () => {
    const summary = await boardSummary();
    expect(summary.seats[0]?.failedReadAt).toBeUndefined();
    expect(summary.seats[2]?.failedReadAt).toBeUndefined();
  });

  test("counts the runs with no seat since the asked time", async () => {
    const { deps, unknownAsked } = setup();
    const from = hoursFromNow(-12);
    const response = await handleSeatsRequest(request(board, { from }), deps);
    expect(response.status).toBe(200);
    expect((response.body as SeatsSummary).unknownSeatRuns).toBe(3);
    expect(unknownAsked).toEqual([from]);
  });

  test("leaves the count out, and reads no cost rows, when no time is asked", async () => {
    const { deps, unknownAsked } = setup();
    const response = await handleSeatsRequest(request(board), deps);
    expect((response.body as SeatsSummary).unknownSeatRuns).toBeUndefined();
    expect(unknownAsked).toEqual([]);
  });

  test("refuses a from time that isn't a time, is in the future or is over 31 days back", async () => {
    for (const from of ["yesterday", hoursFromNow(1), hoursFromNow(-32 * 24), ["a", "b"]]) {
      const { deps, unknownAsked } = setup();
      const response = await handleSeatsRequest(request(board, { from }), deps);
      expect(response.status).toBe(400);
      expect(unknownAsked).toEqual([]);
    }
  });
});
