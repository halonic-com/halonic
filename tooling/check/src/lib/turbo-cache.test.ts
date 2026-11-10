import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { pruneTurboCache } from "./turbo-cache.ts";

const day = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 10, 10);
let directory = "";

function entry(hash: string, ageDays: number, accessedDaysAgo = ageDays): void {
  for (const name of [`${hash}.tar.zst`, `${hash}-meta.json`, `${hash}-manifest.json`]) {
    const file = join(directory, name);
    writeFileSync(file, "x".repeat(10));
    utimesSync(file, new Date(now - accessedDaysAgo * day), new Date(now - ageDays * day));
  }
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "turbo-cache-"));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

test("removes an entry unused for more than the limit, with all its files", () => {
  entry("aaaa", 8);
  entry("bbbb", 2);
  const result = pruneTurboCache(directory, 7, now);
  expect(result).toEqual({ entries: 2, removed: 1, bytesFreed: 30 });
  expect(existsSync(join(directory, "aaaa.tar.zst"))).toBe(false);
  expect(existsSync(join(directory, "aaaa-meta.json"))).toBe(false);
  expect(existsSync(join(directory, "bbbb.tar.zst"))).toBe(true);
});

test("keeps an old entry that was read recently", () => {
  entry("cccc", 30, 1);
  expect(pruneTurboCache(directory, 7, now).removed).toBe(0);
  expect(existsSync(join(directory, "cccc.tar.zst"))).toBe(true);
});

test("leaves files that aren't cache entries", () => {
  writeFileSync(join(directory, "notes.txt"), "keep");
  utimesSync(join(directory, "notes.txt"), new Date(now - 90 * day), new Date(now - 90 * day));
  expect(pruneTurboCache(directory, 7, now)).toEqual({ entries: 0, removed: 0, bytesFreed: 0 });
  expect(existsSync(join(directory, "notes.txt"))).toBe(true);
});

test("a dry run reports what it would remove and deletes nothing", () => {
  entry("dddd", 20);
  expect(pruneTurboCache(directory, 7, now, true).removed).toBe(1);
  expect(existsSync(join(directory, "dddd.tar.zst"))).toBe(true);
});
