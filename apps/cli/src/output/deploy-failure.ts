// How `halonic deploy` shows a failure that says what still serves (deploy
// flow 3.6 and 3.7; HAL-16750, words check C759 row 3): a deploy that was
// stopped, or that lost its lock before the switch, never takes the live
// version down, so line 1 ends by saying which version is still live, the line
// under it names the step it stopped after, and `--json` has both as fields.

import type {
  DeployedVersion,
  DeployFailure,
  DeployPlan,
  DeploySelfTestFailed,
  DeployStep,
} from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { type CommandResult, DetailedError } from "../command.ts";
import { exitCode } from "../exit-code.ts";
import { deployMessages } from "../messages/deploy.ts";
import { type Phrase, plainText } from "../messages/phrase.ts";
import { resourceList } from "./deploy-output.ts";

/** A deploy failure that says what still serves. */
type FailureWithLive = DeployFailure & { readonly live: DeployedVersion | "none" };

/**
 * The error `halonic deploy` throws for what the deploy app service threw.
 * A failure that says what still serves gets "Version <n> is still live." or
 * "Nothing is live on <deployment> yet." at the end of line 1, and the step it
 * stopped after under it; the fix is the target's own, else the stop's or the
 * run-again line. Anything else is given back as it is.
 *
 * @example
 * try { await deploys.deploy(input, lines.onEvent) } catch (error) { throw deployFailure(error, "web") }
 */
export function deployFailure(error: unknown, deployment: string): unknown {
  if (!hasLive(error)) return error;
  const { live, stoppedAfter } = error;
  const still =
    live === "none"
      ? deployMessages.nothingLive(deployment)
      : deployMessages.stillLive(live.number);
  const fix = fixOf(error, deployment);
  return new DetailedError(
    errorKindOf(error),
    deployMessages.failedWhileLive(error.message, plainText(still.phrase)),
    fix,
    {
      code: error.code,
      live,
      ...(stoppedAfter === undefined ? {} : { stoppedAfter }),
    },
    // A stop during the switch finishes it and a lock lost after it is only a
    // warning, so no failure comes after it; were one to, "after making
    // version 2 live" would sit next to "Version 1 is still live." (C787 row 3).
    stoppedAfter === undefined || stoppedAfter.step === "switch"
      ? undefined
      : { lines: [deployMessages.stoppedAfter(stepWords(stoppedAfter)).phrase], fix },
  );
}

/**
 * What a deploy whose new version failed its self-test says (3.6): what
 * still serves when the target says, or nothing on a first deploy, under the
 * steps it printed. It ran to its end, so it's a result with exit 1; `--json`
 * has the failed checks.
 */
export function selfTestFailedResult(
  outcome: DeploySelfTestFailed,
  deployment: string,
  plan: DeployPlan | undefined,
  stepLines: readonly Phrase[],
): CommandResult {
  const { version, stillLive, failedChecks, restoreFailed } = outcome;
  const line = deployMessages.selfTestFailed(
    deployment,
    version.number,
    stillAfterSelfTest(outcome, deployment, plan),
  );
  const fix = deployMessages.selfTestFailedFix();
  return {
    exitCode: exitCode.failed,
    lines: [...stepLines, line.phrase, fix.phrase],
    json: { deployment, version: version.number, stillLive, failedChecks, restoreFailed },
    failure: {
      kind: "internal",
      message: plainText(line.phrase).replace(/^✕ /u, ""),
      fix: plainText(fix.phrase).trim(),
    },
  };
}

/**
 * Which version still serves after a failed self-test, when that's known: the
 * target's, or nothing on a first deploy. Left out when the new version went
 * live before its test, or putting the old one back failed.
 */
function stillAfterSelfTest(
  outcome: DeploySelfTestFailed,
  deployment: string,
  plan: DeployPlan | undefined,
): string | undefined {
  if (outcome.stillLive !== undefined) {
    return plainText(deployMessages.stillLive(outcome.stillLive.number).phrase);
  }
  if (plan !== undefined && plan.live === undefined) {
    return plainText(deployMessages.nothingLive(deployment).phrase);
  }
  return undefined;
}

/** The target's own fix, else the stop's (3.7), else run again (C759 row 3). */
function fixOf(error: FailureWithLive, deployment: string) {
  if (error.fix !== undefined) return deployMessages.targetFix(error.fix);
  if (error.code === "stopped") return deployMessages.stoppedFix(deployment);
  return deployMessages.runAgain();
}

function hasLive(error: unknown): error is FailureWithLive {
  if (typeof error !== "object" || error === null) return false;
  const { code, live } = error as { code?: unknown; live?: unknown };
  return (
    typeof code === "string" &&
    error instanceof Error &&
    (live === "none" || (typeof live === "object" && live !== null))
  );
}

/** "uploading version 2", as 2.8 names the step. */
function stepWords(step: Exclude<DeployStep, { step: "switch" }>): string {
  const words = (() => {
    switch (step.step) {
      case "create":
        return deployMessages.stepCreating(resourceList([step.resource]));
      case "database":
        return step.first ? deployMessages.stepSettingUp() : deployMessages.stepUpdating();
      case "upload":
        return deployMessages.stepUploading(step.version);
      case "self-test":
        return deployMessages.stepSelfTest(step.version);
    }
  })();
  return plainText(words.phrase);
}
