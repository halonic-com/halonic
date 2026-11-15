// The places in the workspace's files that name a Library item, so a rename
// can rewrite them and the dialog can list them (requirement
// `app.references-to`). A lookup over a loaded workspace: nothing is read
// from disk.

import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import type { YamlPath } from "@halonicjs/yaml";
import { LISTING_FIELD, type LibraryItemRef, reachOf } from "./who-uses.ts";

/** One place in a file that names the item. */
export interface Reference {
  /** The workspace-relative path of the file, with `/` separators. */
  readonly file: string;
  /** Where in that file the item's id stands, as `editYaml` takes it. */
  readonly path: YamlPath;
  /** The name of the agent, hub, routine or collection the place belongs to. */
  readonly owner: string;
}

/**
 * Every place that names this item's id, in the order of the files' paths and
 * then of the places inside a file. It covers the same files as `whoUses`,
 * with the exact place in each: an entry of an agent's or hub's list, a mail
 * trigger's `connector`, a `ref` field's `collection`.
 *
 * @example
 * referencesTo(workspace, { kind: "knowledge", id: "kb", hub: null });
 * // [{ file: "hubs/support/agents/billing.agent.yaml", path: ["knowledge", 0], owner: "Billing" }]
 */
export function referencesTo(workspace: LoadedWorkspace, item: LibraryItemRef): Reference[] {
  const places = [
    ...inLists(workspace, item),
    ...inMailTriggers(workspace, item),
    ...inRefFields(workspace, item),
  ];
  return places.sort((a, b) => a.file.localeCompare(b.file, "en"));
}

/** The entries of agents' lists, and of the hubs' `uses` for a shared item. */
function inLists(workspace: LoadedWorkspace, item: LibraryItemRef): Reference[] {
  const field = LISTING_FIELD[item.kind];
  const inReach = reachOf(workspace, item);
  const places: Reference[] = [];
  const add = (file: string, owner: string, ids: readonly string[], before: YamlPath): void => {
    for (const [index, id] of ids.entries()) {
      if (id === item.id) {
        places.push({ file, path: [...before, index], owner });
      }
    }
  };
  for (const file of filesOf(workspace, "agent")) {
    if (inReach(file.hub)) {
      add(file.path, file.value.name, file.value[field], [field]);
    }
  }
  for (const file of item.hub === null ? filesOf(workspace, "hub") : []) {
    add(file.path, file.value.name, file.value.uses?.[field] ?? [], ["uses", field]);
  }
  return places;
}

/** The `connector` of each mail trigger that names a connector. */
function inMailTriggers(workspace: LoadedWorkspace, item: LibraryItemRef): Reference[] {
  if (item.kind !== "connector") {
    return [];
  }
  const inReach = reachOf(workspace, item);
  return filesOf(workspace, "routine")
    .filter(
      (file) =>
        inReach(file.hub) &&
        "mail" in file.value.trigger &&
        file.value.trigger.mail.connector === item.id,
    )
    .map((file) => ({
      file: file.path,
      path: ["trigger", "mail", "connector"],
      owner: file.value.name,
    }));
}

/** The `collection` of each `ref` field of another collection that points at the item. */
function inRefFields(workspace: LoadedWorkspace, item: LibraryItemRef): Reference[] {
  if (item.kind !== "collection") {
    return [];
  }
  return filesOf(workspace, "collection")
    .filter((file) => file.value.id !== item.id)
    .flatMap((file) =>
      Object.entries(file.value.fields)
        .filter(([, each]) => each.type === "ref" && each.collection === item.id)
        .map(([name]) => ({
          file: file.path,
          path: ["fields", name, "collection"],
          owner: file.value.name,
        })),
    );
}
