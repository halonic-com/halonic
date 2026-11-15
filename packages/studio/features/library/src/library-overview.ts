import type { OverviewHub, OverviewItem, OverviewShared } from "@halonicjs/studio-shell";
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

/** One row per entry, each with its "Used by" text on the right. */
export function libraryOverview(listing: LibraryListing): LibraryOverview {
  return {
    hubs: listing.hubs.map((hub) => ({
      id: hub.id,
      name: hub.name,
      items: hub.entries.map((entry) => rowOf(hub.id, entry)),
    })),
    ...(listing.shared === undefined
      ? {}
      : {
          shared: {
            workspaceName: listing.shared.workspaceName,
            items: listing.shared.entries.map((entry) => rowOf(null, entry)),
          },
        }),
  };
}
