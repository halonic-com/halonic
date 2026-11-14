import type { OverviewHub, OverviewItem, OverviewShared } from "@halonicjs/studio-shell";
import type { LibraryEntry, LibraryListing } from "./library-items-host.ts";
import { usedByText } from "./used-by-text.ts";

/** The data of the shell's overview page for one tab. */
export interface LibraryOverview {
  readonly hubs: readonly OverviewHub[];
  readonly shared?: OverviewShared;
}

function rowOf(entry: LibraryEntry): OverviewItem {
  return {
    id: entry.id,
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
      items: hub.entries.map(rowOf),
    })),
    ...(listing.shared === undefined
      ? {}
      : {
          shared: {
            workspaceName: listing.shared.workspaceName,
            items: listing.shared.entries.map(rowOf),
          },
        }),
  };
}
