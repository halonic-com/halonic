import { type IndexedHubs, readRunDefinitionsIndex } from "@halonicjs/adapter-cloudflare-storage";
import type { RunDefinitions } from "@halonicjs/engine";
import { type DefinitionSource, RunTargetNotFound } from "@halonicjs/ports";

/**
 * The definitions a new run on the Worker starts with, from the run-definitions index of the
 * snapshot this Worker version serves: the workflow, and the hub's agents, workflows,
 * collections, knowledge sources, skills and connector `tools` lists, as `runDefinitionsOf` of
 * `@halonicjs/workspace` gives them on a computer. The index is read once, on the first start.
 *
 * The Worker serves one snapshot, so a start's `version` reads the same definitions as any other.
 *
 * @param source - the Worker's definitions, `runtime.definitions`
 * @returns the executor's `definitionsOf`; it throws RunTargetNotFound for a hub or workflow the
 *   index doesn't have, and DefinitionSnapshotError when the snapshot has no index it can read
 */
export function indexedRunDefinitions(
  source: DefinitionSource,
): (hubId: string, workflowId: string) => Promise<RunDefinitions> {
  let hubs: Promise<IndexedHubs> | undefined;
  return async (hubId, workflowId) => {
    // A failed read isn't kept, so the next start tries again.
    hubs ??= readRunDefinitionsIndex(source).catch((error: unknown) => {
      hubs = undefined;
      throw error;
    });
    const indexed = await hubs;
    const hub = Object.hasOwn(indexed, hubId) ? indexed[hubId] : undefined;
    if (hub === undefined) {
      throw new RunTargetNotFound("hub", hubId, `The deployed workspace has no hub "${hubId}".`);
    }
    const workflow = Object.hasOwn(hub.workflows, workflowId)
      ? hub.workflows[workflowId]
      : undefined;
    if (workflow === undefined) {
      throw new RunTargetNotFound(
        "workflow",
        workflowId,
        `The hub "${hubId}" has no workflow "${workflowId}".`,
      );
    }
    return {
      workflow,
      agents: hub.agents,
      workflows: hub.workflows,
      collections: hub.collections,
      knowledge: hub.knowledge,
      skills: hub.skills,
      // `fromEntries` defines each key, so a connector named "__proto__" stays one.
      connectorTools: Object.fromEntries(
        Object.entries(hub.connectors).map(([id, connector]) => [id, connector.tools]),
      ),
    };
  };
}
