import {
  TauriDefinitionStore,
  type TauriFileShell,
  TauriRunStore,
} from "@halonicjs/adapter-fs-tauri";
import type { ServiceRegistry } from "@halonicjs/app";
import { InboxRunsService } from "@halonicjs/studio-feature-inbox/api";
import { RunsSourceService } from "@halonicjs/studio-feature-runs/api";
import { type TauriIpc, tauriAgentHostTransport } from "@halonicjs/studio-services";
import { provideLibraryServices } from "../library/provide-library-services.ts";
import { WorkspaceRuns } from "../runs/workspace-runs.ts";
import type { WorkspaceTrust } from "./workspace-trust.ts";

/** What the services of one open folder read: the shell, the page's window and the folder. */
export interface FolderServiceParts {
  readonly ipc: TauriIpc;
  readonly files: TauriFileShell;
  readonly window: object;
  readonly trust: WorkspaceTrust;
  readonly location: string;
}

/** Gives the folder in `location` the services its features read through the shell. */
export function provideFolderServices(
  services: ServiceRegistry,
  { ipc, files, window, trust, location }: FolderServiceParts,
): void {
  provideWorkspaceRuns(services, { ipc, files, window }, location);
  provideLibraryServices(services, {
    ipc,
    files,
    transport: tauriAgentHostTransport(window),
    trust,
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
