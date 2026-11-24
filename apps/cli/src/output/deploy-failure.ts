// How `halonic deploy` shows a failure that says what still serves (deploy
// flow 3.6 and 3.7; HAL-16750, words check C759 row 3): a deploy that was
// stopped, or that lost its lock before the switch, never takes the live
// version down, so line 1 ends by saying which version is still live, the line
// under it names the step it stopped after, and `--json` has both as fields.

import type { DeployedVersion, DeployFailure, DeployStep } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { DetailedError } from "../command.ts";
import { deployMessages } from "../messages/deploy.ts";
import { plainText } from "../messages/phrase.ts";
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
    stoppedAfter === undefined
      ? undefined
      : { lines: [deployMessages.stoppedAfter(stepWords(stoppedAfter)).phrase], fix },
  );
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
function stepWords(step: DeployStep): string {
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
      case "switch":
        return deployMessages.stepSwitching(step.version);
    }
  })();
  return plainText(words.phrase);
}
