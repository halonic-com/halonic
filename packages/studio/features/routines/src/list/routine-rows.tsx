import { LetterTile, StatusChip } from "@halonicjs/studio-kit";
import type { OverviewHub, OverviewItem } from "@halonicjs/studio-shell";
import type { RoutineHub, RoutineListing, RoutineRef } from "../api.ts";
import { cantStartReason, cantStartWords } from "../cant-start.ts";
import { listWords, nextWhen } from "./list-words.ts";

/** The row id of a routine: unique across hubs, because two hubs can both have a `daily`. */
export function rowId(ref: RoutineRef): string {
  return `${ref.hubId ?? ""}/${ref.id}`;
}

/**
 * The one chip a row shows (flow-routines 2.1): "Can't start", else "Off", else "Paused until
 * trusted", else "Needs sign-in", else "Needs you"; a routine that is fine and on has none. "Can't
 * start" comes first because turning the routine on or trusting the workspace wouldn't help: only
 * picking another workflow or agent, or fixing its file, does (HAL-14940). The row's detail line
 * says which (HAL-15082).
 */
function Chip({ listing }: { readonly listing: RoutineListing }) {
  if (cantStartReason(listing) !== undefined) {
    return <StatusChip tone="danger">{cantStartWords.chip}</StatusChip>;
  }
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

function hasChip(listing: RoutineListing): boolean {
  const { enabled, pausedUntilTrusted, needsSignIn, needsYou } = listing;
  const cantStart = cantStartReason(listing) !== undefined;
  return cantStart || !enabled || pausedUntilTrusted || needsSignIn || needsYou > 0;
}

/** Whether the row shows when the routine next starts: not when it is off or can't start. */
function showsNextRun(listing: RoutineListing): listing is RoutineListing & { nextRun: string } {
  const canStart = cantStartReason(listing) === undefined;
  return listing.enabled && canStart && listing.nextRun !== undefined;
}

/**
 * A row. Its line under the name is what the routine does, or, when it can't start, why and what to
 * do, so the reason isn't left to screen readers (HAL-15082); the search still reads what it does.
 */
function itemOf(listing: RoutineListing, now: Date): OverviewItem {
  return {
    id: rowId(listing),
    name: listing.name,
    description: listing.summary,
    detail: cantStartReason(listing) ?? listing.summary,
    ...(showsNextRun(listing) ? { usedBy: nextWhen(listing.nextRun, now) } : {}),
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
