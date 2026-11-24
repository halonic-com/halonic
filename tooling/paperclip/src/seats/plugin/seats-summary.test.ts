import { verifies } from "@halonicjs/testing-spec";
import type { PluginApiRequestInput } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import type { SeatNow } from "../placement-rules.ts";
import { handleSeatsRequest, type SeatsRouteDeps } from "./routes.ts";
import { readSeatsSettings } from "./settings.ts";

// Made-up seats only: no real folder, account, connection or company.
const config = {
  seats: [
    {
      id: "seat-a",
      role: "pool",
      configDir: "/srv/seats/seat-a",
      account: "a@acme.test",
      connectionId: "conn-acme-secret-1",
      resetGroup: "g1",
    },
    {
      id: "seat-b",
      role: "pool",
      configDir: "/srv/seats/seat-b",
      account: "b@acme.test",
      connectionId: "conn-acme-secret-2",
    },
  ],
};

const at = "2026-11-24T12:00:00.000Z";

const seatA: SeatNow = {
  id: "seat-a",
  role: "pool",
  status: "active",
  resetGroup: "g1",
  manualResetUsed: false,
  readable: true,
  session: { usedPercent: 85, percentPerHour: 10, resetsAt: "2026-11-24T14:00:00.000Z" },
  week: { usedPercent: 40, percentPerHour: 1, resetsAt: "2026-11-27T09:00:00.000Z" },
};

const seatB: SeatNow = {
  ...seatA,
  id: "seat-b",
  resetGroup: undefined,
  session: { usedPercent: 10, percentPerHour: undefined, resetsAt: "2026-11-24T16:00:00.000Z" },
  week: { usedPercent: 20, percentPerHour: undefined, resetsAt: "2026-11-28T09:00:00.000Z" },
};

function setup() {
  const settingsRead: string[] = [];
  const deps: SeatsRouteDeps = {
    readSettings: async (companyId) => {
      settingsRead.push(companyId);
      return readSeatsSettings(config);
    },
    store: {
      recordEvent: async () => undefined,
      recordReading: async () => undefined,
      manualResets: async () => [],
      removeOld: async () => undefined,
    },
    now: () => new Date(at),
    reads: () => ({
      readerStartedAt: "2026-11-24T10:00:00.000Z",
      seats: [
        {
          seatId: "seat-a",
          nextReadAt: "2026-11-24T12:05:00.000Z",
          lastReadAt: "2026-11-24T11:58:00.000Z",
          readingAgeMs: 2 * 60_000,
          lastError: undefined,
          alerts: [],
          signInExpiresAt: undefined,
        },
      ],
    }),
    seatsNow: async () => ({
      seats: [seatA, seatB],
      placements: new Map([["agent-1", "seat-a"]]),
      agentNames: new Map([["agent-1", "Elena"]]),
    }),
  };
  return { deps, settingsRead };
}

function request(actor: PluginApiRequestInput["actor"]): PluginApiRequestInput {
  return {
    routeKey: "seats.summary",
    method: "GET",
    path: "/seats/summary",
    params: {},
    query: { companyId: "acme" },
    body: undefined,
    actor,
    companyId: "acme",
    headers: {},
  };
}

const board = { actorType: "user", actorId: "user-1", userId: "user-1" } as const;
const agent = { actorType: "agent", actorId: "agent-1", agentId: "agent-1" } as const;

verifies("paperclip.seats-summary", () => {
  test("refuses an agent key with 403 before it reads anything", async () => {
    const { deps, settingsRead } = setup();
    const response = await handleSeatsRequest(request(agent), deps);
    expect(response.status).toBe(403);
    expect(settingsRead).toEqual([]);
  });

  test("answers without any seat's folder, account or connection id", async () => {
    const { deps } = setup();
    const response = await handleSeatsRequest(request(board), deps);
    expect(response.status).toBe(200);
    const text = JSON.stringify(response.body);
    for (const hidden of ["/srv/seats", "acme.test", "conn-acme-secret", "configDir"]) {
      expect(text).not.toContain(hidden);
    }
    expect(text).not.toMatch(/account|connectionId|user-1/);
  });

  test("gives labels, window percentages, resets, reaches90At and the proposal", async () => {
    const { deps } = setup();
    const response = await handleSeatsRequest(request(board), deps);
    expect(response.body).toEqual({
      asOf: at,
      seats: [
        {
          id: "seat-a",
          label: "seat-a",
          role: "pool",
          state: "near-limit",
          readAt: "2026-11-24T11:58:00.000Z",
          windows: [
            {
              kind: "five-hour",
              label: "5-hour window",
              usedPercent: 85,
              resetsAt: "2026-11-24T14:00:00.000Z",
              reaches90At: "2026-11-24T12:30:00.000Z",
            },
            {
              kind: "week",
              label: "Week",
              usedPercent: 40,
              resetsAt: "2026-11-27T09:00:00.000Z",
              reaches90At: "2026-11-26T14:00:00.000Z",
            },
          ],
          agents: ["Elena"],
          manualReset: "available",
        },
        {
          id: "seat-b",
          label: "seat-b",
          role: "pool",
          state: "ok",
          readAt: undefined,
          windows: [
            {
              kind: "five-hour",
              label: "5-hour window",
              usedPercent: 10,
              resetsAt: "2026-11-24T16:00:00.000Z",
              reaches90At: undefined,
            },
            {
              kind: "week",
              label: "Week",
              usedPercent: 20,
              resetsAt: "2026-11-28T09:00:00.000Z",
              reaches90At: undefined,
            },
          ],
          agents: [],
          manualReset: "available",
        },
      ],
      proposal: { text: expect.stringContaining("- Elena: seat-a → seat-b"), at },
    });
  });
});
