// Whether a plugin is trusted, as `app.plugin-trust` asks: the same
// records as workspaces, keyed by the plugin folder's real path, but a
// plugin's record never shrinks. Any change to the manifest, a file or a pin
// turns the plugin off until a person trusts it again (P2 plan section 4).
// `TrustService.checkPlugin` and `grantPlugin` call these.

import type { Plugin, PluginLocalTool } from "@halonicjs/format";
import type { ConnectorPin, TrustGrant } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import { type PluginTrustChanges, pluginTrustChanges } from "./plugin-trust-changes.ts";
import {
  type PluginFileHash,
  type PluginTrustContent,
  pluginTrustContent,
  pluginTrustFingerprint,
} from "./plugin-trust-content.ts";
import {
  grantOf,
  type PersonTrustOrigin,
  readTrustRecord,
  savePersonTrust,
  type TrustRefusal,
  type TrustServiceOptions,
} from "./trust-record.ts";

/** The plugin a trust check is about. */
export interface PluginTrustSubject {
  /** The plugin folder's resolved real path: the trust record's key. */
  readonly location: string;
  /** The manifest, as parsed and checked. */
  readonly plugin: Plugin;
  /** The hash of every file in the plugin folder, of the bytes that were read. */
  readonly files: readonly PluginFileHash[];
}

/** What the plugin holds now, as the prompt shows it. */
interface CurrentPluginTrust {
  readonly content: PluginTrustContent;
  /** The full fingerprint, such as "hpf1:9f86d081…". Never shortened. */
  readonly fingerprint: string;
}

/** Whether a plugin is trusted, and if not, why. Only `trusted` has a grant. */
export type PluginTrustCheck =
  | (CurrentPluginTrust & {
      readonly status: "trusted";
      readonly grant: TrustGrant;
      /** When the person trusted it, as ISO text. */
      readonly trustedAt: string;
    })
  | (CurrentPluginTrust & { readonly status: "new" })
  | (CurrentPluginTrust & {
      readonly status: "changed";
      readonly changes: PluginTrustChanges;
      /** When the person trusted the earlier version, as ISO text. */
      readonly trustedAt: string;
    })
  | (CurrentPluginTrust & {
      readonly status: "unreadable";
      /** The store's error. It names the record's location, so the host can say which file. */
      readonly error: unknown;
    });

/**
 * The public registry a runner uses when the manifest names none, as a
 * `ConnectorPin.registryUrl`: the registry's base address, never its index.
 * The launcher adds `/simple` for PyPI itself, and the pin check reads
 * `/pypi/<name>/json` from the same base.
 */
const publicRegistries: Record<ConnectorPin["registry"], string> = {
  npm: "https://registry.npmjs.org",
  pypi: "https://pypi.org",
};

/** Whether the plugin is trusted now: a grant only when the record's fingerprint is the current one. */
export async function checkPluginTrust(
  options: TrustServiceOptions,
  subject: PluginTrustSubject,
): Promise<PluginTrustCheck> {
  const current = await currentTrust(options, subject);
  const stored = await readTrustRecord(options.store, subject.location);
  if (stored.status === "unreadable") {
    return { status: "unreadable", ...current, error: stored.error };
  }
  if (stored.status === "none") {
    return { status: "new", ...current };
  }
  const { record } = stored;
  if (record.fingerprint === current.fingerprint) {
    return { status: "trusted", ...current, grant: grantOf(record), trustedAt: record.grantedAt };
  }
  const changes = pluginTrustChanges(record.content, current.content);
  return { status: "changed", ...current, changes, trustedAt: record.grantedAt };
}

/** Saves a person's trust, only when the fingerprint they were shown is exactly the current one. */
export async function grantPluginTrust(
  options: TrustServiceOptions,
  subject: PluginTrustSubject,
  shownFingerprint: string,
  origin: PersonTrustOrigin,
): Promise<Result<TrustGrant, TrustRefusal>> {
  const { content, fingerprint } = await currentTrust(options, subject);
  if (shownFingerprint !== fingerprint) {
    return err({ kind: "fingerprint-changed", fingerprint });
  }
  const pins = pluginPins(subject.plugin);
  return ok(
    await savePersonTrust(options, {
      location: subject.location,
      fingerprint,
      content,
      pins,
      origin,
    }),
  );
}

async function currentTrust(
  options: TrustServiceOptions,
  subject: PluginTrustSubject,
): Promise<CurrentPluginTrust> {
  const content = pluginTrustContent({ plugin: subject.plugin, files: subject.files });
  return { content, fingerprint: await pluginTrustFingerprint(content, options.digest) };
}

/**
 * Each local tool's package pin, keyed by the local tool's id, as the
 * launcher reads them from the record. A local tool started by a script has
 * no pin: its file's hash is in the content.
 */
function pluginPins(plugin: Plugin): Record<string, ConnectorPin> {
  const pins: Record<string, ConnectorPin> = {};
  for (const tool of plugin.localTools ?? []) {
    const pin = packagePin(tool);
    if (pin !== null) pins[tool.id] = pin;
  }
  return pins;
}

function packagePin(tool: PluginLocalTool): ConnectorPin | null {
  const start = tool.start.package;
  if (start === undefined) return null;
  const registry = start.runner === "npx" ? "npm" : "pypi";
  return {
    registry,
    registryUrl: start.registry ?? publicRegistries[registry],
    package: start.name,
    version: start.version,
  };
}
