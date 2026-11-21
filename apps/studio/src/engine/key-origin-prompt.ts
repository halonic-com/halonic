// "Allow this address?" for the window's own engine (HAL-11873, PR 3b): the
// engine half (`askingModelResolver`) asks only when `mayAsk` says yes, and
// this says yes only for a run a person started here, with Run or from the
// Inbox. A remote engine, a served window and a routine's trigger never get
// here: only the local `EngineService` is given a prompt.

import type { KeyOriginAskOptions } from "@halonicjs/adapter-workspace-models";
import type { ModelScope } from "@halonicjs/engine";
import type { RunEvent } from "@halonicjs/events";
import type { KeyOrigins, RunStore } from "@halonicjs/ports";
import type { KeyAddressQuestions } from "@halonicjs/studio-feature-models/api";

/** What the window gives its engine to ask "Allow this address?". */
export interface KeyOriginPrompt {
  /** The open folder's questions, which the Models feature draws as a dialog. */
  readonly questions: KeyAddressQuestions;
  /**
   * Adds `origin` to the list of the key named `key` through the shell's `secret_allow_origin`
   * (HAL-11887); `true` once it is on the list.
   */
  allowOrigin(key: string, origin: string): Promise<boolean>;
}

/** The run starts a person makes at the window: Run (or a routine's Run now), the Inbox, or a workflow's own Run. */
const askableTriggers: ReadonlySet<string> = new Set(["manual", "inbox"]);

/**
 * The asking options of the window's engine: it asks the open folder's questions, saves through
 * the prompt, and asks only for a run a person started at this window.
 *
 * @example
 * const resolveModel = askingModelResolver(options.resolveModel,
 *   keyOriginAskOf(prompt, { runs, keyOrigins, setTimer }));
 */
export function keyOriginAskOf(
  prompt: KeyOriginPrompt,
  host: {
    readonly runs: Pick<RunStore, "events">;
    readonly keyOrigins: KeyOrigins;
    readonly setTimer: KeyOriginAskOptions["setTimer"];
  },
): KeyOriginAskOptions {
  return {
    mayAsk: (scope) => startedByAPerson(host.runs, scope),
    ask: async (question, { save, signal }) => {
      // The key's addresses now, for the context line; a list that can't be read shows none.
      const allowed = await host.keyOrigins.allowedOrigins(question.key).catch(() => undefined);
      const { provider, key, origin } = question;
      return prompt.questions.ask({ provider, key, origin, allowed }, { save, signal });
    },
    allowOrigin: (key, origin) => prompt.allowOrigin(key, origin),
    setTimer: host.setTimer,
  };
}

/**
 * Whether the call's run was started by a person at this window: its `run.started` has no
 * trigger (a workflow's own Run), or a `manual` or `inbox` one, and it isn't a subflow. A chat
 * turn, a scheduled or signalled run, and a run whose log can't be read are a no.
 */
async function startedByAPerson(
  runs: Pick<RunStore, "events">,
  scope: ModelScope | undefined,
): Promise<boolean> {
  if (scope === undefined) return false;
  const events = await runs.events(scope.runId).catch((): RunEvent[] => []);
  const started = events.find((event) => event.type === "run.started");
  if (started?.type !== "run.started" || started.parent !== undefined) return false;
  return started.trigger === undefined || askableTriggers.has(started.trigger.type);
}
