// The runs of one open folder, read through the shell: the source the Runs feature and the Inbox
// both read, and what the Inbox derives from them. Kept apart from `provideFolderServices`, which
// gives the folder everything else.

import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import {
  TauriBlobStore,
  TauriDefinitionStore,
  type TauriFileShell,
  TauriRunStore,
} from "@halonicjs/adapter-fs-tauri";
import type { ServiceRegistry } from "@halonicjs/app";
import {
  InboxNoticesService,
  InboxRunsService,
  ProposalDecisionsService,
  SandboxRefusalsService,
} from "@halonicjs/studio-feature-inbox/api";
import {
  RunFileSaveService,
  RunFilesService,
  RunsSourceService,
} from "@halonicjs/studio-feature-runs/api";
import type { TauriIpc } from "@halonicjs/studio-services";
import { engineServiceKey } from "../engine/engine-service.ts";
import type { RemoteEngine } from "../engine/remote-engine.ts";
import { WorkspaceNotices } from "../inbox/workspace-notices.ts";
import { WorkspaceSandboxRefusals } from "../inbox/workspace-sandbox-refusals.ts";
import {
  hostDoneProposalsOf,
  hostProposalDecisionsOf,
  hostProposalsOf,
} from "../runs/host-proposals.ts";
import { shellFileSave } from "../runs/run-file-save.ts";
import { WorkspaceRuns } from "../runs/workspace-runs.ts";
import { focusOf, storageOf } from "./page-window.ts";
import type { WorkspaceTrust } from "./workspace-trust.ts";

/**
 * Gives the workspace in `location` its runs, read through the shell, as both the Runs
 * feature's and the Inbox's source, and the files its runs saved.
 */
export function provideWorkspaceRuns(
  services: ServiceRegistry,
  {
    ipc,
    files,
    window,
    remoteEngine,
    transport,
    trust,
  }: {
    ipc: TauriIpc;
    files: TauriFileShell;
    window: object;
    remoteEngine?: RemoteEngine | undefined;
    transport: AgentHostTransport | undefined;
    trust: WorkspaceTrust;
  },
  location: string,
): void {
  const trusted = () => trust.mayStartNow();
  const runs = new WorkspaceRuns({
    runs: new TauriRunStore(ipc, location),
    definitions: new TauriDefinitionStore(files, location),
    folder: location,
    // The trust check loaded the files as the folder opened: the runs take that load.
    loaded: () => trust.loaded,
    onFocus: (listener) => focusOf(window, listener),
    // Looked up on the first answer: the page's engine is provided after the runs.
    send: (...answer) => (remoteEngine ?? services.get(engineServiceKey)).send(...answer),
    ...(remoteEngine === undefined
      ? {}
      : {
          waiting: () => remoteEngine.waiting(),
          // The engine says when a run changed, so the runs aren't read every 10 s.
          followRuns: (listener) => remoteEngine.followRuns(listener),
          reportError: (error) => console.error("The background engine's run changes", error),
        }),
    // Run proposals live in the agent host's records (HAL-10916); without the host there are none,
    // and an untrusted folder asks the host nothing.
    ...(transport === undefined
      ? {}
      : {
          proposals: hostProposalsOf(transport, location, trusted),
          doneProposals: hostDoneProposalsOf(transport, location, trusted),
        }),
  });
  if (transport !== undefined) {
    services.provide(
      ProposalDecisionsService,
      hostProposalDecisionsOf(transport, location, trusted),
    );
  }
  services.provide(RunsSourceService, runs);
  // The files runs saved, read from the same blob folder the engine writes (HAL-17831).
  const blobs = new TauriBlobStore(ipc, location);
  services.provide(RunFilesService, { read: (hash) => blobs.get(hash) });
  services.provide(RunFileSaveService, shellFileSave(ipc, location));
  services.provide(InboxRunsService, runs);
  services.provide(SandboxRefusalsService, new WorkspaceSandboxRefusals(runs));
  services.provide(
    InboxNoticesService,
    new WorkspaceNotices({
      runs,
      storage: storageOf(window),
      location,
      now: () => new Date(),
    }),
  );
}
