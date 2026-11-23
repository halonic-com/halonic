import {
  AgentHostPlacementStore,
  type AgentHostTransport,
  thisComputerOffered,
} from "@halonicjs/adapter-agent-host-client";
import {
  TauriDefinitionStore,
  type TauriFileShell,
  webCryptoDigest,
} from "@halonicjs/adapter-fs-tauri";
import { AgentPlacement } from "@halonicjs/app";
import { systemClock } from "@halonicjs/std";
import { savedAgentBytes, savedAgentFile } from "../engine/studio-harness-host.ts";
import { fileChangedAt, type VersionsOfFiles } from "./agent-file-changed-at.ts";
import { AgentPlacementChoices } from "./agent-placement-choices.ts";

/** The "On this computer" choices of one workspace, kept by the agent host. */
export interface AgentHostPlacement {
  /** The choices themselves, where Settings › New agents run records a new agent. */
  readonly placement: AgentPlacement;
  /** The same choices as the Harness page reads and saves them, for each agent's saved file. */
  readonly choices: AgentPlacementChoices;
}

/**
 * One set of "On this computer" choices for a workspace, kept by the agent host in the person's
 * profile, so Settings, the Harness page and the engine all see the same choice.
 *
 * @param location - the workspace's real path, which the choices are kept for
 * @param versions - the workspace's versions, which say when an agent's file changed after a choice
 *
 * @example
 * const { placement, choices } = agentHostPlacement(transport, files, location, changes);
 * await choices.where({ hubId: "acme", id: "writer" }); // { runsOn: "sandbox", fingerprint: "sha256:…" }
 */
export function agentHostPlacement(
  transport: AgentHostTransport,
  files: TauriFileShell,
  location: string,
  versions: VersionsOfFiles,
): AgentHostPlacement {
  const placement = new AgentPlacement({
    store: new AgentHostPlacementStore(transport),
    digest: webCryptoDigest,
    clock: systemClock,
  });
  const definitions = new TauriDefinitionStore(files, location);
  const choices = new AgentPlacementChoices({
    placement,
    location,
    bytesOf: ({ hubId, id }) => savedAgentBytes(definitions, hubId, id),
    studioStartsUnfenced: onceAnswered(() => thisComputerOffered(transport)),
    changedAt: async ({ hubId, id }, since) =>
      fileChangedAt(versions, (await savedAgentFile(definitions, hubId, id)).path, since),
  });
  return { placement, choices };
}

/**
 * Asks `ask` until it answers, then keeps that answer: whether the host offers sessions on this
 * computer doesn't change while it runs. A failed ask throws, as reading the choice itself does
 * when the host can't be reached, and the next one asks again.
 */
function onceAnswered<T>(ask: () => Promise<T>): () => Promise<T> {
  let answered: Promise<T> | undefined;
  return () => {
    answered ??= ask().catch((error: unknown) => {
      answered = undefined;
      throw error;
    });
    return answered;
  };
}
