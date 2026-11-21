// What the trust check covers in a workspace, built the one way every caller
// builds it (the CLI's `doctor`, `trust` and `run`, and the Studio), so they
// all compute one fingerprint for the same files on the same computer.

import type { Connector } from "@halonicjs/format";
import {
  filesOf,
  type LoadedWorkspace,
  type LocalIntegrationInput,
  sameSettings,
} from "@halonicjs/workspace";
import { integrationsFolder } from "./local-integrations.ts";
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
  const connectors = filesOf(workspace, "connector").map((file) => file.value);
  return {
    connectors,
    agents: filesOf(workspace, "agent").map((file) => file.value),
    integrations: integrations.map((integration) => withConnectorSettings(integration, connectors)),
    providers: filesOf(workspace, "provider").map((file) => file.value),
  };
}

/**
 * The integration with the settings the connector files that name its
 * folder give it, the ones its runner starts with (`openLocalIntegration`),
 * so the trust check shows the address a `{ fromSetting }` host reads and
 * the start compares against it. Connectors of the root and of every hub
 * count. When they give the folder different settings, it gets none, so a
 * `{ fromSetting }` host is not set and its runner doesn't start; the
 * workspace check `integration-settings-differ` says why.
 */
function withConnectorSettings(
  integration: LocalIntegrationInput,
  connectors: readonly Connector[],
): LocalIntegrationInput {
  const named = connectors.flatMap((connector) =>
    "integration" in connector.transport &&
    `${integrationsFolder}/${connector.transport.integration.folder}` === integration.folder
      ? [connector.transport.integration.settings ?? {}]
      : [],
  );
  const [first, ...others] = named;
  if (first === undefined || others.some((settings) => !sameSettings(settings, first))) {
    return integration;
  }
  return { ...integration, settings: first };
}
