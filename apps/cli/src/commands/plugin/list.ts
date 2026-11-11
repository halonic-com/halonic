// `halonic plugin list`: the plugins in the profile, one row each (cli-output
// 3.6). A thin command over `PluginService.load`: it lists, and writes
// nothing, so it needs no trust.

import type { PluginEntry, PluginInstall, PluginService } from "@halonicjs/app";
import { type ProfileEnvironment, withHomeAsTilde } from "@halonicjs/profile";
import type { CommandContext, CommandInput, CommandResult } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { columns } from "../../messages/columns.ts";
import { dimmed, markPart, type Phrase, phrase } from "../../messages/phrase.ts";
import { type PluginState, pluginMessages } from "../../messages/plugin.ts";
import { printable } from "../../output/printable.ts";
import { openPluginService, type PluginSetup } from "../../plugin-host.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";

/** How many characters of a commit the list shows, as git does. */
const shownCommitLength = 7;

/**
 * Lists every plugin in the profile, lined up: its name, version, where it
 * came from and whether it is on. No plugins says so, and exits 0.
 *
 * @example
 * await listPlugins(input, context, {});
 * // "Weather   1.2.0   github.com/acme/weather@3f2c1ab   ✓ on"
 */
export async function listPlugins(
  _input: CommandInput,
  _context: CommandContext,
  setup: PluginSetup,
): Promise<CommandResult> {
  const service = openPluginService(setup);
  const entries = await service.load();
  const profile = setup.profile ?? nodeProfileEnvironment();
  const rows = await Promise.all(entries.map((entry) => pluginRow(service, entry, profile)));
  const json = { plugins: rows.map((row) => row.json) };
  if (rows.length === 0) {
    return { exitCode: exitCode.ok, lines: [pluginMessages.noPlugins().phrase], json };
  }
  return { exitCode: exitCode.ok, lines: columns(rows.map((row) => row.cells)), json };
}

interface PluginRow {
  readonly cells: Phrase[];
  readonly json: Readonly<Record<string, unknown>>;
}

async function pluginRow(
  service: PluginService,
  entry: PluginEntry,
  profile: ProfileEnvironment,
): Promise<PluginRow> {
  const install = await service.install(entry.folder);
  const source = install === null ? "" : shownSource(install.source, profile);
  if (entry.status === "broken") {
    return {
      cells: [
        phrase`${printable(entry.folder)}`,
        phrase``,
        dimmed(phrase`${printable(source)}`),
        phrase`${markPart("failed")} ${pluginMessages.broken().phrase}`,
      ],
      json: { id: entry.folder, status: "broken", source: install?.source ?? null },
    };
  }
  const state = stateOf(entry);
  return {
    cells: [
      phrase`${printable(entry.plugin.name)}`,
      phrase`${printable(entry.plugin.version)}`,
      dimmed(phrase`${printable(source)}`),
      stateCell(state, entry.folder),
    ],
    json: {
      id: entry.folder,
      name: entry.plugin.name,
      version: entry.plugin.version,
      status: state,
      source: install?.source ?? null,
    },
  };
}

function stateOf(entry: Exclude<PluginEntry, { status: "broken" }>): PluginState {
  if (entry.status === "trusted") return "on";
  return entry.status === "changed" ? "changed" : "notTrusted";
}

function stateCell(state: PluginState, id: string): Phrase {
  if (state === "on") {
    return phrase`${markPart("done")} ${pluginMessages.state("on").phrase}`;
  }
  return phrase`${markPart("needsYou")} ${pluginMessages.stateWithFix(state, id).phrase}`;
}

/**
 * Where a plugin came from, as the list shows it: a git address without its
 * scheme and `.git`, with the short commit, or a folder with the home folder
 * written as `~`.
 */
function shownSource(source: PluginInstall["source"], profile: ProfileEnvironment): string {
  if (source.kind === "git") {
    const address = source.address.replace(/^[a-z+]+:\/\//, "").replace(/\.git$/, "");
    return `${address}@${source.commit.slice(0, shownCommitLength)}`;
  }
  return withHomeAsTilde(profile.platform, profile.homeFolder, source.path);
}
