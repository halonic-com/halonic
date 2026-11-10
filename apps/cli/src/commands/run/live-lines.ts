// What `halonic run` shows while the run goes (cli-output 3.4, "Live, in a
// terminal", and 1.5): the heading as soon as the run starts, each step's
// ✓ (or ✕, !) line as soon as the step ends, and the live ◌ line of the step
// that is running, "◌ Draft a reply    Writer · smart · waiting for
// Anthropic (12 s)". The finished lines are printed ahead, and the result
// repeats them word for word (requirement `cli.print-ahead`), so they come
// from the same helpers `result.ts` uses.

import { type RunEvent, summarize } from "@halonicjs/events";
import type { LoadedWorkspace } from "@halonicjs/workspace";
import type { CommandContext } from "../../command.ts";
import { printable } from "../../output/printable.ts";
import type { Progress } from "../../output/progress.ts";
import { type WorkspaceModels, workspaceModelsOf } from "../../run-failure-of.ts";
import { runSteps, type StepEnd } from "../../run-steps.ts";
import type { RunClock } from "../../run-times.ts";
import {
  type RunDefinitions,
  runViewDefinitions,
  type StepColumns,
  stepColumns,
  stepDoing,
} from "../../run-view.ts";
import { runHeading, runStepLines } from "./result.ts";

/** What the live lines are about besides the run. */
export interface LiveLinesFacts {
  readonly workspace: LoadedWorkspace;
  /** The workspace's name, as the heading says it. */
  readonly workspaceName: string;
  /** The clock the result's step lines are written with too, so both say the same. */
  readonly clock: RunClock;
  /**
   * Whether to print the heading at the run's first event; yes by default.
   * `halonic runs send` prints its own line instead.
   */
  readonly heading?: boolean;
}

/** Draws a run while `halonic run` follows it; see {@link liveLines}. */
export interface LiveLines {
  /** Pass it as the follow's `onEvent`, to every follow of the run. */
  onEvent(event: RunEvent, events: readonly RunEvent[]): void;
  /** Takes the live line away, when the follow has ended for any reason. */
  end(): void;
}

/** What the live lines know once the run's first event has named its workflow. */
interface KnownRun {
  readonly definitions: RunDefinitions;
  readonly widths: StepColumns;
  readonly models: WorkspaceModels;
}

/**
 * Prints the run's heading and finished step lines ahead, and draws the
 * running step's live line. Every follow reads the log from its first
 * event, so one that follows on after an `--event` reads the steps it
 * already printed again: they are counted, and printed only once.
 *
 * @example
 * const live = liveLines(context, { workspace, workspaceName: "acme", clock });
 * try {
 *   await workflowRuns.startRun(workspace, "support-reply", input, { onEvent: live.onEvent });
 * } finally {
 *   live.end();
 * }
 */
export function liveLines(
  context: Pick<CommandContext, "printAhead" | "progress">,
  facts: LiveLinesFacts,
): LiveLines {
  let known: KnownRun | undefined;
  /** Lines printed ahead after the heading: the empty line, then the step lines. */
  let printedSteps = 0;
  let progress: Progress | undefined;

  const endProgress = () => {
    progress?.end();
    progress = undefined;
  };

  /** Prints the step lines that have ended since the last time. */
  const printFinishedSteps = (run: KnownRun, events: readonly RunEvent[]) => {
    const summary = summarize(events);
    if (summary === null) return;
    const steps = runSteps(events, summary);
    const finished = steps.filter((step) => isFinished(step.end.kind)).length;
    if (finished <= printedSteps) return;
    endProgress();
    const lines = runStepLines(events, summary, run.definitions, facts.clock);
    if (printedSteps === 0) {
      context.printAhead([]);
    }
    for (const line of lines.slice(printedSteps, finished)) {
      context.printAhead(line);
    }
    printedSteps = finished;
  };

  return {
    onEvent(event, events) {
      known ??= knowRun(context, facts, events);
      if (known === undefined) return;
      switch (event.type) {
        case "state.entered":
          if (event.branch !== undefined || event.item !== undefined) break;
          printFinishedSteps(known, events);
          endProgress();
          if (known.definitions.workflow?.states[event.state]?.type !== "final") {
            progress = context.progress(stepDoing(event.state, known.definitions, known.widths));
          }
          break;
        case "llm.request":
          progress?.waitingFor(providerName(known.models, event.provider));
          break;
        case "llm.fallback":
          progress?.waitingFor(fallbackProvider(known.models, event.to));
          break;
        case "llm.response":
        case "llm.skipped":
          progress?.waitingFor(undefined);
          break;
        case "run.waiting":
        case "run.completed":
        case "run.failed":
          endProgress();
          printFinishedSteps(known, events);
          break;
        default:
          break;
      }
    },
    end: endProgress,
  };
}

/**
 * What the live lines need to know about the run, once its first event has
 * named its workflow; then prints the heading, unless `facts` leaves it out.
 */
function knowRun(
  context: Pick<CommandContext, "printAhead">,
  facts: LiveLinesFacts,
  events: readonly RunEvent[],
): KnownRun | undefined {
  const summary = summarize(events);
  if (summary === null) return undefined;
  const definitions = runViewDefinitions(facts.workspace, summary);
  if (facts.heading !== false) {
    context.printAhead(runHeading(summary, definitions, facts.workspaceName));
  }
  return {
    definitions,
    widths: stepColumns(definitions),
    models: workspaceModelsOf(facts.workspace, summary.hubId),
  };
}

/** A step whose line won't change any more: one that ended, or a wait the user answered. */
function isFinished(kind: StepEnd["kind"]): boolean {
  return kind === "done" || kind === "failed" || kind === "answered";
}

/** The provider as its file names it, such as "Anthropic", or else its id. */
function providerName(models: WorkspaceModels, providerId: string): string {
  return printable(models.providers.get(providerId)?.name ?? providerId);
}

/**
 * The provider `llm.fallback` moved the call to: its `to` is an alias or
 * `<provider>/<model>`, as the engine names a model.
 */
function fallbackProvider(models: WorkspaceModels, to: string): string {
  const providerId = models.aliases.get(to)?.provider ?? to.split("/")[0] ?? to;
  return providerName(models, providerId);
}
