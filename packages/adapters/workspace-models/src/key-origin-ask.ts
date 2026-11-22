// Studio's "Allow this address?" (HAL-11873): when a run's model call is
// refused because its stored key may not go to the provider's address, the
// host may ask the person at the window, add the address to the key's list
// and pick the model once more. The wait lives in memory only: it isn't a
// kernel `run.waiting`, so a closed window or a stopped engine loses it, and
// the call fails with the refusal as it would have without the question.

import type { ModelScope, ResolvedModel } from "@halonicjs/engine";
import type { ChatTurnRequest } from "@halonicjs/ports";
import { WorkspaceModelError } from "./workspace-providers.ts";

/** What a person is asked: may this provider send this key to this address? */
export interface KeyOriginQuestion {
  /** The provider's name as the workspace gives it. */
  readonly provider: string;
  /** The stored key's name, never its value. */
  readonly key: string;
  /** The address the key would go to, as the refusal names it. */
  readonly origin: string;
  /** The run the call is made in; a chat turn has none. */
  readonly runId?: string;
}

/** A person's answer: the address was added to the key's list, or they refused. */
export type KeyOriginAnswer = "allowed" | "not-allowed";

/** How {@link askingModelResolver} asks, saves and waits. */
export interface KeyOriginAskOptions {
  /**
   * Whether a person can be asked about this call: the host says yes only for a run a person
   * started at the window, never for a scheduled run or one with nobody to ask.
   */
  mayAsk(scope: ModelScope | undefined): boolean | Promise<boolean>;
  /**
   * Asks the person. On Allow the asker calls `save`, which adds the question's address to the
   * key's list and says whether it did, and answers `allowed` only once it did; it can't add any
   * other address. When `signal` aborts, the wait is over without an answer, and the asker
   * closes the question.
   */
  ask(
    question: KeyOriginQuestion,
    options: { readonly save: () => Promise<boolean>; readonly signal: AbortSignal },
  ): Promise<KeyOriginAnswer>;
  /** Adds `origin` to the list of the key named `key`; `false` when it couldn't. */
  allowOrigin(key: string, origin: string): Promise<boolean>;
  /** Starts a timer and returns a function that clears it. */
  setTimer(callback: () => void, delayMs: number): () => void;
  /** How long a question waits for an answer; 10 minutes when left out. */
  readonly waitMs?: number;
}

/** How long a question waits for an answer when the host gives no time. */
export const keyOriginWaitMs = 10 * 60 * 1000;

/**
 * `resolve`, with Studio's question for a key that may not go to its provider's address
 * (requirements `cli.key-origin-ask` and `cli.key-origin-ask-refused-once`). When `resolve`
 * refuses with `key-origin-not-allowed` and `mayAsk` says yes, it writes `key-origin.asked` to
 * the run's log, so the run page can say the step waits for an answer, and asks once. An
 * `allowed` or `not-allowed` answer goes to the run's log as `key-origin.answered`. After `allowed` it calls `resolve` again, once, with every check made
 * again; after `not-allowed`, a stop or no answer in time, it throws the refusal. Once a person
 * said `not-allowed` in a run, the same key and address in that run fail with the refusal and
 * nobody is asked again. Any other error is thrown as it is.
 *
 * @throws what `resolve` throws, and the refusal when the person didn't allow the address
 */
export function askingModelResolver(
  resolve: (request: ChatTurnRequest, scope?: ModelScope) => Promise<ResolvedModel>,
  options: KeyOriginAskOptions,
): (request: ChatTurnRequest, scope?: ModelScope) => Promise<ResolvedModel> {
  const refusals = new RunRefusals();
  return async (request, scope) => {
    try {
      return await resolve(request, scope);
    } catch (error) {
      if (!(await askedAndAllowed(error, scope, options, refusals))) throw error;
      return await resolve(request, scope);
    }
  };
}

/**
 * The key and address pairs a person refused, per run, so a run asks about each pair at most
 * once (UX checklist on HAL-11873: "After a refusal in the same run, not asked again either").
 * A call outside a run (a chat turn) has no run to remember it in, and is never remembered.
 */
class RunRefusals {
  readonly #refused = new Set<string>();

  has(runId: string | undefined, refused: Omit<KeyOriginQuestion, "runId">): boolean {
    return runId !== undefined && this.#refused.has(RunRefusals.#id(runId, refused));
  }

  add(runId: string | undefined, refused: Omit<KeyOriginQuestion, "runId">): void {
    if (runId !== undefined) this.#refused.add(RunRefusals.#id(runId, refused));
  }

  // JSON keeps the parts apart, whatever characters a key's name holds.
  static #id(runId: string, { key, origin }: Omit<KeyOriginQuestion, "runId">): string {
    return JSON.stringify([runId, key, origin]);
  }
}

/**
 * Whether `error` is a refusal the person was asked about and allowed. Writes the question and
 * the answer, if there was one, to the run's log, and remembers a `not-allowed` for the run.
 */
async function askedAndAllowed(
  error: unknown,
  scope: ModelScope | undefined,
  options: KeyOriginAskOptions,
  refusals: RunRefusals,
): Promise<boolean> {
  const refused = refusedAddress(error);
  if (refused === undefined || scope?.stop?.stopped === true) return false;
  if (refusals.has(scope?.runId, refused)) return false;
  if (!(await options.mayAsk(scope))) return false;
  const question = scope === undefined ? refused : { ...refused, runId: scope.runId };
  await scope?.log?.append({ type: "key-origin.asked", ...refused });
  const answer = await answerOf(question, scope, options);
  if (answer === undefined) return false;
  await scope?.log?.append({ type: "key-origin.answered", ...refused, answer });
  if (answer === "not-allowed") refusals.add(scope?.runId, refused);
  return answer === "allowed";
}

/** The provider, key and address a `key-origin-not-allowed` refusal names; `undefined` for any other error. */
function refusedAddress(error: unknown): Omit<KeyOriginQuestion, "runId"> | undefined {
  if (!(error instanceof WorkspaceModelError) || error.code !== "key-origin-not-allowed") {
    return undefined;
  }
  const detail = error.failureCause.detail;
  const provider = detail?.["provider"];
  const key = detail?.["key"];
  const origin = detail?.["origin"];
  if (provider === undefined || key === undefined || origin === undefined) return undefined;
  return { provider, key, origin };
}

/**
 * The person's answer, or `undefined` when the call was stopped, the wait timed out or the
 * question couldn't be asked. Saving adds only the refused address, which comes from the
 * host's own check, never from the window.
 */
async function answerOf(
  question: KeyOriginQuestion,
  scope: ModelScope | undefined,
  options: KeyOriginAskOptions,
): Promise<KeyOriginAnswer | undefined> {
  const over = new AbortController();
  const ended = new Promise<undefined>((settle) => {
    over.signal.addEventListener("abort", () => settle(undefined), { once: true });
  });
  const clearTimer = options.setTimer(() => over.abort(), options.waitMs ?? keyOriginWaitMs);
  const stopListening = scope?.stop?.onStop(() => over.abort());
  try {
    const asked = options
      .ask(question, {
        save: () => options.allowOrigin(question.key, question.origin),
        signal: over.signal,
      })
      .catch(() => undefined);
    return await Promise.race([asked, ended]);
  } finally {
    clearTimer();
    stopListening?.();
    over.abort();
  }
}
