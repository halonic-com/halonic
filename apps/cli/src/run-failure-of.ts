// Turns a failed run, as its log records it, into the facts of its two
// failure lines (`RunFailure`, cli-output 3.4). The engine's `run.failed`
// names the reason; the model the run last called, and that model's alias
// and provider file, name the rest. `halonic run` and `halonic runs show`
// both print a failed run through here.

import type { RunEvent } from "@halonicjs/events";
import type { ModelAlias, Provider } from "@halonicjs/format";
import { assertNever } from "@halonicjs/std";
import { filesOf, type LoadedWorkspace, modelAliases } from "@halonicjs/workspace";
import { providerAddress } from "./doctor-workspace.ts";
import type { RunFailure } from "./messages/run-failures.ts";

/** The event a failed run ends with. */
export type RunFailedEvent = Extract<RunEvent, { type: "run.failed" }>;

/** The model a failed run called last, as the workspace describes it. */
export interface FailedModel {
  /** Its alias, such as "smart", or `<provider>/<model>` when no alias points at it. */
  readonly alias: string;
  /** The model's name at its provider, such as "llama3.2". */
  readonly model: string;
  /** The agent the model was called for, such as "sorter". */
  readonly agent: string;
  /** The workspace's name, such as "Acme", from {@link WorkspaceModels.name}. */
  readonly workspace: string;
  /** The provider's id in the workspace, such as "ollama". */
  readonly providerId: string;
  /** The provider's file; `undefined` when the workspace has none by that id. */
  readonly provider: Provider | undefined;
  /**
   * The run skipped this model because its key isn't set, and had no other
   * model left: no key was sent, rather than a key being turned away.
   */
  readonly keyMissing: boolean;
}

/** What {@link failedModelOf} reads from the workspace. */
export interface WorkspaceModels {
  /** The workspace's name, such as "Acme", as `workspace.yaml` gives it; else its id. */
  readonly name: string;
  /**
   * The model aliases the run's hub can use, by name: `modelAliases(workspace, hubId)`
   * with the run's own hub, so a hub's alias over a `models.yaml` one names the model
   * the run called.
   */
  readonly aliases: ReadonlyMap<string, ModelAlias>;
  /** The provider files by id. */
  readonly providers: ReadonlyMap<string, Provider>;
}

/**
 * The aliases a run's hub can use and the workspace's provider files, as
 * {@link failedModelOf} reads them.
 *
 * @example
 * workspaceModelsOf(loaded, "support");
 * // { name: "Acme", aliases: Map { "smart" => { provider: "anthropic", … } }, providers: Map { "anthropic" => { … } } }
 */
export function workspaceModelsOf(workspace: LoadedWorkspace, hubId: string): WorkspaceModels {
  const settings = filesOf(workspace, "workspace")[0]?.value;
  return {
    name: settings?.name ?? settings?.id ?? "",
    aliases: modelAliases(workspace, hubId),
    providers: new Map(filesOf(workspace, "provider").map((file) => [file.value.id, file.value])),
  };
}

/**
 * The model a run called last before it failed, from its log: the last
 * `llm.request`, `llm.fallback` or `llm.skipped`. A model call that fails
 * is the last of these, because the engine logs each move to another model
 * before it calls it.
 *
 * @returns `undefined` when the run called no model
 *
 * @example
 * failedModelOf(events, { aliases, providers });
 * // { alias: "local", agent: "sorter", workspace: "Acme", model: "llama3.2", providerId: "ollama", provider: { type: "ollama", … }, keyMissing: false }
 */
