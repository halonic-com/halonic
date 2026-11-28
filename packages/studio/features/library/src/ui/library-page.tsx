import type { LibraryItemKind } from "@halonicjs/app";
import { type BrokenFileActions, brokenFileMenu } from "@halonicjs/studio-feature-files/api";
import {
  Button,
  FilterChips,
  PlusIcon,
  usePresentation,
  useToastStore,
} from "@halonicjs/studio-kit";
import {
  brokenFileWords,
  errorMessageFor,
  type FilesWithErrorsSource,
  type FileWithErrors,
  type FocusTarget,
  focusRow,
  OverviewPage,
  targetAfterRemoving,
  useBrokenFiles,
  useRefocusWhenGone,
  useTellWhenGoneWithFocus,
  visibleRowIds,
} from "@halonicjs/studio-shell";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteWords, phoneCanDelete } from "../delete-words.ts";
import type { LibraryEntry, LibraryItemsHost, LibraryListing } from "../library-items-host.ts";
import {
  brokenRowId,
  entryOfRow,
  type LibraryEntryPlace,
  libraryOverview,
} from "../library-overview.ts";
import {
  couldntLoad,
  libraryKinds,
  newLabel,
  overviewWords,
  showingLastList,
  tabLabel,
  tabSentence,
  tryingAgain,
} from "../library-words.ts";
import { removeItem } from "../remove-item.ts";

/** The props of {@link LibraryPage}. */
export interface LibraryPageProps {
  /** The open workspace's items. The place's view takes it from the app's services. */
  readonly host: LibraryItemsHost;
  /** The tab that shows. The app keeps it for each workspace. */
  readonly kind: LibraryItemKind;
  readonly onKindChange: (kind: LibraryItemKind) => void;
  readonly onOpen: (kind: LibraryItemKind, entry: LibraryEntryPlace) => void;
  readonly onOpenInNewTab: (kind: LibraryItemKind, entry: LibraryEntryPlace) => void;
  /** Opens the item's file in a tab. Without it, a row's menu has no Open as file. */
  readonly onOpenAsFile?: (kind: LibraryItemKind, entry: LibraryEntryPlace, name: string) => void;
  /** The New button of a tab that has one. Without it, no tab shows the button. */
  readonly onNew?: (kind: LibraryItemKind) => void;
  /** The Knowledge empty state's button. Without it, the empty state has no button. */
  readonly onOpenDocsFolder?: () => void;
  /** Reads how many items a search or hub change left (`announcer.announceState`); absent in tests that don't listen. */
  readonly announceState?: ((key: string, text: string) => void) | undefined;
  /** The workspace's files with errors: a connector file that didn't load keeps its row (C348 ST4). */
  readonly filesWithErrors?: FilesWithErrorsSource;
  /** What a broken file's row and its ⋮ menu do; without it the row opens nothing and has no menu. */
  readonly brokenActions?: BrokenFileActions;
}

type Load =
  | { readonly state: "loading" }
  | {
      readonly state: "failed";
      readonly host: LibraryItemsHost;
      readonly kind: LibraryItemKind;
      readonly reason?: string;
    }
  | {
      readonly state: "loaded";
      readonly host: LibraryItemsHost;
      readonly kind: LibraryItemKind;
      readonly listing: LibraryListing;
      /** A later read failed: the list stays, and the page says so above it. */
      readonly stale?: { readonly reason?: string };
      /** Try again is reading while the list stays. */
      readonly refreshing?: boolean;
    };

/** Why a read failed, for the user: a system message never reaches them. */
function failureReason(error: unknown, kind: LibraryItemKind): string | undefined {
  const message = errorMessageFor(error, { title: couldntLoad(kind) });
  const reason = message.body.trim();
  return message.kind === "internal" || reason === "" ? undefined : reason;
}

