// How `halonic deploy` says it was stopped (deploy flow 3.7; words check C787
// row 1 on HAL-17198): Ctrl C, SIGTERM or a closed terminal is the person's
// own choice, so it's never the ✕ "Couldn't deploy" shape and never says
// "interrupted". Line 1 names the step it stopped after and what still
// serves; the line under it says how to finish. `runCli` exits with 130, 143
// or 129 for the signal.

import type { DeployedVersion, DeployFailure, DeployStep } from "@halonicjs/ports";
import type { StoppedResult } from "../command.ts";
import { deployMessages } from "../messages/deploy.ts";
import { type Phrase, plainText } from "../messages/phrase.ts";
import { stopMessages } from "../messages/stop.ts";
import { resourceList } from "./deploy-output.ts";

/** What the deploy knew when it stopped. */
export interface DeployStopFacts {
  /** The deployment's name, such as "web". */
  readonly deployment: string;
  /** The step that had started and not finished, from the deploy's events. */
  readonly running: DeployStep | undefined;
  /** Whether any step had finished, so something may have changed on Cloudflare. */
  readonly changed: boolean;
  /** The database changes the plan counted, for "1 of 2"; `undefined` before the plan. */
  readonly databaseChanges: number | undefined;
}

/**
 * The stop lines for what the deploy threw once it was stopped, or
 * `undefined` when they can't be said truthfully: something changed and the
 * target doesn't say what still serves. `runCli` then says only "Stopped.".
 */
export function deployStopped(error: unknown, facts: DeployStopFacts): StoppedResult | undefined {
  const stop = stopOf(error);
  if (stop === undefined) {
    return facts.changed ? undefined : nothingChanged(facts.deployment);
  }
  const { live, stoppedAfter } = stop;
  const json = {
    deployment: facts.deployment,
    live,
    ...(stoppedAfter === undefined ? {} : { stoppedAfter }),
  };
  // A stop while making it live finishes it and shows the live screen, so no
  // stop comes after that step; were one to, "after making version 2 live"
  // would sit next to "Version 1 is still live." (C787 row 3), so only
  // "Stopped." is said.
  if (stoppedAfter?.step === "switch") return undefined;
  const lines = stopLines(live, stoppedAfter, facts);
  return lines === undefined
    ? nothingChanged(facts.deployment, json)
    : { stopped: true, lines, json };
}

function stopLines(
  live: DeployedVersion | "none",
  stoppedAfter: Exclude<DeployStep, { step: "switch" }> | undefined,
  facts: DeployStopFacts,
): Phrase[] | undefined {
  const { deployment, running } = facts;
  const still = plainText(
    (live === "none"
      ? deployMessages.nothingLive(deployment)
      : deployMessages.stillLive(live.number)
    ).phrase,
  );
  // Your answers are kept from the yes on, and a first deploy changes Cloudflare only after it (2.7).
  const first = live === "none";
  if (running?.step === "self-test") {
    // A stop during the self-test stops at once, with the new version not live.
    const line = deployMessages.stoppedInSelfTest(running.version, still).phrase;
    return first ? [line, deployMessages.answersKept().phrase] : [line];
  }
  // Stopped before any step finished: nothing changed on Cloudflare.
  if (stoppedAfter === undefined) return undefined;
  const line =
    stoppedAfter.step === "database"
      ? deployMessages.stoppedAfterChanges(
          stoppedAfter.changes,
          facts.databaseChanges ?? stoppedAfter.changes,
          still,
        )
      : deployMessages.stoppedAfterStep(stepWords(stoppedAfter), still);
  const fix = plainText(deployMessages.stoppedFix(deployment).phrase);
  return [
    line.phrase,
    first ? deployMessages.answersKept(fix).phrase : deployMessages.stopFixLine(fix).phrase,
  ];
}

/** "Stopped. Nothing changed on Cloudflare.": a stop before anything changed. */
function nothingChanged(deployment: string, json: StoppedResult["json"] = { deployment }) {
  return {
    stopped: true as const,
    lines: [stopMessages.stopped(deployMessages.nothingChanged().phrase).phrase],
    json,
  };
}

/** The target's `stopped` failure, which says what still serves. */
function stopOf(error: unknown): (DeployFailure & { live: DeployedVersion | "none" }) | undefined {
  if (!(error instanceof Error)) return undefined;
  const { code, live } = error as Partial<DeployFailure>;
  return code === "stopped" && live !== undefined
    ? (error as DeployFailure & { live: DeployedVersion | "none" })
    : undefined;
}

/** "uploading version 2", as 2.8 names the step. */
function stepWords(step: Exclude<DeployStep, { step: "switch" | "database" }>): string {
  const words = (() => {
    switch (step.step) {
      case "create":
        return deployMessages.stepCreating(resourceList([step.resource]));
      case "upload":
        return deployMessages.stepUploading(step.version);
      case "self-test":
        return deployMessages.stepSelfTest(step.version);
    }
  })();
  return plainText(words.phrase);
}
