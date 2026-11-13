/**
 * The services and types other features may use. Features import each other only through this
 * file. The app provides `WorkspacePageService` for each open folder; the workspace page reads it.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { WorkspaceTrustControl } from "./trust/workspace-trust-control.ts";

/** What the app tells the workspace page about the folder open in the window. */
export interface WorkspacePage {
  /** The workspace's name, the one in `workspace.yaml` or else its folder's. */
  readonly name: string;
  /** The folder's trust; absent outside the desktop app, which has no folder to trust. */
  readonly trust?: WorkspaceTrustControl | undefined;
}

/** The workspace page's facts, provided by the app for each open folder. */
export const WorkspacePageService: ServiceKey<WorkspacePage> =
  serviceKey<WorkspacePage>("workspace.page");
