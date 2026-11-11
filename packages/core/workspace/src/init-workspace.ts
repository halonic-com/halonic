import { type FileProblem, parseFile } from "@halonicjs/format";
import type { DefinitionStore } from "@halonicjs/ports";
import { err, ok, type Result, slugify } from "@halonicjs/std";
import { writeYamlFile } from "@halonicjs/yaml";
import { settingsPath } from "./places.ts";

/** What a new workspace is called. */
export interface InitWorkspaceOptions {
  /** The name people read, such as "Acme Billing". */
  readonly name: string;
  /** The workspace id; made from the name when absent ("Acme Billing" gives `acme-billing`). */
  readonly id?: string;
}

/** A workspace `initWorkspace` laid out. */
export interface InitializedWorkspace {
  /** The store's location, such as "memory:demo". */
  readonly location: string;
  readonly id: string;
  readonly name: string;
  /** The workspace-relative paths written, with `/` separators, in the order they were written. */
  readonly files: readonly string[];
}

/** Why `initWorkspace` wrote nothing. */
export type InitWorkspaceError =
  /** The store already has files, such as a workspace or a project of another kind; it is left as it is. */
  | { readonly kind: "not_empty"; readonly location: string }
  /** The settings the name or id give don't pass the workspace kind's checks, such as an id in capitals. */
  | { readonly kind: "invalid_settings"; readonly problems: readonly FileProblem[] };

/** The file that keeps git from taking in files people keep secrets in. */
export const gitIgnorePath = ".gitignore";

/**
 * The lines a new workspace's `.gitignore` holds: secrets files, which the
 * `DefinitionStore` port already never serves, stay out of git as well.
 */
export const gitIgnoreLines: readonly string[] = [".env", ".env.*"];

/**
 * Lays out a new workspace in an empty {@link DefinitionStore}: a
 * `workspace.yaml` with its id and name, and a `.gitignore` that keeps
 * `.env` files out of git. A new workspace is local only
 * (`privacy.localOnly: true`): until the person turns that off, the engine
 * uses only local models and connectors and refuses harness agents (ADR
 * `docs/adr/2026-11-08-local-first.md`, requirement `engine.local-only`).
 *
 * The settings are checked with the workspace kind's own schema before
 * anything is written. A store that has any file is left alone, so nothing a
 * person made is ever overwritten or mixed into (cli-output 3.1: "the folder
 * isn't empty"). Empty means what the store lists: entries the port keeps
 * private, such as `.git` and `.env`, don't count, so a folder fresh from
 * `git init` can become a workspace.
 *
 * The `.gitignore` is written first and `workspace.yaml` last. If writing
 * `workspace.yaml` fails, the `.gitignore` is removed again, so the store is
 * empty once more and the call can be repeated.
 *
 * The check that the store is empty and the writes that follow are not one
 * step: if something else writes the store at the same time, such as a
 * Studio editor on a live store, its files can be replaced. The CLI runs it
 * alone on a new folder; a caller with other writers must keep them out while
 * it runs.
 *
 * @param store - where the workspace files go: an empty folder, or one that doesn't exist yet
 * @param options - the workspace's name, and its id if it isn't to come from the name
 * @returns the files written, or why nothing was
 *
 * @example
 * const result = await initWorkspace(store, { name: "Acme Billing" });
 * if (result.ok) console.log(result.value.id); // "acme-billing"
 */
export async function initWorkspace(
  store: DefinitionStore,
  options: InitWorkspaceOptions,
): Promise<Result<InitializedWorkspace, InitWorkspaceError>> {
  const id = options.id ?? slugify(options.name);
  const settings = writeYamlFile({ id, name: options.name, privacy: { localOnly: true } });
  const parsed = parseFile("workspace", settings);
  if (!parsed.ok) {
    return err({ kind: "invalid_settings", problems: parsed.error });
  }
  if ((await store.list()).length > 0) {
    return err({ kind: "not_empty", location: store.location });
  }

  await store.write(gitIgnorePath, `${gitIgnoreLines.join("\n")}\n`);
  try {
    await store.write(settingsPath, settings);
  } catch (error) {
    await removeQuietly(store, gitIgnorePath);
    throw error;
  }
  return ok({
    location: store.location,
    id,
    name: options.name,
    files: [gitIgnorePath, settingsPath],
  });
}

/**
 * Removes a file after a failed write. If removing fails as well, the first
 * error is the one worth reporting, so this one is dropped.
 */
export async function removeQuietly(store: DefinitionStore, path: string): Promise<void> {
  try {
    await store.remove(path);
  } catch {
    // The caller rethrows the write's own error.
  }
}
