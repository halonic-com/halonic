import type { DefinitionSource, DefinitionStore } from "@halonicjs/ports";
import { err, ok, type Result } from "@halonicjs/std";
import { gitIgnoreLines, gitIgnorePath, removeQuietly } from "./init-workspace.ts";
import { settingsPath } from "./places.ts";

/** A copy `copyWorkspace` laid out. */
export interface CopiedWorkspace {
  /** The target store's location, such as "./acme". */
  readonly location: string;
  /** The workspace-relative paths written, with `/` separators, in the order they were written. */
  readonly files: readonly string[];
}

/** Why `copyWorkspace` wrote nothing: the target already has files, and is left as it is. */
export interface CopyWorkspaceError {
  readonly kind: "not_empty";
  readonly location: string;
}

/**
 * Lays out a copy of the workspace in `source` in an empty `target`, such as
 * the Acme example that `halonic init --example acme` copies.
 *
 * Like {@link initWorkspace}, it never writes into a store that lists a file,
 * and a copy gets the `.gitignore` a new workspace gets when the source has
 * none, so the keys people add later stay out of git.
 *
 * `workspace.yaml` is written last, so a copy cut short is never a
 * workspace. If any write fails, the files written so far are removed again,
 * so the target is empty once more and the call can be repeated.
 *
 * @param source - the workspace to copy, read as it lists its files
 * @param target - an empty store, or one for a folder that doesn't exist yet
 * @returns the files written, or why nothing was
 *
 * @example
 * const result = await copyWorkspace(exampleFolder, new FolderDefinitionStore("acme"));
 * if (result.ok) console.log(result.value.files.length);
 */
export async function copyWorkspace(
  source: DefinitionSource,
  target: DefinitionStore,
): Promise<Result<CopiedWorkspace, CopyWorkspaceError>> {
  if ((await target.list()).length > 0) {
    return err({ kind: "not_empty", location: target.location });
  }

  const files = await filesToCopy(source);
  const written: string[] = [];
  try {
    for (const { path, content } of files) {
      await target.write(path, content);
      written.push(path);
    }
  } catch (error) {
    for (const path of written) {
      await removeQuietly(target, path);
    }
    throw error;
  }
  return ok({ location: target.location, files: written });
}

/** One file of the copy. */
interface FileToCopy {
  readonly path: string;
  readonly content: string;
}

/**
 * The source's files in the order they are written: a `.gitignore` first,
 * the source's own or a new workspace's, and `workspace.yaml` last. A file
 * the source lists but can no longer read, as when it was removed in
 * between, is left out.
 */
async function filesToCopy(source: DefinitionSource): Promise<FileToCopy[]> {
  const files: FileToCopy[] = [];
  for (const path of await source.list()) {
    const content = await source.read(path);
    if (content !== null) {
      files.push({ path, content });
    }
  }
  const gitIgnore = files.find((file) => file.path === gitIgnorePath) ?? {
    path: gitIgnorePath,
    content: `${gitIgnoreLines.join("\n")}\n`,
  };
  const settings = files.filter((file) => file.path === settingsPath);
  const others = files.filter((file) => file.path !== gitIgnorePath && file.path !== settingsPath);
  return [gitIgnore, ...others, ...settings];
}
