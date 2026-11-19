import { EmptyState, ExternalLink, List, usePresentation } from "@halonicjs/studio-kit";
import type { ItemRef, PlaceViewProps } from "@halonicjs/studio-shell";
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { type ChangesRead, type DeveloperView, DeveloperViewService } from "../api.ts";
import type { ChangeItem } from "../change-items.ts";
import { type ChangesList, ChangesListService, type ChangesListState } from "../changes-list.ts";
import { pageWords, phoneWords, stateWords } from "../changes-words.ts";
import { loadFailureReason } from "../load-failure.ts";
import { AddShareAddressDialog } from "./add-share-address-dialog.tsx";
import { ChangeList, orderItems } from "./change-list.tsx";
import { GetUpdates } from "./get-updates.tsx";
import { History } from "./history.tsx";
import { MergeChoices, MergeStrip } from "./merge-choices.tsx";
import {
  CouldntCheckStrip,
  NotSharedStrip,
  SharingStrip,
  UpToDateStrip,
} from "./sharing-strip.tsx";
import { type OpenItem, useOpenItem } from "./use-open-item.ts";
import { type OpenVersion, useOpenVersion } from "./use-open-version.ts";
import { VersionDialogs } from "./version-dialogs.tsx";
import { VersionPage } from "./version-page.tsx";
import { WhatChangedPage } from "./whats-changed-page.tsx";

