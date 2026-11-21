import { TauriTrustStore } from "@halonicjs/adapter-fs-tauri";
import { pluginTrustFingerprintPrefix, type SignOutPlugin } from "@halonicjs/app";
import type { TrustRecord, TrustStore } from "@halonicjs/ports";
import type { TrustedSource, TrustedSourcesHost } from "@halonicjs/studio-feature-workspace/api";
import { tauriAgentHostTransport, tauriChannelIpc } from "@halonicjs/studio-services";
import { agentHostPluginSignOut } from "../plugins/provide-plugins.ts";
import type { WorkspaceTrust } from "./workspace-trust.ts";

/** The last part of a path, which is the folder's name; both slash kinds count. */
function nameOf(location: string): string {
  const parts = location.split(/[\\/]+/u).filter((part) => part !== "");
  return parts.at(-1) ?? location;
}

/** Whether each folder is still there, by location; one left out is unknown. */
export type FoldersFound = (locations: readonly string[]) => Promise<ReadonlyMap<string, boolean>>;

/** What {@link trustedSourcesOf} reads and calls. */
export interface TrustedSourcesParts {
  /** The profile's trust records. */
  readonly store: TrustStore;
  /**
   * Signs out a plugin's sign-ins by its id, the plugin folder's name, before its record is
   * removed, the same sign-out the plugins host uses (`app.plugin-sign-out`).
   */
  readonly signOutPlugin: SignOutPlugin;
  /** Runs once a record is removed; nothing by default. */
  readonly afterRemove?: () => Promise<void>;
  /** Whether each folder is still there; without it every row's `found` is unknown. */
  readonly foldersFound?: FoldersFound;
}

/**
 * Settings › Trusted sources over the profile's trust records (`workspace.trusted-sources`). With
 * `foldersFound` a row says whether its folder is still there; without it, or when it fails, `found`
 * stays unknown and the row only says when it was trusted. Once a record is removed, `afterRemove` runs, so the folders open now check their
 * trust again and a removed trust holds no longer, without waiting for a save.
 *
 * Removing a plugin's record signs the plugin out first, as removing its trust on its own page
 * does, also when its folder is gone. The record is removed whether or not the sign-out worked,
 * and then the sign-out's error is thrown, so the dialog says why and removing again finishes.
 *
 * @example
 * const host = trustedSourcesOf({ store, signOutPlugin, afterRemove, foldersFound });
 */
export function trustedSourcesOf({
  store,
  signOutPlugin,
  afterRemove = async () => undefined,
  foldersFound,
}: TrustedSourcesParts): TrustedSourcesHost {
  return {
    async list(): Promise<TrustedSource[]> {
      const records = await store.list();
      const found = await foundOf(
        foldersFound,
        records.map((record) => record.location),
      );
      return records.map((record) => ({
        location: record.location,
        name: nameOf(record.location),
        trustedAt: record.grantedAt,
        found: found.get(record.location),
        // A plugin's record has its own fingerprint kind; the Remove dialog says its tools stop.
        kind: isPluginRecord(record) ? "plugin" : "workspace",
      }));
    },
    async remove(location): Promise<void> {
      const record = await store.get(location);
      try {
        // A plugin's id is its folder's name, and its sign-ins are signed in under its id.
        if (record !== null && isPluginRecord(record)) await signOutPlugin(nameOf(location));
      } finally {
        // A sign-in that couldn't be signed out never keeps a plugin trusted.
        await store.revoke(location);
        await afterRemove();
      }
    },
  };
}

function isPluginRecord(record: TrustRecord): boolean {
  return record.fingerprint.startsWith(pluginTrustFingerprintPrefix);
}

/**
 * Settings › Trusted sources over the profile's trust records, signing a plugin out at the agent
 * host when its record is removed. Without the shell there are none to show or remove.
 */
export function desktopTrustedSources(
  window: object,
  open: ReadonlySet<WorkspaceTrust>,
): TrustedSourcesHost {
  const ipc = tauriChannelIpc(window);
  const agentHost = tauriAgentHostTransport(window);
  if (ipc === undefined || agentHost === undefined) {
    return { list: async () => [], remove: async () => undefined };
  }
  const store = new TauriTrustStore(ipc);
  return trustedSourcesOf({
    store,
    signOutPlugin: agentHostPluginSignOut(agentHost),
    afterRemove: async () => {
      await Promise.all([...open].map((each) => each.refresh()));
    },
    foldersFound: (locations) => store.foldersFound(locations),
  });
}

/** The shell's answer, or nothing when it can't give one: the list still shows without it. */
async function foundOf(
  foldersFound: FoldersFound | undefined,
  locations: readonly string[],
): Promise<ReadonlyMap<string, boolean>> {
  if (foldersFound === undefined) {
    return new Map();
  }
  try {
    return await foldersFound(locations);
  } catch {
    return new Map();
  }
}
