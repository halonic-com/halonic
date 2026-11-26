// What the waiting list says about each run, so a served wait card shows what an answer is about
// (requirement `server.waiting-run-context`, HAL-19450): the workflow's name, the waiting step's
// description as written, what the run started with and whether the test model wrote its answers.
// A served page can't read the workflow files or the run's log itself.

import { ranOnTestModel } from "@halonicjs/app";
import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { RunStore } from "@halonicjs/ports";
import type { ErrorLog } from "./api.ts";

/** What the waiting list needs to know about the workspace's workflows and models. */
export interface WaitFacts {
  /** A hub's workflow by its id; `undefined` when the workspace has no such workflow. */
  workflow(hubId: string, workflowId: string): WaitWorkflow | undefined;
  /** Whether the provider is the built-in test model, which Studio calls Sample answers. */
  isTestModel(providerId: string): boolean;
}

/** A workflow as the waiting list names it. */
export interface WaitWorkflow {
  /** The name its file gives it. */
  readonly name: string;
  /** The input field its start fills (`start.field`), such as `mail`; left out when it has no start. */
  readonly startField?: string | undefined;
  /** A step's description as written; `undefined` for a step it doesn't have. */
  stepDescription(stateId: string): string | undefined;
}

/** What the waiting list says about one run, in its `context` by the run's id. */
export interface WaitContext {
  /** The workflow's name, or its id when the workspace no longer has it. */
  readonly workflow: string;
  /** The step the run waits at, its description as the workflow file writes it; left out when not known. */
  readonly description?: string;
  /** The text the run started with in its workflow's `start.field`; left out when there is none. */
  readonly startInput?: string;
  /** Every model call of the run went to the test model ("Sample answers"). */
  readonly sample: boolean;
}

/**
 * By run id, the context of each listed run, its log read from `runStore` when the host gives
 * `events`. A run whose log can't be read is left out, and so is every run when the workspace's
 * facts can't be read; the cause goes to the error log and the list itself never fails for them.
 */
export async function waitContextOf(
  runs: readonly RunSummary[],
  waitFacts: () => Promise<WaitFacts>,
  runStore: Partial<Pick<RunStore, "events">>,
  errorLog: ErrorLog,
): Promise<Record<string, WaitContext>> {
  if (runs.length === 0) return {};
  let facts: WaitFacts;
  try {
    facts = await waitFacts();
  } catch (error) {
    errorLog.record(error);
    return {};
  }
  const entries = await Promise.all(
    runs.map(async (run): Promise<[string, WaitContext][]> => {
      try {
        // Without the log the context still names the workflow and step, just not the start or models.
        const events = (await runStore.events?.(run.id)) ?? [];
        return [[run.id, contextOf(run, events, facts)]];
      } catch (error) {
        errorLog.record(error);
        return [];
      }
    }),
  );
  // `fromEntries`, so a run id such as `__proto__` is only ever a key.
  return Object.fromEntries(entries.flat());
}

function contextOf(run: RunSummary, events: readonly RunEvent[], facts: WaitFacts): WaitContext {
  const workflow = facts.workflow(run.hubId, run.workflowId);
  const description = run.state === null ? undefined : workflow?.stepDescription(run.state);
  const field = workflow?.startField;
  const startInput = field === undefined ? undefined : startInputOf(events, field);
  return {
    workflow: workflow?.name ?? run.workflowId,
    ...(description === undefined ? {} : { description }),
    ...(startInput === undefined ? {} : { startInput }),
    // The same check as the CLI's line and Studio's chip, so the three never disagree.
    sample: ranOnTestModel(events, (providerId) => facts.isTestModel(providerId)),
  };
}

/** The text the run started with in `field`; `undefined` when it is missing, empty or not text. */
function startInputOf(events: readonly RunEvent[], field: string): string | undefined {
  const started = events.find((event) => event.type === "run.started");
  if (started?.type !== "run.started") return undefined;
  const value = started.input[field];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