/** The Changes place's page: the open workspace's changes, from `ChangesListService`. */
export function ChangesPage({ context }: PlaceViewProps) {
  return (
    <ChangesView
      list={context.services.get(ChangesListService)}
      developerView={context.services.find(DeveloperViewService)}
      openItem={context.openItem}
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
}

/**
 * The Changes page on the desktop (checklist part 2, 2.2 and 2.10): "Changes" over what the
 * folder's history says: a first read's skeleton, why it couldn't load, "Keep a history of your
 * work", "Halonic needs git to keep versions.", or "Nothing has changed since your last version.".
 * A later read that fails keeps what the page showed (states D1).
 *
 * On a phone (2.12) it is the same page in one column with a 16px inset: the top bar says
 * "Changes", so the heading is for screen readers only, and git's words say "your computer".
 * A version in History, and the Get updates choices, open as their own pages (2.14).
 *
 * Not here yet: the sharing strip's teammate-versions state.
 */
export function ChangesView({ list, developerView, openItem }: ChangesViewProps) {
  const phone = usePresentation() === "phone";
  const subscribe = useCallback((listener: () => void) => list.subscribe(listener), [list]);
  const state = useSyncExternalStore(subscribe, () => list.state);
  const developer = useDeveloperView(developerView);
  const heading = useRef<HTMLHeadingElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const focusNewVersion = useFocusNewVersion(list, page);
  const [addingAddress, setAddingAddress] = useState(false);
  const items = orderItems(state.files);
  const nav = useOpenItem(items, () => heading.current?.focus());
  const versionNav = useOpenVersion(state.history.versions);
  useFocusAfterChoices(phone && state.choosing, () => heading.current?.focus());
  const pageClass = `flex w-full flex-col gap-4 ${phone ? "p-4" : "px-6 py-5"}`;
  const pushed = pushedPage({ list, nav, versionNav, developer, openItem, phone, pageClass });
  if (pushed !== undefined) return pushed;
  return (
    <div ref={page} className={pageClass}>
      <header className="flex items-center gap-3">
        <h1 ref={heading} tabIndex={-1} className={phone ? "sr-only flex-1" : "text-title flex-1"}>
          {pageWords.title}
        </h1>
        {state.hasRemote ? (
          <span className="ml-auto">
            <GetUpdates list={list} phone={phone} />
          </span>
        ) : null}
      </header>
      {state.merge !== undefined && !state.choosing ? <MergeStrip list={list} /> : null}
      {state.merge !== undefined && state.choosing && !phone ? (
        <MergeChoices list={list} phone={false} />
      ) : null}
      <SharingLine list={list} phone={phone} onAdd={() => setAddingAddress(true)} />
      <PageBody
        list={list}
        state={state}
        items={items}
        nav={nav}
        versionPage={phone ? versionNav : undefined}
        openItem={openItem}
        phone={phone}
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
        returnFocus={() => heading.current}
        onCreated={focusNewVersion}
      />
    </div>
  );
}

/**
 * On a phone, the Get updates choices are a page of their own; when it closes (Back, Finish or
 * Cancel) focus goes to the Changes page's heading rather than being lost with the page.
 */
function useFocusAfterChoices(pushed: boolean, focus: () => void) {
  const wasPushed = useRef(pushed);
  useEffect(() => {
    if (wasPushed.current && !pushed) focus();
    wasPushed.current = pushed;
  }, [pushed, focus]);
}

/**
 * The page pushed over the Changes page, if one is open: an item's What changed, or on a phone
 * the Get updates choices or a version's page.
 */
function pushedPage({
  list,
  nav,
  versionNav,
  developer,
  openItem,
  phone,
  pageClass,
}: {
  readonly list: ChangesList;
  readonly nav: OpenItem;
  readonly versionNav: OpenVersion;
  readonly developer: boolean;
  readonly openItem: ((item: ItemRef) => void) | undefined;
  readonly phone: boolean;
  readonly pageClass: string;
}): ReactNode | undefined {
  if (nav.open !== undefined) {
    return (
      // On a phone the page draws its own inset, so its bottom bar can run edge to edge.
      <div className={phone ? "flex min-h-full w-full flex-col" : pageClass}>
        <WhatChangedPage
          list={list}
          item={nav.open}
          developer={developer}
          openItem={openItem}
          onBack={nav.back}
          phone={phone}
        />
      </div>
    );
  }
  if (phone && list.state.merge !== undefined && list.state.choosing) {
    return (
      // The page draws its own inset, so its bottom bar can run edge to edge.
      <div className="flex min-h-full w-full flex-col">
        <MergeChoices list={list} phone />
      </div>
    );
  }
  if (phone && versionNav.open !== undefined) {
    return (
      <div className={pageClass}>
        <VersionPage version={versionNav.open} onBack={versionNav.back} />
      </div>
    );
  }
  return undefined;
}

/**
 * The sharing strip's state now: no address, versions the shared copy lacks, the shared copy
 * couldn't be asked, or everything shared and up to date; else none. On the phone only the
 * no-address line shows.
 */
function SharingLine({
  list,
  phone,
  onAdd,
}: {
  readonly list: ChangesList;
  readonly phone: boolean;
  readonly onAdd: () => void;
}) {
  const { read, hasRemote, merge, unshared, sharing, sharedCheck } = list.state;
  if (read?.kind === "ready" && !hasRemote) return <SharingStrip onAdd={onAdd} phone={phone} />;
  const notShared = unshared > 0 || sharing;
  if (!hasRemote || merge !== undefined || phone) return null;
  if (notShared) return <NotSharedStrip list={list} />;
  if (sharedCheck.kind === "failed")
    return <CouldntCheckStrip list={list} reason={sharedCheck.reason} />;
  if (sharedCheck.kind === "checked" && sharedCheck.waiting === 0) return <UpToDateStrip />;
  return null;
}

/** What comes under the heading, by what the last read said. */
function PageBody({
  list,
  state,
  items,
  nav,
  versionPage,
  openItem,
  phone,
  focusHeading,
}: {
  readonly list: ChangesList;
  readonly state: ChangesListState;
  readonly items: readonly ChangeItem[];
  readonly nav: OpenItem;
  readonly versionPage: OpenVersion | undefined;
  readonly openItem: ((item: ItemRef) => void) | undefined;
  readonly phone: boolean;
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
        versionPage={versionPage}
        openItem={openItem}
        phone={phone}
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
  versionPage,
  openItem,
  phone,
  focusHeading,
}: {
  readonly list: ChangesList;
  readonly state: ChangesListState;
  readonly read: ChangesRead;
  readonly items: readonly ChangeItem[];
  readonly nav: OpenItem;
  readonly versionPage: OpenVersion | undefined;
  readonly openItem: ((item: ItemRef) => void) | undefined;
  readonly phone: boolean;
  readonly focusHeading: () => void;
}) {
  if (read.kind === "not-a-repository") {
    return <TurnOnHistory list={list} state={state} focusHeading={focusHeading} />;
  }
  if (read.kind === "no-git") return <NoGit list={list} phone={phone} />;
  if (read.kind === "nested-repository") {
    return (
      <EmptyState
        tone="error"
        align="start"
        title={stateWords.loadFailed}
        description={stateWords.nestedRepository}
      />
    );
  }
  return (
    <>
      {read.changes.length === 0 ? (
        <p className="text-body text-fg-muted">{stateWords.nothingChanged}</p>
      ) : (
        <ChangeList
          list={list}
          items={items}
          onOpen={nav.show}
          openItem={openItem}
          returnFocus={nav.returnFocus}
          onFocusPlaced={nav.focusPlaced}
          phone={phone}
        />
      )}
      <History
        list={list}
        history={state.history}
        unshared={state.unsharedIds}
        phone={phone}
        versionPage={versionPage}
      />
    </>
  );
}

/**
 * Creating a version closes its dialog, and focus goes back to the Create version button. With
 * nothing left to version that button is gone a moment later, and focus would drop to the page
 * (WCAG 2.4.3). So focus moves on to what the person just made: History's first row, the new
 * version, once the page has read again. When that read failed, the first row isn't the new
 * version, so focus stays where the dialog put it, and the failure's alert says why.
 */
function useFocusNewVersion(list: ChangesList, page: RefObject<HTMLElement | null>): () => void {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) return;
    setPending(false);
    page.current
      ?.querySelector<HTMLElement>('[data-part="history-list"] [data-row-id] [role="gridcell"]')
      ?.focus();
  }, [pending, page]);
  return () => {
    const { error, history } = list.state;
    if (error === undefined && history.error === undefined) setPending(true);
  };
}

