// The runs of one open folder, read through the shell: the source the Runs feature and the Inbox
// both read, and what the Inbox derives from them. Kept apart from `provideFolderServices`, which
// gives the folder everything else.

import {
  TauriDefinitionStore,
  type TauriFileShell,
  TauriRunStore,
} from "@halonicjs/adapter-fs-tauri";
import type { ServiceRegistry } from "@halonicjs/app";
import {
  InboxNoticesService,
  InboxRunsService,
  SandboxRefusalsService,
} from "@halonicjs/studio-feature-inbox/api";
import { RunsSourceService } from "@halonicjs/studio-feature-runs/api";
import type { TauriIpc } from "@halonicjs/studio-services";
import { engineServiceKey } from "../engine/engine-service.ts";
import type { RemoteEngine } from "../engine/remote-engine.ts";
import { WorkspaceNotices } from "../inbox/workspace-notices.ts";
import { WorkspaceSandboxRefusals } from "../inbox/workspace-sandbox-refusals.ts";
import { WorkspaceRuns } from "../runs/workspace-runs.ts";
import { focusOf, storageOf } from "./page-window.ts";

/**
 * Gives the workspace in `location` its runs, read through the shell, as both the Runs
 * feature's and the Inbox's source.
 */
export function provideWorkspaceRuns(
  services: ServiceRegistry,
  {
    ipc,
    files,
    window,
    remoteEngine,
  }: {
    ipc: TauriIpc;
    files: TauriFileShell;
    window: object;
    remoteEngine?: RemoteEngine | undefined;
  },
  location: string,
): void {
  const runs = new WorkspaceRuns({
    runs: new TauriRunStore(ipc, location),
    definitions: new TauriDefinitionStore(files, location),
    folder: location,
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
  });
  services.provide(RunsSourceService, runs);
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
