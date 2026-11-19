// The "this computer" choices, kept in the host (HAL-10849). They live in the
// person's profile folder next to the CLI's, as files, so Studio's page asks
// for each step over loopback and the host reads and writes the same files.

import { FileAgentPlacementStore } from "@halonicjs/adapter-fs-node";
import type {
  AgentPlacementKey,
  AgentPlacementRecord,
  AgentPlacementStore,
} from "@halonicjs/ports";
import { type ProfileFolder, placementFolder } from "@halonicjs/profile";
import { namedWorkspace } from "../server/named-workspace.ts";

/**
 * The placement store of the workspaces the launcher named. A choice is for a
 * workspace's real path, as in a trust record, so a location that isn't the
 * real path of a named workspace is refused: each method answers `undefined`
 * for it and touches nothing.
 *
 * @example
 * const placements = new HostPlacements(store, workspaceRoots);
 * await placements.get({ location: "/work/acme", hub: "support", agent: "coder" }); // the choice, or null
 */
export class HostPlacements {
  readonly #store: AgentPlacementStore;
  readonly #workspaceRoots: readonly string[];

  constructor(store: AgentPlacementStore, workspaceRoots: readonly string[]) {
    this.#store = store;
    this.#workspaceRoots = workspaceRoots;
  }

  /**
   * @returns the choice, `null` when there is none, or `undefined` for a location that isn't named
   * @throws when a choice exists but can't be read
   */
  async get(key: AgentPlacementKey): Promise<AgentPlacementRecord | null | undefined> {
    if (!(await this.#isNamed(key))) return undefined;
    return await this.#store.get(key);
  }

  /** @returns `false` for a location that isn't named, and nothing is saved */
  async save(placement: AgentPlacementRecord): Promise<boolean> {
    if (!(await this.#isNamed(placement))) return false;
    await this.#store.save(placement);
    return true;
  }

  /** @returns `false` for a location that isn't named */
  async remove(key: AgentPlacementKey): Promise<boolean> {
    if (!(await this.#isNamed(key))) return false;
    await this.#store.remove(key);
    return true;
  }

  async #isNamed(key: AgentPlacementKey): Promise<boolean> {
    return (await namedWorkspace(this.#workspaceRoots, key.location)) === key.location;
  }
}

/**
 * The placements in the profile folder, or `undefined` without one (no
 * placement routes are served).
 */
export function hostPlacements(
  profile: ProfileFolder | undefined,
  workspaceRoots: readonly string[],
): HostPlacements | undefined {
  if (profile === undefined) return undefined;
  return new HostPlacements(new FileAgentPlacementStore(placementFolder(profile)), workspaceRoots);
}
