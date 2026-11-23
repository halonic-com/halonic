// The files of a model choice made in a served window (HAL-14808, D3). Served runs start from
// the live version, so Continue writes the choice's files and commits them: only those files, in
// one commit with a fixed message. It never sweeps someone's own edits into that commit: a file
// Continue would write that already has changes that aren't committed stops the save, and the
// files are left as they were. Other files, staged or not, are never touched.

import { access } from "node:fs/promises";
import { join } from "node:path";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { ChoiceFilesNotCommitted } from "@halonicjs/app";
import type { DefinitionStore, Vcs } from "@halonicjs/ports";
import { plainText } from "../../messages/phrase.ts";
import { serveMessages } from "../../messages/serve.ts";

/** What saving the choice files needs of the workspace's history. */
export type ChoiceHistory = Pick<Vcs, "status" | "commitVersion">;

/** Opens the workspace's history for one save, or `null` when the workspace has none. */
export type OpenChoiceHistory = (
  root: string,
) => Promise<{ readonly vcs: ChoiceHistory; close(): Promise<void> } | null>;

/** The message of every commit Continue makes, so the history shows where it came from. */
export const choiceCommitMessage = plainText(serveMessages.choiceCommit().phrase);

/** The author of that commit: git here never reads the person's own config (`GitRunner`). */
const choiceAuthor = { name: "Halonic", email: "halonic@localhost" };

/**
 * Continue would commit files that have changes of their own; nothing was written. `files` are the
 * workspace paths, sorted. As a `ChoiceFilesNotCommitted`, Continue answers `not-committed` with them.
 */
export class UncommittedChoiceFilesError extends ChoiceFilesNotCommitted {
  constructor(files: readonly string[]) {
    super(files, plainText(serveMessages.choiceFilesNotCommitted(files).phrase));
    this.name = "UncommittedChoiceFilesError";
  }
}

/** The history of `root` through the hardened git program, or `null` when it isn't a repository. */
export const openChoiceHistory: OpenChoiceHistory = async (root) => {
  const isRepository = await access(join(root, ".git")).then(
    () => true,
    () => false,
  );
  if (!isRepository) return null;
  const runner = await GitRunner.create();
  return { vcs: new GitVcs(root, { runner, author: choiceAuthor }), close: () => runner.close() };
};

/** Where the choice files are saved: the workspace's files and its history. */
export interface ChoiceFilesInput {
  readonly store: DefinitionStore;
  readonly root: string;
  readonly openHistory: OpenChoiceHistory;
}

/**
 * Saves `changes`, by workspace path, and commits them when the workspace has history. One save
 * at a time: the caller keeps the saves of every session in one queue.
 *
 * @throws UncommittedChoiceFilesError when one of the files has changes that aren't committed
 * @throws when writing or committing fails; the files are then put back as they were
 */
export async function saveChoiceFiles(
  input: ChoiceFilesInput,
  changes: Readonly<Record<string, string>>,
): Promise<void> {
  const paths = Object.keys(changes).sort();
  if (paths.length === 0) return;
  const history = await input.openHistory(input.root);
  try {
    if (history !== null) {
      const notCommitted = await changedOf(history.vcs, paths);
      if (notCommitted.length > 0) throw new UncommittedChoiceFilesError(notCommitted);
    }
    const before = await Promise.all(paths.map((path) => input.store.read(path)));
    try {
      for (const path of paths) await input.store.write(path, changes[path] ?? "");
      await history?.vcs.commitVersion({
        message: choiceCommitMessage,
        include: paths,
        exclude: [],
      });
    } catch (error) {
      await putBack(input.store, paths, before, error);
      throw error;
    }
  } finally {
    await history?.close();
  }
}

/** Each of `paths` with a change that isn't committed, staged or not, by its path now or before. */
async function changedOf(vcs: ChoiceHistory, paths: readonly string[]): Promise<string[]> {
  const { changes } = await vcs.status();
  return paths.filter((path) =>
    changes.some((change) => change.path === path || change.from === path),
  );
}

/**
 * Puts each file back as it was before the save. When that fails too, both errors go up, so a
 * file left half saved is never kept quiet.
 */
async function putBack(
  store: DefinitionStore,
  paths: readonly string[],
  before: readonly (string | null)[],
  cause: unknown,
): Promise<void> {
  try {
    for (const [index, path] of paths.entries()) {
      const text = before[index] ?? null;
      if (text === null) await store.remove(path);
      else await store.write(path, text);
    }
  } catch (failed) {
    throw new AggregateError([cause, failed], plainText(serveMessages.choiceUndoFailed().phrase));
  }
}
