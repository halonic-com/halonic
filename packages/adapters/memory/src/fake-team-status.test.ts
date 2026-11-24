// The fake lives in @halonicjs/testing-contracts, whose code is measured in
// this package's run (its "measuredIn"), so its tests run here.
import { FakeTeamStatus, teamStatusContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

/** A fake with two sources whose clock the test moves by hand. */
function makeFake() {
  let now = new Date("2026-11-24T10:00:00.000Z");
  const team = new FakeTeamStatus({ now: () => now });
  const acme = team.addSource().source;
  const globex = team.addSource({ seats: false }).source;
  return { team, acme, globex, setTime: (iso: string) => (now = new Date(iso)) };
}

/** A fake with a source that serves every part and one that serves no seats. */
function makeFilled() {
  const status = new FakeTeamStatus();
  const acme = status.addSource().source;
  const globex = status.addSource({ seats: false }).source;
  status.setSpend(acme, { range: "month", paid: { cents: 4120, currency: "USD" } });
  status.setSpend(globex, { range: "month" });
  status.addAgentSpend(acme, { agent: "agent-chief", range: "month" });
  status.addSeat(acme, { label: "Pool 1" });
  status.addPullRequest(acme, {
    label: "#12",
    title: "Faster launch",
    webLink: "https://github.com/acme/app/pull/12",
  });
  status.addPullRequest(acme, {
    label: "#13",
    title: "Pointed elsewhere",
    webLink: "https://github.com.evil.io/acme/app/pull/13",
  });
  status.setMergeQueue(acme, { health: "running" });
  return status;
}

teamStatusContract("fake", async () => ({
  status: makeFilled(),
  connectionOrigin: "https://paperclip.acme.test",
}));

verifies("contracts.fake-team-status", () => {
  it("says which parts each source serves and refuses to fill one it doesn't", async () => {
    const { team, acme, globex } = makeFake();

    expect(await team.parts()).toEqual([
      { source: acme, spend: true, seats: true, pullRequests: true },
      { source: globex, spend: true, seats: false, pullRequests: true },
    ]);
    expect(() => team.addSeat(globex, { label: "Pool 1" })).toThrow("doesn't serve seats");
  });

  it("keeps two sources' spend apart, one answer per range", async () => {
    const { team, acme, globex } = makeFake();
    team.setSpend(acme, { range: "today", paid: { cents: 100, currency: "USD" } });
    team.setSpend(acme, { range: "today", paid: { cents: 4120, currency: "USD" } });
    team.setSpend(globex, { range: "today" });
    team.setSpend(acme, { range: "month" });
    team.addAgentSpend(acme, { agent: "agent-chief", range: "week" });

    const today = await team.spend("today");

    expect(today.map((each) => [each.source, each.paid.cents])).toEqual([
      [acme, 4120],
      [globex, 0],
    ]);
    expect(await team.agentSpend("today")).toEqual([]);
    expect((await team.agentSpend("week")).map((each) => each.agent)).toEqual(["agent-chief"]);
  });

  it("lists open pull requests and those that ended in the last 24 hours", async () => {
    const { team, acme } = makeFake();
    team.addPullRequest(acme, { label: "#1", title: "Open" });
    team.addPullRequest(acme, {
      label: "#2",
      title: "Merged",
      state: "merged",
      since: "2026-11-24T08:00:00.000Z",
    });
    team.addPullRequest(acme, {
      label: "#3",
      title: "Closed",
      state: "closed",
      since: "2026-11-21T10:00:00.000Z",
    });
    team.addPullRequest(acme, { label: "#4", title: "Other repo", repo: "site" });

    const lists = await team.pullRequests();

    expect(lists.map((list) => [list.repo, list.asOf])).toEqual([
      ["app", "2026-11-24T10:00:00.000Z"],
      ["site", "2026-11-24T10:00:00.000Z"],
    ]);
    expect(lists[0]?.open.map((each) => each.label)).toEqual(["#1"]);
    expect(lists[0]?.recent.map((each) => each.label)).toEqual(["#2"]);
  });

  it("keeps a GitHub pull request link and drops one isAllowedWebLink refuses", async () => {
    const { team, acme } = makeFake();
    const kept = team.addPullRequest(acme, {
      label: "#1",
      title: "Kept",
      webLink: "https://github.com/acme/app/pull/1",
    });
    const dropped = team.addPullRequest(acme, {
      label: "#2",
      title: "Dropped",
      webLink: "https://github.com.evil.io/acme/app/pull/2",
    });

    expect(kept.webLink).toBe("https://github.com/acme/app/pull/1");
    expect(dropped.webLink).toBeUndefined();
    expect((await team.pullRequest(dropped.id))?.pullRequest.webLink).toBeUndefined();
  });

  it("gives a pull request's timeline, and nothing for an unknown one", async () => {
    const { team, acme } = makeFake();
    const pullRequest = team.addPullRequest(acme, { label: "#1", title: "Search" });
    team.addPullRequestEvent(pullRequest.id, { kind: "check-failed", text: "typecheck" });

    const detail = await team.pullRequest(pullRequest.id);

    expect(detail?.timeline).toEqual([
      { at: "2026-11-24T10:00:00.000Z", kind: "check-failed", text: "typecheck" },
    ]);
    expect(await team.pullRequest("no-such-pull-request")).toBeUndefined();
  });

  it("offline, reads a source as of its last read, and live again once it is back", async () => {
    const { team, acme, setTime } = makeFake();
    team.addSeat(acme, { label: "Pool 1" });
    team.setMergeQueue(acme, { health: "running" });

    setTime("2026-11-24T14:05:00.000Z");
    team.goOffline(acme);
    team.addSeat(acme, { label: "Pool 2" });
    team.setMergeQueue(acme, { health: "stopped" });
    const seats = await team.seats();
    const queues = await team.mergeQueue();

    expect(seats.map((seat) => [seat.label, seat.asOf])).toEqual([
      ["Pool 1", "2026-11-24T10:00:00.000Z"],
    ]);
    expect(queues.map((queue) => queue.health)).toEqual(["running"]);

    team.goOnline(acme);
    expect((await team.seats()).map((seat) => seat.label)).toEqual(["Pool 1", "Pool 2"]);
    expect((await team.mergeQueue()).map((queue) => queue.health)).toEqual(["stopped"]);
  });

  it("tells a reader which source changed", async () => {
    const { team, acme } = makeFake();
    const changes = team.changes()[Symbol.asyncIterator]();

    team.addSeat(acme, { label: "Pool 1" });

    expect(await changes.next()).toEqual({ done: false, value: acme });
    await changes.return?.();
  });
});