/** The tab's items from the host, read again when the host says something changed or after Try again. */
function useListing(
  host: LibraryItemsHost,
  kind: LibraryItemKind,
): { load: Load; retry: () => void } {
  const [stored, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    let latest = 0;
    const read = () => {
      const mine = ++latest;
      const wanted = () => current && mine === latest;
      host.list(kind).then(
        (listing) => wanted() && setLoad({ state: "loaded", host, kind, listing }),
        (error: unknown) => {
          if (!wanted()) return;
          const reason = failureReason(error, kind);
          const why = reason === undefined ? {} : { reason };
          // A list that was read stays on screen when a later read fails.
          setLoad((was) =>
            was.state === "loaded" && was.host === host && was.kind === kind
              ? { ...was, stale: why, refreshing: false }
              : { state: "failed", host, kind, ...why },
          );
        },
      );
    };
    // The same tab's list stays while it is read again; another tab's, or another workspace's, is not this one's.
    setLoad((was) =>
      was.state === "loaded" && was.host === host && was.kind === kind
        ? { ...was, refreshing: true }
        : { state: "loading" },
    );
    read();
    const stop = host.subscribe(read);
    return () => {
      current = false;
      stop();
    };
  }, [host, kind, attempt]);

  // A result of the tab or workspace just left isn't this one's: until its own read lands, it is loading.
  const load: Load =
    stored.state !== "loading" && (stored.host !== host || stored.kind !== kind)
      ? { state: "loading" }
      : stored;
  return { load, retry: useCallback(() => setAttempt((count) => count + 1), []) };
}

/** The listing's entry at a place. */
function findEntry(listing: LibraryListing, place: LibraryEntryPlace): LibraryEntry | undefined {
  const entries =
    place.hub === null
      ? (listing.shared?.entries ?? [])
      : (listing.hubs.find((hub) => hub.id === place.hub)?.entries ?? []);
  return entries.find((entry) => entry.id === place.id);
}

/** The broken rows of a tab other than Connectors: none, kept the same so the rows aren't made again. */
const noBrokenFiles: readonly FileWithErrors[] = [];

/**
 * The kinds' chips, Connectors with the count of its files that didn't load: "Connectors 1", read
 * "Connectors, 1 problem" (C348 ST4).
 */
function libraryChips(brokenConnectors: number) {
  return libraryKinds.map((each) => ({
    value: each,
    label: tabLabel(each),
    ...(each === "connector" && brokenConnectors > 0
      ? {
          count: {
            value: brokenConnectors,
            tone: "danger" as const,
            name: brokenFileWords.problems(brokenConnectors),
          },
        }
      : {}),
  }));
}

/** The kind's New button; none for a kind without one (Knowledge) or without `onNew`. */
function kindNewButton(
  kind: LibraryItemKind,
  onNew: ((kind: LibraryItemKind) => void) | undefined,
): { readonly label: string; readonly onClick: () => void } | undefined {
  const label = newLabel(kind);
  if (onNew === undefined || label === undefined) return undefined;
  return { label, onClick: () => onNew(kind) };
}

/**
 * Whether the overview shows its search and New: not on a failed read, nor for an empty list,
 * whose New is its empty state's own button.
 */
function showsListHead(load: Load, overview: ReturnType<typeof libraryOverview>): boolean {
  if (load.state === "failed") return false;
  if (load.state === "loading") return true;
  return (
    overview.hubs.some((hub) => hub.items.length > 0) || (overview.shared?.items.length ?? 0) > 0
  );
}

/**
 * The page's title. On the desktop the list column is narrow, so New sits on the title's line, or
 * wraps under "Library" where the column is too narrow for both, and the search keeps the full width; on a phone the top bar names the kind's list, so the heading
 * says the same, for screen readers only. Margin, not padding: the shell focuses the heading, and
 * its focus ring must fit inside the scrolling page.
 */
function LibraryTitle({
  phone,
  kind,
  newButton,
}: {
  readonly phone: boolean;
  readonly kind: LibraryItemKind;
  readonly newButton: { readonly label: string; readonly onClick: () => void } | undefined;
}) {
  if (phone) return <h1 className="sr-only">{tabLabel(kind)}</h1>;
  return (
    <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-title">Library</h1>
      {newButton && (
        <Button variant="primary" icon={<PlusIcon />} onClick={newButton.onClick}>
          {newButton.label}
        </Button>
      )}
    </div>
  );
}

/**
 * The line above a list that a later read couldn't refresh, with Try again; tells
 * `onGoneWithFocus` if it goes while Try again holds the focus.
 */
