// The workspace a run reads (save model 2.2–2.3, HAL-3246): `halonic run`
// starts the live version, so a saved change isn't used until it is made
// live; with history off, it starts the saved files. `halonic runs send`
// reads the same version: the run's own steps come from the definitions it
// kept when it started, but trust, the sandbox and the models are checked
// on the version that runs now.

import { access } from "node:fs/promises";
import { join } from "node:path";
import {
  GitHardeningIgnoredError,
  GitRunner,
  type GitRunnerOptions,
  GitVcs,
} from "@halonicjs/adapter-git";
import {
  integrationsFolder,
  type LiveVersionReader,
  liveVersionOf,
  type RunSource,
  runSourceFor,
  runVersionOf,
} from "@halonicjs/app";
import { withSavedLocalOnly } from "@halonicjs/app/saved-local-only";
import type { RunVersion } from "@halonicjs/events";
import type { Vcs, VcsStatus } from "@halonicjs/ports";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { KindedError } from "@halonicjs/std";
import {
  type LoadedWorkspace,
  type LocalIntegrationInput,
  loadWorkspace,
  placeOf,
} from "@halonicjs/workspace";
import type { Message } from "./messages/define.ts";
import { plainText } from "./messages/phrase.ts";
import { runMessages } from "./messages/run.ts";
import { sandboxMessages } from "./messages/sandbox.ts";
import { versionSheetHosts } from "./sheet-hosts.ts";
import { type LoadedVersion, loadVersion, versionWithTexts } from "./version-files.ts";
import {
  integrationsAtCommit,
  savedIntegrations,
  type WorkspaceAtVersion,
} from "./workspace-at-version.ts";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";

/** What a run's workspace needs of version control: which version is live, and its files. */
export type WorkspaceHistory = LiveVersionReader & Pick<Vcs, "readAt" | "listAt">;

/** Opens a workspace's history, or `null` when it has none. */
export type OpenWorkspaceHistory = (root: string) => Promise<OpenedHistory | null>;

/** A workspace's history, open until {@link OpenedHistory.close}. */
export interface OpenedHistory {
  readonly vcs: WorkspaceHistory;
  close(): Promise<void>;
}

/**
 * The workspace a run reads:
 * - `loaded`: the live version, or the saved files with history off, its
 *   definitions and local integrations, with the version the run records
 *   on its `run.started` (`app.run-records-its-version`).
 *   `notCommitted` names each definition file and file under
 *   `integrations/` that differs from the live version, so trust doesn't
 *   cover it (HAL-16335); empty with history off. `changesNotLive` says a definition
 *   file differs from the live version and the run won't use it
 *   (HAL-6007): changed, added, removed or renamed since the last commit,
 *   staged or not. Other files, such as a connector's script, aren't
 *   counted: a live run's programs read them as saved. `fileTexts` are
 *   its agents' and skills' files as the load read them, which the
 *   "On this computer" choice is checked against. `localOnlySaved` says
 *   Local only is on only because the saved `workspace.yaml` says on, which
 *   isn't live yet (C755 #1), so the run's lines can say where it comes from;
 * - `nothing-live`: the workspace has history but no version yet, so there
 *   is nothing to run.
 */
export type RunWorkspace =
  | (WorkspaceAtVersion & {
      readonly found: "loaded";
      readonly version: RunVersion;
      readonly changesNotLive: boolean;
      readonly localOnlySaved: boolean;
      readonly notCommitted: readonly string[];
      readonly fileTexts: ReadonlyMap<string, string>;
    })
  | { readonly found: "nothing-live" };

/**
 * The workspace `halonic runs send` checks on, with its local integrations,
 * the version it is, and its agents' and skills' files.
 */
export interface SendWorkspace extends LoadedVersion, WorkspaceAtVersion {
  readonly version: RunVersion;
}

/**
 * A run refused because the workspace's history can't be opened, such as
 * when git isn't installed: `unavailable`, exit 9. The saved files are no
 * fallback, since they may hold changes that aren't live. The opener's own
 * error is the `cause`, so it shows with `--debug` and nowhere else.
 */
