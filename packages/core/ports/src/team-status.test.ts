import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type {
  MessagingId,
  PullRequestDetail,
  Seat,
  SpendRange,
  SpendSummary,
  TeamStatus,
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
});
