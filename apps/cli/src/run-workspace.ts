// The workspace a run reads (save model 2.2–2.3, HAL-3246): `halonic run`
// starts the live version, so a saved change isn't used until it is made
// live; with history off, it starts the saved files. `halonic runs send`
// reads the same version: the run's own steps come from the definitions it
// kept when it started, but trust, the sandbox and the models are checked
// on the version that runs now.

import { access } from "node:fs/promises";
import { join } from "node:path";
import { GitRunner, type GitRunnerOptions, GitVcs } from "@halonicjs/adapter-git";
import { type LiveVersionReader, liveVersionOf, runSourceFor } from "@halonicjs/app";
import type { Vcs } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import type { Message } from "./messages/define.ts";
import { plainText } from "./messages/phrase.ts";
import { runMessages } from "./messages/run.ts";
import { sandboxMessages } from "./messages/sandbox.ts";
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
 * - `loaded`: the live version, or the saved files with history off;
 * - `nothing-live`: the workspace has history but no version yet, so there
 *   is nothing to run.
 */
export type RunWorkspace =
  | { readonly found: "loaded"; readonly workspace: LoadedWorkspace }
  | { readonly found: "nothing-live" };

/**
 * A run refused because the workspace's history can't be opened, such as
 * when git isn't installed: `unavailable`, exit 9. The saved files are no
 * fallback, since they may hold changes that aren't live. The opener's own
 * error is the `cause`, so it shows with `--debug` and nowhere else.
 */
export class HistoryUnavailableError extends KindedError {
  constructor(nothingDone: Message, cause: unknown) {
    super("unavailable", plainText(runMessages.gitWontStart(nothingDone.phrase).phrase), {
      fix: plainText(runMessages.gitWontStartFix().phrase),
      cause,
    });
  }
}

/**
 * Loads the workspace `halonic run` starts: the live version, or the saved
 * files with history off (requirement `cli.run-live-version`). The run
 * records the loaded workspace's version, the commit for the live version.
 * `nothingDone` ends line 1 of a refusal: "Nothing ran." by default.
 *
 * @throws HistoryUnavailableError when the workspace has history but it can't be opened
 */
export async function loadRunWorkspace(
  dir: OpenWorkspaceDir,
  openHistory: OpenWorkspaceHistory = openGitHistory,
  nothingDone: Message = runMessages.nothingRan(),
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
    return { found: "loaded", workspace: await loadWorkspace(picked.source) };
  } finally {
    await history?.close();
  }
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
): Promise<LoadedWorkspace> {
  const run = await loadRunWorkspace(dir, openHistory, sandboxMessages.nothingSent());
  return run.found === "loaded" ? run.workspace : await loadWorkspace(dir.store);
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
