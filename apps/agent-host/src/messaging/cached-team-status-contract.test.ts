import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SpendRange, TeamStatus } from "@halonicjs/ports";
import { FakeTeamStatus, teamStatusContract } from "@halonicjs/testing-contracts";
import { afterAll } from "vitest";
import { TeamStatusHub } from "./team-status-hub.ts";

const folders: string[] = [];
const spendRanges: readonly SpendRange[] = ["today", "week", "month"];

afterAll(async () => {
  await Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true })));
});

/**
 * A hub restarted while its one provider is offline, so every answer comes
 * from the cache file the first hub saved: the cached source must keep the
 * port's rules as the live one does (requirement `agent-host.team-status-hub`).
 */
async function cachedHub(): Promise<TeamStatus> {
  const folder = await mkdtemp(join(tmpdir(), "halonic-cached-team-status-"));
  folders.push(folder);
  const team = new FakeTeamStatus();
  const acme = team.addSource().source;
  team.setSpend(acme, { range: "today", unpricedRuns: 560, unknownSeatRuns: 3 });
  team.addSeat(acme, {
    label: "Pool 1",
    asOf: "2026-11-24T09:50:00.000Z",
    failedRead: { cause: "rate-limited", at: "2026-11-24T10:00:00.000Z" },
  });
  const line = { cut: false };
  const online = <Item>(read: () => Promise<Item>) =>
    line.cut ? Promise.reject(new Error("fetch failed")) : read();
  const status: TeamStatus = {
    parts: () => online(() => team.parts()),
    spend: (range) => online(() => team.spend(range)),
    seats: () => online(() => team.seats()),
    agentSpend: (range) => team.agentSpend(range),
    pullRequests: () => team.pullRequests(),
    pullRequest: (id) => team.pullRequest(id),
    mergeQueue: () => team.mergeQueue(),
    changes: () => team.changes(),
  };
  const hubOf = () =>
    new TeamStatusHub({
      providers: [{ name: "paperclip:acme", status }],
      clock: { now: () => new Date("2026-11-24T10:05:00.000Z") },
      folder: join(folder, "app-data", "messaging-cache"),
      workspaceRoots: [join(folder, "acme-workspace")],
      warn: (message) => {
        throw new Error(`unexpected cache warning: ${message}`);
      },
      report: () => undefined,
    });
  const first = hubOf();
  // The contract reads every range, so the first hub reads each into the cache.
  await Promise.all(spendRanges.map((range) => first.spend(range)));
  await first.refresh();
  line.cut = true;
  return hubOf();
}

teamStatusContract("agent-host hub, served from its cache", cachedHub);
