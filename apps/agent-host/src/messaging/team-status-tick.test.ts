import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryScheduler } from "@halonicjs/adapter-memory";
import { MessagingHub } from "@halonicjs/host-agent-messaging-hub";
import { pollRates, SyncScheduler } from "@halonicjs/host-paperclip-sync";
import type { TeamStatus } from "@halonicjs/ports";
import { FakeAgentMessaging, FakeTeamStatus } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { TeamStatusHub, teamStatusMaxAgeMs, teamStatusTickTimer } from "./team-status-hub.ts";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-team-status-tick-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/**
 * One Paperclip connection that serves messaging and team status, with the
 * messaging poll and the team status tick on one memory scheduler whose clock
 * the test moves.
 */
async function startBoth() {
  let now = Date.parse("2026-11-24T10:00:00.000Z");
  const clock = { now: () => new Date(now) };
  let messagingReads = 0;
  const messaging = Object.assign(new FakeAgentMessaging(), {
    refresh: async () => {
      messagingReads += 1;
    },
  });
  const fake = new FakeTeamStatus({ now: clock.now });
  let seatReads = 0;
  const status: TeamStatus = {
    parts: () => fake.parts(),
    spend: (range) => fake.spend(range),
    agentSpend: (range) => fake.agentSpend(range),
    seats: () => {
      seatReads += 1;
      return fake.seats();
    },
    pullRequests: () => fake.pullRequests(),
    pullRequest: (id) => fake.pullRequest(id),
    mergeQueue: () => fake.mergeQueue(),
    changes: () => fake.changes(),
  };
  const messagingHub = new MessagingHub({
    providers: [{ name: "paperclip:acme", messaging }],
    report: () => {},
  });
  const teamHub = new TeamStatusHub({
    providers: [{ name: "paperclip:acme", status }],
    clock,
    folder: join(folder, "messaging-cache"),
    workspaceRoots: [],
    warn: () => {},
    report: () => {},
  });
  const syncs: SyncScheduler[] = [];
  const every = { windowOpenMs: teamStatusMaxAgeMs, windowClosedMs: teamStatusMaxAgeMs };
  const scheduler = new MemoryScheduler(
    {
      onTimer: async (timer) => {
        for (const sync of syncs) if (await sync.onTimer(timer)) return;
      },
      onTick: async () => {},
    },
    clock,
  );
  syncs.push(
    new SyncScheduler({ scheduler, clock, poll: () => messagingHub.refresh() }),
    new SyncScheduler({
      scheduler,
      clock,
      poll: () => teamHub.refresh(),
      timer: teamStatusTickTimer,
      rates: { ...pollRates, connected: every, down: every },
    }),
  );
  for (const sync of syncs) await sync.start(true);
  const wait = async (ms: number) => {
    now += ms;
    await scheduler.runDue();
  };
  // Both start with a read at once, the first full load; the tests count the reads after it.
  await wait(0);
  return { wait, messagingReads: () => messagingReads, seatReads: () => seatReads };
}

verifies("agent-host.paperclip-polling", () => {
  it("reads a connection's messaging on the 10-second poll, and its team status only on the 5-minute tick", async () => {
    const { wait, messagingReads, seatReads } = await startBoth();

    await wait(10_000);

    expect(messagingReads()).toBe(2);
    expect(seatReads()).toBe(1);
  });
});

verifies("agent-host.team-status-hub", () => {
  it("reads team status on the 5-minute tick through the scheduler", async () => {
    const { wait, seatReads } = await startBoth();

    await wait(teamStatusMaxAgeMs - 1);
    expect(seatReads()).toBe(1);

    await wait(1);
    expect(seatReads()).toBe(2);

    await wait(teamStatusMaxAgeMs);
    expect(seatReads()).toBe(3);
  });
});
