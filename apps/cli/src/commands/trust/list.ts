import { realpath } from "node:fs/promises";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { pluginTrustFingerprintPrefix } from "@halonicjs/app";
import { parseFile, pluginFromIntegrationSheet } from "@halonicjs/format";
import type { Clock, TrustRecord, TrustStore } from "@halonicjs/ports";
import { settingsPath } from "@halonicjs/workspace";
import type { CommandResult } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { columns } from "../../messages/columns.ts";
import { phrase } from "../../messages/phrase.ts";
import { trustMessages } from "../../messages/trust.ts";
import { printable } from "../../output/printable.ts";
import { shownDate } from "../../output/trust-check.ts";
import { shownPath } from "../../shown-path.ts";
import { cliTrustService } from "../../workspace-trust.ts";

// `halonic trust --list`, and the names it and `--remove` show for a record.

/**
 * `--list`: one line per trusted workspace or plugin, its name, folder and
 * the day it was trusted; a plugin's name says it is one. `--list --json`
 * adds the fingerprint and the kind; the lines don't.
 */
export async function listTrusted(
  store: TrustStore,
  clock: Clock,
  cwd: string,
): Promise<CommandResult> {
  const records = await cliTrustService(store, clock).list();
  if (records.length === 0) {
    return {
      exitCode: exitCode.ok,
      lines: [trustMessages.noneTrusted().phrase],
      json: { workspaces: [] },
    };
  }
  // A record holds the folder's real path, so each one is shown from the real
  // path of the current folder too: through a link, or a Windows short name
  // such as `RUNNER~1`, the two would share no folders and `./acme` would
  // come out as `../../…/acme`.
  const here = await realpath(cwd).catch(() => cwd);
  const workspaces = await Promise.all(records.map((record) => listed(record, here)));
  const rows = workspaces.map((workspace) => [
    workspace.kind === "plugin"
      ? trustMessages.listedPlugin(printable(workspace.name)).phrase
      : phrase`${printable(workspace.name)}`,
    phrase`${workspace.folder}`,
    trustMessages.trustedOn(shownDate(workspace.trustedAt)).phrase,
  ]);
  return { exitCode: exitCode.ok, lines: columns(rows), json: { workspaces } };
}

/** A trusted workspace or plugin as `--list` shows it. */
async function listed(record: TrustRecord, cwd: string) {
  const folder = shownPath(cwd, record.location);
  const plugin = isPluginRecord(record);
  return {
    kind: plugin ? "plugin" : "workspace",
    name: plugin
      ? await pluginNameAt(record.location, folder)
      : await nameAt(record.location, folder),
    folder,
    fingerprint: record.fingerprint,
    trustedAt: record.grantedAt,
  };
}

/** Whether the record trusts a plugin: a plugin's fingerprint has its own kind. */
export function isPluginRecord(record: TrustRecord): boolean {
  return record.fingerprint.startsWith(pluginTrustFingerprintPrefix);
}

/**
 * The name in the workspace's `workspace.yaml`, or `fallback` when there's
 * none to read. Only that file is read, so a broken file or folder elsewhere
 * in one workspace can't stop `--list` from showing the others.
 */
export async function nameAt(location: string, fallback: string): Promise<string> {
  const store = new FolderDefinitionStore(location, fallback);
  const text = await store.read(settingsPath).catch(() => null);
  if (text === null) {
    return fallback;
  }
  const parsed = parseFile("workspace", text);
  return parsed.ok ? parsed.value.value.name : fallback;
}

/**
 * The name in the plugin's manifest, a `plugin.yaml` or an `integration.yaml`,
 * or `fallback` when there's none to read.
 */
async function pluginNameAt(location: string, fallback: string): Promise<string> {
  const store = new FolderDefinitionStore(location, fallback);
  const manifest = await store.read("plugin.yaml").catch(() => null);
  if (manifest !== null) {
    const parsed = parseFile("plugin", manifest);
    return parsed.ok ? parsed.value.value.name : fallback;
  }
  const sheet = await store.read("integration.yaml").catch(() => null);
  if (sheet === null) return fallback;
  const parsed = parseFile("integration", sheet);
  return parsed.ok ? pluginFromIntegrationSheet(parsed.value.value).name : fallback;
}
