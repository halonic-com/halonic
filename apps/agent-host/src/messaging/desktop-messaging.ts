import { createHash } from "node:crypto";
import { join } from "node:path";
import { namedWorkspace } from "../server/named-workspace.ts";
import {
  type Disconnected,
  WorkspaceMessaging,
  type WorkspaceMessagingOptions,
} from "./workspace-messaging.ts";

/** What the desktop engine needs; each workspace gets its own messaging and cache folder. */
export interface DesktopMessagingOptions
  extends Omit<WorkspaceMessagingOptions, "workspace" | "cacheFolder"> {
  /** The messaging cache's folder in the app data folder; each workspace gets a folder inside it. */
  cacheRoot: string;
}

/**
 * The desktop engine's messaging (ADR 2026-11-24, agent messaging, deployment
 * (a)): one {@link WorkspaceMessaging} for each workspace the launcher named,
 * made when Studio first asks for it. Keys are bound to their workspace, so
 * each workspace sees only the connections the person connected there.
 */
export class DesktopMessaging {
  readonly #options: DesktopMessagingOptions;
  readonly #workspaces = new Map<string, WorkspaceMessaging>();

  constructor(options: DesktopMessagingOptions) {
    this.#options = options;
  }

  /** The messaging of `folder`, or `undefined` when it isn't the real path of a workspace the launcher named. */
  async of(folder: string): Promise<WorkspaceMessaging | undefined> {
    const workspace = await namedWorkspace(this.#options.workspaceRoots, folder);
    if (workspace === undefined) return undefined;
    const known = this.#workspaces.get(workspace);
    if (known !== undefined) return known;
    const made = new WorkspaceMessaging({
      ...this.#options,
      workspace,
      cacheFolder: join(this.#options.cacheRoot, folderNameOf(workspace)),
    });
    this.#workspaces.set(workspace, made);
    return made;
  }

  /**
   * Disconnect (`agent-host.paperclip-key`) in the workspace at `folder`, then
   * in every other open workspace that holds the same key for a connection of
   * the same name: Studio deletes the one keychain entry for that name, and
   * when the revoke failed the key stays valid, so no workspace may go on
   * polling with it.
   *
   * @returns what Disconnect did, or `undefined` when `folder` isn't the real path of a workspace the launcher named
   */
  async disconnect(folder: string, connection: string): Promise<Disconnected | undefined> {
    const messaging = await this.of(folder);
    if (messaging === undefined) return undefined;
    const madeFor = this.#options.keys.madeFor({ workspace: messaging.workspace, connection });
    const disconnected = await messaging.disconnect(connection);
    if (madeFor === undefined) return disconnected;
    const others = [...this.#workspaces.values()].filter((other) => other !== messaging);
    await Promise.all(others.map((other) => other.forgetSameKey(connection, madeFor)));
    return disconnected;
  }

  /** Reads every workspace's connected sources again; the poller calls it. Failures are reported, never thrown. */
  async refresh(): Promise<void> {
    await Promise.all([...this.#workspaces.values()].map((workspace) => workspace.refresh()));
  }

  /** Stops following every workspace's changes, when the host stops. */
  close(): void {
    for (const workspace of this.#workspaces.values()) workspace.close();
  }
}

/** A workspace's cache folder name: a hash of its path, so no path can name another folder. */
function folderNameOf(workspace: string): string {
  return createHash("sha256").update(workspace).digest("hex").slice(0, 32);
}
