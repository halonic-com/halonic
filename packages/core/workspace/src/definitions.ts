import type { Connector, HubUses, KindName, KindValues } from "@halonicjs/format";
import type { Digest } from "@halonicjs/ports";
import { bytesToHex, canonicalJson, encodeUtf8 } from "@halonicjs/std";
import { filesOf, type LoadedWorkspace } from "./load-workspace.ts";
import { modelAliases, type ResolvedModelTarget, resolvedAlias } from "./resolve-model.ts";

/** Values of one kind by their id. */
type ById<Name extends KindName> = Readonly<Record<string, KindValues[Name]>>;

/**
 * Everything a run in one hub reads from the workspace, as plain data. It
 * is what a run keeps: the engine stores it in the blob store when the run
 * starts, so a waiting run goes on with the definitions it started with.
 */
export interface HubDefinitions {
  readonly hubId: string;
  /** `workspace.yaml`, or `null` when it didn't parse. */
  readonly settings: KindValues["workspace"] | null;
  /** The hub's `hub.yaml`, or `null` when it has none or it didn't parse. */
  readonly hub: KindValues["hub"] | null;
  /** The model a setting without one uses: the hub's default, else the workspace's. */
  readonly defaultModel?: string;
  /** The hub's own workflows and agents. A hub doesn't run the root's or another hub's. */
  readonly workflows: ById<"workflow">;
  readonly agents: ById<"agent">;
  /** Every model alias the hub can use, resolved, with its fallbacks. */
  readonly models: Readonly<Record<string, ResolvedModelTarget>>;
  readonly providers: ById<"provider">;
  readonly runtimes: ById<"runtime">;
  /**
   * The hub's own library items, and the shared ones at the root it may
   * use: all of them, or only those its `uses` lists. Its own win over a
   * shared one with the same id.
   */
  readonly skills: ById<"skill">;
  readonly knowledge: ById<"knowledge">;
  readonly collections: ById<"collection">;
  readonly connectors: ById<"connector">;
}

/** The library kinds, each with its key in a hub's `uses`. */
type LibraryKind = "skill" | "knowledge" | "collection" | "connector";

/**
 * The definitions a run in one hub needs, built from the files that parsed.
 * Load the workspace and refuse to start on its errors first: a file with
 * an error is left out here.
 *
 * @param workspace - the loaded workspace
 * @param hubId - the hub the run is in
 * @returns plain data; {@link definitionsVersion} hashes it
 * @throws RangeError when no file of the workspace is in that hub
 *
 * @example
 * const definitions = definitionsOf(workspace, "billing");
 * const version = await definitionsVersion(definitions, digest);
 */
export function definitionsOf(workspace: LoadedWorkspace, hubId: string): HubDefinitions {
  if (!workspace.files.some((file) => file.hub === hubId)) {
    throw new RangeError(`The workspace has no hub "${hubId}".`);
  }
  const settings = filesOf(workspace, "workspace")[0]?.value ?? null;
  const hub = filesOf(workspace, "hub").find((file) => file.hub === hubId)?.value ?? null;
  const aliases = modelAliases(workspace, hubId);
  // `fromEntries` defines each key, so an alias named "__proto__" stays an alias.
  const models = Object.fromEntries(
    [...aliases].map(([name, alias]) => [name, resolvedAlias(aliases, name, alias)]),
  );
  const uses = hub?.uses;
  const defaultModel = hub?.defaults.model ?? settings?.defaults.model;
  return {
    hubId,
    settings,
    hub,
    ...(defaultModel === undefined ? {} : { defaultModel }),
    workflows: idsOf(workspace, "workflow", hubId),
    agents: idsOf(workspace, "agent", hubId),
    models,
    providers: idsOf(workspace, "provider", null),
    runtimes: idsOf(workspace, "runtime", null),
    skills: libraryOf(workspace, "skill", hubId, uses?.skills),
    knowledge: libraryOf(workspace, "knowledge", hubId, uses?.knowledge),
    collections: libraryOf(workspace, "collection", hubId, uses?.collections),
    connectors: libraryOf(workspace, "connector", hubId, uses?.connectors),
  };
}

/**
 * What a new run starts with: the workflow it runs, the hub's agents,
 * workflows, collections, knowledge sources and skills, and the `tools`
 * lists of the connectors it can see. It has the shape of the engine's
 * `RunDefinitions`, built here so the CLI and the test runner build it the
 * same way.
 */
