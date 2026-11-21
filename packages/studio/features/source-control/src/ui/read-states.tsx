import { Callout, EmptyState, ExternalLink, List } from "@halonicjs/studio-kit";
import { useRef, useState } from "react";
import type { ChangesList, ChangesListState } from "../changes-list.ts";
import { pageWords, phoneWords, stateWords } from "../changes-words.ts";
import { loadFailureReason } from "../load-failure.ts";

/**
 * What the Changes page shows in place of its list when a read didn't give one (states D1): the
 * first read's skeleton, why a read failed, a folder without history, a computer without git, and a
 * folder inside a larger repository.
 */

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
export function LoadFailed({
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
export function Loading({ retry }: { readonly retry: () => void }) {
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
export function TurnOnHistory({
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
export function NoGit({ list, phone }: { readonly list: ChangesList; readonly phone: boolean }) {
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

/**
 * A folder inside a larger git repository: the shell won't run git on a repository whose top is
 * outside the opened folder. Nothing here can change that, so no Try again and no Turn on history,
 * which would make a second repository.
 */
export function NestedRepository({ phone }: { readonly phone: boolean }) {
  return (
    <Callout tone="info">
      {phone ? phoneWords.nestedRepository : stateWords.nestedRepository}
    </Callout>
  );
}
