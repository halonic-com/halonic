import { usePresentation } from "@halonicjs/studio-kit";
import { focusFellToPage, type ItemRef, type PlaceViewProps } from "@halonicjs/studio-shell";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  type ChangesRead,
  type DeveloperView,
  DeveloperViewService,
  type ShareChoice,
  ShareChoiceService,
  type Version,
} from "../api.ts";
import type { ChangeItem } from "../change-items.ts";
import { type ChangesList, ChangesListService, type ChangesListState } from "../changes-list.ts";
import { pageWords, stateWords } from "../changes-words.ts";
import { AddShareAddressDialog } from "./add-share-address-dialog.tsx";
import { ChangeList, orderItems } from "./change-list.tsx";
import { ChangesColumns, ChangesPane } from "./changes-columns.tsx";
import { GetUpdates } from "./get-updates.tsx";
import { History } from "./history.tsx";
import { LeftToGitCallout } from "./left-to-git-callout.tsx";
import { MergeChoices, MergeStrip } from "./merge-choices.tsx";
import {
  type ChangesPhonePages,
  type PhoneOpening,
  pushedPageOf,
  useChangesPhonePages,
  usePhoneOpening,
} from "./phone-pages.ts";
import { LoadFailed, Loading, NestedRepository, NoGit, TurnOnHistory } from "./read-states.tsx";
import { SharingLine } from "./sharing-line.tsx";
import { useFocusNewVersion } from "./use-focus-new-version.ts";
import { type OpenItem, useOpenItem } from "./use-open-item.ts";
import { historyOpening, type PaneSelection, usePaneSelection } from "./use-pane-selection.ts";
import { VersionDialogs } from "./version-dialogs.tsx";
import { VersionPage } from "./version-page.tsx";
import { WhatChangedPage } from "./whats-changed-page.tsx";

/**
 * The Changes place's page: the open workspace's changes, from `ChangesListService`. On a phone, an
 * item's What changed and a version are pages of their own above it (`sub`).
 */
export function ChangesPage(props: PlaceViewProps) {
  const { context } = props;
  const phonePages = useChangesPhonePages(props);
  return (
    <ChangesView
      list={context.services.get(ChangesListService)}
      developerView={context.services.find(DeveloperViewService)}
      shareChoice={context.services.find(ShareChoiceService)}
      openItem={context.openItem}
      phonePages={phonePages}
    />
  );
}

/** Props for {@link ChangesView}. */
export interface ChangesViewProps {
  readonly list: ChangesList;
  /** Whether the developer view is on; without it the view is off. */
  readonly developerView?: DeveloperView | undefined;
  /** Opens an item in this tab, for the What changed page's Open button; without it there is none. */
  readonly openItem?: ((item: ItemRef) => void) | undefined;
  /**
   * On a phone, the window's page stack, where an item's What changed and a version open as pages
   * of their own. Without it, as for a view drawn without a window, What changed opens in place of
   * the list with Back to Changes, and a version's details show under History.
   */
  readonly phonePages?: ChangesPhonePages | undefined;
  /** Create version's remembered "Share with your team right away"; without it the box starts off. */
  readonly shareChoice?: ShareChoice | undefined;
}

/**
 * The Changes page on the desktop (checklist part 2, 2.2 and 2.10), in a list column beside a
 * content pane (`source-control.list-column`): "Changes" over what the folder's history says: a
 * first read's skeleton, why it couldn't load, "Keep a history of your work", "Halonic needs git to
 * keep versions.", or "Nothing has changed since your last version.".
 * A later read that fails keeps what the page showed (states D1).
 *
 * On a phone (2.12) it is the same page in one column with a 16px inset: the top bar says
 * "Changes", so the heading is for screen readers only, and git's words say "your computer".
 * An item's What changed (2.13) and a version in History (2.14) open as pages of their own on the
 * phone's stack, whose top bar names them and has the one Back; Back puts focus on the row again.
 * The Get updates choices open as a page of their own too.
 *
 * Not here yet: the sharing strip's teammate-versions state.
 */
