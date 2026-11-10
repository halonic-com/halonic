import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Turbo's local cache keeps each entry as a few files that share the hash as
 * their name: `<hash>.tar.zst`, `<hash>-meta.json`, `<hash>-manifest.json`.
 */
export interface PruneResult {
  readonly entries: number;
  readonly removed: number;
  readonly bytesFreed: number;
}

const entryFile = /^([0-9a-f]+)(?:\.tar\.zst|-meta\.json|-manifest\.json)$/;

/**
 * Deletes the cache entries nobody has used for `maxAgeDays`. An entry's last
 * use is the newest access or modification time of its files. A cache hit
 * reads the entry, so a hit counts as use on a filesystem that records access
 * times; on one that doesn't, an entry is dropped `maxAgeDays` after it was
 * written and the next run rebuilds it. Files that aren't cache entries stay.
 * With `dryRun` nothing is deleted.
 */
export function pruneTurboCache(
  directory: string,
  maxAgeDays: number,
  now: number = Date.now(),
  dryRun = false,
): PruneResult {
  const cutoff = now - maxAgeDays * 24 * 60 * 60 * 1000;
  const entries = new Map<string, { lastUsed: number; bytes: number; files: string[] }>();
  for (const name of readdirSync(directory)) {
    const hash = entryFile.exec(name)?.[1];
    if (hash === undefined) {
      continue;
    }
    const stats = statSync(join(directory, name));
    const entry = entries.get(hash) ?? { lastUsed: 0, bytes: 0, files: [] };
    entry.lastUsed = Math.max(entry.lastUsed, stats.atimeMs, stats.mtimeMs);
    entry.bytes += stats.size;
    entry.files.push(name);
    entries.set(hash, entry);
  }
  let removed = 0;
  let bytesFreed = 0;
  for (const entry of entries.values()) {
    if (entry.lastUsed >= cutoff) {
      continue;
    }
    removed += 1;
    bytesFreed += entry.bytes;
    if (!dryRun) {
      for (const name of entry.files) {
        rmSync(join(directory, name), { force: true });
      }
    }
  }
  return { entries: entries.size, removed, bytesFreed };
}
