// The contract lives in @halonicjs/testing-contracts, whose code is measured in
// this package's run (its "measuredIn"), so its tests run here.
import type { Seat, SpendSummary } from "@halonicjs/ports";
import {
  FakeTeamStatus,
  seatContractProblems,
  spendContractProblems,
  teamStatusContract,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

teamStatusContract("fake, serving the table 1.6 fields", () => {
  const team = new FakeTeamStatus();
  const acme = team.addSource().source;
  team.setSpend(acme, { range: "today", unpricedRuns: 560, unknownSeatRuns: 3 });
  team.addSeat(acme, {
    label: "Pool 1",
    asOf: "2026-11-24T09:50:00.000Z",
    failedRead: { cause: "rate-limited", at: "2026-11-24T10:00:00.000Z" },
  });
  team.goOffline(acme);
  return Promise.resolve(team);
});

teamStatusContract("fake, an older source without them", () => {
  const team = new FakeTeamStatus();
  const acme = team.addSource().source;
  team.setSpend(acme, { range: "today" });
  team.addSeat(acme, { label: "Pool 1", state: "full" });
  return Promise.resolve(team);
});

const seat: Seat = {
  id: "seat-1",
  source: "source-1",
  label: "Pool 1",
  role: "pool",
  state: "not-read",
  windows: [],
  agents: [],
  manualReset: "none",
  asOf: "2026-11-24T12:20:00.000Z",
  failedRead: { cause: "rate-limited", at: "2026-11-24T12:30:00.000Z" },
};

const spend: SpendSummary = {
  source: "source-1",
  range: "today",
  paid: { cents: 4120, currency: "USD" },
  tokens: { input: 0, cached: 0, output: 0 },
  unpricedRuns: 0,
  asOf: "2026-11-24T12:20:00.000Z",
};

verifies("contracts.team-status", () => {
  it("fails a seat with a failedRead whose state isn't not-read", () => {
    expect(seatContractProblems(seat)).toEqual([]);
    expect(seatContractProblems({ ...seat, state: "ok" })).toEqual([
      "seat seat-1 has a failedRead but its state is ok, not not-read",
    ]);
  });

  it("fails spend whose run counts are negative or not whole", () => {
    expect(spendContractProblems({ ...spend, unknownSeatRuns: 3 })).toEqual([]);
    expect(spendContractProblems({ ...spend, unknownSeatRuns: -1 })).toEqual([
      "spend of source-1 has unknownSeatRuns -1",
    ]);
    expect(spendContractProblems({ ...spend, unpricedRuns: 1.5 })).toEqual([
      "spend of source-1 has unpricedRuns 1.5",
    ]);
  });
});
