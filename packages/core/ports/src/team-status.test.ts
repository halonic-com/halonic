import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  type AgentDetail,
  type MessagingId,
  type PullRequestDetail,
  type Seat,
  type SpendRange,
  type SpendSummary,
  type TeamStatus,
  teamStatusVersion,
} from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const seat: Seat = {
  id: "seat-1",
  source: "source-1",
  label: "Pool 1",
  role: "pool",
  state: "ok",
  windows: [{ kind: "five-hour", label: "5 hours", usedPercent: 40 }],
  agents: [],
  manualReset: "none",
  asOf: "2026-11-24T13:00:00.000Z",
};

verifies("ports.team-status", () => {
  typeTest("has only reads and changes, and no write", () => {
    expectTypeOf<keyof TeamStatus>().toEqualTypeOf<
      | "parts"
      | "spend"
      | "agentSpend"
      | "seats"
      | "pullRequests"
      | "pullRequest"
      | "mergeQueue"
      | "agent"
      | "runs"
      | "changes"
    >();
    expectTypeOf<TeamStatus["spend"]>().parameters.toEqualTypeOf<[range: SpendRange]>();
    expectTypeOf<TeamStatus["spend"]>().returns.toEqualTypeOf<Promise<readonly SpendSummary[]>>();
    expectTypeOf<TeamStatus["pullRequest"]>().returns.toEqualTypeOf<
      Promise<PullRequestDetail | undefined>
    >();
    expectTypeOf<TeamStatus["changes"]>().returns.toEqualTypeOf<AsyncIterable<MessagingId>>();
  });

  it("names a seat by its label, never its account, login folder or connection", () => {
    // @ts-expect-error: a seat has no account
    const withAccount: Seat = { ...seat, account: "pool-1@acme.test" };
    // @ts-expect-error: a seat has no login folder
    const withFolder: Seat = { ...seat, configDir: "/acme/pool-1" };
    // @ts-expect-error: a seat has no connection
    const withConnection: Seat = { ...seat, connectionId: "connection-1" };
    expect(seat.label).toBe("Pool 1");
    expect([withAccount, withFolder, withConnection]).toHaveLength(3);
  });

  it("says as of when the source made each answer", () => {
    const { asOf: _asOf, ...undated } = seat;
    // @ts-expect-error: every answer carries its source's time
    const unknownAge: Seat = undated;
    expect(unknownAge).toBeDefined();
  });

  it("keeps the table 1.6 fields optional, so an older source is still whole", () => {
    const spend: SpendSummary = {
      source: "source-1",
      range: "today",
      paid: { cents: 4120, currency: "USD" },
      tokens: { input: 0, cached: 0, output: 0 },
      unpricedRuns: 0,
      asOf: "2026-11-24T13:00:00.000Z",
    };
    expect(seat.failedRead).toBeUndefined();
    expect(seat.fromCache).toBeUndefined();
    expect(spend.unknownSeatRuns).toBeUndefined();
    expect(teamStatusVersion).toBe(1);
  });

  it("names why a seat's newest reading failed, beside its last good reading", () => {
    const rateLimited: Seat = {
      ...seat,
      state: "not-read",
      asOf: "2026-11-24T12:20:00.000Z",
      failedRead: { cause: "rate-limited", at: "2026-11-24T12:30:00.000Z" },
      fromCache: true,
    };
    const unknownCause: Seat = {
      ...rateLimited,
      // @ts-expect-error: a cause the port doesn't name reads as `other`
      failedRead: { cause: "timed-out", at: "2026-11-24T12:30:00.000Z" },
    };
    expect(rateLimited.windows).toEqual(seat.windows);
    expect(unknownCause).toBeDefined();
  });
});

verifies("ports.team-status-agent-detail", () => {
  typeTest("has an optional agent read that takes an ID and a range", () => {
    expectTypeOf<TeamStatus["agent"]>().toEqualTypeOf<
      ((id: MessagingId, range: SpendRange) => Promise<AgentDetail | undefined>) | undefined
    >();
    expectTypeOf<Omit<TeamStatus, "agent">>().toMatchTypeOf<TeamStatus>();
  });

  it("keeps every detail field optional", () => {
    const bare: AgentDetail = { asOf: "2026-11-24T13:00:00.000Z" };
    expect(bare.seatNow).toBeUndefined();
    expect(teamStatusVersion).toBe(1);
  });

  it("names who moved an agent and why runs failed only by closed lists", () => {
    const detail: AgentDetail = {
      asOf: "2026-11-24T13:00:00.000Z",
      seatNow: { seat: "seat-1", since: "2026-11-24T09:00:00.000Z", movedBy: "seat-supervisor" },
      seatHistory: [
        { seat: "seat-2", from: "2026-11-23T09:00:00.000Z", to: "2026-11-24T09:00:00.000Z" },
      ],
      runs: { total: 12, failedByCause: [{ cause: "time-out", count: 2 }] },
      produced: { pullRequestsMerged: 3, tasksDone: 4 },
    };
    const byLogin: AgentDetail = {
      ...detail,
      // @ts-expect-error: a mover is never a login or a name
      seatNow: { seat: "seat-1", since: "2026-11-24T09:00:00.000Z", movedBy: "acme-admin" },
    };
    const unknownCause: AgentDetail = {
      ...detail,
      // @ts-expect-error: a cause the port doesn't name reads as `other`
      runs: { total: 1, failedByCause: [{ cause: "out-of-memory", count: 1 }] },
    };
    expect([byLogin, unknownCause]).toHaveLength(2);
  });
});

verifies("ports.team-status-seat-detail", () => {
  it("keeps the seat detail fields optional, and still has no account", () => {
    const detailed: Seat = {
      ...seat,
      agentShares: [{ agent: "agent-1", weekPercent: 60 }],
      plan: "Max",
      manualResetGroup: "Pool A",
      webLink: "https://paperclip.acme.test/seats/seat-1",
    };
    // @ts-expect-error: a seat has no account
    const withAccount: Seat = { ...detailed, account: "pool-1@acme.test" };
    expect(seat.plan).toBeUndefined();
    expect(withAccount).toBeDefined();
    expect(teamStatusVersion).toBe(1);
  });
});
