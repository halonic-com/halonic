import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import {
  TauriDefinitionStore,
  type TauriFileShell,
  TauriFolderReader,
  type TauriShell,
  TauriToolApprovalStore,
  webCryptoDigest,
} from "@halonicjs/adapter-fs-tauri";
import type { ServiceRegistry } from "@halonicjs/app";
import { systemClock } from "@halonicjs/std";
import type { GoogleSetupAccounts } from "@halonicjs/studio-feature-google-setup/api";
import {
  ConnectorStatusHostService,
  ListedToolsHostService,
  type RefusalsFeed,
} from "@halonicjs/studio-feature-library/api";
import { secretsKey, tokenStoreKey } from "@halonicjs/studio-services";
import { agentHostToolLister, noHttpInStudio } from "../connect/agent-host-tool-lister.ts";
import type { WorkspaceTrust } from "../studio/workspace-trust.ts";
import { WorkspaceConnectorStatus } from "./workspace-connector-status.ts";
import { WorkspaceListedTools } from "./workspace-listed-tools.ts";

/** What the Library's connector review needs from the open folder and the shell. */
export interface LibraryServiceParts {
  readonly ipc: TauriShell;
  readonly files: TauriFileShell;
  readonly transport: AgentHostTransport | undefined;
  readonly trust: WorkspaceTrust;
  readonly location: string;
  /** What the folder's engine refused and left waiting, which its chats and runs record. */
  readonly refusals: RefusalsFeed;
  /** The workspace's Google accounts, which the status of a Google connector is read from. */
  readonly google: Pick<GoogleSetupAccounts, "list" | "subscribe">;
  /** Calls the listener whenever the window comes to the front; returns a function that stops it. */
  readonly onFocus: (listener: () => void) => () => void;
}

/**
 * Gives the Library the workspace's connectors and what the engine refused from them
 * (`studio.workspace-connector-status`), and the review and approval of their listed tools
 * (`studio.workspace-listed-tools`). Without an agent host nothing can start a connector, so
 * the review is not provided and the Library shows none.
 */
export function provideLibraryServices(
  services: ServiceRegistry,
  parts: LibraryServiceParts,
): void {
  services.provide(
    ConnectorStatusHostService,
    new WorkspaceConnectorStatus({
      definitions: new TauriDefinitionStore(parts.files, parts.location),
      refusals: parts.refusals,
      google: parts.google,
      onFocus: parts.onFocus,
      onWatchError: (error) => console.error(error),
    }),
  );
  if (parts.transport === undefined) return;
  services.provide(
    ListedToolsHostService,
    new WorkspaceListedTools({
      definitions: new TauriDefinitionStore(parts.files, parts.location),
      folder: new TauriFolderReader(parts.ipc, parts.location),
      trust: parts.trust,
      approvals: new TauriToolApprovalStore(parts.ipc),
      digest: webCryptoDigest,
      clock: systemClock,
      secrets: services.get(secretsKey),
      tokens: services.get(tokenStoreKey),
      http: noHttpInStudio,
      listTools: agentHostToolLister(parts.transport),
      onApproved: parts.refusals.dropWaiting,
    }),
  );
}
