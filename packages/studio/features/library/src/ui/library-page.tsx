import type { LibraryItemKind } from "@halonicjs/app";
import {
  Button,
  TabList,
  TabPanel,
  usePresentation,
  useTabIds,
  useToastStore,
} from "@halonicjs/studio-kit";
import { errorMessageFor, OverviewPage } from "@halonicjs/studio-shell";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteWords, phoneCanDelete } from "../delete-words.ts";
import type { LibraryEntry, LibraryItemsHost, LibraryListing } from "../library-items-host.ts";
import { entryOfRow, type LibraryEntryPlace, libraryOverview } from "../library-overview.ts";
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
import { type FocusTarget, focusRow, targetAfterRemoving, visibleRowIds } from "../row-focus.ts";

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
  readonly onOpenAsFile?: (kind: LibraryItemKind, entry: LibraryEntryPlace) => void;
  /** The New button of a tab that has one. Without it, no tab shows the button. */
  readonly onNew?: (kind: LibraryItemKind) => void;
  /** The Knowledge empty state's button. Without it, the empty state has no button. */
  readonly onOpenDocsFolder?: () => void;
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

/**
 * The Library: one sentence, four tabs (Skills, Knowledge, Collections, Connectors) and, under
 * them, the shell's overview page with that tab's items and their "Used by". The Library
 * place shows it ({@link LibraryPlace}).
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
}: LibraryPageProps) {
  const phone = usePresentation() === "phone";
  const ids = useTabIds();
  const tabs = useMemo(() => libraryKinds.map((each) => ({ id: each, label: tabLabel(each) })), []);
  const { load, retry } = useListing(host, kind);
  const overview = useMemo(
    () => (load.state === "loaded" ? libraryOverview(load.listing) : { hubs: [] }),
    [load],
  );
  const label = newLabel(kind);
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

  // A phone shows one kind's list on its own page, with no tabs to be a panel of.
  const content = (
    <>
      {load.state === "loaded" && load.stale !== undefined && (
        <p className="flex flex-wrap items-center gap-2 px-4 py-2 text-small text-fg-muted">
          {showingLastList(kind, load.stale.reason)}
          <Button
            variant="ghost"
            busy={load.refreshing === true}
            busyLabel={tryingAgain}
            onClick={retry}
          >
            Try again
          </Button>
        </p>
      )}
      <OverviewPage
        key={kind}
        {...overview}
        words={overviewWords(kind, {
          phone,
          ...(onOpenDocsFolder === undefined ? {} : { onOpenDocsFolder }),
          ...(onNew !== undefined && label !== undefined ? { onNew: () => onNew(kind) } : {}),
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
        itemMenu={(row) => [
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
          ...(onOpenAsFile === undefined
            ? []
            : [
                {
                  id: "open-as-file",
                  label: deleteWords.openAsFile,
                  onSelect: () => onOpenAsFile(kind, entryOfRow(row.id)),
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
        ]}
        onOpen={(row) => onOpen(kind, entryOfRow(row))}
        onOpenInNewTab={(row) => onOpenInNewTab(kind, entryOfRow(row))}
        {...(onNew !== undefined && label !== undefined
          ? { newButton: { label, onClick: () => onNew(kind) } }
          : {})}
      />
    </>
  );

  return (
    <div ref={page}>
      {/* On a phone the top bar names the kind's list, so the heading says the same. */}
      <h1 className={phone ? "sr-only" : "px-4 pt-4 text-title"}>
        {phone ? tabLabel(kind) : "Library"}
      </h1>
      <p className="px-4 pt-2 text-small text-fg-muted">{tabSentence(kind)}</p>
      {!phone && (
        <div className="px-4 py-2">
          <TabList label="Library" tabs={tabs} selected={kind} onSelect={onKindChange} ids={ids} />
        </div>
      )}
      {phone ? (
        content
      ) : (
        <TabPanel ids={ids} tabs={tabs} selected={kind}>
          {content}
        </TabPanel>
      )}
    </div>
  );
}