export function ChangesView({
  list,
  developerView,
  openItem,
  phonePages,
  shareChoice,
}: ChangesViewProps) {
  const phone = usePresentation() === "phone";
  const pages = phone ? phonePages : undefined;
  const subscribe = useCallback((listener: () => void) => list.subscribe(listener), [list]);
  const state = useSyncExternalStore(subscribe, () => list.state);
  const developer = useDeveloperView(developerView);
  const heading = useRef<HTMLHeadingElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const focusNewVersion = useFocusNewVersion(list, page);
  const [addingAddress, setAddingAddress] = useState(false);
  const [leftToGit, setLeftToGit] = useState(false);
  const items = orderItems(state.files);
  // Beside the pane, a read nobody asked for may close the item while focus is elsewhere: leave it.
  const nav = useOpenItem(items, () => {
    if (phone || focusFellToPage()) heading.current?.focus();
  });
  const selection = usePaneSelection(list, nav, page, !phone);
  const opening = usePhoneOpening(pages, items, state.history.versions);
  useFocusAfterChoices(state.choosing, () => heading.current?.focus());
  const pageClass = "flex w-full flex-col gap-4 p-4";
  const pushed = pushedPage({ list, pages, items, nav, openItem, phone });
  if (pushed !== undefined) return pushed;
  const content = (
    <>
      <header className="flex flex-wrap items-center gap-3">
        <h1 ref={heading} tabIndex={-1} className={phone ? "sr-only flex-1" : "text-title flex-1"}>
          {pageWords.title}
        </h1>
        {state.hasRemote ? (
          <span className="ml-auto">
            <GetUpdates list={list} phone={phone} onLeftToGit={setLeftToGit} />
          </span>
        ) : null}
      </header>
      <LeftToGitCallout shown={state.hasRemote && leftToGit} />
      {state.merge !== undefined && !state.choosing ? <MergeStrip list={list} /> : null}
      <SharingLine list={list} phone={phone} onAdd={() => setAddingAddress(true)} />
      <PageBody
        list={list}
        state={state}
        items={items}
        nav={nav}
        opening={opening}
        openItem={openItem}
        phone={phone}
        selection={phone ? undefined : selection}
        focusHeading={() => heading.current?.focus()}
      />
      {addingAddress ? (
        <AddShareAddressDialog
          list={list}
          onClose={() => setAddingAddress(false)}
          returnFocus={() => heading.current}
        />
      ) : null}
      <VersionDialogs
        list={list}
        state={state}
        opener="page"
        canShare={state.hasRemote && !phone}
        shareChoice={shareChoice}
        returnFocus={() => heading.current}
        onCreated={focusNewVersion}
      />
    </>
  );
  if (phone) {
    return (
      <div ref={page} className={pageClass}>
        {content}
      </div>
    );
  }
  return (
    <ChangesColumns
      listRef={page}
      pane={
        <ChangesPane
          list={list}
          state={state}
          items={items}
          open={nav.open}
          version={state.history.versions.find((version) => version.id === selection.versionId)}
          onVersionEscape={selection.focusVersionRow}
          developer={developer}
          openItem={openItem}
        />
      }
    >
      {content}
    </ChangesColumns>
  );
}

/**
 * When the Get updates choices close (Finish or Cancel, or a phone's Back), focus goes to the
 * Changes page's heading rather than being lost with the button that closed them: on a phone the
 * choices are a page of their own, on the desktop a section of this page. Focus that is still
 * somewhere on the page, as when a read finds the merge ended elsewhere, stays where it is.
 */
function useFocusAfterChoices(open: boolean, focus: () => void) {
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open && focusIsLost()) focus();
    wasOpen.current = open;
  }, [open, focus]);
}

/** Focus fell back to the page, as it does when the focused element is removed. */
function focusIsLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body;
}

/**
 * The page drawn instead of the Changes page on a phone, if one is open: a page on the stack above
 * it (`sub`), the Get updates choices, or an item's What changed opened in place. The desktop
 * draws these in the content pane beside the list (`source-control.list-column`).
 */
function pushedPage({
  list,
  pages,
  items,
  nav,
  openItem,
  phone,
}: {
  readonly list: ChangesList;
  readonly pages: ChangesPhonePages | undefined;
  readonly items: readonly ChangeItem[];
  readonly nav: OpenItem;
  readonly openItem: ((item: ItemRef) => void) | undefined;
  readonly phone: boolean;
}): ReactNode | undefined {
  if (!phone) return undefined;
  if (pages?.sub !== undefined) {
    return (
      <PhonePushedPage
        list={list}
        items={items}
        versions={list.state.history.versions}
        openItem={openItem}
        close={pages.close}
        sub={pages.sub}
      />
    );
  }
  if (nav.open !== undefined) {
    return (
      // The page draws its own inset, so its bottom bar can run edge to edge.
      <div className="flex min-h-full w-full flex-col">
        <WhatChangedPage
          list={list}
          item={nav.open}
          developer={false}
          openItem={openItem}
          onBack={nav.back}
          phone
        />
      </div>
    );
  }
  if (list.state.merge !== undefined && list.state.choosing) {
    return (
      // The page draws its own inset, so its bottom bar can run edge to edge.
      <div className="flex min-h-full w-full flex-col">
        <MergeChoices list={list} phone />
      </div>
    );
  }
  return undefined;
}

