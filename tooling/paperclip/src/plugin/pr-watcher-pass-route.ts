import type {
  PluginApiRequestInput,
  PluginApiResponse,
  PluginStateClient,
  ScopeKey,
} from "@paperclipai/plugin-sdk";
import { maxInputBytes } from "../signals/pr-watcher-input.ts";
import type { PrWatcherAction, PrWatcherInput } from "../signals/rules/pr-watcher.ts";
import { isBoard } from "./github-routes.ts";

/**
 * The `pr-watcher-pass` route (HAL-19720): the last `pr-watch` pass's rule
 * input and the actions today's watcher took in it, for the `pr-watcher`
 * workflow under `halonic serve`, which holds no GitHub token and reaches
 * Paperclip only through its connection. The workflow decides from `input`;
 * its dry run compares with `actions`. The answer holds task identifiers,
 * agent ids and pull request facts only: no key, login or name. It reads
 * plugin state only, and like `github/summary` it answers the board only.
 */

/** What the route answers. `at` is null before the first pass. */
export interface PrWatcherPassAnswer {
  readonly at: string | null;
  readonly input: PrWatcherInput | null;
  /** The watcher's dones and wakes this pass, for the tasks in `input`. */
  readonly actions: readonly PrWatcherAction[];
  /** True when tasks were left out to keep the answer under the ToolScript `inputBytes` default. */
  readonly truncated: boolean;
}

/** The part of the plugin context the route and the pass use. */
export interface PassRecordApi {
  readonly state: Pick<PluginStateClient, "get" | "set">;
}

const noPass: PrWatcherPassAnswer = { at: null, input: null, actions: [], truncated: false };

function stateKey(companyId: string): ScopeKey {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "signals",
    stateKey: "pr-watcher-pass",
  };
}

function bytesOf(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function answerOf(
  input: PrWatcherInput,
  actions: readonly PrWatcherAction[],
  truncated: boolean,
): PrWatcherPassAnswer {
  const tasks = new Set(input.tasks.map((task) => task.task));
  return {
    at: input.now,
    input,
    actions: actions.filter((action) => tasks.has(action.task)),
    truncated,
  };
}

/**
 * The answer for one pass: the first of the rule's inputs, with the
 * watcher's actions on its tasks. When the rule had more than one input, a
 * task was too large, or the actions push the answer over
 * {@link maxInputBytes}, tasks are left out from the end and it says so.
 *
 * @param empty - the input of a pass with no task to watch
 * @param inputs - the rule's inputs, as `ruleInputs` cut them
 * @param tooLarge - the tasks `ruleInputs` left out
 * @param actions - what today's watcher wrote this pass
 */
export function passAnswer(
  empty: PrWatcherInput,
  inputs: readonly PrWatcherInput[],
  tooLarge: readonly string[],
  actions: readonly PrWatcherAction[],
): PrWatcherPassAnswer {
  const first = inputs[0] ?? empty;
  const cut = inputs.length > 1 || tooLarge.length > 0;
  let tasks = first.tasks;
  let answer = answerOf(first, actions, cut);
  while (bytesOf(answer) > maxInputBytes && tasks.length > 0) {
    tasks = tasks.slice(0, -1);
    answer = answerOf({ ...first, tasks }, actions, true);
  }
  return answer;
}

/** Keeps a pass's answer for the route. */
export async function savePass(
  ctx: PassRecordApi,
  companyId: string,
  answer: PrWatcherPassAnswer,
): Promise<void> {
  await ctx.state.set(stateKey(companyId), answer);
}

function storedAnswer(value: unknown): PrWatcherPassAnswer {
  if (typeof value !== "object" || value === null || !("input" in value) || !("at" in value)) {
    return noPass;
  }
  return value as PrWatcherPassAnswer;
}

/** Answers `GET /pr-watcher/pass`: the last pass's rule input and the watcher's actions. */
export async function handlePrWatcherPass(
  input: PluginApiRequestInput,
  ctx: PassRecordApi,
): Promise<PluginApiResponse> {
  if (!isBoard(input)) {
    return { status: 403, body: { error: "Only the board can read the PR watcher's pass." } };
  }
  return { status: 200, body: storedAnswer(await ctx.state.get(stateKey(input.companyId))) };
}
