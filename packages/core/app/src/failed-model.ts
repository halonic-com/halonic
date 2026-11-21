// What a failed run's log says about the model it called last and the step
// that didn't start, with the names the workspace gives them. The CLI's
// failure lines and Studio's run page both read a failed run through here.

import type { RunEvent } from "@halonicjs/events";
import type { ModelAlias, Provider } from "@halonicjs/format";
import { filesOf, type LoadedWorkspace, modelAliases } from "@halonicjs/workspace";

/** The event a failed run ends with. */
export type RunFailedEvent = Extract<RunEvent, { type: "run.failed" }>;

/**
 * What `runFailureOf` reads of a `run.failed` event. A failed chat
 * answer gives the same facts, without the time a run failed at
 * (`chatFailureOf`).
 */
export type RunFailedFacts = Pick<
  RunFailedEvent,
  "error" | "reason" | "host" | "cause" | "sandboxReason" | "harnessCause" | "agent" | "changed"
> & { readonly at?: string };

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
   * The provider's host and port, such as "localhost:11434", from
   * {@link WorkspaceModels.addresses}; `undefined` when it has none.
   */
  readonly address: string | undefined;
  /**
   * The run skipped this model because its key isn't set, and had no other
   * model left: no key was sent, rather than a key being turned away.
   */
  readonly keyMissing: boolean;
}

/** The step that failed while starting its sandbox or its harness program, as the run log names it. */
export interface FailedStart {
  /** The agent of the step, such as "writer". */
  readonly agent: string;
  /** The harness program the agent runs in; `undefined` for a failed sandbox. */
  readonly harness?: { readonly id: string; readonly timeoutMs: number };
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
  /** Each provider's host and port by id, such as "ollama" => "localhost:11434"; a provider without one is left out. */
  readonly addresses: ReadonlyMap<string, string>;
}

/**
 * A provider's host and port, such as "localhost:11434"; `undefined` when
 * its file gives no `baseUrl` and its type has no default address. Core
 * doesn't know the model servers' default addresses, so the caller passes
 * the function that does.
 */
export type ProviderAddressOf = (provider: Provider) => string | undefined;

/**
 * The aliases a run's hub can use and the workspace's provider files, as
 * {@link failedModelOf} reads them.
 *
 * @example
 * workspaceModelsOf(loaded, "support", providerAddress);
 * // { name: "Acme", aliases: Map { "smart" => { provider: "anthropic", … } }, providers: Map { "anthropic" => { … } }, addresses: Map {} }
 */
export function workspaceModelsOf(
  workspace: LoadedWorkspace,
  hubId: string,
  addressOf: ProviderAddressOf,
): WorkspaceModels {
  const settings = filesOf(workspace, "workspace")[0]?.value;
  const providers = new Map(
    filesOf(workspace, "provider").map((file) => [file.value.id, file.value]),
  );
  const addresses = new Map<string, string>();
  for (const [id, provider] of providers) {
    const address = addressOf(provider);
    if (address !== undefined) addresses.set(id, address);
  }
  return {
    name: settings?.name ?? settings?.id ?? "",
    aliases: modelAliases(workspace, hubId),
    providers,
    addresses,
  };
}

/** A {@link FailedModel} before the workspace's facts about its provider are added. */
type CalledModel = Omit<FailedModel, "provider" | "workspace" | "address">;

/**
 * The model a run called last before it failed, from its log: the last
 * `llm.request`, `llm.fallback` or `llm.skipped`. A model call that fails
 * is the last of these, because the engine logs each move to another model
 * before it calls it.
 *
 * @returns `undefined` when the run called no model
 *
 * @example
 * failedModelOf(events, { name, aliases, providers, addresses });
 * // { alias: "local", agent: "sorter", workspace: "Acme", model: "llama3.2", providerId: "ollama", provider: { type: "ollama", … }, address: "localhost:11434", keyMissing: false }
 */
export function failedModelOf(
  events: readonly RunEvent[],
  workspace: WorkspaceModels,
): FailedModel | undefined {
  let last: CalledModel | undefined;
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
    : {
        ...last,
        workspace: workspace.name,
        provider: workspace.providers.get(last.providerId),
        address: workspace.addresses.get(last.providerId),
      };
}

/**
 * The agent, and its harness program, of the step that failed to start: the
 * step's own `sandbox.started` or `harness.started`, which the engine logs
 * before it opens or starts anything. An earlier step's event doesn't count.
 *
 * @returns `undefined` when the step's log has no such event, as when the
 *   engine had no harness of that id to start
 *
 * @example
 * failedStartOf(events, failed);
 * // { agent: "writer", harness: { id: "claude-code", timeoutMs: 60000 } }
 */
export function failedStartOf(
  events: readonly RunEvent[],
  failed: RunFailedEvent,
): FailedStart | undefined {
  let start: FailedStart | undefined;
  for (const event of events) {
    if (!("state" in event) || event.state !== failed.state) continue;
    if (event.type === "sandbox.started" && failed.reason === "sandbox-start-failed") {
      start = { agent: event.agent };
    } else if (event.type === "harness.started" && failed.reason === "harness-start-failed") {
      start = { agent: event.agent, harness: { id: event.harness, timeoutMs: event.timeoutMs } };
    }
  }
  return start;
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
): CalledModel | undefined {
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