export interface RunStartDefinitions {
  readonly workflow: KindValues["workflow"];
  readonly agents: ById<"agent">;
  readonly workflows: ById<"workflow">;
  readonly collections: ById<"collection">;
  readonly knowledge: ById<"knowledge">;
  readonly skills: ById<"skill">;
  /**
   * Each connector's `tools` lists by its id, and nothing else of its file:
   * a run needs only what its agents are offered, not how to connect.
   */
  readonly connectorTools: Readonly<Record<string, Connector["tools"]>>;
}

/**
 * The definitions a new run of `workflowId` in `hubId` starts with, as the
 * workspace has them now: the workflow, the hub's agents, workflows,
 * collections, knowledge sources and skills, and its connectors' `tools` lists.
 *
 * @param workspace - the loaded workspace
 * @param hubId - the hub the run is in
 * @param workflowId - the workflow the run runs
 * @throws RangeError when the workspace has no such hub, or the hub no such workflow
 *
 * @example
 * runDefinitionsOf(workspace, "support", "support-reply");
 * // { workflow: { id: "support-reply", … }, agents: { writer: …, sorter: … }, workflows: { … }, collections: {}, knowledge: {}, skills: {}, connectorTools: { mail: { allow: ["search"], approve: [] } } }
 */
export function runDefinitionsOf(
  workspace: LoadedWorkspace,
  hubId: string,
  workflowId: string,
): RunStartDefinitions {
  const hub = definitionsOf(workspace, hubId);
  const workflow = Object.hasOwn(hub.workflows, workflowId) ? hub.workflows[workflowId] : undefined;
  if (workflow === undefined) {
    throw new RangeError(`The hub "${hubId}" has no workflow "${workflowId}".`);
  }
  return {
    workflow,
    agents: hub.agents,
    workflows: hub.workflows,
    collections: hub.collections,
    knowledge: hub.knowledge,
    skills: hub.skills,
    connectorTools: connectorToolsOf(hub),
  };
}

/**
 * The `tools` lists of the hub's connectors by id, and nothing else of their
 * files. A run starts with them, and a chat turn reads them as the
 * workspace has them now.
 *
 * @example
 * connectorToolsOf(definitionsOf(workspace, "support"));
 * // { mail: { allow: ["search"], approve: [] } }
 */
export function connectorToolsOf(
  hub: HubDefinitions,
): Readonly<Record<string, Connector["tools"]>> {
  // `fromEntries` defines each key, so a connector named "__proto__" stays one.
  return Object.fromEntries(
    Object.entries(hub.connectors).map(([id, connector]) => [id, connector.tools]),
  );
}

/**
 * The version of a hub's definitions: the SHA-256, in lowercase hex, of
 * their canonical JSON. It is the hash the blob store gives the same JSON,
 * so a run's `definitionsVersion` names the blob that keeps them. Equal
 * definitions always get the same version, whatever order the files are in.
 *
 * @param definitions - from {@link definitionsOf}
 * @param digest - the port that hashes; the core has no hash code of its own
 */
export async function definitionsVersion(
  definitions: HubDefinitions,
  digest: Digest,
): Promise<string> {
  return bytesToHex(await digest.sha256(encodeUtf8(canonicalJson(definitions))));
}

/** The values of one kind with an id, in one hub (`null`: the root), by id. */
function idsOf<
  Name extends KindName & ("workflow" | "agent" | "provider" | "runtime" | LibraryKind),
>(workspace: LoadedWorkspace, kind: Name, hubId: string | null): Record<string, KindValues[Name]> {
  const byId: Record<string, KindValues[Name]> = {};
  for (const file of filesOf(workspace, kind)) {
    // A duplicate id is an error `loadWorkspace` reports; the first by path wins here too.
    if (file.hub === hubId && !Object.hasOwn(byId, file.value.id)) {
      byId[file.value.id] = file.value;
    }
  }
  return byId;
}

function libraryOf<Name extends LibraryKind>(
  workspace: LoadedWorkspace,
  kind: Name,
  hubId: string,
  uses: HubUses[keyof HubUses] | undefined,
): Record<string, KindValues[Name]> {
  const shared = idsOf(workspace, kind, null);
  const allowed = Object.entries(shared).filter(([id]) => uses === undefined || uses.includes(id));
  return { ...Object.fromEntries(allowed), ...idsOf(workspace, kind, hubId) };
}
