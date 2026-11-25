import { defineMessages } from "./define.ts";
import { markPart, phrase } from "./phrase.ts";

/**
 * The sentences of `halonic deploy` while it deploys and when it's live
 * (deploy flow, revision 5, sections 2.8 to 2.10). Names the user meets on
 * Cloudflare's dashboard and bill (Worker, D1 database, R2 bucket, version),
 * never "provision", "migrate" or "smoke test".
 */
export const deployMessages = defineMessages("deploy", {
  /** What `halonic deploy <deployment>` does, for line 1's "Couldn't …:". */
  action: (deployment?: string) =>
    deployment === undefined ? phrase`deploy` : phrase`deploy ${deployment}`,

  /** One thing a deploy creates, for "Creating …" and "Created …". */
  address: (name: string) => phrase`the workers.dev address ${name}`,
  service: (name: string) => phrase`the Worker ${name}`,
  database: (name: string) => phrase`the D1 database ${name}`,
  bucket: (name: string) => phrase`the R2 bucket ${name}`,

  creating: (what: string) => phrase`Creating ${what}`,
  updatingDatabase: () => phrase`Updating the database`,
  uploading: (version: number, files: number) =>
    phrase`Uploading version ${version} ${markPart("separator")} ${files} files`,
  selfTesting: (version: number) => phrase`Self-test of version ${version}`,
  switching: (version: number) => phrase`Making version ${version} live`,

  /** Every thing created, in one line: "the Worker acme, the D1 database acme-data and …". */
  created: (what: string) => phrase`${markPart("done")} Created ${what}.`,
  databaseSetUp: () => phrase`${markPart("done")} Set up the database.`,
  databaseUpdated: (changes: number) =>
    phrase`${markPart("done")} Updated the database: ${changes === 1 ? "1 change" : `${changes} changes`}.`,
  uploaded: (version: number, secrets: number) =>
    secrets === 0
      ? phrase`${markPart("done")} Uploaded version ${version}.`
      : phrase`${markPart("done")} Uploaded version ${version} with ${secrets === 1 ? "1 secret" : `${secrets} secrets`}.`,
  selfTestPassed: (version: number) =>
    phrase`${markPart("done")} Self-test of version ${version} passed.`,

  live: (workspace: string, deployment: string, url: string) =>
    phrase`${markPart("done")} ${workspace} is live on ${deployment}: ${url}`,
  /** Leaves out "commit …" when the host doesn't give the commit. */
  deployedAs: (commit: string | undefined, version: number, took: string) =>
    commit === undefined
      ? phrase`  Deployed version ${version} in ${took}.`
      : phrase`  Deployed commit ${commit} as version ${version} in ${took}.`,
  /** When the Halonic that deployed is another than the one the version before ran. */
  deployedWithHalonicAs: (
    commit: string | undefined,
    halonic: string,
    was: string,
    version: number,
    took: string,
  ) =>
    commit === undefined
      ? phrase`  Deployed with Halonic ${halonic} (was ${was}) as version ${version} in ${took}.`
      : phrase`  Deployed commit ${commit} with Halonic ${halonic} (was ${was}) as version ${version} in ${took}.`,
  /** Follows "Deployed …" on the same line when there's a version to go back to. */
  kept: (version: number, deployment: string) =>
    phrase` Version ${version} is kept: halonic deploy rollback ${deployment}`,
  /**
   * Same commit and Halonic as what's live: no new version was made. Leaves out
   * "commit …" and "Halonic …" when the host doesn't give them.
   */
  unchanged: (deployment: string, commit: string | undefined, halonic: string | undefined) => {
    if (commit === undefined) {
      return halonic === undefined
        ? phrase`${markPart("done")} ${deployment} is already up to date. Nothing changed on Cloudflare.`
        : phrase`${markPart("done")} ${deployment} already runs Halonic ${halonic}. Nothing changed on Cloudflare.`;
    }
    return halonic === undefined
      ? phrase`${markPart("done")} ${deployment} already runs commit ${commit}. Nothing changed on Cloudflare.`
      : phrase`${markPart("done")} ${deployment} already runs commit ${commit} with Halonic ${halonic}. Nothing changed on Cloudflare.`;
  },
  /**
   * Line 1 of a failure that says what still serves (deploy flow 3.6 and 3.7,
   * words check C759 row 3): the target's reason, with a full stop when it has
   * none (C787 row 2), then what still serves. A deploy that stopped, or lost
   * its lock before the switch, never takes the live version down.
   */
  failedWhileLive: (reason: string, still: string) =>
    phrase`${/[.!?]$/u.test(reason) ? reason : `${reason}.`} ${still}`,
  /** The target's own fix, as it gives it. */
  targetFix: (fix: string) => phrase`${fix}`,
  stillLive: (version: number) => phrase`Version ${version} is still live.`,
  nothingLive: (deployment: string) => phrase`Nothing is live on ${deployment} yet.`,
  /** Under line 1: the step such a deploy stopped after, in the words of 2.8. */
  stoppedAfter: (step: string) => phrase`It stopped after ${step}.`,
  stepCreating: (what: string) => phrase`creating ${what}`,
  stepSettingUp: () => phrase`setting up the database`,
  stepUpdating: () => phrase`updating the database`,
  stepUploading: (version: number) => phrase`uploading version ${version}`,
  stepSelfTest: (version: number) => phrase`the self-test of version ${version}`,
  /** The fix after a stop (3.7), when the target gives none of its own. */
  stoppedFix: (deployment: string) =>
    phrase`Run halonic deploy ${deployment} again to finish. It picks up what's already there.`,
  /** The fix after a lost lock, when the target gives none of its own (C759 row 3). */
  runAgain: () => phrase`Run halonic deploy again.`,

  /** What `halonic deploy` without a name says when no deployment is on Cloudflare yet. */
  needsName: () => phrase`Say which deployment to deploy.`,
  yesOption: () => phrase`Answer Deploy? [y/N] with yes`,
  /** A deploy takes its files from a commit (3.6). Exit 2. */
  notARepository: (workspace: string) =>
    phrase`${workspace} isn't in a git repository, and a deploy takes its files from a commit.`,
  notARepositoryFix: () =>
    phrase`Make one and commit: git init && git add . && git commit -m "First version"`,

  /** The summary before the one question (2.7), with the rows the deploy can fill so far. */
  summary: (workspace: string, host: string) => phrase`Deploy ${workspace} to ${host}?`,
  accountRow: (account: string) => phrase`  Account     ${account}`,
  addressRow: (url: string) => phrase`  Address     ${url}`,
  filesRow: (files: number, commit: string, subject: string) =>
    phrase`  Files       ${files} from commit ${commit} "${subject}"`,
  createsRow: (what: string) => phrase`  Creates     ${what}`,
  question: () => phrase`Deploy?`,
  /** After no to `Deploy? [y/N]` (exit 1), and after "Stopped." before anything changed (3.7). */
  nothingChanged: () => phrase`Nothing changed on Cloudflare.`,

  /**
   * A stop (Ctrl C, SIGTERM, a closed terminal) is the person's own choice,
   * so it's no "Couldn't" (deploy flow 3.7, words check C787 row 1): line 1
   * names the step and says what still serves.
   */
  stoppedAfterStep: (step: string, still: string) => phrase`Stopped after ${step}. ${still}`,
  stoppedAfterChanges: (done: number, of: number, still: string) =>
    phrase`Stopped after ${done} of ${of} database changes. ${still}`,
  stoppedInSelfTest: (version: number, still: string) =>
    phrase`Stopped. Version ${version} is uploaded but not live. ${still}`,
  /** Under a first deploy's stop after the yes, before the fix when there is one (3.6, 3.7). */
  answersKept: (fix?: string) =>
    fix === undefined ? phrase`  Your answers are kept.` : phrase`  Your answers are kept. ${fix}`,
  stopFixLine: (fix: string) => phrase`  ${fix}`,

  /**
   * A self-test that failed (3.6), a result with exit 1 rather than an error.
   * `still` is left out when no older version serves for sure.
   */
  selfTestFailed: (deployment: string, version: number, still?: string) =>
    still === undefined
      ? phrase`${markPart("failed")} Couldn't deploy ${deployment}: version ${version} failed its self-test.`
      : phrase`${markPart("failed")} Couldn't deploy ${deployment}: version ${version} failed its self-test. ${still}`,
  selfTestFailedFix: () =>
    phrase`  Run again. If it fails again, run it with --debug and report it: https://github.com/halonic-com/halonic/issues`,

  /** A line from the target the user must see, such as the lock lost after the switch. The deploy is live. */
  warning: (message: string) => phrase`${markPart("needsYou")} ${message}`,

  /** A host that isn't lowercase letters and digits joined by single hyphens, so no package name is made from it. */
  notAHost: (host: string) => phrase`"${host}" isn't a deploy host.`,
  notAHostFix: () => phrase`Set host in deployments.yaml to cloudflare, then run again.`,
  /** The deploy target for a deployment's `host` isn't installed (wording with Sofia, flow section 9). */
  targetMissing: (host: string, pkg: string) =>
    phrase`Deploying to ${host} needs the package ${pkg}, and it isn't installed. Nothing changed on ${host}.`,
  targetMissingFix: (pkg: string) =>
    phrase`Install it next to halonic with npm install -g ${pkg}, then run again.`,
  /** The package is there but doesn't give a target this halonic can use. */
  targetUnusable: (pkg: string, halonic: string, reason: string) =>
    phrase`The installed ${pkg} doesn't work with Halonic ${halonic}: ${reason}.`,
  targetUnusableFix: (pkg: string, halonic: string) =>
    phrase`Install the ${pkg} that matches Halonic ${halonic}, then run again.`,
});
