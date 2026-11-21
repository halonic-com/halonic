import { LetterTile, StatusChip } from "@halonicjs/studio-kit";
import type { OverviewHub, OverviewItem } from "@halonicjs/studio-shell";
import type { RoutineHub, RoutineListing, RoutineRef } from "../api.ts";
import { listWords, nextWhen } from "./list-words.ts";

/** The row id of a routine: unique across hubs, because two hubs can both have a `daily`. */
export function rowId(ref: RoutineRef): string {
  return `${ref.hubId ?? ""}/${ref.id}`;
}

/**
 * The one chip a row shows (flow-routines 2.1): "Can't start", else "Off", else "Paused until
 * trusted", else "Needs sign-in", else "Needs you"; a routine that is fine and on has none. "Can't
 * start" comes first because turning the routine on or trusting the workspace wouldn't help: only
 * picking another workflow or agent does (HAL-14940).
 */
function Chip({ listing }: { readonly listing: RoutineListing }) {
  if (!listing.targetFound) {
    return (
      <StatusChip tone="danger">
        {/*
         * The row's name is its text, so screen readers hear "… Can't start: support-reply isn't in
         * this workspace". The words and the reason are one text: the chip is a flex box and the
         * reason is positioned out of it, so Chromium puts a space between two parts, which a
         * braille display shows as "Can't start :" (C538-4).
         */}
        <span aria-hidden="true">{listWords.cantStart}</span>
        <span className="sr-only">
          {`${listWords.cantStart}: ${listWords.cantStartWhy(listing.targetName)}`}
        </span>
      </StatusChip>
    );
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
  const { targetFound, enabled, pausedUntilTrusted, needsSignIn, needsYou } = listing;
  return !targetFound || !enabled || pausedUntilTrusted || needsSignIn || needsYou > 0;
}

/** Whether the row shows when the routine next starts: not when it is off or can't start. */
function showsNextRun(listing: RoutineListing): listing is RoutineListing & { nextRun: string } {
  return listing.enabled && listing.targetFound && listing.nextRun !== undefined;
}

function itemOf(listing: RoutineListing, now: Date): OverviewItem {
  return {
    id: rowId(listing),
    name: listing.name,
    description: listing.summary,
    detail: listing.summary,
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
