import { type FileProblem, parseFile } from "@halonicjs/format";
import type { DefinitionStore } from "@halonicjs/ports";
import { err, ok, type Result, slugify } from "@halonicjs/std";
import { writeYamlFile } from "@halonicjs/yaml";

/** What a new workspace is called. */
export interface InitWorkspaceOptions {
  /** The name people read, such as "Acme Billing". */
  readonly name: string;
  /** The workspace id; made from the name when absent ("Acme Billing" gives `acme-billing`). */
  readonly id?: string;
}

/** One file `initWorkspace` wrote, and whether it was new. */
export interface InitWorkspaceFile {
  /** The workspace-relative path, with `/` separators. */
  readonly path: string;
  /** `created` for a new file, `updated` for a file that was there and got lines added. */
  readonly change: "created" | "updated";
}

/** A workspace `initWorkspace` laid out. */
export interface InitializedWorkspace {
  /** The store's location, such as "memory:demo". */
  readonly location: string;
  readonly id: string;
  readonly name: string;
  /** The files written, in the order they were written. Files already right are left out. */
  readonly files: readonly InitWorkspaceFile[];
}

/** Why `initWorkspace` wrote nothing. */
export type InitWorkspaceError =
  /** The store already has a `workspace.yaml`; it is left as it is. */
  | { readonly kind: "already_a_workspace"; readonly location: string }
  /** The settings the name or id give don't pass the workspace kind's checks, such as an id in capitals. */
  | { readonly kind: "invalid_settings"; readonly problems: readonly FileProblem[] };

/** The settings file of a workspace. */
export const settingsPath = "workspace.yaml";

/** The file that keeps git from taking in files people keep secrets in. */
export const gitIgnorePath = ".gitignore";

/**
 * The lines a new workspace's `.gitignore` holds: secrets files, which the
 * `DefinitionStore` port already never serves, stay out of git as well.
 */
export const gitIgnoreLines: readonly string[] = [".env", ".env.*"];

/**
 * Lays out a new workspace through a {@link DefinitionStore}: a
 * `workspace.yaml` with its id and name, and a `.gitignore` that keeps
 * `.env` files out of git. An existing `.gitignore` keeps its lines and gets
 * only the missing ones added, so a folder that is already a git repository
 * can become a workspace.
 *
 * The settings are checked with the workspace kind's own schema before
 * anything is written. A store that already has a `workspace.yaml` is left
 * alone. The `.gitignore` is written first and `workspace.yaml` last, so if a
 * write fails the store is not yet a workspace and the call can be repeated.
 *
 * @param store - where the workspace files go, such as an empty folder
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
  const settings = writeYamlFile({ id, name: options.name });
  const parsed = parseFile("workspace", settings);
  if (!parsed.ok) {
    return err({ kind: "invalid_settings", problems: parsed.error });
  }
  if ((await store.read(settingsPath)) !== null) {
    return err({ kind: "already_a_workspace", location: store.location });
  }

  const files: InitWorkspaceFile[] = [];
  const gitIgnore = await store.read(gitIgnorePath);
  const newGitIgnore = withLines(gitIgnore, gitIgnoreLines);
  if (newGitIgnore !== gitIgnore) {
    await store.write(gitIgnorePath, newGitIgnore);
    files.push({ path: gitIgnorePath, change: gitIgnore === null ? "created" : "updated" });
  }
  await store.write(settingsPath, settings);
  files.push({ path: settingsPath, change: "created" });
  return ok({ location: store.location, id, name: options.name, files });
}

/**
 * The text with each missing line added at the end, or the text unchanged
 * when it has them all. A line counts as there when a line of the text is
 * the same once trimmed.
 */
function withLines(text: string | null, lines: readonly string[]): string {
  const current = text ?? "";
  const present = new Set(current.split(/\r?\n/).map((line) => line.trim()));
  const missing = lines.filter((line) => !present.has(line));
  if (missing.length === 0) {
    return current;
  }
  const separator = current === "" || current.endsWith("\n") ? "" : "\n";
  return `${current}${separator}${missing.join("\n")}\n`;
}
