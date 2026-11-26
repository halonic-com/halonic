import type { ToastStore } from "@halonicjs/studio-kit";
import type { SaveReason, StudioWorkspace } from "@halonicjs/studio-shell";
import type { TestModelWatch } from "../sample/test-model-watch.ts";
import type { WorkspaceTrustControl } from "../trust/workspace-trust-control.ts";
import type { RecentWorkspaces } from "./recent-workspaces.ts";
import type { WorkspaceSaving } from "./workspace-saving.ts";

/** A workspace the app opened in a folder: what the window shows and how to let it go. */
export interface OpenedWorkspace {
  /** Its name, such as "Acme". */
  readonly name: string;
  /** Its tabs, Recent places, save state and services. */
  readonly workspace: StudioWorkspace;
  /** Saves its files by itself and says whether it can close; absent when it has no files to save. */
  readonly saving?: WorkspaceSaving | undefined;
  /** Whether it is trusted and the way to trust it; absent when there is no folder to trust. */
  readonly trust?: WorkspaceTrustControl | undefined;
  /** Whether its `default` model is the test model; absent when its models can't be read. */
  readonly testModel?: TestModelWatch | undefined;
  /** Stops its services. Called once, when it closes. */
  dispose(): Promise<void>;
}

/** A close that couldn't save first: what "Close Acme?" says and asks (UX checklist 1.3). */
export interface CloseRequest {
  /** The folder of the workspace asked to close. */
  readonly location: string;
  readonly name: string;
  /** Why saving failed, or `still-saving` when the window stopped waiting for a save that hasn't ended. */
  readonly reason: SaveReason | "still-saving";
}

/** What {@link WorkspaceSwitcher} needs from the app. */
export interface WorkspaceSwitcherOptions {
  /** Shows the folder picker; resolves with the folder's location, or `undefined` when cancelled. */
  readonly pickFolder: () => Promise<string | undefined>;
  /**
   * Opens the workspace in a folder; rejects with why it can't, a `not_found` or `denied` kind for
   * a folder that's gone or can't be read.
   */
  readonly openFolder: (location: string) => Promise<OpenedWorkspace>;
  readonly recent: RecentWorkspaces;
  /** The window's toasts, for "Opened Acme" and a menu's failed open. */
  readonly toasts: ToastStore;
  /**
   * Lets the app reach a folder the user picked before, after a restart, before a Recent row
   * opens it; rejects as {@link openFolder} does, or with a `conflict` kind when the user has to
   * pick the folder again first. The desktop shell gives a page only the folders the user chose
   * in it. Without it, a Recent row opens its folder straight away.
   */
  readonly reopenFolder?: ((location: string) => Promise<void>) | undefined;
  /** Takes the app's access to a folder away when its row leaves Recent. */
  readonly forgetFolder?: ((location: string) => Promise<void>) | undefined;
}

/**
 * A workspace's name from its folder's location, until the workspace's own name is read from its
 * files: the folder's last part, "acme" for `/work/acme` or `Work\acme`.
 */
export function folderName(location: string): string {
  const parts = location.split(/[\\/]/).filter((part) => part !== "");
  return parts.at(-1) ?? location;
}

/**
 * Lets an opened workspace go: stops its saving and its tabs, then its services. Every close goes
 * through here, a dropped reopen's included, so none keeps a listener or a scheduler behind.
 */
export async function closeOpened(opened: OpenedWorkspace): Promise<void> {
  opened.saving?.dispose();
  opened.workspace.dispose();
  await opened.dispose();
}
