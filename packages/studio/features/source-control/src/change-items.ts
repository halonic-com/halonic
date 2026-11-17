import type { FileChange } from "@halonicjs/app";
import { placeOf, settingsPath } from "@halonicjs/workspace";
import type { ChangedFile } from "./changes-list-state.ts";
import { itemWords } from "./changes-words.ts";

/** An item's kind, as the format names it. */
type KindName = NonNullable<FileChange["kind"]>;

/**
 * One row of the Changes list: an item with all the files that belong to it, or a file no kind
 * places. A person sees the item, never its path.
 */
export interface ChangeItem {
  /** Stable while the item is changed: its kind and name, or the file's path for an other file. */
  readonly id: string;
  /** What the row is called: the item's name, or a friendly name for an other file. */
  readonly name: string;
  /** The item's id in its kind (what the Open button needs); the same as `name` for an other file. */
  readonly itemId: string;
  /** The item's kind, or `undefined` for an other file. */
  readonly kind: KindName | undefined;
  /** The hub the item is in; empty for an item that sits in the workspace itself. */
  readonly hub: string;
  /** The changed files of the item; at least one. */
  readonly files: readonly ChangedFile[];
  /** The one sentence of the row: what changed first, or that the item was renamed. */
  readonly sentence: string;
}

/** The friendly names of the workspace files that no one thinks of as an item. */
const friendlyNames: Readonly<Record<string, string>> = {
  [settingsPath]: itemWords.workspaceSettings,
  "models.yaml": itemWords.models,
  ".gitignore": itemWords.historyLeavesOut,
};

/** A file inside a skill's folder, other than SKILL.md, still belongs to that skill. */
const skillFolderFile = /^(?:hubs\/[^/]+\/)?library\/skills\/([^/]+)\/./u;

/** The last part of a path: where the name of a file is. */
function baseName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

/** Which item a path belongs to: its kind, hub and name; `undefined` for a file that is no item. */
function itemOf(path: string):
  | {
      readonly kind: KindName;
      readonly name: string;
      readonly hub: string;
      readonly key: string;
    }
  | undefined {
  const place = placeOf(path);
  if (place?.placeId !== undefined) {
    return {
      kind: place.kind,
      name: place.placeId,
      hub: place.hub ?? "",
      key: `${place.kind}:${place.hub ?? ""}:${place.placeId}`,
    };
  }
  const skill = skillFolderFile.exec(path)?.[1];
  if (skill === undefined) return undefined;
  const hub = /^hubs\/([^/]+)\//u.exec(path)?.[1] ?? "";
  return { kind: "skill", name: skill, hub, key: `skill:${hub}:${skill}` };
}

/** The name an item had before it moved: "Support" for `agents/support.agent.yaml`. */
function previousName(from: string): string {
  return itemOf(from)?.name ?? friendlyNames[from] ?? baseName(from);
}

/** What the row says: that the item was renamed, else its first change, Important ones first. */
function sentenceOf(files: readonly ChangedFile[]): string {
  const renamed = files.find((file) => file.from !== undefined);
  if (renamed?.from !== undefined) return itemWords.renamedFrom(previousName(renamed.from));
  const described = files.find((file) => file.description.described) ?? files[0];
  return described?.description.lines[0]?.sentence ?? "";
}

/**
 * Groups the changed files into the rows of the list, in the order the files came: an item's files
 * are one row, and a file no kind places is a row of its own with a friendly name. Two files of
 * one agent changed are one item.
 */
export function groupIntoItems(files: readonly ChangedFile[]): ChangeItem[] {
  const byId = new Map<
    string,
    {
      name: string;
      itemId: string;
      kind: KindName | undefined;
      hub: string;
      files: ChangedFile[];
    }
  >();
  for (const file of files) {
    const item = itemOf(file.path);
    const id = item?.key ?? `file:${file.path}`;
    const found = byId.get(id);
    if (found === undefined) {
      const name =
        file.description.name ?? item?.name ?? friendlyNames[file.path] ?? baseName(file.path);
      byId.set(id, {
        name,
        itemId: item?.name ?? name,
        kind: item?.kind,
        hub: item?.hub ?? "",
        files: [file],
      });
    } else {
      // A skill's name is in its SKILL.md; the other files of its folder carry none.
      if (file.description.name !== undefined && item !== undefined)
        found.name = file.description.name;
      found.files.push(file);
    }
  }
  return [...byId].map(([id, item]) => ({
    id,
    ...item,
    sentence: sentenceOf(item.files),
  }));
}