function StaleLine({
  kind,
  reason,
  refreshing,
  onTryAgain,
  onGoneWithFocus,
}: {
  readonly kind: LibraryItemKind;
  readonly reason: string | undefined;
  readonly refreshing: boolean;
  readonly onTryAgain: () => void;
  readonly onGoneWithFocus: () => void;
}) {
  const tryAgain = useRef<HTMLButtonElement>(null);
  useTellWhenGoneWithFocus(tryAgain, onGoneWithFocus);
  return (
    // As Home's failure line: Try again on its own row, pulled out by the ghost button's edge and
    // padding, so its label starts where the sentence starts (HAL-20925).
    <p className="flex flex-col items-start gap-1 px-4 py-2 text-small text-fg-muted">
      <span>{showingLastList(kind, reason)}</span>
      <span className="-ms-3.25 phone:-ms-4.25 touch:-ms-4.25">
        <Button
          ref={tryAgain}
          variant="ghost"
          busy={refreshing}
          busyLabel={tryingAgain}
          onClick={onTryAgain}
        >
          Try again
        </Button>
      </span>
    </p>
  );
}

/**
 * The Library's list: on the desktop, four kind chips (Skills, Knowledge, Collections,
 * Connectors) and, under them, the shell's overview page with that kind's items and their "Used
 * by"; on a phone, one kind's sentence and its items, with no chips. The Library place shows it in
 * the list column ({@link LibraryPlace}).
 */
