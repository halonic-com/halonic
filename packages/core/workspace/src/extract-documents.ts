// The documents of a hub's `files` knowledge sources, for hub extract: where
// they are, and which of them sit in a folder the loader left out
// (requirement workspace.extract).

import type { HubUses } from "@halonicjs/format";
import { isLeftOut } from "@halonicjs/ports";
import { filesOf, type LoadedFileOf, type LoadedWorkspace } from "./load-workspace.ts";

/**
 * The left-out folders that hold documents, or are held by the documents'
 * folder, of a knowledge source the hub takes: its own and the shared ones
 * it uses. Sorted, each once.
 */
export function leftOutDocumentFolders(
  workspace: LoadedWorkspace,
  hubId: string,
  uses: HubUses,
): string[] {
  const taken = filesOf(workspace, "knowledge").filter(
    (source) =>
      source.hub === hubId || (source.hub === null && uses.knowledge.includes(source.value.id)),
  );
  const folders = new Set<string>();
  for (const source of taken) {
    const documents = documentsFolder(source);
    if (documents === null) {
      continue;
    }
    for (const folder of workspace.leftOut) {
      const overlaps =
        isLeftOut(documents, { folders: [folder] }) || isLeftOut(folder, { folders: [documents] });
      if (overlaps) {
        folders.add(folder);
      }
    }
  }
  // Sorted by code unit, as a source lists them.
  return [...folders].sort();
}

/**
 * The documents of a `files` knowledge source: the workspace's files under
 * its `config.path`, which is relative to the workspace root. A path that
 * is absolute or leaves the workspace gives none.
 */
export function documentsOf(
  source: LoadedFileOf<"knowledge">,
  allPaths: readonly string[],
): string[] {
  const folder = documentsFolder(source);
  if (folder === null) {
    return [];
  }
  return allPaths.filter((path) => path.startsWith(`${folder}/`));
}

/** A `files` knowledge source's `config.path` with `/` between its parts, or `null` when it has none in the workspace. */
function documentsFolder(source: LoadedFileOf<"knowledge">): string | null {
  const folder = source.value.config["path"];
  if (source.value.provider !== "files" || typeof folder !== "string" || isAbsolute(folder)) {
    return null;
  }
  const parts = folder.split(/[\\/]+/).filter((part) => part !== "" && part !== ".");
  if (parts.length === 0 || parts.includes("..")) {
    return null;
  }
  return parts.join("/");
}

/** Whether a path starts at a root, `/` or `\`, or at a drive, such as `C:`. */
function isAbsolute(path: string): boolean {
  return /^([\\/]|[a-zA-Z]:)/.test(path);
}
