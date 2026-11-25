import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MessagingFailure } from "@halonicjs/host-agent-messaging-hub";
import type { MessagingId, TeamStatus } from "@halonicjs/ports";
import { FakeTeamStatus } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TeamStatusHub } from "./team-status-hub.ts";

const testKey = "pcp_board_acme-test-key-0000";

/**
 * A provider as the Paperclip one behaves, over the fake: it counts each
 * call, hangs its request (with its key in an `Authorization` header and a
 * cookie) on every answer, and throws while its line is cut.
 */
function keyedProvider(fake: FakeTeamStatus) {
  const calls: string[] = [];
  const line = { cut: false };
  const request = { headers: { Authorization: `Bearer ${testKey}`, Cookie: `sid=${testKey}` } };
  const read =
    <Item extends object>(name: string, list: () => Promise<readonly Item[]>) =>
    async () => {
      calls.push(name);
      if (line.cut) throw new Error("fetch failed");
      return (await list()).map((item) => ({ ...item, request, key: testKey }));
    };
  const status: TeamStatus = {
    parts: read("parts", () => fake.parts()),
    spend: (range) => read("spend", () => fake.spend(range))(),
    agentSpend: (range) => read("agentSpend", () => fake.agentSpend(range))(),
    seats: read("seats", () => fake.seats()),
    pullRequests: read("pullRequests", () => fake.pullRequests()),
    pullRequest: (id) => fake.pullRequest(id),
    mergeQueue: read("mergeQueue", () => fake.mergeQueue()),
    changes: () => fake.changes(),
  };
  return { status, line, calls: (name: string) => calls.filter((each) => each === name).length };
}

