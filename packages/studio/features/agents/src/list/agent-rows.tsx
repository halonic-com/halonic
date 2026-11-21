import { LetterTile } from "@halonicjs/studio-kit";
import {
  brokenFileItem,
  type FileWithErrors,
  type OverviewHub,
  type OverviewItem,
} from "@halonicjs/studio-shell";
import type { AgentHub, AgentListing, AgentRef } from "../api.ts";

/** The row id of an agent: unique across hubs, because two hubs can both have a `sorter`. */
export function rowId(ref: AgentRef): string {
  return `${ref.hubId}/${ref.id}`;
}

/** The row id of an agent file that didn't load: its path, which no agent's row id can be. */
export function brokenRowId(file: FileWithErrors): string {
  return `file:${file.path}`;
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

function brokenItemOf(file: FileWithErrors): OverviewItem {
  return { ...brokenFileItem(file, brokenRowId(file)), avatar: <LetterTile name={file.name} /> };
}

/**
 * The hubs of the overview page: every hub in the workspace's order, with its agents by name. An
 * agent file that didn't load keeps its row in its hub, in the error state (C348 ST4).
 */
export function agentHubs(
  hubs: readonly AgentHub[],
  listings: readonly AgentListing[],
  broken: readonly FileWithErrors[] = [],
): readonly OverviewHub[] {
  return hubs.map((hub) => ({
    id: hub.id,
    name: hub.name,
    items: [
      ...listings.filter((listing) => listing.hubId === hub.id).map(itemOf),
      ...broken.filter((file) => file.hub === hub.id).map(brokenItemOf),
    ].toSorted((a, b) => a.name.localeCompare(b.name)),
  }));
}
