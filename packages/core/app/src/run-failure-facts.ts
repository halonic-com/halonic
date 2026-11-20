// Turns a failed run, as its log records it, into the facts its failure
// lines name (`RunFailure`, cli-output 3.4). The engine's `run.failed` names
// the reason; the model the run last called, and that model's alias and
// provider file, name the rest. The facts are data, never words: the CLI
// and Studio each word them in their own catalogue, from the same facts.

import type { RunFailureCause } from "@halonicjs/events";
import { assertNever } from "@halonicjs/std";
import type { FailedModel, FailedStart, RunFailedEvent } from "./failed-model.ts";
import { budgetStopOf, nextMonthStart } from "./run-failure-budget.ts";

/** What both key failures name: the provider, the secret that holds its key, and the alias that uses it. */
interface KeyFacts {
  /** The provider as its file names it, such as "OpenAI", or else its id. */
  readonly provider: string;
  /** The secret's name in the provider file, such as `openai-key`. */
  readonly secret: string;
  readonly alias: string;
}

/** How often Halonic asked a busy provider again, and for how long. */
export interface BusyRetries {
  readonly tries: number;
  readonly overMs: number;
}

/** How long the engine waits for a model's first answer. */
const modelFirstAnswerMs = 5 * 60_000;

/**
 * Why a run failed, by microcopy 15.3's reasons, with the facts each
 * reason's lines need. A provider is named as its file names it, such as
 * "OpenAI", or else by its id. Not every engine reason has its own facts:
 *
 * - `disk-full`, `interrupted` and `answer-not-an-option` are `error` with
 *   `causeKnown`, and `harness-unavailable` is `error` (HAL-6451);
 * - `cancelled` isn't a failure, so {@link runFailureOf} gives it none.
 */
export type RunFailure =
  | ({ readonly reason: "key-refused" } & KeyFacts)
  | ({ readonly reason: "no-key" } & KeyFacts)
  | { readonly reason: "signed-out"; readonly service: string; readonly account: string }
  | { readonly reason: "out-of-credit"; readonly provider: string }
  | {
      readonly reason: "provider-busy";
      readonly provider: string;
      /** Only once the engine retries a busy provider; left out, the lines name no tries (revision 39). */
      readonly retried?: BusyRetries;
    }
  | {
      readonly reason: "model-unreachable";
      readonly provider: string;
      /** The host and port, such as "localhost:11434". */
      readonly address: string;
      readonly alias: string;
      /** A model on this computer, such as Ollama, rather than a cloud provider. */
      readonly local: boolean;
    }
  | {
      readonly reason: "model-missing";
      readonly provider: string;
      readonly model: string;
      readonly alias: string;
      /** Only Ollama has a command that downloads a model; another local server, such as LM Studio, downloads it in its own window. */
      readonly server: "ollama" | "other";
    }
  | {
      readonly reason: "model-timeout";
      readonly provider: string;
      /** How long the engine waited for the first answer. */
      readonly withinMs: number;
      /** Only for a model on this computer, which may still be loading. */
      readonly localAddress?: string;
    }
  | {
      readonly reason: "budget";
      readonly per: "run";
      readonly budget: number;
      readonly spent: number;
      /** The workspace's `budget.currency`, such as "EUR", which both amounts are in. */
      readonly currency: string;
    }
  | {
      readonly reason: "budget";
      readonly per: "month";
      readonly budget: number;
      readonly currency: string;
      /** When the monthly budget starts again, as an ISO date such as "2026-12-01" (UTC). */
      readonly resetsOn: string;
    }
  | {
      readonly reason: "turn-limit";
      readonly agent: string;
      readonly turns: number;
      readonly agentFile: string;
      /** The tool its last turns called without getting anything back, when the run log has them. */
      readonly emptyCallsTo?: string;
    }
  | {
      readonly reason: "tool-timeout";
      readonly tool: string;
      readonly connector: string;
      readonly withinMs: number;
    }
  | {
      readonly reason: "local-only";
      readonly workspace: string;
      readonly provider: string;
      readonly agent: string;
      readonly alias: string;
    }
  | { readonly reason: "site-blocked"; readonly agent: string; readonly site: string }
  | {
      readonly reason: "sandbox-not-ready";
      /** The `Sandbox` port's reason code from the run log, such as `bubblewrap-missing`. */
      readonly code: string;
    }
  | {
      readonly reason: "model-out-of-memory";
      readonly provider: string;
      /** The model that didn't fit, such as "llama3.1:70b". */
      readonly model: string;
      readonly alias: string;
    }
  | {
      readonly reason: "sandbox-start-failed";
      readonly agent: string;
      /** The `Sandbox` port's reason code from the run log; left out when the log has none. */
      readonly code?: string;
    }
  | {
      readonly reason: "harness-start-failed";
      readonly agent: string;
      /** The harness program's id, such as "claude-code". */
      readonly harness: string;
      /** Why it didn't start, when the run log says. */
      readonly cause?: "not-installed" | "signed-out";
      /** How long the engine waited for its first event. */
      readonly withinMs: number;
    }
  | {
      readonly reason: "unknown-provider-type";
      /** The provider's id, which is also its file's name, such as "acme". */
      readonly provider: string;
      /** The type its file names, which Halonic has no adapter for. */
      readonly type: string;
    }
  | {
      readonly reason: "unknown-model-alias";
      /** The alias the step's model call named, such as "default". */
      readonly alias: string;
      /** The id of the run's hub, such as "notes". */
      readonly hub: string;
    }
  | {
      readonly reason: "model-no-tools";
      /** The model the alias points at, such as "llama3.2". */
      readonly model: string;
      readonly alias: string;
    }
  | {
      readonly reason: "error";
      /** The engine's own message, which is safe to show. */
      readonly message?: string;
      /** The engine knows the cause, such as a full disk, so a bug report wouldn't help (HAL-6451). */
      readonly causeKnown?: true;
    }
  | { readonly reason: "internal" };