/**
 * On a phone, the page pushed above the Changes page: an item's What changed (2.13) or a version's
 * page (2.14), under a top bar that names it and has Back. When the item or the version is gone, as
 * after Undo these changes, the page closes and the list shows again.
 */
function PhonePushedPage({
  list,
  items,
  versions,
  openItem,
  close,
  sub,
}: {
  readonly list: ChangesList;
  readonly items: readonly ChangeItem[];
  readonly versions: readonly Version[];
  readonly openItem: ((item: ItemRef) => void) | undefined;
  readonly close: (sub: string) => void;
  readonly sub: string;
}) {
  const page = pushedPageOf(sub);
  const item = page?.kind === "item" ? items.find((each) => each.id === page.id) : undefined;
  const version =
    page?.kind === "version" ? versions.find((each) => each.id === page.id) : undefined;
  const gone = item === undefined && version === undefined;
  useEffect(() => {
    if (gone) close(sub);
  }, [gone, close, sub]);
  if (item !== undefined) {
    return (
      <div className="flex min-h-full w-full flex-col">
        {/* The phone's What changed has no developer view: its changes are in words only. */}
        <WhatChangedPage list={list} item={item} developer={false} openItem={openItem} phone />
      </div>
    );
  }
  if (version !== undefined) {
    return (
      // The page draws its own inset, so its bottom bar can run edge to edge.
      <div className="flex min-h-full w-full flex-col">
        <VersionPage version={version} list={list} />
      </div>
    );
  }
  return null;
}

/** What comes under the heading, by what the last read said. */
function PageBody({
  list,
  state,
  items,
  nav,
  opening,
  openItem,
  phone,
  selection,
  focusHeading,
}: {
  readonly list: ChangesList;
  readonly state: ChangesListState;
  readonly items: readonly ChangeItem[];
  readonly nav: OpenItem;
  readonly opening: PhoneOpening | undefined;
  readonly openItem: ((item: ItemRef) => void) | undefined;
  readonly phone: boolean;
  /** On the desktop, what the content pane shows; rows and versions open there. */
  readonly selection: PaneSelection | undefined;
  readonly focusHeading: () => void;
}) {
  const retry = () => void list.refresh();
  const { read } = state;
  if (read === undefined && state.error !== undefined)
    return <LoadFailed list={list} state={state} phone={phone} focusHeading={focusHeading} />;
  if (read === undefined) return <Loading retry={retry} />;
  return (
    <>
      {state.error === undefined ? null : (
        <LoadFailed list={list} state={state} phone={phone} focusHeading={focusHeading} />
      )}
      <ReadBody
        list={list}
        state={state}
        read={read}
        items={items}
        nav={nav}
        opening={opening}
        openItem={openItem}
        phone={phone}
        selection={selection}
        focusHeading={focusHeading}
      />
    </>
  );
}

/** What a read that worked says: the old one stays under a later failure's line. */
function ReadBody({
  list,
  state,
  read,
  items,
  nav,
  opening,
  openItem,
  phone,
  selection,
  focusHeading,
}: {
  readonly list: ChangesList;
  readonly state: ChangesListState;
  readonly read: ChangesRead;
  readonly items: readonly ChangeItem[];
  readonly nav: OpenItem;
  readonly opening: PhoneOpening | undefined;
  readonly openItem: ((item: ItemRef) => void) | undefined;
  readonly phone: boolean;
  readonly selection: PaneSelection | undefined;
  readonly focusHeading: () => void;
}) {
  if (read.kind === "not-a-repository") {
    return <TurnOnHistory list={list} state={state} focusHeading={focusHeading} />;
  }
  if (read.kind === "no-git") return <NoGit list={list} phone={phone} />;
  if (read.kind === "nested-repository") return <NestedRepository phone={phone} />;
  return (
    <>
      {read.changes.length === 0 ? (
        <p className="text-body text-fg-muted">{stateWords.nothingChanged}</p>
      ) : (
        <ChangeList
          list={list}
          items={items}
          onOpen={opening?.openItem ?? selection?.openRow ?? nav.show}
          openItem={openItem}
          current={nav.open?.id}
          besidePane={selection !== undefined}
          returnFocus={opening === undefined ? nav.returnFocus : opening.itemFocus}
          onFocusPlaced={nav.focusPlaced}
          phone={phone}
        />
      )}
      <History
        list={list}
        history={state.history}
        unshared={state.unsharedIds}
        phone={phone}
        {...historyOpening(opening, selection)}
      />
    </>
  );
}

/** Whether the developer view is on, read again when it is turned on or off. */
function useDeveloperView(view: DeveloperView | undefined): boolean {
  const subscribe = useCallback(
    (listener: () => void) => view?.subscribe(listener) ?? (() => undefined),
    [view],
  );
  return useSyncExternalStore(subscribe, () => view?.enabled() ?? false);
}
