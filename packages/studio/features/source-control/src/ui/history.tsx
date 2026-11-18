import { Button, List, StatusChip } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import type { Version } from "../api.ts";
import type { ChangesList, HistoryState } from "../changes-list.ts";
import { historyWords } from "../changes-words.ts";
import { groupByDay, timeOfDay } from "../history-days.ts";
import { loadFailureReason } from "../load-failure.ts";
import type { OpenVersion } from "./use-open-version.ts";
import { VersionFacts } from "./version-page.tsx";

/** How many versions a phone shows before "See all history". */
const PHONE_HISTORY_ROWS = 5;

/** No version is marked "Not shared yet" when the page doesn't say which are. */
const NONE_UNSHARED: ReadonlySet<string> = new Set();

/** Props for {@link History}. */
export interface HistoryProps {
  readonly list: ChangesList;
  readonly history: HistoryState;
  /** The versions the shared copy lacks; on a phone they carry "Not shared yet". */
  readonly unshared?: ReadonlySet<string>;
  /** What time it is now, so "Today" and "Yesterday" are right. */
  readonly now?: Date;
  /** On a phone Show more and Try again are 48px touch buttons, and git's words say "your computer". */
  readonly phone?: boolean;
  /** On a phone a version opens as its own page; without it the details show beside the list. */
  readonly versionPage?: OpenVersion | undefined;
}

/**
 * History on the Changes page (checklist part 2, 2.9): the newest versions that touch the
 * workspace folder, grouped by day, newest first, with Show more for older ones. ↑ ↓ move and
 * Enter or a click shows the version's details beside the list: who, when, the notes and what's
 * in it. No branch graph.
 *
 * On a phone (2.14) a version opens as its own page through `versionPage`, and coming back puts
 * focus on its row, unfolding See all history if the row is past the newest 5. There (2.12) each
 * row ends in a chevron, and a version the shared copy lacks carries "Not shared yet".
 *
 * Not here yet: Restore just this and Go back.
 */
export function History({
  list,
  history,
  unshared = NONE_UNSHARED,
  now = new Date(),
  phone = false,
  versionPage,
}: HistoryProps) {
  const headingId = useId();
  const [pickedId, setPickedId] = useState<string>();
  const picked =
    versionPage === undefined
      ? history.versions.find((version) => version.id === pickedId)
      : undefined;
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
            unshared={unshared}
            now={now}
            phone={phone}
            pickedId={picked?.id}
            onPick={versionPage?.show ?? setPickedId}
            returnTo={versionPage?.returnTo}
            onReturned={versionPage?.focusPlaced}
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
  unshared,
  now,
  phone,
  pickedId,
  onPick,
  returnTo,
  onReturned,
}: {
  readonly list: ChangesList;
  readonly history: HistoryState;
  readonly unshared: ReadonlySet<string>;
  readonly now: Date;
  readonly phone: boolean;
  readonly pickedId: string | undefined;
  readonly onPick: (id: string) => void;
  /** The version whose page was just left: its row takes focus, unfolded if need be. */
  readonly returnTo?: string | undefined;
  readonly onReturned?: (() => void) | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const [seeAll, setSeeAll] = useState(
    () => history.versions.findIndex((version) => version.id === returnTo) >= PHONE_HISTORY_ROWS,
  );
  const focusRow = useFocusRow(returnTo, onReturned);
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
    focusRow.request(history.versions[PHONE_HISTORY_ROWS]?.id);
    setSeeAll(true);
  };
  return (
    <div ref={focusRow.region} className="contents">
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
              ...(phone && unshared.has(version.id) ? { trailing: notSharedChip } : {}),
            })),
          }))}
          // On a phone each version opens its own page; the kit draws the chevrons only there.
          chevrons
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
 * Puts focus on a version's row once it is drawn. Pressing See all history removes the button
 * that had focus, so focus moves to the first version the unfolded list shows instead of dropping
 * to the page. Coming back from a version's page, focus starts on that version's row
 * (`initialId`), and `onPlaced` says it is done.
 */
function useFocusRow(initialId: string | undefined, onPlaced: (() => void) | undefined) {
  const region = useRef<HTMLDivElement>(null);
  const [pendingId, setPendingId] = useState(initialId);
  const placed = useRef(onPlaced);
  placed.current = onPlaced;
  useEffect(() => {
    if (pendingId === undefined) return;
    const cell = region.current?.querySelector<HTMLElement>(
      `[data-row-id="${CSS.escape(pendingId)}"] [role="gridcell"]`,
    );
    cell?.focus();
    setPendingId(undefined);
    placed.current?.();
  }, [pendingId]);
  return { region, request: setPendingId };
}

/** The chip on a version the shared copy lacks; the kit puts it at the start of the meta line. */
const notSharedChip = <StatusChip tone="neutral">{historyWords.notShared}</StatusChip>;

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
      <VersionFacts version={version} level="details" />
    </section>
  );
}
