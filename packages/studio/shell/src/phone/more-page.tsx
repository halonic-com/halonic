import {
  ChevronDownIcon,
  ChevronRightIcon,
  List,
  type ListRow,
  PlaceIcon,
  StatusChip,
} from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import type { ShownPlace, SidebarPlace } from "../points/frame.ts";
import { letterMark, type SwitcherWorkspace } from "../sidebar/workspace-switcher.tsx";
import { phonePlaceOf } from "./place-stacks.ts";

/** Props for {@link MorePage}. */
export interface MorePageProps {
  /** The open workspace, as the switcher row shows it. */
  readonly workspace: SwitcherWorkspace;
  /** The switcher row's tap: opens the workspace picker as a picker sheet (T3). */
  readonly onChangeWorkspace: () => void;
  /**
   * The places the features added, from `showPlace`, as the sidebar gets them. Only the ones that
   * live under More are listed; Home, Inbox and Runs have the bottom navigation.
   */
  readonly places: readonly ShownPlace[];
  /** A row's tap. The caller opens the list above the More page (`openPhonePage`). */
  readonly onOpen: (place: SidebarPlace) => void;
  /**
   * A header badge (component specs 20.1), such as the sample workspace's, shown on its own line
   * under the switcher row. Left out when there is none, and then it takes no room.
   */
  readonly badge?: ReactNode;
}

/**
 * The phone's More page (component specs 15.2, VK T2-F11): a place, so the bottom navigation shows
 * with More highlighted. It holds what doesn't fit in the bottom navigation:
 *
 * - **The workspace switcher** as the first row, 56px: the letter mark, the workspace's name over
 *   its folder, and a chevron. It is one button, named "Workspace: Acme. Change workspace".
 * - **The header badge**, when there is one, on its own 48px line under it, so the two are sibling
 *   targets and never one inside the other.
 * - **The lists**: a flush List of Agents, Workflows, Routines, Library and Changes, in that order
 *   and only where a feature added them, each with its icon and a chevron. Changes shows its count
 *   in place of the chevron. Settings joins the end when its feature (T11) gives it an icon.
 * - **The footer line**: "Editing workflows is easier on a computer."
 *
 * The top bar already shows "More", so the page's `h1` is for screen readers only; the shell moves
 * focus to it after a move, as on every page.
 *
 * @example
 * <MorePage
 *   workspace={{ name: "Acme", folder: "~/Work/acme" }}
 *   onChangeWorkspace={openWorkspacePicker}
 *   places={shownPlaces}
 *   onOpen={(place) => setStacks(openPhonePage(stacks, { key: place, title: placeNames[place].label }, { list: true }))}
 * />
 */
export function MorePage({ workspace, onChangeWorkspace, places, onOpen, badge }: MorePageProps) {
  const rows = moreRows(places);
  return (
    <div className="flex flex-col">
      <h1 tabIndex={-1} className="sr-only">
        More
      </h1>
      <WorkspaceRow workspace={workspace} onChange={onChangeWorkspace} />
      {badge === undefined ? null : (
        <div className="mt-2 flex min-h-12 items-center ps-15">{badge}</div>
      )}
      {rows.length === 0 ? null : (
        <div className="mt-2">
          <List label="More" rows={rows} flush onOpen={(id) => onOpen(id)} />
        </div>
      )}
      <p className="px-4 py-3 text-small text-fg-subtle">
        Editing workflows is easier on a computer.
      </p>
    </div>
  );
}

/** The places under More as List rows, in the sidebar's order, which is the More page's too. */
export function moreRows(places: readonly ShownPlace[]): readonly ListRow<SidebarPlace>[] {
  return places
    .filter((place) => phonePlaceOf(place.id) === "more")
    .map((place) => ({
      id: place.id,
      title: place.label,
      icon: <PlaceIcon name={place.id} />,
      trailing: <RowEnd place={place} />,
    }));
}

/** One job on the right edge (component specs 6): the count when there is one, else a chevron. */
function RowEnd({ place }: { readonly place: ShownPlace }) {
  if (place.signal?.mark === "count") {
    return (
      <StatusChip tone="accent" shape="count" name={place.signal.spoken}>
        {place.signal.value}
      </StatusChip>
    );
  }
  return (
    <span aria-hidden="true" className="size-icon-md text-fg-subtle *:size-full">
      <ChevronRightIcon />
    </span>
  );
}

interface WorkspaceRowProps {
  readonly workspace: SwitcherWorkspace;
  readonly onChange: () => void;
}

/** The switcher row: 56px, padding 0 16px, the same mark as the sidebar's switcher. */
function WorkspaceRow({ workspace, onChange }: WorkspaceRowProps) {
  return (
    <button
      type="button"
      aria-label={`Workspace: ${workspace.name}. Change workspace`}
      onClick={onChange}
      className="flex min-h-14 w-full min-w-0 items-center gap-3 border-b border-border px-4 py-2 text-start outline-none focus-ring-inset active:bg-surface-muted"
    >
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-body-strong text-accent-text"
      >
        {letterMark(workspace.name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-strong text-fg">{workspace.name}</span>
        <span className="truncate text-small text-fg-muted">{workspace.folder}</span>
      </span>
      <span aria-hidden="true" className="size-icon-md shrink-0 text-fg-subtle *:size-full">
        <ChevronDownIcon />
      </span>
    </button>
  );
}