/** Whether the developer view is on, read again when it is turned on or off. */
function useDeveloperView(view: DeveloperView | undefined): boolean {
  const subscribe = useCallback(
    (listener: () => void) => view?.subscribe(listener) ?? (() => undefined),
    [view],
  );
  return useSyncExternalStore(subscribe, () => view?.enabled() ?? false);
}

/** Runs `work`, and says while it runs so a button can show it's busy. */
function useBusy(work: () => Promise<void>): readonly [boolean, () => void] {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const start = () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    void work().finally(() => {
      running.current = false;
      setBusy(false);
    });
  };
  return [busy, start];
}

/** Why the last read failed, with Try again; over the old page when one read had worked. */
function LoadFailed({
  list,
  state,
  phone,
  focusHeading,
}: {
  readonly list: ChangesList;
  readonly state: ChangesListState;
  readonly phone: boolean;
  readonly focusHeading: () => void;
}) {
  const [busy, retry] = useBusy(async () => {
    await list.refresh();
    // Try again is gone once the read works, so focus goes to the heading.
    if (list.state.error === undefined) focusHeading();
  });
  // An alert, so a screen reader says so once when the line appears over a page that looked fine.
  return (
    <div role="alert">
      <EmptyState
        tone="error"
        align="start"
        title={stateWords.loadFailed}
        description={loadFailureReason(state.error, phone)}
        action={{ label: stateWords.tryAgain, onClick: retry, busy }}
      />
    </div>
  );
}

/** Skeleton rows until the first read answers (states D1). */
function Loading({ retry }: { readonly retry: () => void }) {
  return (
    <List
      label={pageWords.title}
      rows={[]}
      columns={[{ kind: "main" }]}
      loading
      loadingLabel={stateWords.loading}
      onRetry={retry}
    />
  );
}

/** The folder has no git history yet: one button makes it one. */
function TurnOnHistory({
  list,
  state,
  focusHeading,
}: {
  readonly list: ChangesList;
  readonly state: ChangesListState;
  readonly focusHeading: () => void;
}) {
  const turnOn = async () => {
    await list.turnOnHistory();
    // The button is gone once history is on, so focus goes to the heading.
    if (list.state.turnOnError === undefined) focusHeading();
  };
  return (
    <>
      <EmptyState
        title={stateWords.notARepositoryTitle}
        description={stateWords.notARepositoryBody}
        action={{
          label: stateWords.turnOnHistory,
          onClick: () => void turnOn(),
          busyLabel: stateWords.turningOnHistory,
          ...(state.turningOn ? { busy: true } : {}),
        }}
      />
      <p className="text-small text-fg-muted">{stateWords.historyIsOff}</p>
      {state.turnOnError === undefined ? null : (
        <p role="alert" className="text-small text-danger">
          {stateWords.turnOnFailed}. {loadFailureReason(state.turnOnError)}
        </p>
      )}
    </>
  );
}

/** git isn't installed: a way to get it, and Check again for when the person has. */
function NoGit({ list, phone }: { readonly list: ChangesList; readonly phone: boolean }) {
  const [stillMissing, setStillMissing] = useState(false);
  const [busy, check] = useBusy(async () => {
    setStillMissing(false);
    await list.refresh();
    setStillMissing(list.state.read?.kind === "no-git" && list.state.error === undefined);
  });
  return (
    <>
      <EmptyState
        title={phone ? phoneWords.noGitTitle : stateWords.noGitTitle}
        description={
          <ExternalLink href={stateWords.installGitAddress}>{stateWords.installGit}</ExternalLink>
        }
        action={{
          label: stateWords.checkAgain,
          onClick: check,
          busyLabel: stateWords.checking,
          busy,
        }}
      />
      <p role="status" className="text-small text-fg-muted empty:hidden">
        {stillMissing ? stateWords.stillNoGit : null}
      </p>
    </>
  );
}
