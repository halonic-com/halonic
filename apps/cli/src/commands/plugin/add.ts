// `halonic plugin add <folder or git address>[@commit]`: copies a plugin
// into the profile's plugins folder, shows the trust check and asks whether
// to trust it (cli-output 3.6). A thin command over `PluginService.add` and
// `trust`: the service reads, checks and places the plugin, this file shows
// and asks. A git address is first exported to a temporary folder outside
// every workspace (`git-source.ts`).

import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import { GitHardeningIgnoredError } from "@halonicjs/adapter-git";
import type {
  PluginAddRefusal,
  PluginEntry,
  PluginInstall,
  PluginProblem,
  PluginService,
} from "@halonicjs/app";
import { formatPath } from "@halonicjs/schema-kit";
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
import { runMessages } from "../../messages/run.ts";
import { trustMessages } from "../../messages/trust.ts";
import { printable } from "../../output/printable.ts";
import { openPluginService, type PluginSetup, programsRunFor } from "../../plugin-host.ts";
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
  const service = openPluginService(setup, context.cwd);
  let added: Awaited<ReturnType<PluginService["add"]>>;
  let nested: NestedManifest | undefined;
  try {
    added = await service.add(new FileSystemFolderReader(opened.folder), {
      from: opened.from,
      replace: false,
    });
    if (!added.ok && opened.from.kind === "folder" && hasNoManifest(added.error)) {
      nested = await nestedManifest(opened.folder);
    }
  } finally {
    await opened.close();
  }
  if (!added.ok) throw refused(added.error, nested);
  const entry = added.value;
  // Only a replace keeps a copy that can't be read back; `add` never replaces.
  if (entry.status === "broken") throw problemRefusal(entry.problems);
  const leftOut = leftOutLine(entry.leftOut, context);
  const programsRun = await programsRunFor(setup, [entry.content]);
  const result = await trustAdded(service, entry, { context, yes, fingerprint, programsRun });
  return { ...result, lines: [...opened.printedAhead, ...leftOut, ...result.lines] };
}

/**
 * "! Not copied, because they're private: .aws, .ssh", printed ahead of the
 * check, when the copy left out paths the sandbox denies; nothing otherwise.
 */
function leftOutLine(paths: readonly string[], context: CommandContext): Phrase[] {
  if (paths.length === 0) return [];
  const listed = paths.map((path) => printable(path)).join(", ");
  const line = phrase`${markPart("needsYou")} ${pluginMessages.leftOut(listed).phrase}`;
  context.printAhead(line);
  return [line];
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
  const found = await stat(folder).catch(() => null);
  if (found === null) {
    throw refusal(pluginMessages.noFolder(printable(source)).phrase);
  }
  if (!found.isDirectory()) {
    throw refusal(pluginMessages.notAFolder(printable(source)).phrase);
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

/**
 * A refused or failed export as the refusal `plugin add` ends with. A git
 * that drops Halonic's git settings isn't the address's fault, so it gets
 * run's fix instead of "Check the folder or git address.".
 */
function exportRefusal(error: unknown): KindedError {
  if (error instanceof GitHardeningIgnoredError) {
    return new KindedError(
      "unavailable",
      plainOf(pluginMessages.gitNotItself(printable(error.git))),
      {
        fix: plainOf(runMessages.gitNotItselfFix()),
        cause: error,
      },
    );
  }
  const reason = error instanceof Error ? error.message : String(error);
  return refusal(phrase`${printable(reason)}`);
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

/** The refusal for a plugin that wasn't added: Halonic's own data, already added, or its first problem. */
function refused(error: PluginAddRefusal, nested: NestedManifest | undefined): KindedError {
  if (error.kind === "halonic-data") return refusal(pluginMessages.halonicData().phrase);
  if (error.kind === "taken") {
    return new KindedError("conflict", plainOf(pluginMessages.alreadyAdded(error.id)), {
      fix: plainOf(pluginMessages.alreadyAddedFix(error.id)),
    });
  }
  if (nested !== undefined) {
    const fix = pluginMessages.nestedManifest(nested.manifest, printable(nested.folder));
    return refusal(firstProblem(error.problems), fix);
  }
  return problemRefusal(error.problems);
}

/**
 * The first problem, never more detail than its own words. One in the
 * manifest says where, as `validate` does, and that the file is the fix;
 * one about the folder, that the folder or git address is.
 */
function problemRefusal(problems: readonly PluginProblem[]): KindedError {
  const inManifest = problems.filter(isManifestProblem).sort(byLine);
  const [first] = inManifest;
  if (first === undefined) {
    return refusal(firstProblem(problems));
  }
  const where = first.line === undefined ? undefined : `${first.line}:${first.col ?? 1}`;
  const field = printable(formatPath(first.path));
  const problem = pluginMessages.manifestProblem(
    first.file,
    where,
    field,
    printable(first.message),
  );
  // The SDK's own words already say what to do, and the manifest isn't it.
  const fix = first.code === "sdk-version" ? null : pluginMessages.manifestFix(first.file);
  return refusal(problem.phrase, fix);
}

/**
 * The first problem's own words, which are the reason, after the field they
 * are about, such as `ui.settings.units.choices[1]: …`, when they are about
 * one. A sentence that names its field, such as a typo's, has an empty path.
 */
function firstProblem(problems: readonly PluginProblem[]): Phrase {
  const problem = problems[0];
  if (problem === undefined) return phrase``;
  // A key in the path is the manifest's own text, so it is outside text too.
  const reason =
    problem.path.length === 0 ? problem.message : `${formatPath(problem.path)}: ${problem.message}`;
  return phrase`${printable(reason)}`;
}

/** "Couldn't add the plugin: <reason>", then the fix: "Check the folder or git address." unless another is given, none for `null`. */
function refusal(
  reason: Phrase,
  fix: Message | null = pluginMessages.refusedSourceFix(),
): KindedError {
  return new KindedError("invalid_input", plainText(reason), {
    ...(fix === null ? {} : { fix: plainOf(fix) }),
  });
}

/** The two manifest names a plugin folder may have, as `readPluginFolder` reads them. */
const manifestNames = ["plugin.yaml", "integration.yaml"] as const;

/** A problem inside the manifest, at a value or a line, not one about the folder or another file. */
function isManifestProblem(problem: PluginProblem): boolean {
  const named = (manifestNames as readonly string[]).includes(problem.file);
  return named && (problem.line !== undefined || problem.path.length > 0);
}

/** Problems with a line first, in line order; the others after them, as found. */
function byLine(a: PluginProblem, b: PluginProblem): number {
  return (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER);
}

/** A manifest one folder down: the folder's name and which manifest it has. */
interface NestedManifest {
  readonly folder: string;
  readonly manifest: (typeof manifestNames)[number];
}

function hasNoManifest(error: PluginAddRefusal): boolean {
  return error.kind === "broken" && error.problems[0]?.code === "manifest-missing";
}

/** The first folder in `folder`, by name, that has a manifest; only this one level down. */
async function nestedManifest(folder: string): Promise<NestedManifest | undefined> {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  for (const name of folders.sort()) {
    for (const manifest of manifestNames) {
      const found = await stat(join(folder, name, manifest)).catch(() => null);
      if (found?.isFile() === true) return { folder: name, manifest };
    }
  }
  return undefined;
}

function plainOf(message: Message): string {
  return plainText(message.phrase);
}
