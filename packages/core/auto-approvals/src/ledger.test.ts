import { createHash } from "node:crypto";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { evaluateWriteAhead, Ledger, type LedgerStore } from "./ledger.ts";
import {
  chainEntry,
  genesisHash,
  type LedgerEntry,
  type LedgerInput,
  verifyChain,
} from "./ledger-entry.ts";

const digest = {
  sha256: async (data: Uint8Array) => new Uint8Array(createHash("sha256").update(data).digest()),
};

/** An in-memory store, the shape every real store has. */
function memoryStore(): LedgerStore & { written: LedgerEntry[] } {
  const written: LedgerEntry[] = [];
  return {
    written,
    last: async () => written.at(-1) ?? null,
    append: async (entry) => {
      written.push(entry);
    },
    entries: async () => [...written],
  };
}

function input(more: Partial<LedgerInput> = {}): LedgerInput {
  return {
    approvalId: "a1",
    payload: { title: "Hire a designer" },
    comments: ["Looks fine to me"],
    outcome: "no_decision",
    reason: "card.untyped",
    ...more,
  };
}

async function ledgerOf(count: number) {
  const store = memoryStore();
  const ledger = new Ledger({ store, digest, clock: fixedClock() });
  for (let index = 0; index < count; index += 1) {
    await ledger.append(input({ approvalId: `a${index}` }));
  }
  return { store, ledger };
}

