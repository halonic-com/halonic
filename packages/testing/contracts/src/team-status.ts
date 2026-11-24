import type { Seat, SpendRange, SpendSummary, TeamStatus } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** Creates a source filled the way the provider under test serves it: with or without the optional fields. */
export type MakeTeamStatus = () => Promise<TeamStatus>;

const ranges: readonly SpendRange[] = ["today", "week", "month"];

/**
 * What is wrong with a seat by the port's rules, or an empty list. A seat
 * with a `failedRead` must be `not-read`: its windows and `asOf` are the last
 * good reading's, so it can't also claim a state that needs a new one.
 */
export function seatContractProblems(seat: Seat): readonly string[] {
  if (seat.failedRead === undefined || seat.state === "not-read") return [];
  return [`seat ${seat.id} has a failedRead but its state is ${seat.state}, not not-read`];
}

/** What is wrong with a spend summary by the port's rules, or an empty list. Run counts are whole and never negative. */
export function spendContractProblems(spend: SpendSummary): readonly string[] {
  const counts = { unpricedRuns: spend.unpricedRuns, unknownSeatRuns: spend.unknownSeatRuns };
  return Object.entries(counts)
    .filter(([, count]) => count !== undefined && !(Number.isInteger(count) && count >= 0))
    .map(([name, count]) => `spend of ${spend.source} has ${name} ${String(count)}`);
}

/**
 * The contract every {@link TeamStatus} passes (requirement
 * `contracts.team-status`): the fake, and the Paperclip provider once it maps
 * the table 1.6 fields. Run it once against a source that serves them and
 * once against one that leaves them out, since both are whole sources.
 */
export function teamStatusContract(name: string, make: MakeTeamStatus): void {
  verifies("contracts.team-status", () => {
    describe(`TeamStatus contract: ${name}`, () => {
      it("gives seats that keep the failedRead rule", async () => {
        const seats = await (await make()).seats();
        expect(seats.flatMap(seatContractProblems)).toEqual([]);
      });

      it("gives spend whose run counts are whole and never negative", async () => {
        const teamStatus = await make();
        for (const range of ranges) {
          const spend = await teamStatus.spend(range);
          expect(spend.flatMap(spendContractProblems)).toEqual([]);
        }
      });
    });
  });
}
