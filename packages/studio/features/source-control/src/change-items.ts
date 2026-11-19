import { type FileChange, nameFromId } from "@halonicjs/app";
import { placeOf, settingsPath } from "@halonicjs/workspace";
import type { ChangedFile } from "./changes-list-state.ts";
import { itemWords } from "./changes-words.ts";

/** An item's kind, as the format names it. */
export type ItemKind = NonNullable<FileChange["kind"]>;

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
  readonly kind: ItemKind | undefined;
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
      readonly kind: ItemKind;
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
      kind: ItemKind | undefined;
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
    name: item.kind === "workflowTest" ? testName(item, byId) : item.name,
    sentence: sentenceOf(item.files),
  }));
}

/**
 * A workflow test has no name of its own: it is called by the workflow it tests, its kind tells
 * the two apart. The workflow's name comes from its file when it changed too, else from its id.
 */
function testName(
  test: { readonly itemId: string; readonly hub: string },
  byId: ReadonlyMap<string, { readonly name: string }>,
): string {
  return byId.get(`workflow:${test.hub}:${test.itemId}`)?.name ?? nameFromId(test.itemId);
}

/** The kinds that have a page of their own to open from the Changes page. */
const openableKinds: readonly string[] = ["agent", "workflow", "routine"];

/** Whether the item has a page to open: an agent, a workflow or a routine. */
export function isOpenable(item: ChangeItem): boolean {
  return item.kind !== undefined && openableKinds.includes(item.kind);
}

/** One item a version changed, as the version's What's in it lists it. */
export interface VersionItem {
  /** Its kind and name, or the file's path for an other file, as {@link ChangeItem.id}. */
  readonly id: string;
  /** What the row is called: the item's name, or a friendly name for an other file. */
  readonly name: string;
  /** The item's kind, or `undefined` for an other file. */
  readonly kind: ItemKind | undefined;
  /** The files of the item the version changed; at least one. */
  readonly paths: readonly string[];
}

/**
 * Groups the files a version changed into its items, as the Changes list groups changed files:
 * the items first, then the files no kind places, each in the order the files came. A version
 * holds no descriptions, so an item is called by its name in its path.
 */
export function groupVersionFiles(paths: readonly string[]): VersionItem[] {
  const byId = new Map<string, { name: string; kind: ItemKind | undefined; paths: string[] }>();
  for (const path of paths) {
    const item = itemOf(path);
    const id = item?.key ?? `file:${path}`;
    const found = byId.get(id);
    if (found === undefined) {
      const name = item?.name ?? friendlyNames[path] ?? baseName(path);
      byId.set(id, { name, kind: item?.kind, paths: [path] });
    } else {
      found.paths.push(path);
    }
  }
  const items = [...byId].map(([id, item]) => ({ id, ...item }));
  return [
    ...items.filter((item) => item.kind !== undefined),
    ...items.filter((item) => item.kind === undefined),
  ];
}
