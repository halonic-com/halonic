// The page's engine's run connectors on the agent host (HAL-13344): started as the Library's
// listing starts them, with the grant the person saved, and their tools offered once approved
// there.

import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import {
  TauriDefinitionStore,
  type TauriFileShell,
  TauriFolderReader,
  TauriToolApprovalStore,
  webCryptoDigest,
} from "@halonicjs/adapter-fs-tauri";
import type { TokenStore } from "@halonicjs/ports";
import { systemClock } from "@halonicjs/std";
import { shellKeychain, type TauriIpc } from "@halonicjs/studio-services";
import { noHttpInStudio } from "../connect/agent-host-tool-lister.ts";
import {
  libraryWaitingReporter,
  studioListedToolApproval,
  studioRunConnectors,
} from "../connect/studio-run-connectors.ts";
import type { StudioRunConnectors } from "../engine/engine-service.ts";
import type { WorkspaceTrust } from "./workspace-trust.ts";

/** What the folder's run connectors are built from. */
export interface RunConnectorParts {
  readonly ipc: TauriIpc;
  readonly files: TauriFileShell;
  readonly location: string;
  readonly transport: AgentHostTransport;
  readonly trust: WorkspaceTrust;
  readonly tokens: TokenStore;
}

/** The runs' connectors and the Library's approvals of their tools, for one engine. */
export async function openStudioRunConnectors({
  ipc,
  files,
  location,
  transport,
  trust,
  tokens,
}: RunConnectorParts): Promise<StudioRunConnectors> {
  return {
    connectors: studioRunConnectors({
      transport,
      definitions: new TauriDefinitionStore(files, location),
      folder: new TauriFolderReader(ipc, location),
      trust,
      secrets: shellKeychain(ipc),
      tokens,
      http: noHttpInStudio,
      reportError: (error) => console.error("A run's connector", error),
    }),
    listedToolApproval: await studioListedToolApproval({
      definitions: new TauriDefinitionStore(files, location),
      folder: new TauriFolderReader(ipc, location),
      approvals: new TauriToolApprovalStore(ipc),
      digest: webCryptoDigest,
      clock: systemClock,
      reportWaiting: libraryWaitingReporter((line) => console.warn(line)),
    }),
  };
}