export function LibraryPage({
  host,
  kind,
  onKindChange,
  onOpen,
  onOpenInNewTab,
  onOpenAsFile,
  onNew,
  onOpenDocsFolder,
  announceState,
  filesWithErrors,
  brokenActions = {},
}: LibraryPageProps) {
  const phone = usePresentation() === "phone";
  const brokenConnectors = useBrokenFiles(filesWithErrors, "connector");
  const chips = useMemo(() => libraryChips(brokenConnectors.length), [brokenConnectors.length]);
  const { load, retry } = useListing(host, kind);
  // Only connectors are files the shared check reads; the other tabs have no broken rows.
  const broken = kind === "connector" ? brokenConnectors : noBrokenFiles;
  const brokenOf = (row: string) => broken.find((file) => brokenRowId(file) === row);
  const overview = useMemo(
    () => (load.state === "loaded" ? libraryOverview(load.listing, broken) : { hubs: [] }),
    [load, broken],
  );
  const newButton = kindNewButton(kind, onNew);
  const newInTitle = !phone && showsListHead(load, overview);
  const toasts = useToastStore();
  const page = useRef<HTMLDivElement>(null);
  const emptyTitle = useRef<HTMLHeadingElement>(null);
  // Where focus goes once it can: a restored row only shows when the list is read again.
  // It waits for the list that was on screen when it was set to be replaced, then is dropped
  // if it still isn't there (a search can hide the restored row).
  const pendingFocus = useRef<{ target: FocusTarget; listAtStart: Load } | undefined>(undefined);
  const latestLoad = useRef(load);
  latestLoad.current = load;
  const applyFocus = useCallback(() => {
    const pending = pendingFocus.current;
    if (pending === undefined || page.current === null) return;
    const { target } = pending;
    const shown =
      target === "empty" ? emptyTitle.current !== null : focusRow(page.current, target.row);
    if (target === "empty") emptyTitle.current?.focus();
    const listReadAgain =
      latestLoad.current.state === "loaded" && latestLoad.current !== pending.listAtStart;
    if (shown || listReadAgain) pendingFocus.current = undefined;
  }, []);
  // Runs after every render, to catch the row or the empty state when it appears.
  useEffect(applyFocus);
  // The stale-list line goes once a read works. If its Try again held the focus and the focus fell
  // to the page, it moves to the first row, or to the empty state's title when there is none.
  const staleLineGone = useRefocusWhenGone(() => {
    const first = page.current === null ? undefined : visibleRowIds(page.current)[0];
    if (page.current !== null && first !== undefined) focusRow(page.current, first);
    else emptyTitle.current?.focus();
  });
  const focusOn = (target: FocusTarget) => {
    pendingFocus.current = { target, listAtStart: latestLoad.current };
    applyFocus();
  };
  const remove = (row: string) => {
    const place = entryOfRow(row);
    const entry = load.state === "loaded" ? findEntry(load.listing, place) : undefined;
    if (entry === undefined || page.current === null) return;
    const after = targetAfterRemoving(visibleRowIds(page.current), row);
    void removeItem(
      host,
      toasts,
      { kind, place, name: entry.name, usage: entry.usage },
      { onRemoved: () => focusOn(after), onRestored: () => focusOn({ row }) },
    );
  };
  // A broken file has no page: its row opens the file at its first problem.
  const open = (row: string, inNewTab: boolean) => {
    const file = brokenOf(row);
    if (file !== undefined) brokenActions.open?.(file);
    else if (inNewTab) onOpenInNewTab(kind, entryOfRow(row));
    else onOpen(kind, entryOfRow(row));
  };
  // A broken row's Delete moves focus as an item's does: to the next row, and back on Undo.
  const brokenMenu = (file: FileWithErrors, row: string) =>
    brokenFileMenu(file, brokenActions, {
      removed: () => {
        if (page.current !== null) focusOn(targetAfterRemoving(visibleRowIds(page.current), row));
      },
      restored: () => focusOn({ row }),
    });

  // An item's ⋮: Open, Open in new tab, and Open as file and Delete where the window can.
  const itemMenu = (row: { readonly id: string; readonly name: string }) => [
    {
      id: "open",
      label: deleteWords.open,
      onSelect: () => onOpen(kind, entryOfRow(row.id)),
    },
    {
      id: "open-in-new-tab",
      label: deleteWords.openInNewTab,
      onSelect: () => onOpenInNewTab(kind, entryOfRow(row.id)),
    },
    // On a phone only the kinds whose rows keep a ⋮ for Delete offer it (flow-library 8.3).
    ...(onOpenAsFile === undefined || (phone && !phoneCanDelete(kind))
      ? []
      : [
          {
            id: "open-as-file",
            label: deleteWords.openAsFile,
            onSelect: () => onOpenAsFile(kind, entryOfRow(row.id), row.name),
          },
        ]),
    // A phone can't remove what it can't make again, so only some kinds keep Delete.
    ...(phone && !phoneCanDelete(kind)
      ? []
      : [
          {
            id: "delete",
            label: deleteWords.delete,
            danger: true,
            onSelect: () => remove(row.id),
          },
        ]),
  ];

  return (
    <div ref={page}>
      <LibraryTitle phone={phone} kind={kind} newButton={newInTitle ? newButton : undefined} />
      {/* On the desktop the content pane beside the list column says what the kind is. */}
      {phone && <p className="px-4 pt-2 text-small text-fg-muted">{tabSentence(kind)}</p>}
      {/* A phone shows one kind's list on its own page, so it has no chips. */}
      {!phone && (
        <FilterChips label="Library" options={chips} value={kind} onChange={onKindChange} />
      )}
      {load.state === "loaded" && load.stale !== undefined && (
        <StaleLine
          kind={kind}
          reason={load.stale.reason}
          refreshing={load.refreshing === true}
          onTryAgain={retry}
          onGoneWithFocus={staleLineGone}
        />
      )}
      <OverviewPage
        key={kind}
        {...overview}
        announceState={announceState}
        words={overviewWords(kind, {
          phone,
          ...(onOpenDocsFolder === undefined ? {} : { onOpenDocsFolder }),
          ...(newButton === undefined ? {} : { onNew: newButton.onClick }),
        })}
        quietWhenEmpty
        emptyTitleRef={emptyTitle}
        loading={load.state === "loading"}
        {...(load.state === "failed"
          ? {
              failure: {
                title: couldntLoad(kind),
                ...(load.reason === undefined ? {} : { reason: load.reason }),
                onTryAgain: retry,
              },
            }
          : {})}
        itemMenu={(row) => {
          const file = brokenOf(row.id);
          return file === undefined ? itemMenu(row) : brokenMenu(file, row.id);
        }}
        onOpen={(row) => open(row, false)}
        onOpenInNewTab={(row) => open(row, true)}
        {...(newButton === undefined || newInTitle ? {} : { newButton })}
      />
    </div>
  );
}