export class HistoryUnavailableError extends KindedError {
  constructor(nothingDone: Message, cause: unknown) {
    const { reason, fix } = historyRefusalOf(nothingDone, cause);
    super("unavailable", plainText(reason.phrase), { fix: plainText(fix.phrase), cause });
  }
}

/**
 * Why the history can't be opened, and its fix: a git that drops Halonic's
 * git settings is named, since installing git wouldn't help (HAL-12342);
 * any other cause reads as git that can't start.
 */
export function historyRefusalOf(
  nothingDone: Message,
  cause: unknown,
): { readonly reason: Message; readonly fix: Message } {
  if (cause instanceof GitHardeningIgnoredError) {
    return {
      reason: runMessages.gitNotItself(cause.git, nothingDone.phrase),
      fix: runMessages.gitNotItselfFix(),
    };
  }
  return {
    reason: runMessages.gitWontStart(nothingDone.phrase),
    fix: runMessages.gitWontStartFix(),
  };
}

/** How {@link loadRunWorkspace} reads the version. */
export interface RunWorkspaceOptions {
  /**
   * Whether Local only counts as on when only the saved `workspace.yaml`
   * says on (`app.saved-local-only`); on by default. A trust review turns
   * it off: it shows the version as committed, and a saved file with an
   * error mustn't stop it.
   */
  readonly savedLocalOnly?: boolean;
}

/**
 * Loads the workspace `halonic run` starts: the live version, or the saved
 * files with history off (requirement `cli.run-live-version`). The run
 * records the version it read: the live version's commit and date, or the
 * saved files. Local only counts as on when the saved `workspace.yaml`
 * says on, before it's made live (`app.saved-local-only`).
 * `nothingDone` ends line 1 of a refusal: "Nothing ran." by default.
 * `profile` holds the installed plugins, whose hosts `privacy.localOnly` counts.
 *
 * @throws HistoryUnavailableError when the workspace has history but it can't be opened
 * @throws KindedError `invalid_input` when the live version has Local only
 *   off and the saved `workspace.yaml` can't be read or has an error
 */
export async function loadRunWorkspace(
  dir: OpenWorkspaceDir,
  openHistory: OpenWorkspaceHistory = openGitHistory,
  nothingDone: Message = runMessages.nothingRan(),
  profile?: ProfileEnvironment,
  options: RunWorkspaceOptions = {},
): Promise<RunWorkspace> {
  const history = await openOrRefuse(dir.root, openHistory, nothingDone);
  try {
    const vcs = history?.vcs ?? null;
    const live = await liveVersionOf(vcs);
    // `liveVersionOf` gives `history-off` without a `vcs`, so `runSourceFor` never reads it then.
    const picked = runSourceFor("run", { live, vcs: vcs ?? noHistory, saved: dir.store });
    if (picked.reads === "nothing-live") {
      return { found: "nothing-live" };
    }
    // Loaded before the history closes: a loaded workspace holds its files' contents.
    // With the hosts of the sheets the run uses, so `privacy.localOnly` refuses
    // what `validate` does and what the run's connectors would leave out.
    const sheetHosts = await versionSheetHosts(picked.source, profile);
    const loaded = await loadWorkspace(picked.source, { sheetHosts });
    // Only the flag changes, so trust is still checked on the live version's files.
    const workspace =
      picked.reads === "live-version" && options.savedLocalOnly !== false
        ? await withSavedLocalOnly(loaded, dir.store)
        : loaded;
    const { fileTexts } = await versionWithTexts(workspace, picked.source);
    const integrations = await integrationsOf(picked, vcs, dir);
    const status = vcs !== null && picked.reads === "live-version" ? await vcs.status() : null;
    return {
      found: "loaded",
      workspace,
      integrations,
      version: runVersionOf(picked),
      changesNotLive: status !== null && definitionsChanged(status),
      // `withSavedLocalOnly` gives back the load itself unless the saved file turned Local only on.
      localOnlySaved: workspace !== loaded,
      notCommitted: status === null ? [] : trustFilesChanged(status),
      fileTexts,
    };
  } finally {
    await history?.close();
  }
}

/**
 * Loads the saved files, as `halonic validate` reads them, for a refusal of
 * the live version's errors: when they have none, the fix is saved but not
 * live (C666 #2). `profile` holds the installed plugins, as for the run.
 */
