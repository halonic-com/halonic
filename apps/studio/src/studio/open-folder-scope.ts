import {
  TauriDefinitionStore,
  type TauriFileShell,
  webCryptoDigest,
} from "@halonicjs/adapter-fs-tauri";
import { openWorkspace, type WorkspaceScope, workspaceFilesKey } from "@halonicjs/app";
import { WorkspaceSaving } from "@halonicjs/studio-feature-workspace";
import type { StudioWorkspace } from "@halonicjs/studio-shell";
import type { WorkspaceTrust } from "./workspace-trust.ts";

/** Saves the scope's files by themselves, through the workspace's save state (`workspace.saves-itself`). */
export function savingOf(
  scope: WorkspaceScope,
  workspace: StudioWorkspace,
  name: string,
): WorkspaceSaving {
  return new WorkspaceSaving({
    files: scope.services.get(workspaceFilesKey),
    onChange: (listener) => scope.events.on("files.changed", listener),
    saving: workspace.saving,
    name,
  });
}

/** The workspace's scope over its folder and its review records, which live in the profile. */
export function openFolderScope(
  files: TauriFileShell,
  location: string,
  trust: WorkspaceTrust,
): WorkspaceScope {
  const scope = openWorkspace({
    store: new TauriDefinitionStore(files, location),
    reviewRecords: new TauriDefinitionStore(files, location, { folder: "review" }),
    digest: webCryptoDigest,
    isTrusted: () => trust.isTrusted(),
    onListenerError: (error) => console.error(error),
  });
  // A saved change may add something to run, so trust is checked again on what is saved.
  scope.events.on("files.saved", () => void trust.refresh());
  return scope;
}
