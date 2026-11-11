// The engine's placement policy on `AgentPlacement` (requirement
// `harness-host.placement`). The engine asks with the agent's run, hub and
// id; `AgentPlacement` wants the agent's file as it is on disk, because its
// choice holds for those exact bytes. This reads the file and passes on only
// what the engine may know: where the harness runs, and since when.

import type { PlacementReader } from "@halonicjs/app";
import type { HarnessAgent, PlacementAnswer, PlacementPolicy } from "@halonicjs/engine";

/** The agents' files in the workspace, as the host reads them. */
export interface AgentFiles {
  /**
   * The agent's file exactly as it is on disk now, the bytes `halonic run`'s
   * sandbox check hashes too, so both see the same choice.
   *
   * @throws when the hub has no agent with this id
   */
  bytesOf(hubId: string, agentId: string): Promise<Uint8Array>;
}

/**
 * Where each agent's harness runs, as the person chose for the agent's file
 * as it is now. Without a choice, with one for another version of the file,
 * or with one that can't be read, in a sandbox.
 *
 * @example
 * const placement = new FilePlacementPolicy({ reader, files, location: "/workspaces/acme" });
 * await placement.where(agent); // { runsOn: "sandbox" }
 */
export class FilePlacementPolicy implements PlacementPolicy {
  readonly #reader: PlacementReader;
  readonly #files: AgentFiles;
  readonly #location: string;

  /**
   * @param options.location - the workspace's real path, which the person's choices are keyed by
   */
  constructor(options: { reader: PlacementReader; files: AgentFiles; location: string }) {
    this.#reader = options.reader;
    this.#files = options.files;
    this.#location = options.location;
  }

  /** @throws what {@link AgentFiles.bytesOf} throws: the harness doesn't start */
  async where(agent: HarnessAgent): Promise<PlacementAnswer> {
    const file = await this.#files.bytesOf(agent.hubId, agent.agentId);
    const answer = await this.#reader.where({
      location: this.#location,
      agent: agent.agentId,
      file,
    });
    if (answer.runsOn === "this-computer") {
      return { runsOn: "this-computer", chosenAt: answer.chosenAt };
    }
    return { runsOn: "sandbox" };
  }
}
