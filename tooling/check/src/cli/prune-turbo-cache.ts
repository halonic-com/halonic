import { existsSync } from "node:fs";
import { pruneTurboCache } from "../lib/turbo-cache.ts";

/**
 * pnpm turbo:prune [--days <n>] [--dry-run]
 *
 * Deletes the entries in the shared Turbo cache (TURBO_CACHE_DIR) that
 * nobody has used for 7 days, or for `--days`. Run it from cron or by hand;
 * a run that reads an entry while it is deleted just misses and rebuilds.
 */

const defaultDays = 7;

function main(argv: readonly string[]): number {
  const directory = process.env["TURBO_CACHE_DIR"];
  if (directory === undefined || directory === "") {
    console.error("turbo:prune: set TURBO_CACHE_DIR to the cache folder to prune.");
    return 2;
  }
  const daysAt = argv.indexOf("--days");
  const days = daysAt === -1 ? defaultDays : Number(argv[daysAt + 1]);
  if (!Number.isFinite(days) || days < 0) {
    console.error("turbo:prune: --days takes a number of days, such as 7.");
    return 2;
  }
  if (!existsSync(directory)) {
    console.log(`turbo:prune: ${directory} doesn't exist yet; nothing to do.`);
    return 0;
  }
  const dryRun = argv.includes("--dry-run");
  const result = pruneTurboCache(directory, days, Date.now(), dryRun);
  const megabytes = (result.bytesFreed / 1024 / 1024).toFixed(1);
  console.log(
    `turbo:prune: ${dryRun ? "would remove" : "removed"} ${result.removed} of ${result.entries} entries unused for ${days} days (${megabytes} MB).`,
  );
  return 0;
}

process.exitCode = main(process.argv.slice(2));
