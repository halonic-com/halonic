import {
  isAllowedWebLink,
  type MessagingId,
  type PullRequest,
  type TeamStatus,
  type TeamStatusParts,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** What the suite needs from a provider under test. */
export interface TeamStatusHarness {
  /**
   * The provider, already holding, in at least one source that serves every
   * part, a month's spend, a seat, an open pull request and a merge queue,
   * and at least one source that serves only some parts.
   */
  status: TeamStatus;
  /** The connection's Paperclip origin, which its web links may point at. */
  connectionOrigin: string;
}

/** Creates a provider for one test, filled as {@link TeamStatusHarness} says. */
export type MakeTeamStatus = () => Promise<TeamStatusHarness>;

/**
 * The contract every {@link TeamStatus} passes: the fake now, the Paperclip
 * provider (on recorded routes) next. It needs no network of its own.
 */
export function teamStatusContract(name: string, make: MakeTeamStatus): void {
  verifies("contracts.team-status", () => {
    describe(`TeamStatus contract: ${name}`, () => {
      it("names each source once, and every answer comes from a listed source that serves its part", async () => {
        const { status } = await make();
        const parts = await status.parts();
        const serving = (part: keyof Omit<TeamStatusParts, "source">) =>
          new Set(parts.filter((each) => each[part]).map((each) => each.source));

        expect(new Set(parts.map((each) => each.source)).size).toBe(parts.length);
        expect(parts.some((each) => each.spend && each.seats && each.pullRequests)).toBe(true);
        expect(parts.some((each) => !(each.spend && each.seats && each.pullRequests))).toBe(true);
        expectWithin(await status.spend("month"), serving("spend"));
        expectWithin(await status.agentSpend("month"), serving("spend"));
        expectWithin(await status.seats(), serving("seats"));
        expectWithin(await status.pullRequests(), serving("pullRequests"));
        expectWithin(await status.mergeQueue(), serving("pullRequests"));
      });

      it("gives the range it was asked for, and says as of when", async () => {
        const { status } = await make();
        const month = await status.spend("month");
        const answers = [...month, ...(await status.seats()), ...(await status.pullRequests())];

        expect(month.length).toBeGreaterThan(0);
        expect(month.every((each) => each.range === "month")).toBe(true);
        expect((await status.spend("today")).every((each) => each.range === "today")).toBe(true);
        for (const answer of [...answers, ...(await status.mergeQueue())]) {
          expect(Number.isNaN(Date.parse(answer.asOf)), answer.asOf).toBe(false);
        }
      });

      it("finds each open pull request with its timeline, and nothing for an ID it never gave", async () => {
        const { status } = await make();
        const open = (await status.pullRequests()).flatMap((list) => list.open);

        expect(open.length).toBeGreaterThan(0);
        for (const pullRequest of open) {
          const detail = await status.pullRequest(pullRequest.id);
          expect(detail?.pullRequest.id).toBe(pullRequest.id);
          expect(Array.isArray(detail?.timeline)).toBe(true);
        }
        expect(await status.pullRequest("never-given")).toBeUndefined();
      });

      it("gives only web links the link check allows", async () => {
        const { status, connectionOrigin } = await make();
        const lists = await status.pullRequests();
        const all: PullRequest[] = lists.flatMap((list) => [...list.open, ...list.recent]);

        for (const { webLink } of all) {
          if (webLink !== undefined)
            expect(isAllowedWebLink(webLink, connectionOrigin), webLink).toBe(true);
        }
      });

      it("keeps a seat to its label, without its account, login folder or connection", async () => {
        const { status } = await make();
        const seats = await status.seats();

        expect(seats.length).toBeGreaterThan(0);
        for (const field of ["account", "configDir", "connectionId"]) {
          expect(
            seats.filter((seat) => field in seat),
            field,
          ).toEqual([]);
        }
      });
    });
  });
}

/** Every item comes from one of these sources. */
function expectWithin(items: readonly { source: MessagingId }[], sources: Set<MessagingId>): void {
  for (const item of items) expect(sources.has(item.source), item.source).toBe(true);
}
