import { type IndexedHubs, readRunDefinitionsIndex } from "@halonicjs/adapter-cloudflare-storage";
import type { RunDefinitions } from "@halonicjs/engine";
import { type DefinitionSource, RunTargetNotFound } from "@halonicjs/ports";
import type { HubDefinitions } from "@halonicjs/workspace";

/** Reads the run-definitions index of the snapshot this Worker version serves. */
export type RunDefinitionsIndexReader = () => Promise<IndexedHubs>;

/**
 * The snapshot's run-definitions index, read once, on the first call, and kept: the Worker
 * serves one snapshot. A failed read isn't kept, so the next call tries again. The run starts
 * and the model resolver share one reader, so they read the same index.
 *
 * @param source - the Worker's definitions, `runtime.definitions`
 * @returns the reader; it throws DefinitionSnapshotError when the snapshot has no index it can read
 */
export function cachedRunDefinitionsIndex(source: DefinitionSource): RunDefinitionsIndexReader {
  let hubs: Promise<IndexedHubs> | undefined;
  return () => {
    hubs ??= readRunDefinitionsIndex(source).catch((error: unknown) => {
      hubs = undefined;
      throw error;
    });
    return hubs;
  };
}

/**
 * One hub's definitions from the index: everything `definitionsOf` of `@halonicjs/workspace`
 * gives for it on a computer, its models and providers included.
 *
 * @throws RunTargetNotFound for a hub the index doesn't have
 */
export async function indexedHub(
  readIndex: RunDefinitionsIndexReader,
  hubId: string,
): Promise<HubDefinitions> {
  const indexed = await readIndex();
  const hub = Object.hasOwn(indexed, hubId) ? indexed[hubId] : undefined;
  if (hub === undefined) {
    throw new RunTargetNotFound("hub", hubId, `The deployed workspace has no hub "${hubId}".`);
  }
  return hub;
}

/**
 * The definitions a new run on the Worker starts with, from the run-definitions index of the
 * snapshot this Worker version serves: the workflow, and the hub's agents, workflows,
 * collections, knowledge sources, skills and connector `tools` lists, as `runDefinitionsOf` of
 * `@halonicjs/workspace` gives them on a computer.
 *
 * The Worker serves one snapshot, so a start's `version` reads the same definitions as any other.
 *
 * @param readIndex - the index, from {@link cachedRunDefinitionsIndex}
 * @returns the executor's `definitionsOf`; it throws RunTargetNotFound for a hub or workflow the
 *   index doesn't have, and DefinitionSnapshotError when the snapshot has no index it can read
 */
export function indexedRunDefinitions(
  readIndex: RunDefinitionsIndexReader,
): (hubId: string, workflowId: string) => Promise<RunDefinitions> {
  return async (hubId, workflowId) => {
    const hub = await indexedHub(readIndex, hubId);
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
