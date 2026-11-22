// The Default model and Last run sentences, which only Studio shows: the CLI
// never prints these two lines, so their words live here, not in
// `@halonicjs/words` (Liam on HAL-13411, 21 Nov; first-run-progress 4.2 and 9).

import type { DefaultModelLine, LastRunLine } from "@halonicjs/app";
import { printable } from "@halonicjs/words";
import { lineLabels } from "../report/report-lines.ts";
import { found, type LineSentence } from "./check-line.ts";

type RunFailure = LastRunLine["failure"];

/**
 * The Default model line (4.2): where the demo's `default` points, by its provider, and why it
 * can't be used yet. A Models cause is that line's to show, so this one waits for it.
 */
export function defaultModelSentences(line: DefaultModelLine): LineSentence[] {
  const { target } = line;
  if (target.uses === "sample-answers") {
    return [found("The demo's ", { code: "default" }, " uses Sample answers.")];
  }
  const name = printable(target.name);
  const where = target.local ? `${name} on this computer` : name;
  if (line.cause === "default-model.local-only") {
    return [
      found(
        `Points at ${name}, but Local only is on for this workspace, so cloud models are refused.`,
      ),
    ];
  }
  const pointsAt = found("The demo's ", { code: "default" }, ` points at ${where}.`);
  if (line.cause === undefined) return [pointsAt];
  return [pointsAt, found("Not checked until the Models line above works.")];
}

/**
 * What stopped the run, after "Stopped at “Write reply” after 6.8 s:", for the causes a first run
 * meets; any other says to open the run, whose page words every cause.
 */
function failureSentence(failure: RunFailure): string {
  const provider = "provider" in failure ? printable(failure.provider) : "";
  switch (failure.reason) {
    case "no-key":
      return `there's no key for ${provider}.`;
    case "key-refused":
      return `${provider} didn't accept the key.`;
    case "out-of-credit":
      return `${provider} said the key has no credit.`;
    case "provider-busy":
      return `${provider} was too busy to answer.`;
    case "model-unreachable":
      return `Halonic couldn't reach ${provider} at ${printable(failure.address)}.`;
    case "model-missing":
      return `${provider} is answering, but it doesn't have ${printable(failure.model)} yet.`;
    case "model-timeout":
      return `${provider} didn't start answering in time.`;
    case "local-only":
      return `the workspace is local only, so Halonic sent nothing to ${provider}.`;
    case "sandbox-not-ready":
      return "the sandbox couldn't start.";
    case "workspace-not-trusted":
      return "the workspace isn't trusted on this computer, so nothing was sent.";
    default:
      return "the run failed. Open the run to see why.";
  }
}

/** "6.8 s", as the run page writes a step's time. */
function seconds(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)} s`;
}

/**
 * The Last run line (4.2): "Stopped at "Write reply" after 6.8 s: Anthropic said the key has no
 * credit." When a line above shows the same cause, it points at that line instead, so the cause
 * counts once: "…, because of the Models line above." The step's name stays on screen; the
 * report counts steps instead.
 */
export function lastRunSentences(line: LastRunLine): LineSentence[] {
  const stopped = `Stopped at “${printable(line.stepName)}” after ${seconds(line.durationMs)}`;
  if (line.causeShownOn !== undefined) {
    const labels: Readonly<Record<string, string>> = lineLabels;
    const above = labels[line.causeShownOn];
    const which = above === undefined ? "a line above" : `the ${above} line above`;
    return [found(`${stopped}, because of ${which}.`)];
  }
  return [found(`${stopped}: ${failureSentence(line.failure)}`)];
}
