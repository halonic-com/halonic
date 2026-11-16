// Picks the model of a run's model call, or a chat turn's, from the
// workspace's files: the alias, its provider file, its fallbacks, the
// provider's secret and the price. It is a plain function of its inputs (the
// loaded workspace, the secrets and the HTTP client) and never reads the
// CLI's printer, argv or `process` (Liam, HAL-3895), so it can move into a
// package Studio shares once Studio starts runs.

import { layeredParams, type ModelScope, type ResolvedModel } from "@halonicjs/engine";
import type { Provider } from "@halonicjs/format";
import type {
  ChatAgentSettings,
  ChatTurnRequest,
  HttpClient,
  LlmProvider,
  Secrets,
} from "@halonicjs/ports";
import {
  callModelName,
  definitionsOf,
  filesOf,
  type HubDefinitions,
  isOnThisMachine,
  type LoadedWorkspace,
  type ModelTarget,
  modelPrice,
  resolveModel,
} from "@halonicjs/workspace";
import { modelTexts } from "./model-texts.ts";
import {
  type ProviderFile,
  WorkspaceModelError,
  workspaceProvider,
} from "./workspace-providers.ts";

/** How many runs' mock providers a resolver keeps; the oldest are dropped first. */
const MOCK_RUNS_KEPT = 32;

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
 * 1. the agent's unsaved settings from the agent editor, when the request has them
 *    (in a local-only workspace, only settings whose address is on this computer);
 * 2. the request's `alias`;
 * 3. the `model` of the request's agent;
 * 4. the hub's default model, else the workspace's.
 *
 * A name with a `/` names a provider and a model directly; any other name is
 * an alias the hub can use, with its own fallbacks. Each provider is built
 * once, on its first call. The exception is a `type: mock` provider, which
 * keeps its script's place: a run gets a mock of its own, so every run starts
 * the script afresh, and a call without a run (a chat turn) gets a new mock each time.
 *
 * @throws {WorkspaceModelError} from the resolver when the call's model names
 *   an alias the hub doesn't have or a provider the workspace doesn't have,
 *   unsaved settings point away from this computer in a local-only workspace,
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
): (request: ChatTurnRequest, scope?: ModelScope) => Promise<ResolvedModel> {
  const hubs = new Map<string, HubDefinitions>();
  const providers = new Map<string, LlmProvider>();
  const mocks = new Map<string, Map<string, LlmProvider>>();
  const context = { secrets: input.secrets, http: input.http };
  const localOnly = filesOf(input.workspace, "workspace")[0]?.value.privacy.localOnly === true;

  const definitionsFor = (hubId: string): HubDefinitions => {
    let definitions = hubs.get(hubId);
    if (definitions === undefined) {
      definitions = definitionsOf(input.workspace, hubId);
      hubs.set(hubId, definitions);
    }
    return definitions;
  };

  const mockFor = (file: Provider, scope: ModelScope | undefined): LlmProvider => {
    if (scope === undefined) {
      return workspaceProvider(file, context);
    }
    let ofRun = mocks.get(scope.runId);
    if (ofRun === undefined) {
      ofRun = new Map();
      mocks.set(scope.runId, ofRun);
      const oldest = mocks.keys().next().value;
      if (mocks.size > MOCK_RUNS_KEPT && oldest !== undefined) {
        mocks.delete(oldest);
      }
    }
    let mock = ofRun.get(file.id);
    if (mock === undefined) {
      mock = workspaceProvider(file, context);
      ofRun.set(file.id, mock);
    }
    return mock;
  };

  const modelAt = (
    definitions: HubDefinitions,
    target: ModelTarget,
    scope: ModelScope | undefined,
  ): ResolvedModel => {
    const file: Provider | undefined = definitions.providers[target.provider];
    if (file === undefined) {
      throw new WorkspaceModelError(
        "no-provider",
        modelTexts.noProvider(target.provider, target.alias ?? target.model),
        modelTexts.noProviderFix(target.provider),
      );
    }
    let provider: LlmProvider | undefined;
    if (file.type === "mock") {
      provider = mockFor(file, scope);
    } else {
      provider = providers.get(file.id);
      if (provider === undefined) {
        provider = workspaceProvider(file, context);
        providers.set(file.id, provider);
      }
    }
    return resolvedModel(provider, file, target);
  };

  return async (request, scope) => {
    if (request.agent !== undefined) {
      return unsavedModel(request.agent, { ...context, localOnly });
    }
    const definitions = definitionsFor(request.hubId);
    const name = callModelName(definitions, request);
    const target = resolveModel(input.workspace, request.hubId, name);
    if (target === undefined) {
      throw new WorkspaceModelError(
        "unknown-model-alias",
        modelTexts.unknownAlias(name, request.hubId),
        modelTexts.unknownAliasFix(),
      );
    }
    const fallback = target.fallback.map((next) => modelAt(definitions, next, scope));
    return { ...modelAt(definitions, target, scope), fallback };
  };
}

/**
 * {@link workspaceModelResolver} for an engine whose workspace can move to
 * a newer version while it is open: each call resolves on `workspace()`,
 * and a new version gets a resolver of its own, with its own providers.
 *
 * @example
 * resolveModel: latestModelResolver({ secrets, http }, () => versions.latest()),
 */
export function latestModelResolver(
  input: Omit<WorkspaceModelResolverInput, "workspace">,
  workspace: () => LoadedWorkspace,
): (request: ChatTurnRequest, scope?: ModelScope) => Promise<ResolvedModel> {
  let last:
    | { workspace: LoadedWorkspace; resolve: ReturnType<typeof workspaceModelResolver> }
    | undefined;
  return async (request, scope) => {
    const now = workspace();
    if (last === undefined || last.workspace !== now) {
      last = { workspace: now, resolve: workspaceModelResolver({ ...input, workspace: now }) };
    }
    return await last.resolve(request, scope);
  };
}

/**
 * The model a provider file and a target make, with its alias's params. The
 * mock model runs on this computer whatever its file says, so its calls cost nothing.
 */
function resolvedModel(
  provider: LlmProvider,
  file: ProviderFile,
  target: ModelTarget,
): ResolvedModel {
  const params = layeredParams(target.params);
  return {
    provider,
    model: target.model,
    local: file.local || file.type === "mock",
    ...(target.alias === undefined ? {} : { alias: target.alias }),
    ...(file.secret === undefined ? {} : { secret: file.secret }),
    ...(target.price === undefined ? {} : { price: modelPrice(target.price) }),
    ...(params === undefined ? {} : { params }),
  };
}

/**
 * The model of the agent editor's unsaved settings: a provider of their own,
 * built for this call. The settings come from the client, so in a local-only
 * workspace their `local` flag is not trusted: the address decides, as it
 * does for the agent host's model route.
 */
function unsavedModel(
  settings: ChatAgentSettings,
  context: { secrets: Secrets; http: HttpClient; localOnly: boolean },
): ResolvedModel {
  if (context.localOnly && !isOnThisMachine({ ...settings, options: {} })) {
    throw new WorkspaceModelError(
      "not-on-this-machine",
      modelTexts.notOnThisMachine(settings.model),
      modelTexts.notOnThisMachineFix(),
    );
  }
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