async function filesUnder(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

verifies("agent-host.team-status-hub", () => {
  describe("TeamStatusHub", () => {
    let folder: string;
    let now: number;
    let fake: FakeTeamStatus;
    let provider: ReturnType<typeof keyedProvider>;
    let failures: MessagingFailure[];
    let source: MessagingId;

    const clock = { now: () => new Date(now) };
    const hubOver = (providers: { name: string; status: TeamStatus }[]) =>
      new TeamStatusHub({
        providers,
        clock,
        folder: join(folder, "app-data", "messaging-cache"),
        workspaceRoots: [join(folder, "acme-workspace")],
        warn: (message) => {
          throw new Error(`unexpected cache warning: ${message}`);
        },
        report: (failure) => failures.push(failure),
      });
    const wait = (ms: number) => {
      now += ms;
    };

    beforeEach(async () => {
      folder = await mkdtemp(join(tmpdir(), "halonic-team-status-"));
      now = Date.parse("2026-11-24T14:02:00.000Z");
      fake = new FakeTeamStatus({ now: clock.now });
      provider = keyedProvider(fake);
      failures = [];
      source = fake.addSource().source;
      fake.addSeat(source, { label: "Pool 1" });
    });

    afterEach(async () => {
      await rm(folder, { recursive: true, force: true });
    });

    it("asks the provider once for reads within a minute, together or one after another", async () => {
      const hub = hubOver([{ name: "paperclip:acme", status: provider.status }]);

      await Promise.all([hub.seats(), hub.seats(), hub.seats()]);
      for (let read = 0; read < 6; read += 1) {
        wait(10_000);
        expect((await hub.seats()).map((seat) => seat.label)).toEqual(["Pool 1"]);
      }

      expect(provider.calls("seats")).toBe(1);
    });

    it("asks again when the answer is 5 minutes old", async () => {
      const hub = hubOver([{ name: "paperclip:acme", status: provider.status }]);
      await hub.seats();

      wait(5 * 60_000 - 1);
      await hub.seats();
      expect(provider.calls("seats")).toBe(1);

      wait(1);
      await hub.seats();
      expect(provider.calls("seats")).toBe(2);
    });

    it("asks a provider that stopped answering at most once a minute, and answers with its last seats", async () => {
      const hub = hubOver([{ name: "paperclip:acme", status: provider.status }]);
      await hub.seats();
      provider.line.cut = true;
      wait(5 * 60_000);

      for (let read = 0; read < 6; read += 1) {
        expect((await hub.seats()).map((seat) => [seat.asOf, seat.fromCache])).toEqual([
          ["2026-11-24T14:02:00.000Z", true],
        ]);
        wait(10_000);
      }
      await hub.seats();

      expect(provider.calls("seats")).toBe(3);
      expect(failures.map((failure) => [failure.provider, failure.action])).toEqual([
        ["paperclip:acme", "seats"],
        ["paperclip:acme", "seats"],
      ]);
    });

    it("answers from the cache, as of the source's last read, after a restart while offline", async () => {
      await hubOver([{ name: "paperclip:acme", status: provider.status }]).seats();
      provider.line.cut = true;
      wait(90 * 60_000);

      const restarted = hubOver([{ name: "paperclip:acme", status: provider.status }]);
      const seats = await restarted.seats();

      expect(seats.map((seat) => [seat.label, seat.asOf, seat.fromCache])).toEqual([
        ["Pool 1", "2026-11-24T14:02:00.000Z", true],
      ]);
    });

    it("leaves fromCache out of a live answer, even one a provider marked, and again once the line is back", async () => {
      const marked: TeamStatus = {
        ...provider.status,
        seats: async () =>
          (await provider.status.seats()).map((seat) => ({ ...seat, fromCache: true })),
      };
      const hub = hubOver([{ name: "paperclip:acme", status: marked }]);
      expect((await hub.seats()).map((seat) => seat.fromCache)).toEqual([undefined]);

      provider.line.cut = true;
      wait(5 * 60_000);
      expect((await hub.seats()).map((seat) => seat.fromCache)).toEqual([true]);

      provider.line.cut = false;
      wait(60_000);
      expect((await hub.seats()).map((seat) => seat.fromCache)).toEqual([undefined]);
    });

    it("keeps a seat's failedRead and the spend's unknownSeatRuns, live and from the cache", async () => {
      const failedRead = { cause: "rate-limited", at: "2026-11-24T14:00:00.000Z" } as const;
      fake.addSeat(source, { label: "Pool 2", failedRead });
      fake.setSpend(source, { range: "today", unknownSeatRuns: 3 });
      await hubOver([{ name: "paperclip:acme", status: provider.status }]).refresh();
      provider.line.cut = true;
      const restarted = hubOver([{ name: "paperclip:acme", status: provider.status }]);

      const seats = await restarted.seats();
      expect(seats.map((seat) => [seat.label, seat.failedRead])).toEqual([
        ["Pool 1", undefined],
        ["Pool 2", failedRead],
      ]);
      const spend = await restarted.spend("today");
      expect(spend.map((each) => [each.unknownSeatRuns, each.fromCache])).toEqual([[3, true]]);
    });

    it("joins the providers, leaves out one that fails, and fails only when none has an answer", async () => {
      const other = new FakeTeamStatus({ now: clock.now, idPrefix: "other" });
      other.addSeat(other.addSource().source, { label: "Reserve" });
      const broken = keyedProvider(other);
      broken.line.cut = true;
      const hub = hubOver([
        { name: "paperclip:acme", status: provider.status },
        { name: "paperclip:other", status: broken.status },
      ]);

      expect((await hub.seats()).map((seat) => seat.label)).toEqual(["Pool 1"]);
      expect(failures.map((failure) => failure.provider)).toEqual(["paperclip:other"]);

      provider.line.cut = true;
      await expect(hub.pullRequests()).rejects.toThrow(
        "Every team status provider failed pull-requests.",
      );
    });

    it("fetches an agent's spend and a pull request's detail on every request", async () => {
      const pull = fake.addPullRequest(source, { label: "#12", title: "Fix the acme login" });
      fake.addAgentSpend(source, { agent: "acme-agent", range: "today" });
      const hub = hubOver([{ name: "paperclip:acme", status: provider.status }]);

      await hub.agentSpend("today");
      expect(await hub.agentSpend("today")).toHaveLength(1);
      expect((await hub.pullRequest(pull.id))?.pullRequest.label).toBe("#12");
      expect(await hub.pullRequest("acme-unknown")).toBeUndefined();

      expect(provider.calls("agentSpend")).toBe(2);
    });

    it("keeps no key, header, cookie or request in its answers or its cache files", async () => {
      fake.setSpend(source, { range: "today" });
      fake.addPullRequest(source, { label: "#12", title: "Fix the acme login" });
      fake.setMergeQueue(source);
      const hub = hubOver([{ name: "paperclip:acme", status: provider.status }]);

      await hub.refresh();
      const answers = JSON.stringify([await hub.seats(), await hub.pullRequests()]);

      const files = await filesUnder(join(folder, "app-data"));
      expect(files).toHaveLength(5);
      for (const text of [
        answers,
        ...(await Promise.all(files.map((file) => readFile(file, "utf8")))),
      ]) {
        expect(text).not.toContain(testKey);
        expect(text).not.toContain("Authorization");
        expect(text).not.toContain("Cookie");
        expect(text).not.toContain("request");
      }
      expect(answers).toContain("Fix the acme login");
    });
  });
});
