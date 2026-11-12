import { parseArgs } from "node:util";
import { type LiveSweeper, type SweepReport, sweep } from "../lib/live-resources.ts";

/**
 * The sweeper (ADR 5.9): deletes every `hlt-` resource older than 2 hours on
 * the live test account. The live-cloud workflow runs it every 6 hours, before
 * every nightly run and at the end of every live job.
 *
 *   node tooling/check/src/cli/live-sweep.ts [--fail-on-delete]
 *
 * `--fail-on-delete` (nightly) fails when it had to delete anything, because
 * that means a leak in a target's `destroy` or in the tests.
 */

/**
 * One entry per target with a live suite. Empty until the Cloudflare
 * target's `destroy` lands (HAL-198 step 3b).
 */
export const liveSweepers: readonly LiveSweeper[] = [];

/** The lines to print for a sweep, and whether it fails. */
export function sweepSummary(
  report: SweepReport,
  sweeperCount: number,
  failOnDelete: boolean,
): { lines: string[]; failed: boolean } {
  if (sweeperCount === 0) {
    return { lines: ["live-sweep: no target has a sweeper yet; nothing to sweep."], failed: false };
  }
  const lines = [
    ...report.deleted.map((resource) => `live-sweep: deleted ${resource.kind} ${resource.name}`),
    ...report.failed.map(
      ({ resource, error }) =>
        `live-sweep: could not delete ${resource.kind} ${resource.name}: ${error}`,
    ),
  ];
  const leaked = failOnDelete && report.deleted.length > 0;
  if (leaked) {
    lines.push(
      `live-sweep: deleted ${report.deleted.length} leftover resource(s); a live job or a target's destroy leaks.`,
    );
  }
  if (lines.length === 0) {
    lines.push("live-sweep: nothing left behind.");
  }
  return { lines, failed: leaked || report.failed.length > 0 };
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { "fail-on-delete": { type: "boolean" } } });
  const report = await sweep(liveSweepers, new Date());
  const summary = sweepSummary(report, liveSweepers.length, values["fail-on-delete"] === true);
  for (const line of summary.lines) {
    (summary.failed ? console.error : console.log)(line);
  }
  if (summary.failed) {
    process.exitCode = 1;
  }
}
