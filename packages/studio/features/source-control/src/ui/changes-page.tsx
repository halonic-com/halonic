import { EmptyState, ExternalLink, List } from "@halonicjs/studio-kit";
import type { PlaceViewProps } from "@halonicjs/studio-shell";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { type ChangesRead, type DeveloperView, DeveloperViewService } from "../api.ts";
import { type ChangesList, ChangesListService, type ChangesListState } from "../changes-list.ts";
import { pageWords, stateWords } from "../changes-words.ts";
import { loadFailureReason } from "../load-failure.ts";
import { ChangeList } from "./change-list.tsx";
import { CreateVersionDialog } from "./create-version-dialog.tsx";
import { GetUpdates } from "./get-updates.tsx";
import { History } from "./history.tsx";
import { IdentityDialog } from "./identity-dialog.tsx";

/** The Changes place's page: the open workspace's changes, from `ChangesListService`. */
export function ChangesPage({ context }: PlaceViewProps) {
  return (
    <ChangesView
      list={context.services.get(ChangesListService)}
      developerView={context.services.find(DeveloperViewService)}
    />
  );
}

/** Props for {@link ChangesView}. */
export interface ChangesViewProps {
  readonly list: ChangesList;
  /** Whether the developer view is on; without it the view is off. */
  readonly developerView?: DeveloperView | undefined;
}

/**
 * The Changes page on the desktop (checklist part 2, 2.2 and 2.10): "Changes" over what the
 * folder's history says: a first read's skeleton, why it couldn't load, "Keep a history of your
 * work", "Halonic needs git to keep versions.", or "Nothing has changed since your last version.".
 * A later read that fails keeps what the page showed (states D1).
 *
 * Not here yet: the sharing strip.
 */
export function ChangesView({ list, developerView }: ChangesViewProps) {
  const subscribe = useCallback((listener: () => void) => list.subscribe(listener), [list]);
  const state = useSyncExternalStore(subscribe, () => list.state);
  const developer = useDeveloperView(developerView);
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <div className="flex w-full flex-col gap-4 px-6 py-5">
      <header className="flex items-center gap-3">
        <h1 ref={heading} tabIndex={-1} className="text-title flex-1">
          {pageWords.title}
        </h1>
        {state.hasRemote ? <GetUpdates list={list} /> : null}
      </header>
      <PageBody
        list={list}
        state={state}
        developer={developer}
        focusHeading={() => heading.current?.focus()}
      />
      {list.needsIdentity && state.identity !== undefined ? (
        <IdentityDialog list={list} initial={state.identity} returnFocus={() => heading.current} />
      ) : null}
      {state.version === undefined || list.needsIdentity ? null : (
        <CreateVersionDialog
          list={list}
          files={list.versionFiles}
          returnFocus={() => heading.current}
        />
      )}
    </div>
  );
}

/** What comes under the heading, by what the last read said. */
function PageBody({
  list,
  state,
  developer,
  focusHeading,
}: {
  readonly list: ChangesList;
  readonly state: ChangesListState;
  readonly developer: boolean;
  readonly focusHeading: () => void;
}) {
  const retry = () => void list.refresh();
  const { read } = state;
  if (read === undefined && state.error !== undefined)
    return <LoadFailed list={list} state={state} focusHeading={focusHeading} />;
  if (read === undefined) return <Loading retry={retry} />;
  return (
    <>
      {state.error === undefined ? null : (
        <LoadFailed list={list} state={state} focusHeading={focusHeading} />
      )}
      <ReadBody
        list={list}
        state={state}
        read={read}
        developer={developer}
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
  developer,
  focusHeading,
}: {
  readonly list: ChangesList;
  readonly state: ChangesListState;
  readonly read: ChangesRead;
  readonly developer: boolean;
  readonly focusHeading: () => void;
}) {
  if (read.kind === "not-a-repository") {
    return <TurnOnHistory list={list} state={state} focusHeading={focusHeading} />;
  }
  if (read.kind === "no-git") return <NoGit list={list} />;
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
        <ChangeList list={list} files={state.files} developer={developer} />
      )}
      <History list={list} history={state.history} />
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
  focusHeading,
}: {
  readonly list: ChangesList;
  readonly state: ChangesListState;
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
        description={loadFailureReason(state.error)}
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
function NoGit({ list }: { readonly list: ChangesList }) {
  const [stillMissing, setStillMissing] = useState(false);
  const [busy, check] = useBusy(async () => {
    setStillMissing(false);
    await list.refresh();
    setStillMissing(list.state.read?.kind === "no-git" && list.state.error === undefined);
  });
  return (
    <>
      <EmptyState
        title={stateWords.noGitTitle}
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
