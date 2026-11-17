// The part of the executor's options that comes from the workspace's files
// and none of the host's stores, scheduler or lock (HAL-10236): which model a
// call uses, which agent a chat turn names, whether the workspace is local
// only. The CLI's `openLocalEngine` and the Studio's `EngineService` both
// build it here, so the two engines answer a model call the same way.

import type { ListedToolApproval, LocalExecutorOptions } from "@halonicjs/engine";
import type { Agent } from "@halonicjs/format";
import type {
  ChatTurnRequest,
  Clock,
  ConnectorClient,
  HttpClient,
  KeyOrigins,
  Secrets,
} from "@halonicjs/ports";
import {
  connectorToolsOf,
  definitionsOf,
  filesOf,
  type LoadedWorkspace,
} from "@halonicjs/workspace";
import { abortOnStop } from "./abort-on-stop.ts";
import type { WorkspaceModelResolverInput } from "./workspace-model-resolver.ts";
import { latestModelResolver } from "./workspace-model-resolver.ts";

/** What {@link workspaceExecutorOptions} reads. */
export interface WorkspaceExecutorInput {
  /** The loaded workspace, checked for errors and trusted before a run starts. */
  readonly workspace: LoadedWorkspace;
  /**
   * The workspace as it is now, for an engine whose runs read more than one
   * version (`routines watch`). Left out, everything reads `workspace`.
   */
  readonly latest?: () => LoadedWorkspace;
  /** The host's remembered secrets, never a raw adapter. */
  readonly secrets: Secrets;
  /** What the model providers call their servers with. */
  readonly http: HttpClient;
  readonly clock: Clock;
  /**
   * Whether the workspace is trusted on this computer, asked on every model
   * call: a provider's stored key goes to a non-default address only when it
   * is (see {@link WorkspaceModelResolverInput.isTrusted}).
   */
  readonly isTrusted: () => boolean | Promise<boolean>;
  /** The origins each stored key may be sent to (see {@link WorkspaceModelResolverInput.keyOrigins}). */
  readonly keyOrigins: KeyOrigins;
  /** Which tools a server lists a person approved; the host chooses, so none is offered by default. */
  readonly listedToolApproval: ListedToolApproval;
  /** The connected servers a chat turn calls; none by default. */
  readonly connectors?: readonly ConnectorClient[];
}

/** The executor options {@link workspaceExecutorOptions} fills; the host adds `runs`. */
export type WorkspaceExecutorOptions = Omit<LocalExecutorOptions, "runs">;

/**
 * The executor options that depend only on the workspace's files. The host
 * adds its `runs` (stores, ids, harnesses) and anything else of its own.
 *
 * @example
 * const options = { ...workspaceExecutorOptions({ workspace, secrets, http, clock }), runs };
 */
export function workspaceExecutorOptions(input: WorkspaceExecutorInput): WorkspaceExecutorOptions {
  const latest = input.latest ?? (() => input.workspace);
  return {
    resolveModel: latestModelResolver(
      {
        secrets: input.secrets,
        http: input.http,
        isTrusted: input.isTrusted,
        keyOrigins: input.keyOrigins,
      },
      latest,
    ),
    halonicTools: [],
    connectors: input.connectors ?? [],
    secrets: input.secrets,
    clock: input.clock,
    listedToolApproval: input.listedToolApproval,
    // A chat turn reads the workspace's files as a run does: its agent's file,
    // and its connector files' `allow` and `approve` lists (HAL-5645).
    chatAgentOf: async (request) => chatAgentOf(latest(), request),
    chatConnectorToolsOf: async (request) =>
      connectorToolsOf(definitionsOf(latest(), request.hubId)),
    // Without a workspace.yaml that parsed, the format default: not local only.
    localOnly: filesOf(input.workspace, "workspace")[0]?.value.privacy.localOnly === true,
    abortOnStop,
  };
}

/** The file of the agent a chat turn names, or `undefined` when the hub has none by that id. */
function chatAgentOf(workspace: LoadedWorkspace, request: ChatTurnRequest): Agent | undefined {
  const { agents } = definitionsOf(workspace, request.hubId);
  return request.agentId !== undefined && Object.hasOwn(agents, request.agentId)
    ? agents[request.agentId]
    : undefined;
}
