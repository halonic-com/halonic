import { EmptyState, ExternalLink, List } from "@halonicjs/studio-kit";
import type { PlaceViewProps } from "@halonicjs/studio-shell";
import { useCallback, useSyncExternalStore } from "react";
import { type ChangesList, ChangesListService, type ChangesListState } from "../changes-list.ts";
import { pageWords, stateWords } from "../changes-words.ts";
import { loadFailureReason } from "../load-failure.ts";

/** The Changes place's page: the open workspace's changes, from `ChangesListService`. */
export function ChangesPage({ context }: PlaceViewProps) {
  return <ChangesView list={context.services.get(ChangesListService)} />;
}

/** Props for {@link ChangesView}. */
export interface ChangesViewProps {
  readonly list: ChangesList;
}

/**
 * The Changes page on the desktop (checklist part 2, 2.2 and 2.10): "Changes" over what the
 * folder's history says: a first read's skeleton, why it couldn't load, "Keep a history of your
 * work", "Halonic needs git to keep versions.", or "Nothing has changed since your last version.".
 * A later read that fails keeps what the page showed (states D1).
 *
 * Not here yet: the changed items themselves, Create version, History and the sharing strip.
 */
export function ChangesView({ list }: ChangesViewProps) {
  const subscribe = useCallback((listener: () => void) => list.subscribe(listener), [list]);
  const state = useSyncExternalStore(subscribe, () => list.state);
  return (
    <div className="flex w-full flex-col gap-4 px-6 py-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-title">{pageWords.title}</h1>
      </header>
      <PageBody list={list} state={state} />
    </div>
  );
}

/** What comes under the heading, by what the last read said. */
function PageBody({
  list,
  state,
}: {
  readonly list: ChangesList;
  readonly state: ChangesListState;
}) {
  const retry = () => void list.refresh();
  const { read } = state;
  if (read === undefined && state.error !== undefined) {
    return (
      <EmptyState
        tone="error"
        align="start"
        title={stateWords.loadFailed}
        description={loadFailureReason(state.error)}
        action={{ label: stateWords.tryAgain, onClick: retry }}
      />
    );
  }
  if (read === undefined) return <Loading retry={retry} />;
  if (read.kind === "not-a-repository") return <TurnOnHistory list={list} state={state} />;
  if (read.kind === "no-git") return <NoGit retry={retry} />;
  if (read.changes.length === 0) {
    return <p className="text-body text-fg-muted">{stateWords.nothingChanged}</p>;
  }
  return <p className="text-body text-fg-muted">{pageWords.changedFiles(read.changes.length)}</p>;
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
}: {
  readonly list: ChangesList;
  readonly state: ChangesListState;
}) {
  return (
    <>
      <EmptyState
        title={stateWords.notARepositoryTitle}
        description={stateWords.notARepositoryBody}
        action={{
          label: stateWords.turnOnHistory,
          onClick: () => void list.turnOnHistory(),
          ...(state.turningOn ? { busy: true } : {}),
        }}
      />
      {state.turnOnError === undefined ? null : (
        <p role="alert" className="text-small text-danger">
          {stateWords.turnOnFailed}. {loadFailureReason(state.turnOnError)}
        </p>
      )}
    </>
  );
}

/** git isn't installed: a way to get it, and Check again for when the person has. */
function NoGit({ retry }: { readonly retry: () => void }) {
  return (
    <EmptyState
      title={stateWords.noGitTitle}
      description={
        <ExternalLink href={stateWords.installGitAddress}>{stateWords.installGit}</ExternalLink>
      }
      action={{ label: stateWords.checkAgain, onClick: retry }}
    />
  );
}
