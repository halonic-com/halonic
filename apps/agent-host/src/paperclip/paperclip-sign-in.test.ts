import { readFile } from "node:fs/promises";
import { ManualClock, MemoryScheduler } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { PaperclipSignIn, signInLimitMs } from "./paperclip-sign-in.ts";
import { FakeKeyStore, FakeSignInCalls, fakeBoardKey } from "./sign-in-calls.test-helper.ts";
import { signInRequests } from "./sign-in-calls.ts";
import { phraseWordCount, signInPhraseWords } from "./sign-in-phrase.ts";

const connection = { address: "https://paperclip.acme.test", companyId: "acme" };

function setUp() {
  const calls = new FakeSignInCalls();
  const keyStore = new FakeKeyStore();
  const clock = new ManualClock();
  let flow: PaperclipSignIn | undefined;
  const scheduler = new MemoryScheduler(
    { onTimer: async (timer) => flow?.onTimer(timer), onTick: async () => undefined },
    clock,
  );
  flow = new PaperclipSignIn({ calls, keyStore, scheduler, clock });
  return { calls, keyStore, clock, scheduler, flow };
}

verifies("agent-host.paperclip-sign-in", () => {
  describe("PaperclipSignIn", () => {
    it("sends the phrase it gives Studio, and holds the key only in memory", async () => {
      const { calls, keyStore, flow } = setUp();
      const started = await flow.start(connection);
      expect(calls.challenges).toEqual([
        {
          command: started.phrase,
          clientName: "Halonic Studio",
          requestedAccess: "board",
          requestedCompanyId: "acme",
        },
      ]);
      const words = started.phrase.split(" ");
      expect(words).toHaveLength(phraseWordCount);
      for (const word of words) expect(signInPhraseWords).toContain(word);
      expect(started.approvalUrl).toBe(
        "https://paperclip.acme.test/cli-auth/challenge-1?token=challenge-secret",
      );
      expect(JSON.stringify(started)).not.toContain(fakeBoardKey);
      expect(flow.holdsKey(started.signInId)).toBe(true);
      expect(await flow.poll(started.signInId)).toEqual({ status: "pending" });
      expect(keyStore.saved).toEqual([]);
    });

    it("has 256 distinct words, so a phrase carries 32 random bits", () => {
      expect(new Set(signInPhraseWords).size).toBe(256);
    });

    it("stores the key with its connection once a poll says approved", async () => {
      const { calls, keyStore, flow } = setUp();
      const started = await flow.start(connection);
      calls.statuses = ["approved"];
      expect(await flow.poll(started.signInId)).toEqual({
        status: "connected",
        userId: "user-ada",
      });
      expect(keyStore.saved).toEqual([{ ...connection, key: fakeBoardKey }]);
      expect(flow.holdsKey(started.signInId)).toBe(false);
      expect(calls.revoked).toEqual([]);
    });

    it("refuses and revokes a key whose user isn't in the connection's company", async () => {
      const { calls, keyStore, flow } = setUp();
      const started = await flow.start(connection);
      calls.statuses = ["approved"];
      calls.owner = { userId: "user-ada", companyIds: ["globex"] };
      expect(await flow.poll(started.signInId)).toEqual({ status: "wrong-company" });
      expect(keyStore.saved).toEqual([]);
      expect(calls.revoked).toEqual([fakeBoardKey]);
      expect(flow.holdsKey(started.signInId)).toBe(false);
    });

    it("drops the key and cancels the challenge when Studio cancels", async () => {
      const { calls, keyStore, scheduler, flow } = setUp();
      const started = await flow.start(connection);
      expect(await flow.cancel(started.signInId)).toEqual({ status: "cancelled" });
      expect(flow.holdsKey(started.signInId)).toBe(false);
      expect(calls.cancelled).toEqual([{ id: "challenge-1", token: "challenge-secret" }]);
      expect(await scheduler.pending("paperclip-sign-in")).toEqual([]);
      expect(await flow.poll(started.signInId)).toEqual({ status: "unknown" });
      expect(keyStore.saved).toEqual([]);
    });

    it.each(["cancelled", "expired"] as const)(
      "drops the key when a poll says %s",
      async (status) => {
        const { calls, keyStore, flow } = setUp();
        const started = await flow.start(connection);
        calls.statuses = [status];
        expect(await flow.poll(started.signInId)).toEqual({ status });
        expect(flow.holdsKey(started.signInId)).toBe(false);
        expect(keyStore.saved).toEqual([]);
      },
    );

    it("ends as expired through the scheduler's timer after 10 minutes", async () => {
      const { calls, keyStore, clock, scheduler, flow } = setUp();
      const started = await flow.start(connection);
      expect(started.expiresAt).toBe(new Date(clock.now().getTime() + signInLimitMs).toISOString());
      clock.advance(signInLimitMs - 1);
      await scheduler.runDue();
      expect(flow.holdsKey(started.signInId)).toBe(true);
      clock.advance(1);
      await scheduler.runDue();
      expect(flow.holdsKey(started.signInId)).toBe(false);
      expect(calls.cancelled).toHaveLength(1);
      expect(await scheduler.pending("paperclip-sign-in")).toEqual([]);
      expect(keyStore.saved).toEqual([]);
    });

    it("ends as expired on a poll after the limit, even before the timer arrives", async () => {
      const { calls, clock, flow } = setUp();
      const started = await flow.start(connection);
      clock.advance(signInLimitMs);
      calls.statuses = ["approved"];
      expect(await flow.poll(started.signInId)).toEqual({ status: "expired" });
      expect(calls.sent).not.toContain(signInRequests.pollChallenge);
      expect(flow.holdsKey(started.signInId)).toBe(false);
    });

    it("revokes a key approved while Studio cancelled", async () => {
      const { calls, keyStore, flow } = setUp();
      const started = await flow.start(connection);
      let answer: () => void = () => undefined;
      calls.holdNextPoll = (resolve) => {
        answer = resolve;
      };
      calls.statuses = ["approved"];
      const polling = flow.poll(started.signInId);
      await flow.cancel(started.signInId);
      answer();
      expect(await polling).toEqual({ status: "cancelled" });
      expect(calls.revoked).toEqual([fakeBoardKey]);
      expect(keyStore.saved).toEqual([]);
    });

    it("polls once at a time, so an approved key is stored once", async () => {
      const { calls, keyStore, flow } = setUp();
      const started = await flow.start(connection);
      let answer: () => void = () => undefined;
      calls.holdNextPoll = (resolve) => {
        answer = resolve;
      };
      calls.statuses = ["approved", "approved"];
      const first = flow.poll(started.signInId);
      expect(await flow.poll(started.signInId)).toEqual({ status: "pending" });
      answer();
      expect(await first).toEqual({ status: "connected", userId: "user-ada" });
      expect(keyStore.saved).toHaveLength(1);
      expect(calls.revoked).toEqual([]);
    });

    it("revokes an approved key the keychain store couldn't save", async () => {
      const { calls, keyStore, flow } = setUp();
      const started = await flow.start(connection);
      calls.statuses = ["approved"];
      keyStore.failWith = new Error("keychain locked");
      await expect(flow.poll(started.signInId)).rejects.toThrow("keychain locked");
      expect(calls.revoked).toEqual([fakeBoardKey]);
      expect(flow.holdsKey(started.signInId)).toBe(false);
    });

    it("refuses an approval page off the connection's address and cancels the challenge", async () => {
      const { calls, flow } = setUp();
      calls.approvalPath = "//evil.test/cli-auth/challenge-1";
      await expect(flow.start(connection)).rejects.toThrow("outside /cli-auth/");
      expect(calls.cancelled).toHaveLength(1);
    });

    it("sends only requests on its list, none of them to the key routes", async () => {
      const { calls, flow } = setUp();
      const approved = await flow.start(connection);
      calls.statuses = ["approved"];
      calls.owner = { userId: "user-ada", companyIds: ["globex"] };
      await flow.poll(approved.signInId);
      await flow.cancel((await flow.start(connection)).signInId);
      const listed: string[] = Object.values(signInRequests);
      expect(new Set(calls.sent)).toEqual(new Set(listed));
      for (const request of listed) expect(request).not.toContain("board-api-keys");
      for (const file of ["paperclip-sign-in.ts", "sign-in-calls.ts"]) {
        const source = await readFile(new URL(file, import.meta.url), "utf8");
        expect(source).not.toContain("board-api-keys");
      }
    });
  });
});
