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
 * This is {@link createWorkspace} with `ifNotEmpty: "refuse"`, which is what
 * `halonic init` wants; the Studio's New workspace dialog uses the other mode.
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
  const created = await createWorkspace(store, { ...options, ifNotEmpty: "refuse" });
  if (!created.ok) {
    // "refuse" never answers `already_workspace`: a workspace.yaml makes the store not empty.
    return err(created.error as InitWorkspaceError);
  }
  const { location, id, name, written } = created.value;
  return ok({ location, id, name, files: written });
}

/** What {@link createWorkspace} needs: what {@link initWorkspace} needs, and what to do with a folder that has files. */
export interface CreateWorkspaceOptions extends InitWorkspaceOptions {
  /**
   * What to do when the store already lists files. `"add-missing"` (the
   * default) writes only the files that aren't there and changes nothing
   * that is; `"refuse"` writes nothing and says `not_empty`.
   */
  readonly ifNotEmpty?: "add-missing" | "refuse";
}

/** A workspace `createWorkspace` laid out. */
export interface CreatedWorkspace {
  /** The store's location, such as "memory:demo". */
  readonly location: string;
  readonly id: string;
  readonly name: string;
  /** The workspace-relative paths written, with `/` separators, in the order they were written. */
  readonly written: readonly string[];
  /** The paths the template has that were already there and were left as they are. */
  readonly skipped: readonly string[];
}

/** Why `createWorkspace` wrote nothing. */
export type CreateWorkspaceError =
  | InitWorkspaceError
  /** The store already holds a `workspace.yaml`: open it instead of creating one. */
  | { readonly kind: "already_workspace"; readonly location: string };

/**
 * Lays out a new workspace through a {@link DefinitionStore}: the one
 * template behind `halonic init` and the Studio's New workspace dialog (flow
 * 2.3). It writes a `.gitignore` that keeps `.env` files out of git and a
 * `workspace.yaml` with the id, the name and `privacy.localOnly: true`.
 *
 * With `ifNotEmpty: "add-missing"` (the default) a folder that already holds
 * files is fine: a template file that is there is left untouched and listed
 * in `skipped`; the caller decides what that means (no trust record when
 * anything was skipped, HAL-65 decision 1). A folder that already holds a
 * `workspace.yaml` is never touched: that is `already_workspace`, so the
 * Studio can offer to open it. The settings are checked before anything is
 * written, and a failed write of `workspace.yaml` removes the files this
 * call wrote, so the call can be repeated.
 *
 * The same caveat as {@link initWorkspace} holds: the listing and the writes
 * are not one step.
 *
 * @param store - where the workspace files go
 * @param options - the name, the id if it isn't to come from the name, and what to do with a folder that has files
 * @returns what was written and what was skipped, or why nothing was written
 *
 * @example
 * const result = await createWorkspace(store, { name: "Acme" });
 * if (result.ok && result.value.skipped.length > 0) console.log("opens untrusted");
 */
export async function createWorkspace(
  store: DefinitionStore,
  options: CreateWorkspaceOptions,
): Promise<Result<CreatedWorkspace, CreateWorkspaceError>> {
  const id = options.id ?? slugify(options.name);
  const settings = writeYamlFile({ id, name: options.name, privacy: { localOnly: true } });
  const parsed = parseFile("workspace", settings);
  if (!parsed.ok) {
    return err({ kind: "invalid_settings", problems: parsed.error });
  }
  const existing = new Set(await store.list());
  if (options.ifNotEmpty === "refuse" && existing.size > 0) {
    return err({ kind: "not_empty", location: store.location });
  }
  if (existing.has(settingsPath)) {
    return err({ kind: "already_workspace", location: store.location });
  }

  const template: ReadonlyArray<readonly [string, string]> = [
    [gitIgnorePath, `${gitIgnoreLines.join("\n")}\n`],
    [settingsPath, settings],
  ];
  const written: string[] = [];
  const skipped: string[] = [];
  try {
    for (const [path, content] of template) {
      if (existing.has(path)) {
        skipped.push(path);
        continue;
      }
      await store.write(path, content);
      written.push(path);
    }
  } catch (error) {
    for (const path of written) {
      await removeQuietly(store, path);
    }
    throw error;
  }
  return ok({ location: store.location, id, name: options.name, written, skipped });
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
