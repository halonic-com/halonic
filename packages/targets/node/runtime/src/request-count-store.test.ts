import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Clock } from "@halonicjs/ports";
import { requestCountStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { openDiskRequestCountStore } from "./disk-request-count-store.ts";

const clock: Clock = { now: () => new Date("2026-11-12T10:00:00Z") };
const folders: string[] = [];

afterAll(async () => {
  await Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true })));
});

let current = "";
async function newFolder(): Promise<string> {
  current = await mkdtemp(join(tmpdir(), "halonic-request-count-"));
  folders.push(current);
  return current;
}

requestCountStoreContract(
  "on disk",
  {
    async make() {
      return openDiskRequestCountStore(await newFolder(), clock);
    },
    async reopen() {
      return openDiskRequestCountStore(current, clock);
    },
  },
  { durable: true },
);

describe("the disk request count", () => {
  verifies("runtime.request-count-store", () => {
    it("keeps the day's count over a restart and keeps days apart", async () => {
      const folder = await newFolder();
      const before = openDiskRequestCountStore(folder, clock);
      await before.countRequest("2026-11-12", 2);
      await before.countRequest("2026-11-13", 2);
      const after = openDiskRequestCountStore(folder, clock);
      expect(await after.countRequest("2026-11-12", 2)).toEqual({ allowed: true, count: 2 });
      expect(await after.countRequest("2026-11-12", 2)).toEqual({ allowed: false, count: 2 });
      expect(await after.countRequest("2026-11-13", 2)).toEqual({ allowed: true, count: 2 });
    });
  });
});
