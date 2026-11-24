import { defineMessages } from "./define.ts";
import { markPart, phrase } from "./phrase.ts";

/**
 * The sentences of `halonic deploy` itself and of `halonic deploy status`
 * (deploy flow, revision 5, section 5.1): what's live on a deployment, read
 * from the host, never a run's content.
 */
export const deployStatusMessages = defineMessages("deployStatus", {
  summary: () => phrase`Deploy the workspace to your own Cloudflare account`,
  statusSummary: () => phrase`Show what's live on a deployment, its health and its runs`,
  /** What `halonic deploy status <deployment>` does, for line 1's "Couldn't …:". */
  statusAction: (deployment: string) => phrase`show ${deployment}'s status`,
  statusNeedsName: () => phrase`Say which deployment to show.`,

  /** The heading: the deployment, its host and its account. */
  heading: (deployment: string, host: string, account: string) =>
    phrase`${deployment} ${markPart("separator")} ${host} ${markPart("separator")} ${account}`,

  addressLabel: () => phrase`Address`,
  liveLabel: () => phrase`Live`,
  halonicLabel: () => phrase`Halonic`,
  healthLabel: () => phrase`Health`,
  runsLabel: () => phrase`Runs`,
  beforeLabel: () => phrase`Before`,

  address: (url: string) => phrase`${url}`,
  /** "version 2 · commit 8d1a04b · since 12 Nov 14:02", leaving out what the host doesn't say. */
  version: (number: number, commit: string | undefined, since: string | undefined) => {
    const head = phrase`version ${number}`;
    const withCommit =
      commit === undefined ? head : phrase`${head} ${markPart("separator")} commit ${commit}`;
    return since === undefined
      ? withCommit
      : phrase`${withCommit} ${markPart("separator")} since ${since}`;
  },
  nothingLive: (deployment: string) => phrase`nothing yet. Deploy it: halonic deploy ${deployment}`,
  /** The live version and what a rollback runs. */
  before: (version: string, deployment: string) =>
    phrase`${version}   halonic deploy rollback ${deployment}`,

  halonicSame: (version: string) => phrase`${version}, the same as this computer`,
  /** The live Halonic is older than this computer's: a deploy updates it. */
  halonicBehind: (live: string, here: string, deployment: string) =>
    phrase`${live} ${markPart("separator")} this computer has ${here}. Update ${deployment}: halonic deploy ${deployment}`,
  /** The live Halonic is newer: a deploy from here would be refused. */
  halonicAhead: (live: string, here: string) =>
    phrase`${live} ${markPart("separator")} this computer has ${here}. Update Halonic here before you deploy again.`,
  /** The two differ, and one of them isn't a version Halonic can compare. */
  halonicOther: (live: string, here: string) =>
    phrase`${live} ${markPart("separator")} this computer has ${here}`,

  answering: () => phrase`${markPart("done")} answering`,
  answeringWithTick: (tick: string) =>
    phrase`${markPart("done")} answering ${markPart("separator")} last routine tick ${tick}`,
  notAnswering: () => phrase`${markPart("failed")} not answering`,

  /** Only the counts by state; a run's content never leaves the host (5.1, Julian's conditions). */
  runCounts: (running: number, waiting: number, lastDay: number) =>
    phrase`${running} running ${markPart("separator")} ${waiting} waiting for you ${markPart("separator")} ${lastDay} in the last day`,
  runsUnknown: () => phrase`open the address to see them`,

  /**
   * A deploy holds the lock. It may be running, or it was stopped and its
   * lock hasn't run out yet (3.7), so the line says when it does.
   */
  deployLocked: (deployment: string, who: string, started: string, until: string) =>
    phrase`${markPart("needsYou")} A deploy of ${deployment} by ${who} started ${started} and hasn't finished. If it was stopped, deploy again after ${until}, when its lock runs out.`,
  /** When the lock's deploy started, as the lock's own message says it (3.7). */
  startedJustNow: () => phrase`less than a minute ago`,
  startedMinutesAgo: (minutes: number) => phrase`${minutes} min ago`,
  /** The last deploy stopped in a step without finishing (3.7, the second Ctrl C). */
  deployUnfinished: (deployment: string, step: string) =>
    phrase`${markPart("needsYou")} The last deploy of ${deployment} stopped while ${step}. The next deploy finishes it: halonic deploy ${deployment}`,
  unfinishedCreating: () => phrase`creating the Worker, the database and the bucket`,
  unfinishedDatabase: () => phrase`updating the database`,
  unfinishedUpload: () => phrase`uploading a version`,
  unfinishedSelfTest: () => phrase`self-testing a version`,
  unfinishedSwitch: () => phrase`making a version live`,
});
