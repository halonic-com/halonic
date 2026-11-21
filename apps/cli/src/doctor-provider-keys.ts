// Which harness agents `halonic doctor` doesn't ask about their own sign-in
// (HAL-14661): those whose runs get a provider key Halonic keeps. It decides
// as `run` does, with the person's placement choice for the agent's file as
// it is on disk and the access `run`'s own key services would give, so doctor
// and run can't disagree.

import type { PlacementReader } from "@halonicjs/app";
import type { AccessAgent, ProviderAccessChoice } from "@halonicjs/host-harness-host";
import { filesOf, type LoadedFileOf, type LoadedWorkspace } from "@halonicjs/workspace";

/** What {@link agentsWithProviderKey} reads. */
export interface ProviderKeyAgentsInput {
  readonly workspace: LoadedWorkspace;
  /** Where each agent runs, as the person chose on this computer. */
  readonly placement: PlacementReader;
  /** The workspace's resolved real path, as placement choices are keyed. */
  readonly location: string;
  /** The raw bytes of a workspace file, by its workspace-relative path. */
  readFile(path: string): Promise<Uint8Array>;
  /** The access `run`'s bridge would give the agent: `ProviderKeyServices.accessFor` of `run`'s own services. */
  access(agent: AccessAgent): Promise<ProviderAccessChoice>;
}

/**
 * The ids of the harness agents whose runs here get a provider key instead
 * of their own sign-in. An agent `doctor` can't decide for, because its file
 * can't be read or `run` would stop on its provider, isn't one of them, so
 * the Harnesses line still asks about its sign-in. An id two hubs use is one
 * only when both agents get a key: they share one settings folder.
 *
 * @example
 * await agentsWithProviderKey({ workspace, placement, location: "/work/acme", readFile, access });
 * // Set { "writer" }
 */
export async function agentsWithProviderKey(
  input: ProviderKeyAgentsInput,
): Promise<ReadonlySet<string>> {
  const agents = filesOf(input.workspace, "agent");
  const keyed = await Promise.all(agents.map((file) => usesProviderKey(input, file)));
  const signIn = new Set(agents.filter((_, index) => !keyed[index]).map((file) => file.value.id));
  return new Set(agents.filter((file) => !signIn.has(file.value.id)).map((file) => file.value.id));
}

/**
 * Whether `run` gives the agent in `file` a provider key in every hub it can
 * run in: its own, or each hub of the workspace for an agent at the root,
 * whose choice is kept per hub. `false` when it can't tell.
 */
async function usesProviderKey(
  input: ProviderKeyAgentsInput,
  file: LoadedFileOf<"agent">,
): Promise<boolean> {
  const { harness } = file.value;
  if (harness === undefined || harness === "halonic") return false;
  const hubs = file.hub === null ? hubsOf(input.workspace) : [file.hub];
  if (hubs.length === 0) return false;
  try {
    const keyed = await Promise.all(hubs.map((hub) => keyedInHub(input, file, harness, hub)));
    return keyed.every(Boolean);
  } catch {
    return false;
  }
}

/** Whether `run` gives the agent in `file` a provider key when it runs in `hub`. */
async function keyedInHub(
  input: ProviderKeyAgentsInput,
  file: LoadedFileOf<"agent">,
  harness: AccessAgent["harness"],
  hub: string,
): Promise<boolean> {
  const answer = await input.placement.where({
    location: input.location,
    hub,
    agent: file.value.id,
    file: await input.readFile(file.path),
  });
  const { model } = file.value;
  const choice = await input.access({
    harness,
    runsOn: answer.runsOn,
    hubId: hub,
    ...(model === undefined ? {} : { model }),
  });
  return choice.kind === "key";
}

/** The ids of the workspace's hubs, each once. */
function hubsOf(workspace: LoadedWorkspace): string[] {
  return [...new Set(filesOf(workspace, "hub").map((file) => file.hub))].filter(
    (hub): hub is string => hub !== null,
  );
}
