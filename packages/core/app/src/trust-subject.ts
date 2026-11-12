// What the trust check covers in a workspace, built the one way every caller
// builds it (the CLI's `doctor`, `trust` and `run`, and the Studio), so they
// all compute one fingerprint for the same files on the same computer.

import { filesOf, type LoadedWorkspace, type LocalIntegrationInput } from "@halonicjs/workspace";
import type { TrustSubject } from "./trust-service.ts";

/** What {@link trustSubjectOf} reads. */
export interface TrustSubjectInput {
  /** The workspace, loaded. Files with an error are left out, as `loadWorkspace` does. */
  readonly workspace: LoadedWorkspace;
  /** The workspace's local integrations, from `readLocalIntegrations`. */
  readonly integrations: readonly LocalIntegrationInput[];
  /** The workspace's resolved real path: the trust record's key. */
  readonly location: string;
  /** The absolute path each connector's command resolves to on this computer. */
  readonly commandPaths: ReadonlyMap<string, string>;
}

/**
 * Every connector, agent and model provider of the workspace, of the root
 * and of every hub, and its local integrations, as the trust check
 * fingerprints them.
 */
export function trustSubjectOf(input: TrustSubjectInput): TrustSubject {
  return {
    location: input.location,
    ...trustContentInputOf(input.workspace, input.integrations),
    commandPaths: input.commandPaths,
  };
}

/**
 * The connectors, agents and model providers of the workspace, of the root
 * and of every hub, and its local integrations: what its trust content is
 * built from, apart from where the programs are on this computer.
 */
export function trustContentInputOf(
  workspace: LoadedWorkspace,
  integrations: readonly LocalIntegrationInput[],
): Pick<TrustSubject, "connectors" | "agents" | "integrations" | "providers"> {
  return {
    connectors: filesOf(workspace, "connector").map((file) => file.value),
    agents: filesOf(workspace, "agent").map((file) => file.value),
    integrations,
    providers: filesOf(workspace, "provider").map((file) => file.value),
  };
}