/**
 * The facts of a failed run, from its `run.failed` event and the model it
 * called last (requirement `app.run-failure`).
 *
 * `budget` reads its figures from the engine's cause, or from its error text
 * in a log written before the cause. A reason whose facts the run log doesn't
 * hold gets `error` with the engine's own message: `harness-unavailable`, a
 * budget stop whose error doesn't read as the engine writes it, and a reason
 * whose model, provider file or started step can't be found. `disk-full`,
 * `interrupted` and `answer-not-an-option` have a known cause, so they get
 * `causeKnown` (HAL-6451).
 *
 * @param model - from `failedModelOf`; `undefined` when the run called no model
 * @param started - from `failedStartOf`; read for `sandbox-start-failed` and `harness-start-failed`
 * @returns `undefined` for a cancelled run, which isn't a failure
 *
 * @example
 * runFailureOf({ type: "run.failed", reason: "model-missing", … }, ollamaModel);
 * // { reason: "model-missing", provider: "Ollama", model: "llama3.2", alias: "local", server: "ollama" }
 */
export function runFailureOf(
  failed: RunFailedEvent,
  model: FailedModel | undefined,
  started?: FailedStart,
): RunFailure | undefined {
  const reason = failed.reason ?? "error";
  switch (reason) {
    case "cancelled":
      return undefined;
    case "key-refused":
      return keyFailure(failed, model);
    case "model-missing":
      return model === undefined
        ? generalFailure(failed)
        : {
            reason,
            provider: providerName(model),
            model: model.model,
            alias: model.alias,
            // Only Ollama downloads a model with a command; a server we can't find gets the general fix.
            server: model.provider?.type === "ollama" ? "ollama" : "other",
          };
    case "model-no-tools":
      return model === undefined
        ? generalFailure(failed)
        : { reason, model: model.model, alias: model.alias };
    case "model-unreachable":
      return unreachableFailure(failed, model);
    case "model-timeout":
      return timeoutFailure(failed, model);
    // Named by its code, as a run the sandbox check refused; a log without one reads as `other`.
    case "sandbox-not-ready":
      return { reason, code: failed.sandboxReason ?? "other" };
    case "out-of-credit":
    case "provider-busy":
      // A busy provider names no tries until the engine retries one (revision 39).
      return model === undefined
        ? generalFailure(failed)
        : { reason, provider: providerName(model) };
    // Nothing was sent: the run log's last `llm.skipped` names the model and its agent.
    case "local-only":
      return model === undefined
        ? generalFailure(failed)
        : {
            reason,
            workspace: model.workspace,
            provider: providerName(model),
            agent: model.agent,
            alias: model.alias,
          };
    case "disk-full":
    case "interrupted":
    case "answer-not-an-option":
      return { ...generalFailure(failed), causeKnown: true };
    case "model-out-of-memory":
      return outOfMemoryFailure(failed, model);
    case "sandbox-start-failed":
      return sandboxFailure(failed, started);
    case "harness-start-failed":
      return harnessFailure(failed, started);
    case "budget":
      return budgetFailure(failed);
    case "error":
      return setupFailureOf(failed.cause) ?? generalFailure(failed);
    case "harness-unavailable":
    case "instructions-not-trusted":
      return generalFailure(failed);
    default:
      return assertNever(reason, "run failure reason");
  }
}

