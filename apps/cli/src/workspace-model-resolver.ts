// Picks the model of a run's model call, or a chat turn's, from the
// workspace's files: the alias, its provider file, its fallbacks, the
// provider's secret and the price. It is a plain function of its inputs (the
// loaded workspace, the secrets and the HTTP client) and never reads the
// CLI's printer, argv or `process` (Liam, HAL-3895), so it can move into a
// package Studio shares once Studio starts runs.

import type { ResolvedModel } from "@halonicjs/engine";
import type { Provider } from "@halonicjs/format";
import type {
  ChatAgentSettings,
  ChatTurnRequest,
  HttpClient,
  LlmProvider,
  ModelPrice,
  Secrets,
} from "@halonicjs/ports";
import {
  definitionsOf,
  type HubDefinitions,
  type LoadedWorkspace,
  type ModelTarget,
  resolveModel,
} from "@halonicjs/workspace";
import { modelMessages } from "./messages/models.ts";
import {
  type ProviderFile,
  WorkspaceModelError,
  workspaceProvider,
} from "./workspace-providers.ts";

/** What {@link workspaceModelResolver} reads. */
export interface WorkspaceModelResolverInput {
  /** The loaded workspace, checked for errors before a run starts. */
  readonly workspace: LoadedWorkspace;
  /** The CLI's remembered secrets, never a raw adapter (`apps/cli/AGENTS.md`). */
  readonly secrets: Secrets;
  readonly http: HttpClient;
}

/**
 * The engine's `resolveModel` for one workspace. A call's model is, in order:
 *
 * 1. the agent's unsaved settings from the agent editor, when the request has them;
 * 2. the request's `alias`;
 * 3. the `model` of the request's agent;
 * 4. the hub's default model, else the workspace's.
 *
 * A name with a `/` names a provider and a model directly; any other name is
 * an alias the hub can use, with its own fallbacks. Each provider is built
 * once, on its first call.
 *
 * @throws {WorkspaceModelError} from the resolver when the call's model names
 *   an alias the hub doesn't have or a provider the workspace doesn't have,
 *   or the provider can't be built (see `workspaceProvider`)
 * @throws RangeError from the resolver when the workspace has no such hub
 *
 * @example
 * const resolve = workspaceModelResolver({ workspace, secrets, http: { fetch } });
 * await resolve({ hubId: "support", agentId: "writer", messages, tools: [] });
 * // { provider, model: "claude-opus-5-5", alias: "smart", secret: "anthropic-key", fallback: [] }
 */
export function workspaceModelResolver(
  input: WorkspaceModelResolverInput,
): (request: ChatTurnRequest) => Promise<ResolvedModel> {
  const hubs = new Map<string, HubDefinitions>();
  const providers = new Map<string, LlmProvider>();
  const context = { secrets: input.secrets, http: input.http };

  const definitionsFor = (hubId: string): HubDefinitions => {
    let definitions = hubs.get(hubId);
    if (definitions === undefined) {
      definitions = definitionsOf(input.workspace, hubId);
      hubs.set(hubId, definitions);
    }
    return definitions;
  };

  const modelAt = (definitions: HubDefinitions, target: ModelTarget): ResolvedModel => {
    const file: Provider | undefined = definitions.providers[target.provider];
    if (file === undefined) {
      throw new WorkspaceModelError(
        "no-provider",
        modelMessages.noProvider(target.provider, target.alias ?? target.model),
        modelMessages.noProviderFix(target.provider),
      );
    }
    let provider = providers.get(file.id);
    if (provider === undefined) {
      provider = workspaceProvider(file, context);
      providers.set(file.id, provider);
    }
    return resolvedModel(provider, file, target);
  };

  return async (request) => {
    if (request.agent !== undefined) {
      return unsavedModel(request.agent, context);
    }
    const definitions = definitionsFor(request.hubId);
    // `default` is the format's own default, for a workspace.yaml that didn't parse.
    const name =
      request.alias ??
      agentModel(definitions, request.agentId) ??
      definitions.defaultModel ??
      "default";
    const target = resolveModel(input.workspace, request.hubId, name);
    if (target === undefined) {
      throw new WorkspaceModelError(
        "unknown-model-alias",
        modelMessages.unknownAlias(name, request.hubId),
        modelMessages.unknownAliasFix(),
      );
    }
    const fallback = target.fallback.map((next) => modelAt(definitions, next));
    return { ...modelAt(definitions, target), fallback };
  };
}

/** The `model` of the agent a call is for, in its hub; `undefined` without one. */
function agentModel(definitions: HubDefinitions, agentId: string | undefined): string | undefined {
  return agentId === undefined ? undefined : definitions.agents[agentId]?.model;
}

/**
 * The model a provider file and a target make. The mock model runs on this
 * computer whatever its file says, so its calls cost nothing.
 */
function resolvedModel(
  provider: LlmProvider,
  file: ProviderFile,
  target: ModelTarget,
): ResolvedModel {
  return {
    provider,
    model: target.model,
    local: file.local || file.type === "mock",
    ...(target.alias === undefined ? {} : { alias: target.alias }),
    ...(file.secret === undefined ? {} : { secret: file.secret }),
    ...(target.price === undefined ? {} : { price: modelPrice(target.price) }),
  };
}

/**
 * An alias's price as the engine takes it: the file format reads a cache
 * price it doesn't have as `undefined`, the engine wants it left out.
 */
function modelPrice(price: NonNullable<ModelTarget["price"]>): ModelPrice {
  const { input, output, cacheRead, cacheWrite, cacheWrite1h } = price;
  return {
    input,
    output,
    ...(cacheRead === undefined ? {} : { cacheRead }),
    ...(cacheWrite === undefined ? {} : { cacheWrite }),
    ...(cacheWrite1h === undefined ? {} : { cacheWrite1h }),
  };
}

/** The model of the agent editor's unsaved settings: a provider of their own, built for this call. */
function unsavedModel(
  settings: ChatAgentSettings,
  context: { secrets: Secrets; http: HttpClient },
): ResolvedModel {
  const file: ProviderFile = {
    id: settings.type,
    type: settings.type,
    local: settings.local,
    options: {},
    ...(settings.baseUrl === undefined ? {} : { baseUrl: settings.baseUrl }),
    ...(settings.secret === undefined ? {} : { secret: settings.secret }),
  };
  return resolvedModel(workspaceProvider(file, context), file, {
    provider: file.id,
    model: settings.model,
    params: {},
  });
}
