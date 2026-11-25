// What `halonic deploy <deployment>` shows before anything changes on
// Cloudflare (deploy flow, revision 5): the summary the one question follows
// (2.7), `--plan`'s result, which is that summary with every file it would
// upload (2.11), and the refusal for what can't run on Cloudflare (3.6).

import type { CloudflareProblem } from "@halonicjs/app";
import type { DeployPlan, DeployReach } from "@halonicjs/ports";
import type { CommandResult } from "../command.ts";
import { DetailedError } from "../command.ts";
import { exitCode } from "../exit-code.ts";
import { columnsAs } from "../messages/columns.ts";
import type { Message } from "../messages/define.ts";
import { deployMessages } from "../messages/deploy.ts";
import { deployPlanMessages as words } from "../messages/deploy-plan.ts";
import { deployStatusMessages } from "../messages/deploy-status.ts";
import { markPart, type Phrase, phrase } from "../messages/phrase.ts";
import { clockTime, type RunClock } from "../run-times.ts";
import { resourceList } from "./deploy-output.ts";
import { minutesAgo } from "./deploy-status.ts";

/** What the summary shows besides the plan. */
export interface DeploySummaryFacts {
  readonly workspace: string;
  readonly deployment: string;
  /** The commit cut to 7 characters, as the flow shows it. */
  readonly commit: string;
  readonly subject: string;
  readonly reaches: readonly DeployReach[];
  readonly secretNames: readonly string[];
  readonly routines: number;
  readonly inTheEu: boolean;
}

/** The flow's rows put each value in the same column, whichever labels a summary has. */
const labelColumn = phrase`${" ".repeat(11)}`;

/** The summary of 2.7: the heading, then one row per fact, lined up. Rows with nothing to say are left out. */
export function deploySummary(plan: DeployPlan, facts: DeploySummaryFacts): Phrase[] {
  const rows: [Message, Phrase][] = [];
  const row = (label: Message, value: Message | Phrase) =>
    rows.push([label, "phrase" in value ? value.phrase : value]);
  row(words.accountLabel(), words.value(plan.account.name));
  if (plan.url !== undefined) row(words.addressLabel(), words.value(plan.url));
  row(words.filesLabel(), words.files(plan.files.length, facts.commit, facts.subject));
  if (plan.creates.length > 0) {
    // The summary lists them with commas, where the ✓ line says "and".
    const creates = plan.creates.map((resource) => resourceList([resource])).join(", ");
    row(words.createsLabel(), words.value(creates));
  }
  if (facts.inTheEu) row(words.dataLabel(), words.inTheEu());
  row(words.reachesLabel(), reaches(facts.reaches));
  if (facts.routines > 0) row(words.routinesLabel(), words.routines(facts.routines));
  if (facts.secretNames.length > 0) {
    row(words.secretsLabel(), words.value(facts.secretNames.join(", ")));
  }
  const cells = rows.map(([label, value]) => [phrase`  ${label.phrase}`, value]);
  return [
    deployMessages.summary(facts.workspace, "Cloudflare").phrase,
    ...columnsAs(cells, [...cells, [labelColumn, phrase``]]),
  ];
}

/** "api.anthropic.com, with anthropic-key · api.crm.example, with crm-key". */
function reaches(list: readonly DeployReach[]): Phrase {
  if (list.length === 0) return words.reachesNothing().phrase;
  return list
    .map((reach) => words.reach(reach.address, reach.secret).phrase)
    .reduce((all, part) => phrase`${all} ${markPart("separator")} ${part}`);
}

/**
 * `--plan`'s result (2.11): the summary, every file the deploy would upload,
 * and the line that nothing changed. With `--exit-code` it exits 1 when the
 * deploy would change something.
 */
export function deployPlanResult(
  plan: DeployPlan,
  facts: DeploySummaryFacts & { readonly clock: RunClock; readonly exitCode: boolean },
): CommandResult {
  const changes = !plan.unchanged;
  const lines = [
    ...deploySummary(plan, facts),
    ...plan.files.map((path) => words.uploadFile(path).phrase),
    words.planEnd().phrase,
  ];
  const lock = plan.lockedBy;
  return {
    exitCode: facts.exitCode && changes ? exitCode.failed : exitCode.ok,
    lines,
    json: {
      deployment: facts.deployment,
      account: plan.account,
      url: plan.url,
      commit: facts.commit,
      files: plan.files,
      creates: plan.creates,
      databaseChanges: plan.databaseChanges,
      reaches: facts.reaches,
      secrets: facts.secretNames,
      live: plan.live,
      lockedBy: lock,
      unchanged: plan.unchanged,
    },
    ...(lock === undefined
      ? {}
      : {
          warnings: [
            deployStatusMessages.deployLocked(
              facts.deployment,
              lock.who,
              minutesAgo(lock.startedAt, facts.clock),
              clockTime(lock.expiresAt, facts.clock),
            ).phrase,
          ],
        }),
  };
}

/**
 * The refusal of 3.6 for what can't run on Cloudflare: with one problem, its
 * sentence is line 1, lowercase after "Couldn't deploy web:", with the fix
 * for its cause; with more, line 1 counts them and each is a line under
 * it with its file. Exit 7 (`denied`), with `code: capability-missing`.
 */
export function cannotRunError(
  problems: readonly CloudflareProblem[],
  workspace: string,
  deployment: string,
): DetailedError {
  const json = { code: "capability-missing", problems };
  const [only] = problems;
  if (only !== undefined && problems.length === 1) {
    const reason = `${only.reason.charAt(0).toLowerCase()}${only.reason.slice(1)}`;
    return new DetailedError(
      "denied",
      words.cannotRunOne(reason),
      only.cause === "address"
        ? words.cannotRunOneFix(deployment)
        : words.cannotRunOneHereFix(deployment, workspace),
      json,
    );
  }
  const fix = words.cannotRunFix(deployment);
  const widest = Math.max(...problems.map((problem) => problem.path.length));
  return new DetailedError("denied", words.cannotRun(problems.length, workspace), fix, json, {
    lines: problems.map(
      (problem) => words.problem(problem.path.padEnd(widest), problem.reason).phrase,
    ),
    fix,
  });
}
