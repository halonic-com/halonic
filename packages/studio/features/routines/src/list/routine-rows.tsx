import { LetterTile, StatusChip } from "@halonicjs/studio-kit";
import type { OverviewHub, OverviewItem } from "@halonicjs/studio-shell";
import type { RoutineHub, RoutineListing, RoutineRef } from "../api.ts";
import { listWords, nextWhen } from "./list-words.ts";

/** The row id of a routine: unique across hubs, because two hubs can both have a `daily`. */
export function rowId(ref: RoutineRef): string {
  return `${ref.hubId ?? ""}/${ref.id}`;
}

/**
 * The one chip a row shows (flow-routines 2.1): "Off", else "Paused until trusted", else "Needs
 * sign-in", else "Needs you"; a routine that is fine and on has none.
 */
function Chip({ listing }: { readonly listing: RoutineListing }) {
  if (!listing.enabled) return <StatusChip tone="neutral">{listWords.off}</StatusChip>;
  if (listing.pausedUntilTrusted) {
    return <StatusChip tone="attention">{listWords.pausedUntilTrusted}</StatusChip>;
  }
  if (listing.needsSignIn) return <StatusChip tone="warning">{listWords.needsSignIn}</StatusChip>;
  if (listing.needsYou > 0) {
    return (
      <StatusChip tone="warning" dot>
        {listWords.needsYou}
      </StatusChip>
    );
  }
  return null;
}

function hasChip({ enabled, pausedUntilTrusted, needsSignIn, needsYou }: RoutineListing): boolean {
  return !enabled || pausedUntilTrusted || needsSignIn || needsYou > 0;
}

function itemOf(listing: RoutineListing, now: Date): OverviewItem {
  return {
    id: rowId(listing),
    name: listing.name,
    description: listing.summary,
    detail: listing.summary,
    ...(listing.enabled && listing.nextRun !== undefined
      ? { usedBy: nextWhen(listing.nextRun, now) }
      : {}),
    avatar: <LetterTile name={listing.name} />,
    ...(hasChip(listing) ? { chips: <Chip listing={listing} /> } : {}),
  };
}

/** The hubs of the overview page: every hub in the workspace's order, with its routines by name. */
export function routineHubs(
  hubs: readonly RoutineHub[],
  listings: readonly RoutineListing[],
  now: Date = new Date(),
): readonly OverviewHub[] {
  return hubs.map((hub) => ({
    id: hub.id,
    name: hub.name,
    items: listings
      .filter((listing) => listing.hubId === hub.id)
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((listing) => itemOf(listing, now)),
  }));
}