export function failedModelOf(
  events: readonly RunEvent[],
  workspace: WorkspaceModels,
): FailedModel | undefined {
  let last: Omit<FailedModel, "provider" | "workspace"> | undefined;
  for (const event of events) {
    switch (event.type) {
      case "llm.request":
        last = {
          alias: aliasPointingAt(workspace.aliases, event.provider, event.model),
          agent: event.agent,
          model: event.model,
          providerId: event.provider,
          keyMissing: false,
        };
        break;
      case "llm.fallback":
        last = modelNamed(workspace.aliases, event.to, event.agent);
        break;
      case "llm.skipped":
        last = {
          alias: event.alias,
          agent: event.agent,
          model: event.model,
          providerId: event.provider,
          keyMissing: event.reason === "no-key" && event.next === undefined,
        };
        break;
      default:
        break;
    }
  }
  return last === undefined
    ? undefined
    : { ...last, workspace: workspace.name, provider: workspace.providers.get(last.providerId) };
}

/**
 * The facts of a failed run's two lines, from its `run.failed` event and
 * the model it called last (requirement `cli.run-failure`).
 *
 * A reason whose lines need a fact the run log doesn't hold yet gets the
 * general lines, with the engine's own message: `budget` (the budget and
 * the spend), as do the reasons whose words wait for the board (HAL-2264)
 * and a model reason whose model or provider file can't be found.
 *
 * @param model - from {@link failedModelOf}; `undefined` when the run called no model
 * @returns `undefined` for a cancelled run, which prints "Stopped." or
 *   `runsMessages.showCancelled` instead (cli-output 1.5)
 *
 * @example
 * runFailureOf({ type: "run.failed", reason: "model-missing", … }, ollamaModel);
 * // { reason: "model-missing", provider: "Ollama", model: "llama3.2", alias: "local", server: "ollama" }
 */
export function runFailureOf(
  failed: RunFailedEvent,
  model: FailedModel | undefined,
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
    // Worded from its code, as a run the sandbox check refused; a log without one reads as `other`.
    case "sandbox-not-ready":
      return { reason, code: failed.sandboxReason ?? "other" };
    case "out-of-credit":
    case "provider-busy":
      // A busy provider's line names no tries until the engine retries one (revision 39).
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
    case "budget":
    case "model-out-of-memory":
    case "disk-full":
    case "interrupted":
    case "sandbox-start-failed":
    case "harness-start-failed":
    case "harness-unavailable":
    case "answer-not-an-option":
    case "error":
      return generalFailure(failed);
    default:
      return assertNever(reason, "run failure reason");
  }
}

/** `key-refused` or `no-key`, which both name the secret; without one, the general lines. */
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
  const address =
    failed.host ?? (model?.provider === undefined ? undefined : providerAddress(model.provider));
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

/** "Halonic can't tell the cause yet:" with the engine's message, which is safe to show. */
function generalFailure(failed: RunFailedEvent): RunFailure {
  return { reason: "error", message: failed.error };
}

/** The provider as its file names it, such as "Ollama", or else its id. */
function providerName(model: FailedModel): string {
  return model.provider?.name ?? model.providerId;
}

/** The first alias that points at `model` at `provider`, or `<provider>/<model>` as the engine names it. */
function aliasPointingAt(
  aliases: ReadonlyMap<string, ModelAlias>,
  provider: string,
  model: string,
): string {
  for (const [name, target] of aliases) {
    if (target.provider === provider && target.model === model) return name;
  }
  return `${provider}/${model}`;
}

/**
 * The model `llm.fallback` moved to, by its alias or by `<provider>/<model>`.
 *
 * @returns `undefined` for a name that is neither, such as an alias the
 *   workspace no longer has
 */
function modelNamed(
  aliases: ReadonlyMap<string, ModelAlias>,
  name: string,
  agent: string,
): Omit<FailedModel, "provider" | "workspace"> | undefined {
  const target = aliases.get(name);
  if (target !== undefined) {
    return {
      alias: name,
      agent,
      model: target.model,
      providerId: target.provider,
      keyMissing: false,
    };
  }
  // A provider id can't hold a "/", so the model's name is everything after the first one.
  const slash = name.indexOf("/");
  if (slash === -1) return undefined;
  return {
    alias: name,
    agent,
    model: name.slice(slash + 1),
    providerId: name.slice(0, slash),
    keyMissing: false,
  };
}
