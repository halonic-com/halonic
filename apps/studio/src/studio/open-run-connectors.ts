// The page's engine's run connectors on the agent host (HAL-13344): started as the Library's
// listing starts them, with the grant the person saved, and their tools offered once approved
// there. A live run's programs start in the agent host's copy at its commit (HAL-16260), and the
// copies an engine that stopped left are swept as this one opens.

import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import {
  TauriDefinitionStore,
  type TauriFileShell,
  TauriFolderReader,
  TauriToolApprovalStore,
  webCryptoDigest,
} from "@halonicjs/adapter-fs-tauri";
import type { ChatTurnWaiting, TokenStore } from "@halonicjs/ports";
import { systemClock } from "@halonicjs/std";
import { shellKeychain, type TauriIpc } from "@halonicjs/studio-services";
import { noHttpInStudio } from "../connect/agent-host-tool-lister.ts";
import {
  libraryWaitingReporter,
  startProgramCopies,
  studioListedToolApproval,
  studioRunConnectors,
} from "../connect/studio-run-connectors.ts";
import type { StudioRunConnectors } from "../engine/engine-service.ts";
import type { RunVersionLoads } from "../engine/page-run-versions.ts";
import type { WorkspaceTrust } from "./workspace-trust.ts";

/** What the folder's run connectors are built from. */
export interface RunConnectorParts {
  readonly ipc: TauriIpc;
  readonly files: TauriFileShell;
  readonly location: string;
  readonly transport: AgentHostTransport;
  readonly trust: WorkspaceTrust;
  readonly tokens: TokenStore;
  /** Hears the listed tools of a connector that wait for approval: the Library's refusals list. */
  readonly onWaiting: (connector: string, waiting: readonly ChatTurnWaiting[]) => void;
  /** The version each run read, which its connectors' files come from. */
  readonly versions: RunVersionLoads;
}

/**
 * The runs' connectors and the Library's approvals of their tools, for one engine. The engine
 * builds them once it holds the engine lock and before any run starts, so the program copies an
 * engine that stopped left are swept here first.
 */
export async function openStudioRunConnectors({
  ipc,
  files,
  location,
  transport,
  trust,
  tokens,
  onWaiting,
  versions,
}: RunConnectorParts): Promise<StudioRunConnectors> {
  const folder = new TauriFolderReader(ipc, location);
  const reportError = (error: unknown) => console.error("A run's connector", error);
  await startProgramCopies({ transport, folder, reportError });
  return {
    connectors: studioRunConnectors({
      transport,
      versions,
      definitions: new TauriDefinitionStore(files, location),
      folder,
      trust,
      secrets: shellKeychain(ipc),
      tokens,
      http: noHttpInStudio,
      reportError,
    }),
    listedToolApproval: await studioListedToolApproval({
      definitions: new TauriDefinitionStore(files, location),
      folder: new TauriFolderReader(ipc, location),
      approvals: new TauriToolApprovalStore(ipc),
      digest: webCryptoDigest,
      clock: systemClock,
      reportWaiting: libraryWaitingReporter((line) => console.warn(line), onWaiting),
    }),
  };
}
