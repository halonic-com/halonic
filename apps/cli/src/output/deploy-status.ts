// What `halonic deploy status <deployment>` shows (deploy flow, revision 5,
// 5.1): one heading with the host and the account, then a row each for the
// address, what's live, its Halonic against this computer's, its health, its
// runs by state and the version a rollback goes back to. It reads only; the
// rows a host can't fill are left out, and runs it can't count point at the
// address.

import type { DeployedVersion, DeploymentStatus, DeployStep } from "@halonicjs/ports";
import { compareVersions, readVersion } from "@halonicjs/std";
import type { CommandResult } from "../command.ts";
import { exitCode } from "../exit-code.ts";
import { columns } from "../messages/columns.ts";
import type { Message } from "../messages/define.ts";
import { deployStatusMessages as words } from "../messages/deploy-status.ts";
import { type Phrase, plainText } from "../messages/phrase.ts";
import { startedInWords } from "../messages/runs-list.ts";
import { clockTime, type RunClock, startedAt } from "../run-times.ts";

/** What the status lines need besides what the host said. */
export interface DeployStatusFacts {
  /** The deployment's name, such as "web". */
  readonly deployment: string;
  /** The host as its dashboard names it, such as "Cloudflare". */
  readonly host: string;
  /** This computer's Halonic, to compare with the live one. */
  readonly halonicVersion: string;
  /** For "since 12 Nov 14:02" and "started 2 min ago", in the computer's time zone. */
  readonly clock: RunClock;
}

/**
 * The result of `halonic deploy status`: the rows of 5.1, then a `!` line
 * when a deploy holds the lock or, with none, the last one didn't finish. `--json`
 * has what the host said, as it said it, and this computer's Halonic.
 */
export function deployStatusResult(
  status: DeploymentStatus,
  facts: DeployStatusFacts,
): CommandResult {
  const { deployment } = facts;
  const { live, previous } = status;
  const row = (label: Message, value: Message): Phrase[] => [label.phrase, value.phrase];
  const rows: Phrase[][] = [];
  if (status.url !== undefined) rows.push(row(words.addressLabel(), words.address(status.url)));
  rows.push(
    row(
      words.liveLabel(),
      live === undefined ? words.nothingLive(deployment) : version(live, facts),
    ),
  );
  if (live !== undefined) {
    const halonic = halonicRow(live, facts);
    if (halonic !== undefined) rows.push(row(words.halonicLabel(), halonic));
    rows.push(row(words.healthLabel(), health(status, facts)));
    rows.push(row(words.runsLabel(), runs(status)));
  }
  if (previous !== undefined) {
    rows.push(
      row(
        words.beforeLabel(),
        words.before(
          plainText(words.version(previous.number, previous.commit, undefined).phrase),
          deployment,
        ),
      ),
    );
  }
  const notes: Phrase[] = [];
  if (status.lockedBy !== undefined) {
    const { who, startedAt: started, expiresAt } = status.lockedBy;
    notes.push(
      words.deployLocked(
        deployment,
        who,
        minutesAgo(started, facts.clock),
        clockTime(expiresAt, facts.clock),
      ).phrase,
    );
  } else if (status.unfinished !== undefined) {
    // Only with no lock: a deploy that holds it may still be in that step.
    notes.push(
      words.deployUnfinished(deployment, plainText(unfinished(status.unfinished).phrase)).phrase,
    );
  }
  return {
    exitCode: exitCode.ok,
    lines: [
      words.heading(deployment, facts.host, status.account.name).phrase,
      ...columns(rows).map((line) => [`  `, ...line]),
      ...notes,
    ],
    json: { deployment, ...status, thisHalonic: facts.halonicVersion },
  };
}

function version(found: DeployedVersion, facts: DeployStatusFacts): Message {
  const since =
    found.liveSince === undefined
      ? undefined
      : startedInWords(startedAt(new Date(found.liveSince), facts.clock));
  return words.version(found.number, found.commit, since);
}

function halonicRow(live: DeployedVersion, facts: DeployStatusFacts): Message | undefined {
  const there = live.halonicVersion;
  const here = facts.halonicVersion;
  if (there === undefined) return undefined;
  if (there === here) return words.halonicSame(there);
  const [a, b] = [readVersion(there), readVersion(here)];
  if (a === undefined || b === undefined) return words.halonicOther(there, here);
  return compareVersions(a, b) < 0
    ? words.halonicBehind(there, here, facts.deployment)
    : words.halonicAhead(there, here);
}

function health(status: DeploymentStatus, facts: DeployStatusFacts): Message {
  if (!status.health.answering) return words.notAnswering();
  const tick = status.health.lastRoutineTick;
  return tick === undefined
    ? words.answering()
    : words.answeringWithTick(startedInWords(startedAt(new Date(tick), facts.clock)));
}

function runs(status: DeploymentStatus): Message {
  const counts = status.runs;
  return counts === undefined
    ? words.runsUnknown()
    : words.runCounts(counts.running, counts.waiting, counts.lastDay);
}

/** "less than a minute ago", "2 min ago", as the lock's own message says it. */
export function minutesAgo(iso: string, clock: RunClock): string {
  const minutes = Math.max(0, Math.round((clock.now.getTime() - Date.parse(iso)) / 60_000));
  return plainText(
    (minutes === 0 ? words.startedJustNow() : words.startedMinutesAgo(minutes)).phrase,
  );
}

function unfinished(step: DeployStep["step"]): Message {
  switch (step) {
    case "create":
      return words.unfinishedCreating();
    case "database":
      return words.unfinishedDatabase();
    case "upload":
      return words.unfinishedUpload();
    case "self-test":
      return words.unfinishedSelfTest();
    case "switch":
      return words.unfinishedSwitch();
  }
}
