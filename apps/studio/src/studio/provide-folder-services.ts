import {
  TauriDefinitionStore,
  type TauriFileShell,
  TauriRunStore,
  webCryptoDigest,
} from "@halonicjs/adapter-fs-tauri";
import { type ServiceRegistry, type WorkspaceScope, workspaceFilesKey } from "@halonicjs/app";
import { InboxRunsService } from "@halonicjs/studio-feature-inbox/api";
import { ModelKeysService, ModelsFilesService } from "@halonicjs/studio-feature-models/api";
import { RunsSourceService } from "@halonicjs/studio-feature-runs/api";
import { ChangesSourceService } from "@halonicjs/studio-feature-source-control/api";
import { WorkflowsHostService } from "@halonicjs/studio-feature-workflows/api";
import { shellKeychain, type TauriIpc, tauriAgentHostTransport } from "@halonicjs/studio-services";
import { type GitAnswer, WorkspaceChanges } from "../changes/workspace-changes.ts";
import { provideGoogleSetup } from "../google/provide-google-setup.ts";
import { provideLibraryServices } from "../library/provide-library-services.ts";
import { WorkspaceModelKeys } from "../models/workspace-model-keys.ts";
import { WorkspaceModelsFiles } from "../models/workspace-models-files.ts";
import { WorkspaceRuns } from "../runs/workspace-runs.ts";
import { WorkspaceWorkflows } from "../workflows/workspace-workflows.ts";
import type { WorkspaceTrust } from "./workspace-trust.ts";

/** What the services of one open folder read: the shell, the page's window and the folder. */
export interface FolderServiceParts {
  readonly ipc: TauriIpc;
  readonly files: TauriFileShell;
  readonly window: object;
  readonly trust: WorkspaceTrust;
  readonly location: string;
  /** The open workspace, whose files and events the Models feature reads. */
  readonly scope: WorkspaceScope;
}

/** Gives the folder in `location` the services its features read through the shell. */
export function provideFolderServices(
  services: ServiceRegistry,
  { ipc, files, window, trust, location, scope }: FolderServiceParts,
): void {
  services.provide(
    ModelsFilesService,
    new WorkspaceModelsFiles({
      files: services.get(workspaceFilesKey),
      onChange: (listener) => scope.events.on("files.changed", listener),
    }),
  );
  services.provide(ModelKeysService, new WorkspaceModelKeys(shellKeychain(ipc)));
  provideWorkspaceRuns(services, { ipc, files, window }, location);
  services.provide(
    ChangesSourceService,
    new WorkspaceChanges({
      git: async (args) =>
        (await ipc.invoke("git", { root: location, args: [...args] })) as GitAnswer,
      files: new TauriDefinitionStore(files, location),
      digest: webCryptoDigest,
      onFocus: (listener) => focusOf(window, listener),
      onFilesChanged: (listener) => scope.events.on("files.changed", listener),
    }),
  );
  services.provide(
    WorkflowsHostService,
    new WorkspaceWorkflows({
      files: services.get(workspaceFilesKey),
      onChange: (listener) => scope.events.on("files.changed", listener),
      runs: services.get(RunsSourceService),
    }),
  );
  provideLibraryServices(services, {
    ipc,
    files,
    transport: tauriAgentHostTransport(window),
    trust,
    location,
    onFocus: (listener) => focusOf(window, listener),
  });
  provideGoogleSetup(services, {
    ipc,
    files,
    location,
    onFocus: (listener) => focusOf(window, listener),
  });
}

/**
 * Gives the workspace in `location` its runs, read through the shell, as both the Runs
 * feature's and the Inbox's source.
 */
function provideWorkspaceRuns(
  services: ServiceRegistry,
  { ipc, files, window }: { ipc: TauriIpc; files: TauriFileShell; window: object },
  location: string,
): void {
  const runs = new WorkspaceRuns({
    runs: new TauriRunStore(ipc, location),
    definitions: new TauriDefinitionStore(files, location),
    onFocus: (listener) => focusOf(window, listener),
  });
  services.provide(RunsSourceService, runs);
  services.provide(InboxRunsService, runs);
}

/** Calls `listener` whenever the page's window comes to the front; returns a function that stops it. */
function focusOf(window: object, listener: () => void): () => void {
  if (!(window instanceof EventTarget)) return () => {};
  window.addEventListener("focus", listener);
  return () => window.removeEventListener("focus", listener);
}
