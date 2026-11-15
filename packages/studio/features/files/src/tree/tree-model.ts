/** Folders the tree never shows: Halonic's own data, git, and installed packages. */
const hiddenFolders: ReadonlySet<string> = new Set([".studio", ".git", "node_modules"]);

/** What a row says about the problems in a file, or in everything under a folder. */
export interface TreeMarks {
  readonly errors: number;
  readonly warnings: number;
  /** The file, or a file in the folder, changed outside Halonic and waits for the user's choice in Compare. */
  readonly outside: boolean;
}

/** A file row. */
export interface TreeFile {
  readonly kind: "file";
  /** The path from the workspace folder, such as `hubs/p/hub.yaml`. */
  readonly path: string;
  readonly name: string;
  readonly marks: TreeMarks;
}

/** A folder row, with its children in tree order. */
export interface TreeFolder {
  readonly kind: "folder";
  readonly path: string;
  readonly name: string;
  readonly children: readonly TreeNode[];
  /** The marks of every file below it added up. */
  readonly marks: TreeMarks;
}

/** One row of the tree. */
export type TreeNode = TreeFile | TreeFolder;

/** The marks of one file by path; a file not listed has none. */
export type FileMarks = ReadonlyMap<string, Partial<TreeMarks>>;

/** No errors, no warnings, nothing outside. */
export const noMarks: TreeMarks = { errors: 0, warnings: 0, outside: false };

interface FolderDraft {
  readonly path: string;
  readonly name: string;
  readonly folders: Map<string, FolderDraft>;
  readonly files: TreeFile[];
}

function byName(a: { name: string }, b: { name: string }): number {
  const lower = a.name.toLowerCase().localeCompare(b.name.toLowerCase(), "en");
  return lower !== 0 ? lower : a.name.localeCompare(b.name, "en");
}

function addMarks(total: TreeMarks, more: TreeMarks): TreeMarks {
  return {
    errors: total.errors + more.errors,
    warnings: total.warnings + more.warnings,
    outside: total.outside || more.outside,
  };
}

function fileMarks(marks: FileMarks, path: string): TreeMarks {
  return { ...noMarks, ...marks.get(path) };
}

function seal(draft: FolderDraft): TreeFolder {
  const folders = [...draft.folders.values()].map(seal).sort(byName);
  const files = [...draft.files].sort(byName);
  const children: TreeNode[] = [...folders, ...files];
  const marks = children.reduce((total, child) => addMarks(total, child.marks), noMarks);
  return { kind: "folder", path: draft.path, name: draft.name, children, marks };
}

function isHidden(segments: readonly string[]): boolean {
  return segments.slice(0, -1).some((name) => hiddenFolders.has(name));
}

/**
 * Builds the file tree from the workspace's file paths (requirement
 * `files.tree.folders-closed-no-local-data`): folders first, then files, each sorted by name, and
 * never the `.studio`, `.git` or `node_modules` folders. Each folder carries the marks of the files
 * below it added up (requirement `files.tree.marks-unsaved-and-problems`).
 *
 * @param paths - every file in the workspace, as the engine lists them
 * @param marks - the problems and outside changes by file path
 * @returns the top rows
 */
export function buildTree(paths: readonly string[], marks: FileMarks = new Map()): TreeNode[] {
  const root: FolderDraft = { path: "", name: "", folders: new Map(), files: [] };
  for (const path of paths) {
    const segments = path.split("/").filter((segment) => segment !== "");
    const name = segments.at(-1);
    if (name === undefined || isHidden(segments)) continue;
    let folder = root;
    for (const [index, segment] of segments.slice(0, -1).entries()) {
      const folderPath = segments.slice(0, index + 1).join("/");
      let next = folder.folders.get(segment);
      if (next === undefined) {
        next = { path: folderPath, name: segment, folders: new Map(), files: [] };
        folder.folders.set(segment, next);
      }
      folder = next;
    }
    const filePath = segments.join("/");
    folder.files.push({ kind: "file", path: filePath, name, marks: fileMarks(marks, filePath) });
  }
  return seal(root).children.slice();
}
