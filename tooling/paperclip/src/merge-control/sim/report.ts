import type { SimDay, Spread } from "./day.ts";
import {
  frontOfLine,
  jumpOver3,
  jumpOver8,
  mergerBefore1815,
  type RuleSet,
  type SimReport,
  simulate,
} from "./simulate.ts";

/** The rule sets a day is compared on: the Merger's until 18:15, today's, jump >3, and the candidate. */
export const comparedRuleSets: readonly RuleSet[] = [
  mergerBefore1815,
  jumpOver8,
  jumpOver3,
  frontOfLine,
];

/** Replays `day` under each rule set. */
export function compareRuleSets(
  day: SimDay,
  rules: readonly RuleSet[] = comparedRuleSets,
): SimReport[] {
  return rules.map((each) => simulate(day, each));
}

function spread(value: Spread): string {
  return value.median === null ? "–" : `${value.median} / ${value.p90} (${value.count})`;
}

/** The comparison as a Markdown table, with what the day recorded first. */
export function reportTable(day: SimDay, reports: readonly SimReport[]): string {
  const { timings } = day;
  const lines = [
    `Day ${day.date}: ${day.pulls.length} pull requests (${day.pulls.filter((pull) => pull.fastTrack).length} fast-track, ${day.pulls.filter((pull) => pull.failsOnce).length} failed a group, ${day.pulls.filter((pull) => pull.conflictsAt !== null).length} conflicted in the queue).`,
    `Timings: group build ${Math.round(timings.groupBuildMinutes)} min, refix ${Math.round(timings.refixMinutes)} min, ${timings.buildLimit} groups at once, runners ${timings.runnerGroups === null ? "unknown (counted as free)" : `${timings.runnerGroups} groups`}.`,
    "",
    "| Rule set | Merged | Time to merge, fast-track (median / p90, n) | Time to merge, other | Queue wait | Jumps | Groups cancelled (jumps + removals) | Rebuilt after failures | Runner-minutes lost | Re-queues |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  const recorded = day.recorded;
  if (recorded !== null) {
    lines.push(
      `| recorded (the Merger) | ${recorded.merged} | ${spread(recorded.timeToMerge)} (all) | | | ${recorded.jumps} | ${recorded.groupsCancelledByJumps} (jumps only) | | | |`,
    );
  }
  for (const report of reports) {
    const cancelled = report.groupsCancelled.byJumps + report.groupsCancelled.byRemovals;
    lines.push(
      `| ${report.rules} | ${report.merged} | ${spread(report.timeToMerge.fastTrack)} | ${spread(report.timeToMerge.other)} | ${spread(report.queueWait)} | ${report.jumps} | ${cancelled} | ${report.groupsCancelled.byFailures} | ${report.runnerMinutesLost} | ${report.requeues} |`,
    );
  }
  return lines.join("\n");
}
