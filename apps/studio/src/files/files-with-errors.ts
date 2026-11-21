import {
  type FilesWithErrorsSource,
  type FileWithErrors,
  type FileWithErrorsKind,
  fileWithErrorsKinds,
} from "@halonicjs/studio-shell";
import {
  type LoadedWorkspace,
  loadWorkspace,
  placeOf,
  type WorkspaceIssue,
} from "@halonicjs/workspace";
import { readYaml } from "@halonicjs/yaml";
import {
  checkedSource,
  type WorkspaceLibraryItemsParts,
} from "../library/workspace-library-items.ts";

/** What {@link WorkspaceFilesWithErrors} needs of the workspace's files. */
export interface FilesWithErrorsParts {
  /** The kernel's `WorkspaceFiles`: reads and lists with unsaved changes applied. */
  readonly files: WorkspaceLibraryItemsParts["files"];
  /** Calls `listener` after every change of the workspace's files and every save; returns the way to stop. */
  readonly onChange: (listener: () => void) => () => void;
}

/**
 * The open workspace's files with errors (`studio.files-with-errors`), from the checks Files ›
 * Problems shows, so the status bar, Home and the lists count the same files.
 *
 * @example
 * services.provide(FilesWithErrorsService, new WorkspaceFilesWithErrors({ files, onChange }));
 */
export class WorkspaceFilesWithErrors implements FilesWithErrorsSource {
  readonly #parts: FilesWithErrorsParts;

  constructor(parts: FilesWithErrorsParts) {
    this.#parts = parts;
  }

  async list(): Promise<readonly FileWithErrors[]> {
    const { files } = this.#parts;
    return filesWithErrors(await loadWorkspace(checkedSource(files)), (path) => files.read(path));
  }

  subscribe(listener: () => void): () => void {
    return this.#parts.onChange(listener);
  }
}

/**
 * The files of a loaded workspace with at least one error, in the order
 * {@link FilesWithErrorsSource.list} gives. A file that didn't load is named from its text when
 * its `name` can still be read, so `read` gives the file's text as the workspace holds it now.
 *
 * @example
 * const broken = (await filesWithErrors(workspace, read)).filter((file) => !file.loaded);
 */
export async function filesWithErrors(
  workspace: LoadedWorkspace,
  read: (path: string) => Promise<string | null>,
): Promise<FileWithErrors[]> {
  const errorsByFile = Map.groupBy(
    workspace.issues.filter((issue) => issue.severity === "error"),
    (issue) => issue.file,
  );
  const found = await Promise.all(
    [...errorsByFile].map(([path, errors]) => fileWithErrors(workspace, path, errors, read)),
  );
  return found.filter((file) => file !== undefined).sort(listOrder);
}

/** One file's entry, or `undefined` for a file of a kind the lists don't show, such as `models.yaml`. */
async function fileWithErrors(
  workspace: LoadedWorkspace,
  path: string,
  errors: readonly WorkspaceIssue[],
  read: (path: string) => Promise<string | null>,
): Promise<FileWithErrors | undefined> {
  const place = placeOf(path);
  if (place === undefined || place.placeId === undefined || !isListedKind(place.kind)) {
    return undefined;
  }
  const loaded = workspace.files.find((file) => file.path === path);
  const name = loaded === undefined ? await nameInText(read, path) : ownName(loaded.value);
  const [first] = errors.toSorted((a, b) => a.line - b.line || a.col - b.col);
  if (first === undefined) return undefined;
  return {
    path,
    kind: place.kind,
    hub: place.hub,
    id: place.placeId,
    // A loaded connector without a name shows its id, as its Library row does.
    name: name ?? (loaded === undefined ? fileName(path) : place.placeId),
    loaded: loaded !== undefined,
    firstError: { line: first.line, col: first.col, reason: first.message },
    errors: errors.length,
  };
}

function isListedKind(kind: string): kind is FileWithErrorsKind {
  return (fileWithErrorsKinds as readonly string[]).includes(kind);
}

/** The `name` a file's YAML still gives, when the file didn't load; `undefined` when it can't be read. */
async function nameInText(
  read: (path: string) => Promise<string | null>,
  path: string,
): Promise<string | undefined> {
  const text = await read(path);
  if (text === null) return undefined;
  const parsed = readYaml(text);
  return parsed.ok ? ownName(parsed.value.data) : undefined;
}

/** A file's own `name`, when it has a non-empty one. */
function ownName(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const name: unknown = Reflect.get(data, "name");
  return typeof name === "string" && name.trim() !== "" ? name : undefined;
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Files that didn't load first (their errors cause others'), then by kind, then by name. */
function listOrder(a: FileWithErrors, b: FileWithErrors): number {
  return (
    Number(a.loaded) - Number(b.loaded) ||
    fileWithErrorsKinds.indexOf(a.kind) - fileWithErrorsKinds.indexOf(b.kind) ||
    a.name.localeCompare(b.name) ||
    a.path.localeCompare(b.path)
  );
}
