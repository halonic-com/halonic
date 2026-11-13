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

/** One thing a person trusted on this computer: a workspace, or a hub or skill folder. */
export interface TrustedSource {
  /** The folder's real path, the trust record's key. */
  readonly location: string;
  /** The folder's name, shown first in its row. */
  readonly name: string;
  /** When the person trusted it, as ISO text. */
  readonly trustedAt: string;
  /** Whether the folder is still there. Unknown (`undefined`) shows the row as trusted, never as gone. */
  readonly found?: boolean | undefined;
}

/** What Settings › Trusted sources reads and changes of the trust records on this computer. */
export interface TrustedSourcesHost {
  /** Every record, most recently trusted first. Rejects with the reason it couldn't be read. */
  list(): Promise<readonly TrustedSource[]>;
  /** Deletes the record, so Halonic asks again. Rejects with the reason it couldn't. */
  remove(location: string): Promise<void>;
}

/** The trust records Settings › Trusted sources lists, provided by the app (`workspace.trusted-sources`). */
export const TrustedSourcesService: ServiceKey<TrustedSourcesHost> = serviceKey<TrustedSourcesHost>(
  "workspace.trusted-sources",
);
