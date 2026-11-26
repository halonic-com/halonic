import { createHash } from "node:crypto";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  approvalRead,
  MemorySource,
  MemoryStore,
  now,
  reasons,
  runnerWith,
} from "./shadow-runner.test-helper.ts";
import { readReasonOf } from "./shadow-source.ts";

const digest = {
  sha256: async (data: Uint8Array) => new Uint8Array(createHash("sha256").update(data).digest()),
};
const runner = runnerWith(digest);

verifies("auto-approvals.shadow-runner", () => {
  describe("ShadowRunner", () => {
    it("records the start, one entry per approval and the finished poll", async () => {
      const store = new MemoryStore();
      const shadow = runner(new MemorySource(), store);
      expect(await shadow.start()).toBeUndefined();
      expect(await shadow.poll()).toEqual({ pending: 1, evaluated: 1 });
      expect(reasons(store)).toEqual(["run.started", "card.untyped", "poll.ran"]);
      expect(store.stored.map((entry) => entry.approvalId)).toEqual(["run", "p1", "run"]);
      expect(store.stored.every((entry) => entry.outcome === "no_decision")).toBe(true);
    });

    it("keeps a spoofed requester in the reason", async () => {
      const source = new MemorySource();
      source.approvals = [approvalRead("p1", { requestedByAgentId: "a2" })];
      const store = new MemoryStore();
      const shadow = runner(source, store);
      await shadow.start();
      await shadow.poll();
      expect(reasons(store)).toContain("card.untyped:requester_mismatch");
    });

    it("polls nothing before it starts", async () => {
      expect(await runner(new MemorySource()).poll()).toMatchObject({ stopped: "run.not_started" });
    });

    it("reads the switches even when nothing is pending", async () => {
      const source = new MemorySource();
      source.approvals = [];
      source.stop = { ...source.stop, locked: false, companyId: "c2" };
      const store = new MemoryStore();
      const shadow = runner(source, store);
      await shadow.start();
      expect(await shadow.poll()).toEqual({
        pending: 0,
        evaluated: 0,
        stopped: "stop.wrong_document",
      });
    });

    it.each([
      [
        "no server time",
        (source: MemorySource) => (source.time = undefined),
        "read.no_server_time",
      ],
      [
        "a broken server time",
        (source: MemorySource) => (source.time = new Date("x")),
        "read.no_server_time",
      ],
      [
        "a clock 3 minutes off",
        (source: MemorySource) => (source.time = new Date(now.getTime() + 180_000)),
        "clock.skew",
      ],
      [
        "a read failure with a code",
        (source: MemorySource) => (source.failure = { shadowReason: "read.status" }),
        "read.status",
      ],
      [
        "a read failure without one",
        (source: MemorySource) => (source.failure = new Error("boom")),
        "read.failed",
      ],
    ])("stops the poll on %s", async (_, arrange, reason) => {
      const source = new MemorySource();
      arrange(source);
      const store = new MemoryStore();
      const shadow = runner(source, store);
      await shadow.start();
      expect((await shadow.poll()).stopped).toBe(reason);
      expect(reasons(store)).toEqual(["run.started", reason]);
      expect(shadow.halted()).toBeUndefined();
    });

    it("stops a poll with more pending approvals than its limit", async () => {
      const source = new MemorySource();
      source.approvals = Array.from({ length: 501 }, (_, index) => approvalRead(`p${index}`));
      const shadow = runner(source);
      await shadow.start();
      expect(await shadow.poll()).toEqual({
        pending: 501,
        evaluated: 0,
        stopped: "read.too_large",
      });
    });

    it("backs off on 429 up to an hour, and resets after a good poll", async () => {
      const source = new MemorySource();
      const shadow = runner(source);
      await shadow.start();
      source.failure = { shadowReason: "read.rate_limited" };
      const delays = [];
      for (let poll = 0; poll < 5; poll += 1) {
        await shadow.poll();
        delays.push(shadow.nextDelayMs() / 60_000);
      }
      expect(delays).toEqual([10, 20, 40, 60, 60]);
      source.failure = undefined;
      await shadow.poll();
      expect(shadow.nextDelayMs()).toBe(5 * 60_000);
    });

    it("halts for good once its source refused a request", async () => {
      const source = new MemorySource();
      const store = new MemoryStore();
      const shadow = runner(source, store);
      await shadow.start();
      source.calls = { sent: 3, refused: 1, refusedNotGet: 1, writesSent: 0 };
      expect((await shadow.poll()).stopped).toBe("guard.refused");
      expect((await shadow.poll()).stopped).toBe("guard.refused");
      expect(reasons(store).at(-1)).toBe("guard.refused");
      expect(shadow.halted()).toBe("guard.refused");
    });

    it("halts for good when a refusal ends the poll as a failed read", async () => {
      const source = new MemorySource();
      const store = new MemoryStore();
      const shadow = runner(source, store);
      await shadow.start();
      // The refused fetch reaches the runner as a read failure, before the poll can finish.
      source.failure = { shadowReason: "read.refused" };
      source.calls = { sent: 0, refused: 1, refusedNotGet: 1, writesSent: 0 };
      expect((await shadow.poll()).stopped).toBe("guard.refused");
      expect(shadow.halted()).toBe("guard.refused");
      expect(reasons(store).at(-1)).toBe("guard.refused");
    });

    it("halts when the ledger can't take an entry, and evaluates nothing more", async () => {
      const store = new MemoryStore();
      const shadow = runner(new MemorySource(), store);
      await shadow.start();
      store.refuse = true;
      expect(await shadow.poll()).toEqual({
        pending: 1,
        evaluated: 0,
        stopped: "ledger.write_failed",
      });
      expect(shadow.halted()).toBe("ledger.write_failed");
    });

    it("halts at start on a broken chain, a missing digest head or a failed write", async () => {
      const store = new MemoryStore();
      const first = runner(new MemorySource(), store);
      await first.start();
      const head = store.stored.at(-1)?.hash;
      const broken = new MemoryStore();
      broken.stored = store.stored.map((entry) => ({ ...entry, reason: "card.touched" }));
      expect(await runner(new MemorySource(), broken).start()).toBe("ledger.chain_broken");
      expect(await runner(new MemorySource()).start(head)).toBe("ledger.head_mismatch");
      const full = new MemoryStore();
      full.refuse = true;
      expect(await runner(new MemorySource(), full).start()).toBe("ledger.write_failed");
      expect(await runner(new MemorySource(), store).start(head)).toBeUndefined();
    });

    it("hashes no payload it couldn't read", async () => {
      const source = new MemorySource();
      source.approvals = [approvalRead("p1", { payload: { big: 1n } })];
      const store = new MemoryStore();
      const shadow = runner(source, store);
      await shadow.start();
      await shadow.poll();
      expect(reasons(store)).toEqual(["run.started", "card.unreadable_payload", "poll.ran"]);
    });
  });

  describe("readReasonOf", () => {
    it("gives a read code, and read.failed for anything else, never a message", () => {
      expect(readReasonOf({ shadowReason: "read.incomplete" })).toBe("read.incomplete");
      expect(readReasonOf({ shadowReason: "read.status and approve" })).toBe("read.failed");
      expect(readReasonOf({ shadowReason: 7 })).toBe("read.failed");
      expect(readReasonOf(new Error("read.status"))).toBe("read.failed");
      expect(readReasonOf(null)).toBe("read.failed");
    });
  });
});
