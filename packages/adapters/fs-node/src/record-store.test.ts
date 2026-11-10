import { createHash } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { mkdir, open, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { foldRecords, type RecordChange, runLockFormat } from "@halonicjs/ports";
import { recordStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, afterEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { FileRecordStore } from "./record-store.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

/** Runs instead of each wait for a held write lock, so no test sleeps. */
const hooks = vi.hoisted(() => ({
  onWait: undefined as (() => Promise<void>) | undefined,
  waits: 0,
}));

vi.mock("node:timers/promises", () => ({
  setTimeout: async () => {
    hooks.waits += 1;
    await hooks.onWait?.();
  },
}));

afterAll(removeTempFolders);
afterEach(() => {
  hooks.onWait = undefined;
  hooks.waits = 0;
});

recordStoreContract("file", async () => new FileRecordStore(join(await tempFolder(), "records")));

/** The log `FileRecordStore` keeps `collection` in. */
function logFor(root: string, collection: string): string {
  return join(root, `${createHash("sha256").update(collection, "utf16le").digest("hex")}.jsonl`);
}

const change = (
  collection: string,
  id: string,
  op: RecordChange["op"],
  values: RecordChange["values"],
  second = 0,
): RecordChange => ({
  at: new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString(),
  collection,
  id,
  op,
  values,
});

const line = (entry: RecordChange): string => `${JSON.stringify(entry)}\n`;

/** A store in a new `records` folder under a temporary folder. */
async function newStore(): Promise<{ root: string; store: FileRecordStore }> {
  const root = join(await tempFolder(), "records");
  return { root, store: new FileRecordStore(root) };
}

/**
 * Makes every `FileHandle.write` take at most `limit` bytes of the part it is
 * asked to write and report success, as a write to a network drive or one cut
 * short by a signal may. The caller restores the returned spy.
 */
async function writeAtMostPerCall(limit: number): Promise<MockInstance<FileHandle["write"]>> {
  const probe = await open(join(await tempFolder(), "probe"), "w");
  const fileHandle: Pick<FileHandle, "write"> = Object.getPrototypeOf(probe);
  await probe.close();
  const write: (this: FileHandle, bytes: Uint8Array) => Promise<unknown> = fileHandle.write;
  function shortWrite(
    this: FileHandle,
    bytes: Uint8Array,
    offset = 0,
    length = bytes.length - offset,
  ) {
    return write.call(this, bytes.subarray(offset, offset + Math.min(length, limit)));
  }
  return vi.spyOn(fileHandle, "write").mockImplementation(shortWrite as FileHandle["write"]);
}

verifies("fs-node.record-store-files", () => {
  describe("the files", () => {
    it("keeps each collection in a log named by its hash, and releases the lock", async () => {
      const { root, store } = await newStore();
      await store.append([change("leads", "1", "add", { name: "Ada" })]);
      await store.append([change("Leads", "1", "add", { name: "Grace" })]);

      expect((await readdir(root)).sort()).toEqual(
        [logFor(root, "leads"), logFor(root, "Leads")].map((file) => file.slice(-70)).sort(),
      );
      expect(await readFile(logFor(root, "leads"), "utf8")).toBe(
        line(change("leads", "1", "add", { name: "Ada" })),
      );
    });

    it("keeps the records when the store is opened again, as after a restart", async () => {
      const { root, store } = await newStore();
      await store.append([change("clerk-notes", "1", "add", { text: "Call Acme on Monday" })]);

      expect(await new FileRecordStore(root).changes("clerk-notes")).toEqual([
        change("clerk-notes", "1", "add", { text: "Call Acme on Monday" }),
      ]);
    });

    it.skipIf(process.platform === "win32")(
      "makes the folder and the logs private to the user",
      async () => {
        const { root, store } = await newStore();
        await store.append([change("leads", "1", "add", { name: "Ada" })]);
        await store.append([change("orders", "a", "add", { total: 1 })]);
        await store.compact("orders");
        expect((await stat(root)).mode & 0o777).toBe(0o700);
        expect((await stat(logFor(root, "leads"))).mode & 0o777).toBe(0o600);
        expect((await stat(logFor(root, "orders"))).mode & 0o777).toBe(0o600);
      },
    );

    it("creates nothing to read or to compact a collection that has no log", async () => {
      const { root, store } = await newStore();
      expect(await store.changes("leads")).toEqual([]);
      await store.append([]);
      await expect(readdir(root)).rejects.toThrow("ENOENT");
      await store.compact("leads");
      expect(await readdir(root)).toEqual([]);
    });
  });

  describe("compacting", () => {
    it("replaces the log, leaving no old value and no temporary file", async () => {
      const { root, store } = await newStore();
      await store.append([
        change("leads", "1", "add", { name: "old-name-of-1" }, 1),
        change("leads", "1", "update", { name: "Ada L." }, 2),
      ]);
      await store.compact("leads");

      expect(await readFile(logFor(root, "leads"), "utf8")).toBe(
        line(change("leads", "1", "seed", { name: "Ada L." }, 2)),
      );
      expect(await readdir(root)).toEqual([logFor(root, "leads").slice(-70)]);
    });

    it("deletes the log when no record is left", async () => {
      const { root, store } = await newStore();
      await store.append([
        change("leads", "1", "add", { name: "Ada" }, 1),
        change("leads", "1", "remove", null, 2),
      ]);
      await store.compact("leads");

      expect(await readdir(root)).toEqual([]);
      expect(await store.changes("leads")).toEqual([]);
    });

    it("loses no change appended while it runs, from another store on the folder", async () => {
      const { root, store } = await newStore();
      await store.append([change("leads", "1", "add", { name: "Ada" }, 1)]);
      const other = new FileRecordStore(root);
      const appends = Array.from({ length: 5 }, (_, index) =>
        other.append([change("leads", `${index + 2}`, "add", { name: `Lead ${index}` }, 2)]),
      );
      await Promise.all([store.compact("leads"), ...appends, store.compact("leads")]);

      expect([...foldRecords(await store.changes("leads")).keys()].sort()).toEqual([
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
      ]);
    });
  });

  describe("crashes and failures", () => {
    it("skips a torn last line, and cuts it off before the next append", async () => {
      const { root, store } = await newStore();
      const whole = line(change("leads", "1", "add", { name: "Ada" }));
      await mkdir(root, { recursive: true });
      await writeFile(logFor(root, "leads"), `${whole}{"at":"2026-01-0`, "utf8");

      expect(await store.changes("leads")).toEqual([change("leads", "1", "add", { name: "Ada" })]);
      const next = change("leads", "2", "add", { name: "Grace" });
      await store.append([next]);
      expect(await readFile(logFor(root, "leads"), "utf8")).toBe(`${whole}${line(next)}`);
    });

    it.each([
      ["a change to another collection", line(change("orders", "a", "add", { total: 1 }))],
      ["text that isn't JSON", "{\n"],
      ["JSON that isn't a change", '{"collection":"leads"}\n'],
    ])("names the file and line when a line holds %s", async (_kind, text) => {
      const { root, store } = await newStore();
      await mkdir(root, { recursive: true });
      await writeFile(logFor(root, "leads"), text, "utf8");

      await expect(store.changes("leads")).rejects.toThrow(
        `Broken record log ${JSON.stringify(logFor(root, "leads"))}, line 1`,
      );
      await expect(store.compact("leads")).rejects.toThrow("line 1");
    });

    it("cuts every log back when an append fails part-way", async () => {
      const { root, store } = await newStore();
      const ada = change("leads", "1", "add", { name: "Ada" });
      await store.append([ada]);
      // A folder where the orders log should be can't be appended to.
      await mkdir(logFor(root, "orders"));

      await expect(
        store.append([
          change("leads", "2", "add", { name: "Grace" }),
          change("orders", "a", "add", { total: 1 }),
        ]),
      ).rejects.toThrow("isn't a plain file");
      expect(await store.changes("leads")).toEqual([ada]);
      expect((await readdir(root)).filter((name) => name.endsWith(".lock"))).toEqual([]);
    });

    it("stores the whole append when the system writes only part of it at a time", async () => {
      const { root, store } = await newStore();
      const shortWrite = await writeAtMostPerCall(10);
      try {
        await store.append([change("leads", "1", "add", { name: "Ada" })]);
        expect(shortWrite.mock.calls.length).toBeGreaterThan(1);
      } finally {
        shortWrite.mockRestore();
      }

      expect(await readFile(logFor(root, "leads"), "utf8")).toBe(
        line(change("leads", "1", "add", { name: "Ada" })),
      );
    });

    it("fails an append the system writes nothing of, and stores none of it", async () => {
      const { root, store } = await newStore();
      await store.append([change("leads", "1", "add", { name: "Ada" })]);
      const noWrite = await writeAtMostPerCall(0);
      try {
        await expect(
          store.append([change("leads", "2", "add", { name: "Grace" })]),
        ).rejects.toThrow(/took none of the last/);
      } finally {
        noWrite.mockRestore();
      }

      expect(await readFile(logFor(root, "leads"), "utf8")).toBe(
        line(change("leads", "1", "add", { name: "Ada" })),
      );
    });

    it("waits while another process holds the write lock", async () => {
      const { root, store } = await newStore();
      await mkdir(root, { recursive: true });
      const lock = join(root, "write.lock");
      const record = { version: runLockFormat, pid: process.pid, host: hostname() };
      await writeFile(lock, JSON.stringify({ ...record, takenAt: new Date().toISOString() }));
      hooks.onWait = () => rm(lock, { force: true });

      await store.append([change("leads", "1", "add", { name: "Ada" })]);
      expect(hooks.waits).toBe(1);
      expect(await store.changes("leads")).toHaveLength(1);
    });
  });
});
