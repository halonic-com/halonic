import {
  ChevronDownIcon,
  ChevronRightIcon,
  HeaderBadgeSheetDialog,
  isMenuItem,
  List,
  type ListRow,
  PlaceIcon,
  SettingsIcon,
  StatusChip,
} from "@halonicjs/studio-kit";
import { type ReactNode, useState } from "react";
import type { ShownPlace, SidebarPlace } from "../points/frame.ts";
import {
  letterMark,
  type SwitcherWorkspace,
  type WorkspaceSwitcherProps,
} from "../sidebar/workspace-switcher.tsx";
import { phonePlaceOf } from "./place-stacks.ts";

/** Props for {@link MorePage}. */
export interface MorePageProps {
  /**
   * The workspace switcher row, once the app has a workspace picker (T3). Without it, no row
   * shows, so the page never has a switcher that does nothing.
   */
  readonly switcher?: MorePageSwitcher | undefined;
  /**
   * The sidebar's switcher, for a desktop window as narrow as a phone, which has no sidebar: when
   * there is no `switcher`, its row opens the workspace menu as a sheet, so switching workspaces
   * still works at 320px (WCAG 1.4.10).
   */
  readonly menuSwitcher?: WorkspaceSwitcherProps | undefined;
  /**
   * The places the features added, from `showPlace`, as the sidebar gets them. Only the ones that
   * live under More are listed; Home, Inbox and Runs have the bottom navigation.
   */
  readonly places: readonly ShownPlace[];
  /** A row's tap. The caller opens the list above the More page (`openPhonePage`). */
  readonly onOpen: (place: SidebarPlace) => void;
  /**
   * A tap on the Settings row, last in the list: the window's `openSettings`. Without it, the page
   * has no Settings row, as the sidebar has none.
   */
  readonly onSettings?: (() => void) | undefined;
  /**
   * A header badge (component specs 20.1), such as the sample workspace's, shown on its own line
   * under the switcher row. Left out when there is none, and then it takes no room.
   */
  readonly badge?: ReactNode;
  /**
   * In the desktop app, where More shows only when the window is narrow or zoomed: the person is
   * on a computer already, so the footer line points at a wider window instead.
   */
  readonly inDesktopApp?: boolean | undefined;
}

/**
 * The phone's More page (component specs 15.2, VK T2-F11): a place, so the bottom navigation shows
 * with More highlighted. It holds what doesn't fit in the bottom navigation:
 *
 * - **The workspace switcher** as the first row, once the app has a workspace picker, 56px: the letter mark, the workspace's name over
 *   its folder, and a chevron. It is one button, named "Workspace: Acme. Change workspace". In a
 *   desktop window as narrow as a phone it opens the sidebar's workspace menu as a sheet.
 * - **The header badge**, when there is one, on its own 48px line under it, so the two are sibling
 *   targets and never one inside the other.
 * - **The lists**: a flush List of Agents, Workflows, Routines, Library and Changes, in that order
 *   and only where a feature added them, each with its icon and a chevron. Changes shows its count
 *   in place of the chevron. **Settings** ends the list, with its icon and a chevron, once the
 *   window has `openSettings` (it opens the Settings list page).
 * - **The footer line**: "Editing workflows is easier on a computer.", or in the desktop app
 *   "Editing workflows is easier in a wider window."
 *
 * The top bar already shows "More", so the page's `h1` is for screen readers only; the shell moves
 * focus to it after a move, as on every page.
 *
 * @example
 * <MorePage
 *   switcher={{ workspace: { name: "Acme", folder: "~/Work/acme" }, onChange: openWorkspacePicker }}
 *   places={shownPlaces}
 *   onOpen={(place) => setStacks(openPhonePage(stacks, { key: place, title: placeNames[place].label }, { list: true }))}
 * />
 */
