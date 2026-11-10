import { createHash } from "node:crypto";
import { constants } from "node:fs";
import type * as fsPromises from "node:fs/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RecordChange } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it, vi } from "vitest";
import { FileRecordStore } from "./record-store.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

/**
 * Makes every file opened to append refuse `truncate` with `EPERM`, as on
 * Windows, where such a file may only be added to (HAL-4361). This runs the
 * Windows behaviour on every system, so a cut through the append's handle
 * fails here and not only in CI's Windows job.
 */
vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof fsPromises>();
  async function open(...args: Parameters<typeof original.open>) {
    const handle = await original.open(...args);
    const [, flags] = args;
    if (typeof flags === "number" && (flags & constants.O_APPEND) !== 0) {
      handle.truncate = async () => {
        throw Object.assign(new Error("EPERM: operation not permitted, ftruncate"), {
          code: "EPERM",
        });
      };
    }
    return handle;
  }
  return { ...original, open };
});

afterAll(removeTempFolders);

/** The log `FileRecordStore` keeps `collection` in. */
function logFor(root: string, collection: string): string {
  return join(root, `${createHash("sha256").update(collection, "utf16le").digest("hex")}.jsonl`);
}

const change = (id: string, name: string): RecordChange => ({
  at: new Date(Date.UTC(2026, 0, 1)).toISOString(),
  collection: "leads",
  id,
  op: "add",
  values: { name },
});

const line = (entry: RecordChange): string => `${JSON.stringify(entry)}\n`;

verifies("fs-node.record-store-files", () => {
  describe("a system where a file opened to append can't be cut, as Windows", () => {
    it("appends", async () => {
      const root = join(await tempFolder(), "records");
      const store = new FileRecordStore(root);
      await store.append([change("1", "Ada")]);
      await store.append([change("2", "Grace")]);

      expect(await readFile(logFor(root, "leads"), "utf8")).toBe(
        `${line(change("1", "Ada"))}${line(change("2", "Grace"))}`,
      );
    });

    it("cuts off a torn last line before the next append", async () => {
      const root = join(await tempFolder(), "records");
      await mkdir(root, { recursive: true });
      await writeFile(logFor(root, "leads"), `${line(change("1", "Ada"))}{"at":"2026-01-0`);

      await new FileRecordStore(root).append([change("2", "Grace")]);
      expect(await readFile(logFor(root, "leads"), "utf8")).toBe(
        `${line(change("1", "Ada"))}${line(change("2", "Grace"))}`,
      );
    });

    it("cuts every log back when an append fails part-way", async () => {
      const root = join(await tempFolder(), "records");
      const store = new FileRecordStore(root);
      await store.append([change("1", "Ada")]);
      // A folder where the orders log should be can't be appended to.
      await mkdir(logFor(root, "orders"));

      await expect(
        store.append([change("2", "Grace"), { ...change("a", "Acme"), collection: "orders" }]),
      ).rejects.toThrow("isn't a plain file");
      expect(await readFile(logFor(root, "leads"), "utf8")).toBe(line(change("1", "Ada")));
    });
  });
});
