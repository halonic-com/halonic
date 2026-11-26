import type { RunSummary } from "@halonicjs/events";
import type { AskKeysText } from "@halonicjs/studio-feature-feedback/api";
import type { AnsweredViewProps, InboxAnsweredView } from "@halonicjs/studio-feature-inbox/api";
import {
  costParts,
  type RunModelPath,
  type RunsList,
  took,
} from "@halonicjs/studio-feature-runs/api";
import type { ViewRef } from "@halonicjs/studio-shell";
import { createElement } from "react";
import type { FirstRun } from "./first-run.ts";
import { youDidItWords } from "./first-run-words.ts";

/**
 * "You did it" in the Inbox (`first-run.you-did-it`, first-run-flow 3.5): it takes the wait
 * card's place once the first run's Approve finished the run. Any other answer, or an answer on
 * another run, keeps the card's decided bar.
 *
 * @example
 * inbox.addAnsweredView(youDidItSource(firstRun, view));
 */
export function youDidItSource(
  firstRun: Pick<FirstRun, "isFirstRun">,
  view: ViewRef,
): InboxAnsweredView {
  return {
    claims: (item, event, after) =>
      event === "approve" && after === "finished" && firstRun.isFirstRun(item.runId),
    view,
  };
}

/**
 * The view of "You did it", loaded once it claims an answer, with the runs it reads the record
 * from and quick ask's keys, where the app gives them: the Inbox gives a view only its own props.
 */
export function youDidItView(runs: RunsList, askKeys?: AskKeysText): ViewRef {
  return {
    view: "YouDidItView",
    load: async () => {
      const { YouDidItView } = await import("./ui/you-did-it-view.tsx");
      return {
        YouDidItView: (props: AnsweredViewProps) =>
          createElement(YouDidItView, { ...props, runs, askKeys }),
      };
    },
  };
}

/** What "You did it" says about the run, from its record. */
export interface YouDidItFacts {
  /** "3 steps · 14 s · no cost, ran on this computer · logged with your yes". */
  readonly line: string;
  /** Whether the run was on Sample answers: the sample line shows and Pick a model comes first. */
  readonly sample: boolean;
}

/**
 * The real step count, time and cost of the finished run. The cost part goes by the run's model
 * path: the run's cost with a key, "no cost, ran on this computer" on a model here, and none on
 * Sample answers, which says so on a line of its own. A run on a key or a subscription with no
 * price shows no cost part, never "€0.00".
 */
export function youDidItFacts(
  summary: RunSummary,
  path: RunModelPath | undefined,
  currency: string,
): YouDidItFacts {
  const cost = path === "local" ? [youDidItWords.localCost] : costPart(summary, path, currency);
  const parts = [
    youDidItWords.steps(summary.statesVisited.length),
    took(summary),
    ...cost,
    youDidItWords.logged,
  ];
  return { line: parts.join(" · "), sample: path === "sample" };
}

function costPart(summary: RunSummary, path: RunModelPath | undefined, currency: string): string[] {
  return path === "sample" ? [] : costParts(summary, currency);
}
