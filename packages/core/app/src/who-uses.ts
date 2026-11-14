// Who uses a Library item, for the "Used by" lists and the delete
// confirmation (requirement `app.who-uses`). A lookup over a loaded
// workspace: nothing is read from disk.

import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";

/** The kinds of Library item people ask about. */
export type LibraryItemKind = "skill" | "knowledge" | "collection" | "connector";

/** The item asked about, by kind and id. */
export interface LibraryItemRef {
  readonly kind: LibraryItemKind;
  readonly id: string;
  /** The hub folder the item sits in, or `null` when it is shared at the workspace root. Collections are always shared. */
  readonly hub: string | null;
}

/** One thing that uses the item. */
export interface Usage {
  readonly id: string;
  readonly name: string;
  /** The hub folder it sits in, or `null` at the workspace root. */
  readonly hub: string | null;
}

/** Everything in the workspace that uses an item; each list may be empty. */
export interface ItemUsage {
  readonly agents: readonly Usage[];
  readonly hubs: readonly Usage[];
  /** Routines with a mail trigger on the connector. */
  readonly routines: readonly Usage[];
  /** Collections with a `ref` field to the collection. */
  readonly collections: readonly Usage[];
}

/** The agent and hub field that lists each kind of item. */
const LISTING_FIELD = {
  skill: "skills",
  knowledge: "knowledge",
  collection: "collections",
  connector: "connectors",
} as const satisfies Record<LibraryItemKind, string>;

/**
 * Who in the workspace uses this item, in the order of the files' paths.
 * A hub's own item is used only from inside that hub; a shared item is used
 * from the root and from every hub that has no item of its own with that id.
 *
 * @example
 * const usage = whoUses(workspace, { kind: "knowledge", id: "kb" });
 * usage.agents.map((agent) => agent.name); // ["Billing", "Support"]
 */
export function whoUses(workspace: LoadedWorkspace, item: LibraryItemRef): ItemUsage {
  const field = LISTING_FIELD[item.kind];
  const listsIt = (ids: readonly string[]) => ids.includes(item.id);
  const hubsWithOwn = new Set(
    item.hub === null
      ? filesOf(workspace, item.kind)
          .filter((file) => file.value.id === item.id && file.hub !== null)
          .map((file) => file.hub)
      : [],
  );
  const inReach = (hub: string | null) =>
    item.hub === null ? hub === null || !hubsWithOwn.has(hub) : hub === item.hub;

  const agents = filesOf(workspace, "agent")
    .filter((file) => inReach(file.hub) && listsIt(file.value[field]))
    .map((file) => usage(file.value, file.hub));
  const hubs = (item.hub === null ? filesOf(workspace, "hub") : [])
    .filter((file) => listsIt(file.value.uses?.[field] ?? []))
    .map((file) => usage(file.value, file.hub));
  const routines =
    item.kind === "connector"
      ? filesOf(workspace, "routine")
          .filter(
            (file) =>
              inReach(file.hub) &&
              "mail" in file.value.trigger &&
              file.value.trigger.mail.connector === item.id,
          )
          .map((file) => usage(file.value, file.hub))
      : [];
  const collections =
    item.kind === "collection"
      ? filesOf(workspace, "collection")
          .filter(
            (file) =>
              file.value.id !== item.id &&
              Object.values(file.value.fields).some(
                (each) => each.type === "ref" && each.collection === item.id,
              ),
          )
          .map((file) => usage(file.value, file.hub))
      : [];

  return { agents, hubs, routines, collections };
}

function usage(value: { readonly id: string; readonly name: string }, hub: string | null): Usage {
  return { id: value.id, name: value.name, hub };
}
