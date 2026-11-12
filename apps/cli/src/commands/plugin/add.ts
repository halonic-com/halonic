// `halonic plugin add <folder or git address>[@commit]`: copies a plugin
// into the profile's plugins folder, shows the trust check and asks whether
// to trust it (cli-output 3.6). A thin command over `PluginService.add` and
// `trust`: the service reads, checks and places the plugin, this file shows
// and asks. A git address is first exported to a temporary folder outside
// every workspace (`git-source.ts`).

import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import type {
  PluginAddRefusal,
  PluginEntry,
  PluginInstall,
  PluginProblem,
  PluginService,
} from "@halonicjs/app";
import { KindedError } from "@halonicjs/std";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import type { Message } from "../../messages/define.ts";
import { markPart, type Phrase, phrase, plainText } from "../../messages/phrase.ts";
import { pluginMessages } from "../../messages/plugin.ts";
import { trustMessages } from "../../messages/trust.ts";
import { printable } from "../../output/printable.ts";
import { openPluginService, type PluginSetup } from "../../plugin-host.ts";
import { askToTrustPlugin, type PluginTrustAnswer } from "../../plugin-trust-question.ts";
import {
  checkGitSource,
  exportToTemporaryFolder,
  exportWithGit,
  type GitSource,
  gitSourceOf,
} from "./git-source.ts";

/** An added plugin that was read and checked. */
type AddedPlugin = Exclude<PluginEntry, { status: "broken" }>;

/**
 * Adds the plugin in a folder and asks whether to trust it. The plugin is
 * added in every case; answering No, or having no terminal, leaves it off
 * and ends with exit code 3, as Studio's Not now does (D4).
 *
 * @throws UsageError for `--yes` without `--fingerprint`, before anything is copied
 * @throws KindedError when the folder can't be read or checked, or the plugin is already added
 * @throws NotTrustedError when the plugin was added but is off, because nobody
 *   could answer or the `--fingerprint` isn't the one of what was added
 */
export async function addPlugin(
  input: CommandInput,
  context: CommandContext,
  setup: PluginSetup,
): Promise<CommandResult> {
  const source = input.positionals[0];
  if (source === undefined) {
    throw new UsageError(pluginMessages.addNeedsSource(), pluginMessages.addUsage());
  }
  const given = input.options["fingerprint"];
  const fingerprint = typeof given === "string" ? given : undefined;
  const yes = input.options["yes"] === true;
  if (yes && fingerprint === undefined) {
    throw new UsageError(
      trustMessages.yesNeedsFingerprint(),
      pluginMessages.yesNeedsFingerprintFix(),
    );
  }

  const opened = await openSource(source, context, setup);
  const service = openPluginService(setup);
  let added: Awaited<ReturnType<PluginService["add"]>>;
  try {
    added = await service.add(new FileSystemFolderReader(opened.folder), {
      from: opened.from,
      replace: false,
    });
  } finally {
    await opened.close();
  }
  if (!added.ok) throw refused(added.error);
  const entry = added.value;
  // Only a replace keeps a copy that can't be read back; `add` never replaces.
  if (entry.status === "broken") {
    throw refusal("invalid_input", firstProblem(entry.problems));
  }
  const result = await trustAdded(service, entry, { context, yes, fingerprint });
  return { ...result, lines: [...opened.printedAhead, ...result.lines] };
}

/** A source's files in a folder on this computer, and where they came from. */
interface OpenedSource {
  readonly folder: string;
  readonly from: PluginInstall["source"];
  /** The lines opening it printed ahead, which lead the result's lines. */
  readonly printedAhead: readonly Phrase[];
  /** Deletes what opening it made; nothing for a folder. */
  close(): Promise<void>;
}

/**
 * The folder to add from: the source itself, or for a git address one
 * commit of it, exported to a temporary folder.
 *
 * @throws KindedError when the folder isn't one, or the git address or commit is refused or can't be fetched
 */
async function openSource(
  source: string,
  context: CommandContext,
  setup: PluginSetup,
): Promise<OpenedSource> {
  const git = gitSourceOf(source);
  if (git !== null) return await exportGitSource(git, context, setup);
  const folder = resolve(context.cwd, source);
  if (!(await isFolder(folder))) {
    throw refusal("invalid_input", pluginMessages.notAFolder(printable(source)).phrase);
  }
  return {
    folder,
    from: { kind: "folder", path: folder },
    printedAhead: [],
    close: async () => {},
  };
}

