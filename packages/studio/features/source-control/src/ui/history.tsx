import { Button, List } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import type { Version } from "../api.ts";
import type { ChangesList, HistoryState } from "../changes-list.ts";
import { historyWords } from "../changes-words.ts";
import { fullDate, groupByDay, timeOfDay } from "../history-days.ts";
import { loadFailureReason } from "../load-failure.ts";

/** How many versions a phone shows before "See all history". */
const PHONE_HISTORY_ROWS = 5;

/** Props for {@link History}. */
export interface HistoryProps {
  readonly list: ChangesList;
  readonly history: HistoryState;
  /** What time it is now, so "Today" and "Yesterday" are right. */
  readonly now?: Date;
  /** On a phone Show more and Try again are 48px touch buttons, and git's words say "your computer". */
  readonly phone?: boolean;
}

/**
 * History on the Changes page (checklist part 2, 2.9): the newest versions that touch the
 * workspace folder, grouped by day, newest first, with Show more for older ones. ↑ ↓ move and
 * Enter or a click shows the version's details beside the list: who, when, the notes and what's
 * in it. No branch graph.
 *
 * Not here yet: Restore just this, Go back, and the shared marks.
 */
export function History({ list, history, now = new Date(), phone = false }: HistoryProps) {
  const headingId = useId();
  const [pickedId, setPickedId] = useState<string>();
  const picked = history.versions.find((version) => version.id === pickedId);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-heading">
        {historyWords.title}
      </h2>
      <div
        data-part="history-layout"
        className={
          picked === undefined ? "flex flex-col" : "grid gap-4 wide:grid-cols-2 wide:items-start"
        }
      >
        <div data-part="history-list" className="flex min-w-0 flex-col gap-3">
          <HistoryBody
            list={list}
            history={history}
            now={now}
            phone={phone}
            pickedId={picked?.id}
            onPick={setPickedId}
          />
        </div>
        {picked === undefined ? null : <Details version={picked} />}
      </div>
    </section>
  );
}

function HistoryBody({
  list,
  history,
  now,
  phone,
  pickedId,
  onPick,
}: {
  readonly list: ChangesList;
  readonly history: HistoryState;
  readonly now: Date;
  readonly phone: boolean;
  readonly pickedId: string | undefined;
  readonly onPick: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [seeAll, setSeeAll] = useState(false);
  const firstUnfolded = useFocusAfterUnfold();
  const failed = history.error !== undefined && (
    <div role="alert" className="flex flex-col items-start gap-2">
      <p className="text-body text-danger">
        {historyWords.loadFailed}. {loadFailureReason(history.error, phone)}
      </p>
      <Button
        variant="secondary"
        size={phone ? "touch" : "sm"}
        onClick={() => void list.refreshHistory()}
      >
        {historyWords.tryAgain}
      </Button>
    </div>
  );
  if (!history.loaded) {
    if (history.error !== undefined) return failed;
    return (
      <List
        label={historyWords.title}
        rows={[]}
        loading
        loadingLabel={historyWords.loading}
        onRetry={() => void list.refreshHistory()}
      />
    );
  }
  const showMore = async () => {
    setBusy(true);
    try {
      await list.showMoreHistory();
    } finally {
      setBusy(false);
    }
  };
  const folded = phone && !seeAll && history.versions.length > PHONE_HISTORY_ROWS;
  const shown = folded ? history.versions.slice(0, PHONE_HISTORY_ROWS) : history.versions;
  const unfold = () => {
    firstUnfolded.request(history.versions[PHONE_HISTORY_ROWS]?.id);
    setSeeAll(true);
  };
  return (
    <div ref={firstUnfolded.region} className="contents">
      {failed || null}
      {history.versions.length === 0 ? (
        <p className="text-body text-fg-muted">{historyWords.noVersions}</p>
      ) : (
        <List
          label={historyWords.title}
          groups={groupByDay(shown, now).map((day) => ({
            id: day.id,
            heading: { name: day.heading },
            rows: day.versions.map((version) => ({
              id: version.id,
              title: version.name,
              meta: `${version.author} · ${timeOfDay(version.at)}`,
            })),
          }))}
          {...(pickedId === undefined ? {} : { current: pickedId })}
          onOpen={onPick}
        />
      )}
      <HistoryFooter
        folded={folded}
        more={history.more}
        busy={busy}
        phone={phone}
        onSeeAll={unfold}
        onShowMore={() => void showMore()}
      />
    </div>
  );
}

/**
 * Pressing See all history removes the button that had focus. So that focus doesn't drop to the
 * page, it moves to the first version the unfolded list shows, once that row is drawn.
 */
function useFocusAfterUnfold() {
  const region = useRef<HTMLDivElement>(null);
  const [pendingId, setPendingId] = useState<string>();
  useEffect(() => {
    if (pendingId === undefined) return;
    const cell = region.current?.querySelector<HTMLElement>(
      `[data-row-id="${CSS.escape(pendingId)}"] [role="gridcell"]`,
    );
    cell?.focus();
    setPendingId(undefined);
  }, [pendingId]);
  return { region, request: setPendingId };
}

/** See all history (a folded phone list) or Show more (older versions to read): one or neither. */
function HistoryFooter({
  folded,
  more,
  busy,
  phone,
  onSeeAll,
  onShowMore,
}: {
  readonly folded: boolean;
  readonly more: boolean;
  readonly busy: boolean;
  readonly phone: boolean;
  readonly onSeeAll: () => void;
  readonly onShowMore: () => void;
}) {
  if (folded) {
    return (
      <div>
        <Button variant="secondary" size="touch" block onClick={onSeeAll}>
          {historyWords.seeAll}
        </Button>
      </div>
    );
  }
  if (!more) return null;
  return (
    <div>
      <Button
        variant="secondary"
        size={phone ? "touch" : "sm"}
        block={phone}
        busy={busy}
        onClick={onShowMore}
      >
        {historyWords.showMore}
      </Button>
    </div>
  );
}

/** The picked version: who, when, its notes and what's in it. Never only on hover. */
function Details({ version }: { readonly version: Version }) {
  return (
    <section
      aria-label={historyWords.detailsLabel(version.name)}
      className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-4 wide:sticky wide:top-4"
    >
      <h3 className="text-heading">{version.name}</h3>
      <p className="text-small text-fg-muted">
        {version.author} · {fullDate(version.at)}
      </p>
      {version.notes === "" ? null : (
        <p className="text-body whitespace-pre-wrap">{version.notes}</p>
      )}
      <h4 className="text-label text-fg-muted">
        {historyWords.whatsInIt} · {historyWords.fileCount(version.files.length)}
      </h4>
      {version.files.length === 0 ? (
        <p className="text-body text-fg-muted">{historyWords.noFiles}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {version.files.map((path) => (
            <li key={path} className="text-body break-all">
              {path}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
