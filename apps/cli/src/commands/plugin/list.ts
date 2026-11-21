// `halonic plugin list`: the plugins in the profile, one row each (cli-output
// 3.6), and under a plugin with programs, whether they run on this computer
// (cli.plugin-programs-run). A thin command over `PluginService.load`: it
// lists, and writes nothing, so it needs no trust.

import type { LocalToolState, PluginEntry, PluginInstall, PluginService } from "@halonicjs/app";
import { type ProfileEnvironment, withHomeAsTilde } from "@halonicjs/profile";
import type { CommandContext, CommandInput, CommandResult } from "../../command.ts";
import { pluginStateOf } from "../../connector-plugin.ts";
import { exitCode } from "../../exit-code.ts";
import { columns } from "../../messages/columns.ts";
import { dimmed, markPart, type Phrase, phrase } from "../../messages/phrase.ts";
import { type PluginState, pluginMessages } from "../../messages/plugin.ts";
import { printable } from "../../output/printable.ts";
import { rowIndent } from "../../output/trust-check-rows.ts";
import { openPluginService, type PluginSetup, programsRunFor } from "../../plugin-host.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";

/** How many characters of a commit the list shows, as git does. */
const shownCommitLength = 7;

/**
 * Lists every plugin in the profile, lined up: its name, version, where it
 * came from and whether it is on. Under a plugin with programs, a line says
 * whether they run on this computer, with a ! when they don't, so a plugin
 * that is on never looks like it runs programs it can't. No plugins says so,
 * and exits 0.
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
  const checked = entries.filter((entry) => entry.status !== "broken");
  const programsRun = await programsRunFor(
    setup,
    checked.map((entry) => entry.content),
  );
  const rows = await Promise.all(
    entries.map((entry) => pluginRow(service, entry, profile, programsRun)),
  );
  const json = { plugins: rows.map((row) => row.json) };
  if (rows.length === 0) {
    return { exitCode: exitCode.ok, lines: [pluginMessages.noPlugins().phrase], json };
  }
  const lined = columns(rows.map((row) => row.cells));
  const lines = rows.flatMap((row, index) => [lined[index] ?? phrase``, ...row.under]);
  return { exitCode: exitCode.ok, lines, json };
}

interface PluginRow {
  readonly cells: Phrase[];
  /** The lines under the row: whether the plugin's programs run here, when it has any. */
  readonly under: Phrase[];
  readonly json: Readonly<Record<string, unknown>>;
}

async function pluginRow(
  service: PluginService,
  entry: PluginEntry,
  profile: ProfileEnvironment,
  programsRun: LocalToolState["kind"] | undefined,
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
      under: [],
      json: { id: entry.folder, status: "broken", source: install?.source ?? null },
    };
  }
  const state = pluginStateOf(entry);
  const runs = entry.content.localTools.length === 0 ? undefined : programsRun;
  return {
    cells: [
      phrase`${printable(entry.plugin.name)}`,
      phrase`${printable(entry.plugin.version)}`,
      dimmed(phrase`${printable(source)}`),
      stateCell(state, entry.folder),
    ],
    under: runs === undefined ? [] : [programsRunLine(runs)],
    json: {
      id: entry.folder,
      name: entry.plugin.name,
      version: entry.plugin.version,
      status: state,
      source: install?.source ?? null,
      programsRun: runs ?? null,
    },
  };
}

/** "  ! Programs: Doesn't run now. …", with no mark when they run. */
function programsRunLine(runs: LocalToolState["kind"]): Phrase {
  const line = pluginMessages.listProgramsRun(runs).phrase;
  if (runs === "ready") return phrase`${rowIndent}${line}`;
  return phrase`${rowIndent}${markPart("needsYou")} ${line}`;
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
