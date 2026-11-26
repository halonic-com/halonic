import { appendFile, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  evaluateWriteAhead,
  Ledger,
  type LedgerInput,
  type LedgerStore,
  verifyChain,
} from "@halonicjs/auto-approvals";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { FileApprovalLedgerStore } from "./approval-ledger-store.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

const digest = {
  sha256: async (data: Uint8Array) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data))),
};

function input(approvalId: string): LedgerInput {
  return {
    approvalId,
    payload: { title: "Hire a designer" },
    comments: [],
    outcome: "no_decision",
    reason: "card.untyped",
  };
}

async function ledgerFile(): Promise<string> {
  return join(await tempFolder(), "auto-approvals", "ledger.jsonl");
}

function ledgerOn(store: LedgerStore): Ledger {
  return new Ledger({ store, digest, clock: fixedClock() });
}

verifies("fs-node.approval-ledger-file", () => {
  describe("FileApprovalLedgerStore", () => {
    it("continues the chain after the store is closed and opened again", async () => {
      const file = await ledgerFile();
      const first = ledgerOn(new FileApprovalLedgerStore(file));
      await first.append(input("a1"));
      await first.append(input("a2"));

      const reopened = new FileApprovalLedgerStore(file);
      const next = await ledgerOn(reopened).append(input("a3"));

      expect(next.index).toBe(2);
      const entries = await new FileApprovalLedgerStore(file).entries();
      expect(entries.map((entry) => entry.approvalId)).toEqual(["a1", "a2", "a3"]);
      expect(await verifyChain(entries, digest)).toEqual({ ok: true });
    });

    it("has no method to change or remove an entry", () => {
      const methods = Object.getOwnPropertyNames(FileApprovalLedgerStore.prototype).sort();
      expect(methods).toEqual(["append", "constructor", "entries", "last"]);
    });

    it("has the entry on disk before the evaluation's result comes back", async () => {
      const file = await ledgerFile();
      const ledger = ledgerOn(new FileApprovalLedgerStore(file));
      const result = await evaluateWriteAhead(ledger, () => input("a1"));
      const lines = (await readFile(file, "utf8")).trim().split("\n");
      expect(result.approvalId).toBe("a1");
      expect(JSON.parse(lines.at(-1) ?? "")).toMatchObject({ approvalId: "a1" });
    });

    it("reads a missing file as an empty ledger", async () => {
      const store = new FileApprovalLedgerStore(await ledgerFile());
      expect(await store.last()).toBeNull();
      expect(await store.entries()).toEqual([]);
    });

    it("keeps the file and its folder private", async () => {
      if (process.platform === "win32") return;
      const file = await ledgerFile();
      await ledgerOn(new FileApprovalLedgerStore(file)).append(input("a1"));
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      expect((await stat(join(file, ".."))).mode & 0o777).toBe(0o700);
    });

    it("cuts a line torn by a crash and goes on from the last whole entry", async () => {
      const file = await ledgerFile();
      await ledgerOn(new FileApprovalLedgerStore(file)).append(input("a1"));
      await appendFile(file, '{"index":1,"previ');

      await ledgerOn(new FileApprovalLedgerStore(file)).append(input("a2"));

      const entries = await new FileApprovalLedgerStore(file).entries();
      expect(entries.map((entry) => entry.index)).toEqual([0, 1]);
      expect(await verifyChain(entries, digest)).toEqual({ ok: true });
    });

    it("lets verifyChain find an entry edited in the file", async () => {
      const file = await ledgerFile();
      const ledger = ledgerOn(new FileApprovalLedgerStore(file));
      for (const id of ["a1", "a2", "a3"]) await ledger.append(input(id));
      const text = await readFile(file, "utf8");
      await writeFile(file, text.replace('"a2"', '"a9"'), "utf8");

      const entries = await new FileApprovalLedgerStore(file).entries();
      expect(await verifyChain(entries, digest)).toEqual({ ok: false, at: 1 });
    });

    it("refuses a whole line that isn't an entry, naming the line", async () => {
      const file = await ledgerFile();
      await ledgerOn(new FileApprovalLedgerStore(file)).append(input("a1"));
      await appendFile(file, "not json\n[1]\n");
      await expect(new FileApprovalLedgerStore(file).entries()).rejects.toThrow(
        /line 2 is not JSON/,
      );
      const other = await ledgerFile();
      await ledgerOn(new FileApprovalLedgerStore(other)).append(input("a1"));
      await appendFile(other, "[1]\n");
      await expect(new FileApprovalLedgerStore(other).last()).rejects.toThrow(
        /line 2 is not an entry/,
      );
    });

    it("refuses a link in the file's place", async () => {
      if (process.platform === "win32") return;
      const target = await ledgerFile();
      await ledgerOn(new FileApprovalLedgerStore(target)).append(input("a1"));
      const link = join(await tempFolder(), "ledger.jsonl");
      await symlink(target, link);
      await expect(new FileApprovalLedgerStore(link).entries()).rejects.toThrow();
    });
  });
});