export function MorePage({
  switcher,
  menuSwitcher,
  places,
  onOpen,
  onSettings,
  badge,
  inDesktopApp = false,
}: MorePageProps) {
  const rows = onSettings === undefined ? moreRows(places) : [...moreRows(places), settingsRow];
  return (
    <div className="flex flex-col">
      <h1 tabIndex={-1} className="sr-only">
        More
      </h1>
      <SwitcherRow switcher={switcher} menuSwitcher={menuSwitcher} />
      {/* Empty when the badges given all draw nothing, such as an untrusted sample's chip. A
          column stretches each badge's own line, so its divider runs full width like the rows'. */}
      {badge === undefined ? null : (
        <div className="mt-2 flex min-h-12 flex-col justify-center empty:hidden">{badge}</div>
      )}
      {rows.length === 0 ? null : (
        <div className="mt-2">
          <List
            label="More"
            rows={rows}
            flush
            onOpen={(id) => (id === settingsRowId ? onSettings?.() : onOpen(id))}
          />
        </div>
      )}
      <p className="px-4 py-3 text-small text-fg-subtle">
        {inDesktopApp ? footerLines.desktopApp : footerLines.phone}
      </p>
    </div>
  );
}

/** The footer line: on a phone, and in a narrow desktop app window (HAL-12962). */
const footerLines = {
  phone: "Editing workflows is easier on a computer.",
  desktopApp: "Editing workflows is easier in a wider window.",
} as const;

const settingsRowId = "settings";

/** The Settings row (56px like the others): its icon and a chevron. */
const settingsRow: ListRow<SidebarPlace | typeof settingsRowId> = {
  id: settingsRowId,
  title: "Settings",
  icon: <SettingsIcon />,
  trailing: (
    <span aria-hidden="true" className="size-icon-md text-fg-subtle *:size-full">
      <ChevronRightIcon />
    </span>
  ),
};

/** The places under More as List rows, in the sidebar's order, which is the More page's too. */
export function moreRows(
  places: readonly ShownPlace[],
): readonly ListRow<SidebarPlace | typeof settingsRowId>[] {
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

/** The More page's workspace switcher row: the workspace it shows, and what its tap does. */
export interface MorePageSwitcher {
  /** The open workspace, as the row shows it. */
  readonly workspace: SwitcherWorkspace;
  /** The row's tap: opens the workspace picker as a picker sheet (T3). */
  readonly onChange: () => void;
}

/** The More sheet's title for the workspace menu, as the served phone's picker sheet is titled. */
const workspaceSheetTitle = "Workspace";

/** The app's switcher row when there is one, else the sidebar's switcher's, else nothing. */
function SwitcherRow({ switcher, menuSwitcher }: Pick<MorePageProps, "switcher" | "menuSwitcher">) {
  if (switcher !== undefined) {
    return <WorkspaceRow {...switcher} />;
  }
  if (menuSwitcher === undefined) {
    return null;
  }
  return <MenuSwitcherRow {...menuSwitcher} />;
}

/**
 * The switcher row of a narrow desktop window: it opens the workspace menu's rows as the kit's
 * modal sheet over the window, so nothing behind it takes focus, and a picked row closes the
 * sheet before it does its job.
 */
function MenuSwitcherRow({ workspace, menu, busy = false }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const entries = menu.map((entry) =>
    isMenuItem(entry)
      ? {
          ...entry,
          onSelect: () => {
            setOpen(false);
            entry.onSelect();
          },
        }
      : entry,
  );
  return (
    <>
      <WorkspaceRow
        workspace={workspace}
        onChange={() => {
          // A workspace still opening ignores presses, as the sidebar's switcher does.
          if (!busy) setOpen(true);
        }}
      />
      {open ? (
        <HeaderBadgeSheetDialog
          title={workspaceSheetTitle}
          entries={entries}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/** The switcher row: 56px, padding 0 16px, the same mark as the sidebar's switcher. */
function WorkspaceRow({ workspace, onChange }: MorePageSwitcher) {
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