/** `budget` with the stop's figures; a monthly budget resets on the first of the next month (UTC). */
function budgetFailure(failed: RunFailedEvent): RunFailure {
  const stop = budgetStopOf(failed.cause, failed.error);
  if (stop === undefined) {
    return generalFailure(failed);
  }
  const { currency, budget, spent } = stop;
  return stop.per === "run"
    ? { reason: "budget", per: "run", budget, spent, currency }
    : { reason: "budget", per: "month", budget, currency, resetsOn: nextMonthStart(failed.at) };
}

/** `model-out-of-memory` at the model the run called last. */
function outOfMemoryFailure(failed: RunFailedEvent, model: FailedModel | undefined): RunFailure {
  if (model === undefined) {
    return generalFailure(failed);
  }
  return {
    reason: "model-out-of-memory",
    provider: providerName(model),
    model: model.model,
    alias: model.alias,
  };
}

/** `sandbox-start-failed` for the agent of the step whose sandbox didn't start. */
function sandboxFailure(failed: RunFailedEvent, started: FailedStart | undefined): RunFailure {
  return started === undefined
    ? generalFailure(failed)
    : {
        reason: "sandbox-start-failed",
        agent: started.agent,
        // Left out for a log from before the engine named it.
        ...(failed.sandboxReason === undefined ? {} : { code: failed.sandboxReason }),
      };
}

/** `harness-start-failed` for the program the step's `harness.started` names, and how long the engine waited for it. */
function harnessFailure(failed: RunFailedEvent, started: FailedStart | undefined): RunFailure {
  if (started?.harness === undefined) {
    return generalFailure(failed);
  }
  return {
    reason: "harness-start-failed",
    agent: started.agent,
    harness: started.harness.id,
    withinMs: started.harness.timeoutMs,
    ...(failed.harnessCause === undefined ? {} : { cause: failed.harnessCause }),
  };
}

/** `key-refused` or `no-key`, which both name the secret; without one, the general facts. */
function keyFailure(failed: RunFailedEvent, model: FailedModel | undefined): RunFailure {
  const secret = model?.provider?.secret;
  if (model === undefined || secret === undefined) {
    return generalFailure(failed);
  }
  return {
    reason: model.keyMissing ? "no-key" : "key-refused",
    provider: providerName(model),
    secret,
    alias: model.alias,
  };
}

/** `model-unreachable` at the host the engine names, or else at the provider's own address. */
function unreachableFailure(failed: RunFailedEvent, model: FailedModel | undefined): RunFailure {
  const address = failed.host ?? model?.address;
  if (model === undefined || address === undefined) {
    return generalFailure(failed);
  }
  return {
    reason: "model-unreachable",
    provider: providerName(model),
    address,
    alias: model.alias,
    local: model.provider?.local ?? false,
  };
}

/** `model-timeout`: a model on this computer also gets the address, as it may still be loading. */
function timeoutFailure(failed: RunFailedEvent, model: FailedModel | undefined): RunFailure {
  if (model === undefined) {
    return generalFailure(failed);
  }
  const address = failed.host ?? model.address;
  return {
    reason: "model-timeout",
    provider: providerName(model),
    withinMs: modelFirstAnswerMs,
    ...(model.provider?.local === true && address !== undefined ? { localAddress: address } : {}),
  };
}

/**
 * The failure an `error` names by its cause's code, when it has facts of
 * its own. These are the workspace's own setup, not a bug: a provider file
 * whose type Halonic can't call (HAL-12342), and a model alias the hub
 * doesn't have, such as `default` in a workspace made with plain
 * `halonic init` (HAL-12377). A cause without the names its facts need is
 * `error`.
 */
function setupFailureOf(cause: RunFailureCause | undefined): RunFailure | undefined {
  const { code, detail = {} } = cause ?? {};
  switch (code) {
    case "models.unknown-provider-type": {
      const { provider, type } = detail;
      return provider === undefined || type === undefined
        ? undefined
        : { reason: "unknown-provider-type", provider, type };
    }
    case "models.unknown-model-alias": {
      const { alias, hub } = detail;
      return alias === undefined || hub === undefined
        ? undefined
        : { reason: "unknown-model-alias", alias, hub };
    }
    default:
      return undefined;
  }
}

/**
 * Whether a failed run's cause is one of the workspace's setup problems with
 * facts of its own, so a client can treat the run by the cause's own kind,
 * the kind `--json` shows in the run's `cause`, rather than as a broken run
 * (HAL-12377).
 */
export function isSetupCause(cause: RunFailureCause | undefined): cause is RunFailureCause {
  return setupFailureOf(cause) !== undefined;
}

/** The engine's own message, which is safe to show, for a failure without facts of its own. */
function generalFailure(failed: RunFailedEvent): Extract<RunFailure, { reason: "error" }> {
  return { reason: "error", message: failed.error };
}

/** The provider as its file names it, such as "Ollama", or else its id. */
function providerName(model: FailedModel): string {
  return model.provider?.name ?? model.providerId;
}
