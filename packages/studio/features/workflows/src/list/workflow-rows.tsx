import { StatusChip } from "@halonicjs/studio-kit";
import type { OverviewHub, OverviewItem } from "@halonicjs/studio-shell";
import type { WorkflowHub, WorkflowLastRun, WorkflowListing, WorkflowRef } from "../api.ts";
import { lastRunOutcome, listWords, runWhen } from "./list-words.ts";

/** The row id of a workflow: unique across hubs, because two hubs can both have a `reply`. */
export function rowId(ref: WorkflowRef): string {
  return `${ref.hubId}/${ref.id}`;
}

/** The first letter of the name, upper case, for the row's avatar (G5 decision 39). */
function avatarLetter(name: string): string {
  return (name.trim().charAt(0) || "?").toUpperCase();
}

export function Avatar({ name }: { readonly name: string }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-small-strong text-accent-text">
      {avatarLetter(name)}
    </span>
  );
}

/** A chip's drawn symbol and its space: sighted people see "✕ 2 problems", a screen reader hears "2 problems". */
function Glyph({ children }: { readonly children: string }) {
  return <span aria-hidden="true">{children} </span>;
}

/** "Last run ✓ Today 09:05" for sighted people; a screen reader hears "Last run completed, Today 09:05". */
function LastRun({ lastRun, now }: { readonly lastRun: WorkflowLastRun; readonly now: Date }) {
  const outcome = lastRunOutcome[lastRun.outcome];
  return (
    <>
      {listWords.lastRun}{" "}
      {outcome !== null && (
        <>
          <span aria-hidden="true">{outcome.glyph} </span>
          <span className="sr-only">{outcome.spoken}, </span>
        </>
      )}
      {runWhen(lastRun.startedAt, now)}
    </>
  );
}

/**
 * The chips of a row, in the order flow-workflows 2.1 gives: "N needs you" when runs wait for a
 * person, else "N running", and the problems last. An idle row with no problems has none.
 */
function Chips({ listing }: { readonly listing: WorkflowListing }) {
  const { waiting, running } = listing.runs;
  const { errors, warnings } = listing.problems;
  return (
    <>
      {waiting > 0 && (
        <StatusChip tone="warning" dot>
          {listWords.needsYou(waiting)}
        </StatusChip>
      )}
      {waiting === 0 && running > 0 && (
        <StatusChip tone="running" dot>
          {listWords.running(running)}
        </StatusChip>
      )}
      {errors > 0 && (
        <StatusChip tone="danger">
          <Glyph>✕</Glyph>
          {listWords.problems(errors + warnings)}
        </StatusChip>
      )}
      {errors === 0 && warnings > 0 && (
        <StatusChip tone="attention">
          <Glyph>△</Glyph>
          {listWords.warnings(warnings)}
        </StatusChip>
      )}
    </>
  );
}

function hasChips({ runs, problems }: WorkflowListing): boolean {
  return runs.waiting > 0 || runs.running > 0 || problems.errors > 0 || problems.warnings > 0;
}

function itemOf(listing: WorkflowListing, now: Date): OverviewItem {
  const { lastRun } = listing;
  return {
    id: rowId(listing),
    name: listing.name,
    ...(listing.description === undefined || listing.description === ""
      ? {}
      : { description: listing.description, detail: listing.description }),
    ...(lastRun === undefined ? {} : { usedBy: <LastRun lastRun={lastRun} now={now} /> }),
    avatar: <Avatar name={listing.name} />,
    ...(hasChips(listing) ? { chips: <Chips listing={listing} /> } : {}),
  };
}

/** The hubs of the overview page: every hub in the workspace's order, with its workflows by name. */
export function workflowHubs(
  hubs: readonly WorkflowHub[],
  listings: readonly WorkflowListing[],
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