export function savedWorkspaceOf(
  dir: OpenWorkspaceDir,
  profile?: ProfileEnvironment,
): () => Promise<LoadedWorkspace> {
  return async () =>
    await loadWorkspace(dir.store, { sheetHosts: await versionSheetHosts(dir.store, profile) });
}

/**
 * The local integrations of the version `picked` reads: at its commit,
 * through the history, or as saved with history off.
 */
async function integrationsOf(
  picked: Exclude<RunSource, { reads: "nothing-live" }>,
  vcs: WorkspaceHistory | null,
  dir: OpenWorkspaceDir,
): Promise<LocalIntegrationInput[]> {
  if (picked.reads === "saved-files" || vcs === null) return await savedIntegrations(dir);
  return await integrationsAtCommit(vcs, picked.commit, dir.store.location);
}

/**
 * The workspace `halonic runs send` checks the run's trust and sandbox on:
 * the version `halonic run` would start now. A waiting run can be answered
 * while nothing is live yet, so then it is the saved files, as for a run
 * started before the workspace had history.
 *
 * @throws HistoryUnavailableError ending "Nothing was sent." when the workspace has history but it can't be opened
 */
export async function loadSendWorkspace(
  dir: OpenWorkspaceDir,
  openHistory: OpenWorkspaceHistory = openGitHistory,
): Promise<SendWorkspace> {
  const run = await loadRunWorkspace(dir, openHistory, sandboxMessages.nothingSent());
  if (run.found === "loaded") {
    const { workspace, integrations, version, fileTexts } = run;
    return { workspace, integrations, version, fileTexts };
  }
  const saved = await loadVersion(dir.store);
  return {
    ...saved,
    integrations: await savedIntegrations(dir),
    version: { reads: "saved-files" },
  };
}

/** Whether a definition file has changes that aren't committed, so aren't in the live version. */
function definitionsChanged({ changes }: VcsStatus): boolean {
  return changes.some(
    ({ path, from }) =>
      placeOf(path) !== undefined || (from !== undefined && placeOf(from) !== undefined),
  );
}

/**
 * Each file a trust check covers that has changes that aren't committed: a
 * definition file or a file under `integrations/`, by its path now, and by
 * its path before for a rename. Sorted, each once.
 */
function trustFilesChanged({ changes }: VcsStatus): string[] {
  const covered = (path: string) =>
    placeOf(path) !== undefined || path.startsWith(`${integrationsFolder}/`);
  const paths = changes.flatMap(({ path, from }) => (from === undefined ? [path] : [from, path]));
  return [...new Set(paths.filter(covered))].sort();
}

/** Opens the history with `openHistory`, or refuses the run when it can't. */
async function openOrRefuse(
  root: string,
  openHistory: OpenWorkspaceHistory,
  nothingDone: Message,
): Promise<OpenedHistory | null> {
  try {
    return await openHistory(root);
  } catch (error) {
    throw new HistoryUnavailableError(nothingDone, error);
  }
}

/**
 * The workspace's git history, through the hardened git program, or `null`
 * when the folder isn't a repository, so a workspace with history off never
 * needs git. `options` say which git, the one on the `PATH` by default.
 *
 * @throws Error when the folder is a repository but git isn't found or drops the hardening
 */
export async function openGitHistory(
  root: string,
  options: GitRunnerOptions = {},
): Promise<OpenedHistory | null> {
  if (!(await exists(join(root, ".git")))) {
    return null;
  }
  const runner = await GitRunner.create(options);
  // A run only reads the history, so it never commits as this author.
  const vcs = new GitVcs(root, { runner, author: readOnlyAuthor });
  return { vcs, close: () => runner.close() };
}

/** The author a {@link GitVcs} needs; the CLI never commits. */
const readOnlyAuthor = { name: "Halonic", email: "halonic@localhost" };

/** Stands in for the history when there is none; `runSourceFor` doesn't read it then. */
const noHistory: Pick<Vcs, "readAt" | "listAt"> = {
  readAt: () => Promise.reject(new Error("This workspace has no history.")),
  listAt: () => Promise.reject(new Error("This workspace has no history.")),
};

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}
