// `halonic plugin list`: the plugins in the profile, one row each (cli-output
// 3.6), and under a plugin with programs, whether they run on this computer
// (cli.plugin-programs-run), and for a plugin that is on but whose backend is
// off here, why (HAL-15080). A thin command over `PluginService.load`: it
// lists, and writes nothing, so it needs no trust.

import type {
  LocalToolState,
  PluginEntry,
  PluginService,
  RunnerUnfencedReason,
} from "@halonicjs/app";
import type { ProfileEnvironment } from "@halonicjs/profile";
import type { CommandContext, CommandInput, CommandResult } from "../../command.ts";
import { pluginStateOf } from "../../connector-plugin.ts";
import { exitCode } from "../../exit-code.ts";
import { columns } from "../../messages/columns.ts";
import { dimmed, markPart, type Phrase, phrase } from "../../messages/phrase.ts";
import { type PluginState, pluginMessages } from "../../messages/plugin.ts";
import { offHereReasonLines } from "../../output/plugin-off-here.ts";
import { shownPluginSource } from "../../output/plugin-source.ts";
import { printable } from "../../output/printable.ts";
import { rowIndent } from "../../output/trust-check-rows.ts";
import {
  offHereFor,
  openPluginService,
  type PluginSetup,
  programsRunFor,
} from "../../plugin-host.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";

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
  const offHere = await offHereFor(
    setup,
    checked.filter((entry) => pluginStateOf(entry) === "on").map((entry) => entry.plugin),
  );
  const rows = await Promise.all(
    entries.map((entry) => pluginRow(service, entry, profile, { programsRun, offHere })),
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

/** What this computer can run, asked once for the whole list. */
interface RunsHere {
  readonly programsRun: LocalToolState["kind"] | undefined;
  /** Why a backend of a plugin that is on doesn't start here, if it doesn't. */
  readonly offHere: RunnerUnfencedReason | undefined;
}

async function pluginRow(
  service: PluginService,
  entry: PluginEntry,
  profile: ProfileEnvironment,
  { programsRun, offHere }: RunsHere,
): Promise<PluginRow> {
  const install = await service.install(entry.folder);
  const source = install === null ? "" : shownPluginSource(install.source, profile);
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
  const off = state === "on" && entry.plugin.backend !== undefined ? offHere : undefined;
  return {
    cells: [
      phrase`${printable(entry.plugin.name)}`,
      phrase`${printable(entry.plugin.version)}`,
      dimmed(phrase`${printable(source)}`),
      off === undefined ? stateCell(state, entry.folder) : offHereCell(),
    ],
    under: [
      ...(off === undefined ? [] : offHereReasonLines(off)),
      ...(runs === undefined ? [] : [programsRunLine(runs)]),
    ],
    json: {
      id: entry.folder,
      name: entry.plugin.name,
      version: entry.plugin.version,
      status: state,
      source: install?.source ?? null,
      programsRun: runs ?? null,
      offOnThisComputer: off ?? null,
    },
  };
}

/** "  ! Programs: Doesn't start on this computer: …", with no mark when they run. */
function programsRunLine(runs: LocalToolState["kind"]): Phrase {
  const line = pluginMessages.listProgramsRun(runs).phrase;
  if (runs === "ready") return phrase`${rowIndent}${line}`;
  return phrase`${rowIndent}${markPart("needsYou")} ${line}`;
}

/** "! off on this computer": on, but its backend doesn't start here (R13). */
function offHereCell(): Phrase {
  return phrase`${markPart("needsYou")} ${pluginMessages.offHereState().phrase}`;
}

function stateCell(state: PluginState, id: string): Phrase {
  if (state === "on") {
    return phrase`${markPart("done")} ${pluginMessages.state("on").phrase}`;
  }
  return phrase`${markPart("needsYou")} ${pluginMessages.stateWithFix(state, id).phrase}`;
}
