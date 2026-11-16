// What the CLI's engine checks a connector's listed tools against: the
// approvals a person gave, which `halonic tools` writes to the profile
// folder (HAL-850 step 4). A run and `halonic tools approve` take a
// connector's address from the same place (`connectorToolServer`) and its
// pin from the trust record, so an approval given there matches a run.

import { connectorToolServer } from "@halonicjs/app/listed-tools";
import type { ConnectorToolAddress, ListedToolApprovalStore } from "@halonicjs/engine";
import type {
  ChatTurnWaiting,
  Clock,
  ConnectorPin,
  Digest,
  ToolApprovalStore,
  TrustStore,
} from "@halonicjs/ports";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";

/** What {@link cliListedToolApproval} reads. */
export interface CliListedToolApprovalInput {
  /** The workspace's resolved real path: the approvals' key. */
  readonly location: string;
  /** The workspace as it is now, for the connectors' files. */
  workspace(): LoadedWorkspace;
  /** The approvals in the profile folder's `tool-approvals`. */
  readonly approvals: ToolApprovalStore;
  /** The trust records, which hold a package-runner connector's pin. */
  readonly trust: Pick<TrustStore, "get">;
  readonly digest: Digest;
  readonly clock: Clock;
  /** Hears the tools that wait, to say which command approves them. */
  reportWaiting?(connector: string, waiting: readonly ChatTurnWaiting[]): void;
}

/**
 * The engine's approval check for a workspace on this computer.
 *
 * @example
 * const listedToolApproval = cliListedToolApproval({ location, workspace: latest, approvals, trust, digest, clock });
 */
export function cliListedToolApproval(input: CliListedToolApprovalInput): ListedToolApprovalStore {
  return {
    kind: "store",
    location: input.location,
    store: input.approvals,
    digest: input.digest,
    clock: input.clock,
    addressOf: (connector) => addressOf(input, connector),
    ...(input.reportWaiting === undefined ? {} : { reportWaiting: input.reportWaiting }),
  };
}

/**
 * Where a connector's tools are approved. Only an `http` or `stdio`
 * connector lists tools a server wrote; the tools of the others (an
 * integration's, a plugin's, the built-in Google connector's) are ones
 * Halonic reviewed.
 */
async function addressOf(
  input: CliListedToolApprovalInput,
  connectorId: string,
): Promise<ConnectorToolAddress> {
  const connector = filesOf(input.workspace(), "connector")
    .map((file) => file.value)
    .find((candidate) => candidate.id === connectorId);
  if (connector === undefined) {
    return { kind: "unaddressable", reason: "the workspace has no file for this connector" };
  }
  const { transport } = connector;
  if (!("http" in transport) && !("stdio" in transport)) {
    return { kind: "reviewed" };
  }
  const pin = await pinOf(input, connectorId);
  if (pin === "unreadable") {
    return { kind: "unaddressable", reason: "couldn't read the workspace's trust record" };
  }
  const server = await connectorToolServer(connector, pin, input.digest);
  return server.ok
    ? { kind: "listed", server: server.value }
    : { kind: "unaddressable", reason: server.error };
}

/** The pin the trust record holds for a connector, `undefined` when it has none. */
async function pinOf(
  input: CliListedToolApprovalInput,
  connectorId: string,
): Promise<ConnectorPin | undefined | "unreadable"> {
  try {
    const record = await input.trust.get(input.location);
    return record !== null && Object.hasOwn(record.pins, connectorId)
      ? record.pins[connectorId]
      : undefined;
  } catch {
    return "unreadable";
  }
}
