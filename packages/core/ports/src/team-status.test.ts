import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { MessagingId, PullRequestDetail, Seat, SpendRange, TeamStatus } from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const seat: Seat = {
  id: "seat-1",
  source: "source-1",
  label: "Pool 1",
  role: "pool",
  state: "near-limit",
  windows: [{ kind: "five-hour", label: "5 hours", usedPercent: 84 }],
  agents: ["agent-1"],
  manualReset: "available",
  asOf: "2026-11-24T13:00:00.000Z",
};

verifies("ports.team-status", () => {
  typeTest("has reads only, and no write of any kind", () => {
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
    expectTypeOf<TeamStatus["pullRequest"]>().parameters.toEqualTypeOf<[id: MessagingId]>();
    expectTypeOf<TeamStatus["pullRequest"]>().returns.toEqualTypeOf<
      Promise<PullRequestDetail | undefined>
    >();
    expectTypeOf<TeamStatus["changes"]>().returns.toEqualTypeOf<AsyncIterable<MessagingId>>();
  });

  it("names a seat by its label, never its account, login folder or connection", () => {
    // @ts-expect-error: a seat has no account
    const withAccount: Seat = { ...seat, account: "pool-1" };
    // @ts-expect-error: a seat has no login folder
    const withFolder: Seat = { ...seat, configDir: "seats/pool-1" };
    // @ts-expect-error: a seat has no connection
    const withConnection: Seat = { ...seat, connectionId: "connection-1" };
    expect([withAccount, withFolder, withConnection]).toHaveLength(3);
    expect(Object.keys(seat)).not.toContain("account");
  });

  it("says as of when the source made each answer", () => {
    // @ts-expect-error: every seat says as of when
    const undated: Seat = { ...seat, asOf: undefined };
    expect(undated).toBeDefined();
    expect(seat.asOf).toBe("2026-11-24T13:00:00.000Z");
  });
});