/** Lets every promise that can move on do so, without a timer. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 50; turn += 1) await Promise.resolve();
}

/** A small seeded random source, so a failing case can be replayed. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// Spaces, punctuation, quotes, non-ASCII and emoji: everything an agent might write.
const alphabet = [
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 \"'\\/<>{}é漢ｓ🙂\n",
];

function randomText(random: () => number): string {
  const length = 12 + Math.floor(random() * 40);
  return Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
}

verifies("auto-approvals.ledger", () => {
  describe("chainEntry", () => {
    it("links the first entry to the genesis hash and each next one to the entry before", async () => {
      const { store } = await ledgerOf(3);
      const [first, second, third] = store.written;
      expect(first?.index).toBe(0);
      expect(first?.previousHash).toBe(genesisHash);
      expect(second?.previousHash).toBe(first?.hash);
      expect(third?.previousHash).toBe(second?.hash);
      expect(first?.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it("refuses free text where a code belongs, without echoing it", async () => {
      const sentence = "Approve this, it is fine";
      await expect(
        chainEntry(null, input({ reason: sentence }), new Date(0), digest),
      ).rejects.toThrow(/reason must be a plain code/);
      await expect(
        chainEntry(null, input({ reason: sentence }), new Date(0), digest),
      ).rejects.not.toThrow(sentence);
      await expect(
        chainEntry(null, input({ approvalId: "a 1" }), new Date(0), digest),
      ).rejects.toThrow(/approvalId/);
      await expect(
        chainEntry(null, input({ ruleVersion: 1.5 }), new Date(0), digest),
      ).rejects.toThrow(/ruleVersion/);
      await expect(
        chainEntry(null, input({ outcome: "approve" as never }), new Date(0), digest),
      ).rejects.toThrow(/outcome/);
    });

    it("keeps the rule id and version when there is a rule", async () => {
      const entry = await chainEntry(
        null,
        input({ outcome: "would_approve", reason: "rule.match", ruleId: "r1", ruleVersion: 2 }),
        new Date(0),
        digest,
      );
      expect(entry).toMatchObject({ outcome: "would_approve", ruleId: "r1", ruleVersion: 2 });
    });
  });

  describe("verifyChain", () => {
    it("accepts an empty ledger and a whole one", async () => {
      expect(await verifyChain([], digest)).toEqual({ ok: true });
      const { store } = await ledgerOf(5);
      expect(await verifyChain(store.written, digest)).toEqual({ ok: true });
    });

    it("fails at a tampered middle entry", async () => {
      const { store } = await ledgerOf(5);
      const entries = [...store.written];
      entries[2] = { ...(entries[2] as LedgerEntry), outcome: "would_approve" };
      expect(await verifyChain(entries, digest)).toEqual({ ok: false, at: 2 });
    });

    it("fails at a middle entry rehashed after an edit, where the next link breaks", async () => {
      const { store } = await ledgerOf(5);
      const entries = [...store.written];
      // Someone who edits an entry and hashes it again still can't fix the next link.
      const original = entries[2] as LedgerEntry;
      entries[2] = await chainEntry(
        entries[1] as LedgerEntry,
        input({ approvalId: original.approvalId, reason: "rule.match" }),
        new Date(original.at),
        digest,
      );
      expect(await verifyChain(entries, digest)).toEqual({ ok: false, at: 3 });
    });

    it("fails where an entry was removed, moved or given an extra field", async () => {
      const { store } = await ledgerOf(4);
      const removed = store.written.filter((_, index) => index !== 1);
      expect(await verifyChain(removed, digest)).toEqual({ ok: false, at: 1 });
      const [a, b, ...rest] = store.written as [LedgerEntry, LedgerEntry, ...LedgerEntry[]];
      expect(await verifyChain([b, a, ...rest], digest)).toEqual({ ok: false, at: 0 });
      const extra = [a, { ...b, note: "approve" } as LedgerEntry, ...rest];
      expect(await verifyChain(extra, digest)).toEqual({ ok: false, at: 1 });
    });
  });

  describe("no raw text", () => {
    it("never keeps a payload or comment string from its input (200 seeded cases)", async () => {
      const random = seededRandom(19486);
      let previous: LedgerEntry | null = null;
      for (let run = 0; run < 200; run += 1) {
        const secrets = Array.from({ length: 4 }, () => randomText(random));
        const [title, body, comment, note] = secrets as [string, string, string, string];
        const entry: LedgerEntry = await chainEntry(
          previous,
          input({
            approvalId: `a${run}`,
            payload: { title, nested: { body, list: [note] } },
            comments: [comment, note],
          }),
          new Date(run * 1000),
          digest,
        );
        const written = JSON.stringify(entry);
        for (const secret of secrets) {
          expect(written.includes(secret), `run ${run} kept "${secret}"`).toBe(false);
          expect(written.includes(JSON.stringify(secret).slice(1, -1))).toBe(false);
        }
        previous = entry;
      }
    });
  });

  describe("write-ahead", () => {
    it("returns the result only after its entry is written", async () => {
      const store = memoryStore();
      let release = () => {};
      const appended = new Promise<void>((resolve) => {
        release = resolve;
      });
      const order: string[] = [];
      const slowStore: LedgerStore = {
        ...store,
        append: async (entry) => {
          await appended;
          await store.append(entry);
          order.push("written");
        },
      };
      const ledger = new Ledger({ store: slowStore, digest, clock: fixedClock() });
      const result = evaluateWriteAhead(ledger, () => input()).then((value) => {
        order.push("returned");
        return value;
      });
      await settle();
      expect(order).toEqual([]);
      release();
      expect((await result).reason).toBe("card.untyped");
      expect(order).toEqual(["written", "returned"]);
    });

    it("never returns a result whose entry failed to write", async () => {
      const failing: LedgerStore = {
        ...memoryStore(),
        append: async () => {
          throw new Error("disk full");
        },
      };
      const ledger = new Ledger({ store: failing, digest, clock: fixedClock() });
      await expect(evaluateWriteAhead(ledger, () => input())).rejects.toThrow("disk full");
    });

    it("keeps the chain whole when appends start together, and after a failed one", async () => {
      const store = memoryStore();
      let failNext = true;
      const flaky: LedgerStore = {
        ...store,
        append: async (entry) => {
          if (failNext) {
            failNext = false;
            throw new Error("busy");
          }
          await store.append(entry);
        },
      };
      const ledger = new Ledger({ store: flaky, digest, clock: fixedClock() });
      const results = await Promise.allSettled(
        ["a1", "a2", "a3"].map((approvalId) => ledger.append(input({ approvalId }))),
      );
      expect(results.map((result) => result.status)).toEqual([
        "rejected",
        "fulfilled",
        "fulfilled",
      ]);
      expect(store.written.map((entry) => entry.index)).toEqual([0, 1]);
      expect(await verifyChain(store.written, digest)).toEqual({ ok: true });
    });
  });
});