/** How many characters of a commit the lines show, as git does. */
const shownCommitLength = 7;

async function exportGitSource(
  git: GitSource,
  context: CommandContext,
  setup: PluginSetup,
): Promise<OpenedSource> {
  // Checked before the live line shows any part of the address: a refused
  // one may be cut in the wrong place and show a password as the name.
  try {
    checkGitSource(git);
  } catch (error) {
    throw exportRefusal(error);
  }
  const progress = context.progress(
    pluginMessages.copying(printable(repositoryName(git.address)), git.commit).phrase,
  );
  let exported: Awaited<ReturnType<typeof exportToTemporaryFolder>>;
  try {
    exported = await exportToTemporaryFolder(git, setup.exportGit ?? exportWithGit);
  } catch (error) {
    throw exportRefusal(error);
  } finally {
    progress.end();
  }
  const { commit, branch } = exported;
  const printedAhead: Phrase[] = [];
  if (git.commit === undefined && branch !== undefined) {
    const short = commit.slice(0, shownCommitLength);
    const latest = pluginMessages.latestCommit(short, printable(branch), commit);
    printedAhead.push(phrase`${markPart("needsYou")} ${latest.phrase}`);
  }
  for (const line of printedAhead) context.printAhead(line);
  return {
    folder: exported.folder,
    from: { kind: "git", address: git.address, commit },
    printedAhead,
    close: () => exported.remove(),
  };
}

/** A refused or failed export as the refusal `plugin add` ends with. */
function exportRefusal(error: unknown): KindedError {
  const reason = error instanceof Error ? error.message : String(error);
  return refusal("invalid_input", phrase`${printable(reason)}`);
}

/** The last part of a git address without `.git`, such as `weather`, for the live line. */
function repositoryName(address: string): string {
  const last = address.split(/[/:]/u).findLast((part) => part !== "") ?? address;
  return last.replace(/\.git$/u, "");
}

/** Says it's on, or asks whether to trust it, with `plugin add`'s words around the question. */
async function trustAdded(
  service: PluginService,
  entry: AddedPlugin,
  answer: PluginTrustAnswer,
): Promise<CommandResult> {
  const { plugin } = entry;
  // The manifest's name and version are outside text (cli-output 5).
  const name = printable(plugin.name);
  const added = pluginMessages.added(name, printable(plugin.version));
  if (entry.status === "trusted") {
    const json = { id: entry.folder, name: plugin.name, version: plugin.version };
    return {
      exitCode: exitCode.ok,
      lines: [phrase`${markPart("done")} ${added.phrase}`],
      json: { ...json, fingerprint: entry.fingerprint, status: "on" },
    };
  }
  return await askToTrustPlugin(service, entry, answer, {
    on: added,
    off: pluginMessages.addedButOff(name, entry.folder),
    noTerminal: pluginMessages.addNoTerminal(name),
  });
}

/** The refusal for a plugin that wasn't added, with its reason and "Check the folder or git address.". */
function refused(error: PluginAddRefusal): KindedError {
  if (error.kind === "taken") {
    return new KindedError("conflict", plainOf(pluginMessages.alreadyAdded(error.id)), {
      fix: plainOf(pluginMessages.alreadyAddedFix(error.id)),
    });
  }
  return refusal("invalid_input", firstProblem(error.problems));
}

/** The first problem's own words, which are the reason; never more detail than that. */
function firstProblem(problems: readonly PluginProblem[]): Phrase {
  return phrase`${printable(problems[0]?.message ?? "")}`;
}

/** "Couldn't add the plugin: <reason> · Check the folder or git address." */
function refusal(kind: "invalid_input", reason: Phrase): KindedError {
  return new KindedError(kind, plainText(reason), {
    fix: plainOf(pluginMessages.refusedSourceFix()),
  });
}

function plainOf(message: Message): string {
  return plainText(message.phrase);
}

/** Whether `path` is a folder, or a link to one. */
async function isFolder(path: string): Promise<boolean> {
  const found = await stat(path).catch(() => null);
  return found?.isDirectory() === true;
}
