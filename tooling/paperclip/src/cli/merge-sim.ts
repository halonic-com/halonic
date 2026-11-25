import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { SimDay } from "../merge-control/sim/day.ts";
import { importMergerDay } from "../merge-control/sim/import-merger.ts";
import { compareRuleSets, reportTable } from "../merge-control/sim/report.ts";

/**
 * pnpm exec node tooling/paperclip/src/cli/merge-sim.ts --date 2026-11-24 \
 *   --snapshots <queue-snapshots.jsonl> --log <queue-manager.log> \
 *   [--jumps <jumps.json>] [--gate <gate-report.json>] [--runner-groups <n>]
 * pnpm exec node tooling/paperclip/src/cli/merge-sim.ts --day <day.json> [--runner-groups <n>]
 *
 * Replays one day under the Merger's rule until 18:15 on 24 Nov, today's
 * rule, jump >3 and "front of the line without a rebuild", and prints the
 * comparison as a Markdown table. `--runner-groups` says how many merge
 * groups the runners build at once without a wait, which the Merger's
 * files don't. Reads only the files it is given and needs no token.
 */

const { values } = parseArgs({
  options: {
    date: { type: "string" },
    snapshots: { type: "string" },
    log: { type: "string" },
    jumps: { type: "string" },
    gate: { type: "string" },
    day: { type: "string" },
    "runner-groups": { type: "string" },
  },
});

const read = (path: string | undefined) => (path === undefined ? "" : readFileSync(path, "utf8"));

function dayOf(): SimDay | string {
  if (values.day !== undefined) {
    return JSON.parse(read(values.day)) as SimDay;
  }
  if (values.date === undefined || values.snapshots === undefined || values.log === undefined) {
    return "give --day <day.json>, or --date, --snapshots and --log (and optionally --jumps and --gate).";
  }
  return importMergerDay(values.date, {
    snapshots: read(values.snapshots),
    log: read(values.log),
    jumps: read(values.jumps),
    gateReport: read(values.gate),
  });
}

function withRunners(day: SimDay): SimDay | string {
  const text = values["runner-groups"];
  if (text === undefined) {
    return day;
  }
  const runnerGroups = Number(text);
  if (!Number.isInteger(runnerGroups) || runnerGroups < 1) {
    return `--runner-groups must be a whole number of 1 or more, not ${text}.`;
  }
  return { ...day, timings: { ...day.timings, runnerGroups } };
}

const given = dayOf();
const day = typeof given === "string" ? given : withRunners(given);
if (typeof day === "string") {
  console.error(`merge-sim: ${day}`);
  process.exitCode = 2;
} else {
  console.log(reportTable(day, compareRuleSets(day)));
}
