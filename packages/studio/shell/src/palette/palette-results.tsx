import { AlertIcon, Button, SkeletonBar } from "@halonicjs/studio-kit";
import type { MouseEvent, ReactNode } from "react";
import type { PaletteContent, PaletteRow } from "./palette-groups.ts";
import { type PaletteKindNames, paletteOptionName } from "./palette-options.ts";

/** Props for {@link PaletteResults}. */
export interface PaletteResultsProps {
  /** The listbox's id, which the search box controls. */
  readonly id: string;
  /** The typed words, as "Nothing matches" quotes them. */
  readonly words: string;
  readonly content: PaletteContent;
  /** Search providers are still looking, so two skeleton rows follow the names (T2-F23). */
  readonly searching: boolean;
  readonly activeKey: string | undefined;
  readonly kinds: PaletteKindNames;
  /** Why the palette couldn't search: the engine's `words.notAnswering` for this host. */
  readonly notAnswering: string;
  readonly iconFor?: ((row: PaletteRow) => ReactNode) | undefined;
  /** A click on a row; `inNewTab` with Ctrl (⌘ on macOS) or the middle button. */
  readonly onOpen: (row: PaletteRow, event: MouseEvent) => void;
  readonly onTryAgain: () => void;
}

/** The id of a row's option, for the search box's `aria-activedescendant`. */
export function paletteOptionId(listId: string, row: PaletteRow): string {
  return `${listId}-${row.key}`;
}

/**
 * What the palette shows under its search row (component specs 24.3, VK T2-F6, F22 to F25): the
 * "Couldn't search" or "Nothing matches" line when words find no place or item, then the groups,
 * each named by its title, then the skeleton rows while providers look.
 *
 * The groups are one `listbox`: the search box keeps the focus and points at the active option,
 * so a screen reader reads the option's name ("Support reply, workflow, switch to tab"). Nothing
 * in the list takes focus; a press on a row keeps it in the box.
 */
export function PaletteResults(props: PaletteResultsProps) {
  const { id, content, searching } = props;
  const words = props.words.trim();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {content.couldNotSearch ? (
        <CouldNotSearch reason={props.notAnswering} onTryAgain={props.onTryAgain} />
      ) : null}
      {content.nothingFound && !searching ? (
        // The second sentence, "Press Enter to search the text of every file.", comes with the
        // Search page (PR 12), so the line never points to a page that isn't there.
        <p className="px-4 pt-3 pb-2 text-body text-fg-muted">Nothing matches “{words}”.</p>
      ) : null}
      <div id={id} role="listbox" aria-label="Results" aria-busy={searching} className="p-2">
        {content.groups.map((group) => (
          // biome-ignore lint/a11y/useSemanticElements: a listbox's groups are `group`s, not fieldsets.
          <div key={group.id} role="group" aria-labelledby={`${id}-${group.id}`}>
            <div
              id={`${id}-${group.id}`}
              role="presentation"
              className="px-2 pt-2 pb-1 text-caption text-fg-muted"
            >
              {group.title}
            </div>
            {group.rows.map((row) => (
              <Row key={row.key} row={row} {...props} />
            ))}
          </div>
        ))}
        {searching ? <SearchingRows /> : null}
      </div>
    </div>
  );
}

// A 40px row, 8px between icon and name. The active one has the grey fill and the 2px accent bar
// (N1), so it isn't told by colour alone; in forced colours the bar is `Highlight`.
const rowBase = "flex h-10 cursor-default items-center gap-2 rounded-sm px-2 text-body text-fg";
const rowClasses = {
  active: `${rowBase} bg-surface-muted selected-bar selected-forced`,
  other: `${rowBase} hover:bg-surface-subtle`,
} as const;

function Row({
  id,
  row,
  activeKey,
  kinds,
  iconFor,
  onOpen,
}: PaletteResultsProps & {
  readonly row: PaletteRow;
}) {
  const active = row.key === activeKey;
  return (
    // The search box keeps the focus and takes the keys for every option (aria-activedescendant).
    // biome-ignore lint/a11y/useFocusableInteractive: options of a combobox's listbox never take focus.
    // biome-ignore lint/a11y/useKeyWithClickEvents: ↓ ↑ and Enter in the search box reach every option.
    <div
      id={paletteOptionId(id, row)}
      role="option"
      aria-selected={active}
      aria-label={paletteOptionName(row, kinds)}
      data-fill={active ? "muted" : undefined}
      className={active ? rowClasses.active : rowClasses.other}
      // The box keeps the focus, so typing goes on after a press.
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => onOpen(row, event)}
      onAuxClick={(event) => {
        if (event.button === 1) {
          onOpen(row, event);
        }
      }}
    >
      <span aria-hidden="true" className="size-icon-md shrink-0 text-fg-muted *:size-full">
        {iconFor?.(row)}
      </span>
      <span className="min-w-0 truncate">
        <Highlighted row={row} />
        {row.detail === undefined ? null : (
          <span className="ms-2 text-small text-fg-muted">{row.detail}</span>
        )}
      </span>
      {row.open ? (
        <span className="ms-auto shrink-0 text-small text-fg-muted">Switch to tab</span>
      ) : null}
    </div>
  );
}

/** The row's name with the typed words marked in `accent-soft`, as the phone's rows mark them. */
function Highlighted({ row }: { readonly row: PaletteRow }) {
  const { label, match } = row;
  if (match === undefined || match.start === match.end) {
    return <>{label}</>;
  }
  return (
    <>
      {label.slice(0, match.start)}
      <mark className="rounded-xs bg-accent-soft text-fg">
        {label.slice(match.start, match.end)}
      </mark>
      {label.slice(match.end)}
    </>
  );
}

/** "Couldn't search", the reason and **Try again**, start-aligned (VK T2-F25). */
function CouldNotSearch({
  reason,
  onTryAgain,
}: {
  readonly reason: string;
  readonly onTryAgain: () => void;
}) {
  return (
    <div className="flex gap-2 px-4 pt-3 pb-2">
      <span aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger *:size-full">
        <AlertIcon />
      </span>
      <div className="flex flex-col items-start gap-1">
        <p className="text-body text-fg">Couldn't search</p>
        <p className="text-small text-fg-muted">{reason}</p>
        <div className="mt-1">
          <Button size="sm" onClick={onTryAgain}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Two still skeleton rows, no spinner (microcopy 3.5, kit 19.3). */
function SearchingRows() {
  return (
    <div aria-hidden="true">
      {[0, 1].map((index) => (
        <div key={index} className="flex h-10 items-center gap-2 px-2">
          <SkeletonBar kind="icon" />
          <span className="w-24">
            <SkeletonBar kind="title" />
          </span>
          <span className="w-56">
            <SkeletonBar kind="meta" />
          </span>
        </div>
      ))}
    </div>
  );
}
