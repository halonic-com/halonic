import { LetterTile, StatusChip } from "@halonicjs/studio-kit";
import {
  brokenFileItem,
  type FileWithErrors,
  type OverviewHub,
  type OverviewItem,
} from "@halonicjs/studio-shell";
import type { WorkflowHub, WorkflowLastRun, WorkflowListing, WorkflowRef } from "../api.ts";
import { lastRunOutcome, listWords, runWhen } from "./list-words.ts";

/** The row id of a workflow: unique across hubs, because two hubs can both have a `reply`. */
export function rowId(ref: WorkflowRef): string {
  return `${ref.hubId}/${ref.id}`;
}

/** The row id of a workflow file that didn't load: its path, which no workflow's row id can be. */
export function brokenRowId(file: FileWithErrors): string {
  return `file:${file.path}`;
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
          <span aria-hidden="true" className={outcome.danger ? "text-danger" : undefined}>
            {outcome.glyph}{" "}
          </span>
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
    // On a phone, Last run takes its own line, so the name and description keep the width (HAL-13100).
    ...(lastRun === undefined
      ? {}
      : { usedBy: <LastRun lastRun={lastRun} now={now} />, usedByOwnLine: true }),
    avatar: <LetterTile name={listing.name} />,
    ...(hasChips(listing) ? { chips: <Chips listing={listing} /> } : {}),
  };
}

function brokenItemOf(file: FileWithErrors): OverviewItem {
  return { ...brokenFileItem(file, brokenRowId(file)), avatar: <LetterTile name={file.name} /> };
}

/**
 * The hubs of the overview page: every hub in the workspace's order, with its workflows by name. A
 * workflow file that didn't load keeps its row in its hub, in the error state (C348 ST4).
 */
export function workflowHubs(
  hubs: readonly WorkflowHub[],
  listings: readonly WorkflowListing[],
  broken: readonly FileWithErrors[] = [],
  now: Date = new Date(),
): readonly OverviewHub[] {
  return hubs.map((hub) => ({
    id: hub.id,
    name: hub.name,
    items: [
      ...listings
        .filter((listing) => listing.hubId === hub.id)
        .map((listing) => itemOf(listing, now)),
      ...broken.filter((file) => file.hub === hub.id).map(brokenItemOf),
    ].toSorted((a, b) => a.name.localeCompare(b.name)),
  }));
}
