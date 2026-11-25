import {
  brokenFileItem,
  type FileWithErrors,
  type OverviewHub,
  type OverviewItem,
  type OverviewShared,
} from "@halonicjs/studio-shell";
import type { LibraryEntry, LibraryListing } from "./library-items-host.ts";
import { usedByText } from "./used-by-text.ts";

/** The data of the shell's overview page for one tab. */
export interface LibraryOverview {
  readonly hubs: readonly OverviewHub[];
  readonly shared?: OverviewShared;
}

/** Where an entry sits: its hub's id, or `null` when the workspace shares it. */
export interface LibraryEntryPlace {
  readonly hub: string | null;
  readonly id: string;
}

/** A row's id: two hubs may each have a skill `refunds`, so the hub is part of it. */
function rowId(hub: string | null, id: string): string {
  return `${hub ?? ""}/${id}`;
}

/** The entry a row id names, the inverse of the ids {@link libraryOverview} gives. */
export function entryOfRow(row: string): LibraryEntryPlace {
  const slash = row.indexOf("/");
  const hub = row.slice(0, slash);
  return { hub: hub === "" ? null : hub, id: row.slice(slash + 1) };
}

function rowOf(hub: string | null, entry: LibraryEntry): OverviewItem {
  return {
    id: rowId(hub, entry.id),
    name: entry.name,
    ...(entry.description === undefined ? {} : { description: entry.description }),
    ...(entry.detail === undefined ? {} : { detail: entry.detail }),
    usedBy: usedByText(entry.usage),
  };
}

/** The row id of a file that didn't load: its path, which no entry's row id can be. */
export function brokenRowId(file: FileWithErrors): string {
  return `file:${file.path}`;
}

/** The error-state rows of the broken files in one hub (`null`: the workspace's shared ones), by name. */
function brokenRowsIn(hub: string | null, broken: readonly FileWithErrors[]): OverviewItem[] {
  return broken
    .filter((file) => file.hub === hub)
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((file) => brokenFileItem(file, brokenRowId(file)));
}

/**
 * One row per entry, each with its "Used by" text on the right. A file that didn't load keeps a
 * row after its hub's entries, in the error state (C348 ST4); only the Connectors tab passes any.
 */
export function libraryOverview(
  listing: LibraryListing,
  broken: readonly FileWithErrors[] = [],
): LibraryOverview {
  return {
    hubs: listing.hubs.map((hub) => ({
      id: hub.id,
      name: hub.name,
      items: [...hub.entries.map((entry) => rowOf(hub.id, entry)), ...brokenRowsIn(hub.id, broken)],
    })),
    ...(listing.shared === undefined
      ? {}
      : {
          shared: {
            workspaceName: listing.shared.workspaceName,
            items: [
              ...listing.shared.entries.map((entry) => rowOf(null, entry)),
              ...brokenRowsIn(null, broken),
            ],
          },
        }),
  };
}
