import { LetterTile } from "@halonicjs/studio-kit";
import type { OverviewHub, OverviewItem } from "@halonicjs/studio-shell";
import type { AgentHub, AgentListing, AgentRef } from "../api.ts";

/** The row id of an agent: unique across hubs, because two hubs can both have a `sorter`. */
export function rowId(ref: AgentRef): string {
  return `${ref.hubId}/${ref.id}`;
}

function itemOf(listing: AgentListing): OverviewItem {
  return {
    id: rowId(listing),
    name: listing.name,
    ...(listing.description === undefined || listing.description === ""
      ? {}
      : { description: listing.description, detail: listing.description }),
    ...(listing.model === undefined ? {} : { usedBy: listing.model }),
    avatar: <LetterTile name={listing.name} />,
  };
}

/** The hubs of the overview page: every hub in the workspace's order, with its agents by name. */
export function agentHubs(
  hubs: readonly AgentHub[],
  listings: readonly AgentListing[],
): readonly OverviewHub[] {
  return hubs.map((hub) => ({
    id: hub.id,
    name: hub.name,
    items: listings
      .filter((listing) => listing.hubId === hub.id)
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map(itemOf),
  }));
}
