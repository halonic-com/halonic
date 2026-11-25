import { Tabs } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { pullRequestWords } from "../pull-request-words.ts";
import type { PullRequestRow, PullRequests, PullRequestsState } from "../pull-requests.ts";
import { formatTime, minutesSince, type TeamClock } from "../team-format.ts";
import { type TeamLink, teamWords } from "../team-words.ts";
import { useKeepFocus } from "./keep-focus.ts";
import { LinkButton } from "./money-tiles.tsx";
import { PullRequestRowView, type WebLinkOpener } from "./pull-request-row.tsx";

/** The props of {@link PullRequestsPage}. */
export interface PullRequestsPageProps {
  readonly pullRequests: PullRequests;
  /** Opens a PR's GitHub page or a Paperclip page in the system browser. */
  readonly opener: WebLinkOpener;
  /** Opens the connection flow for "Connect again". */
  readonly onLink: (link: TeamLink) => void;
}

/** Still loading, the last good read (marked failed when a later read failed), or a failed first read. */
type Shown =
  | { kind: "loading" }
  | { kind: "read"; state: PullRequestsState; failed: boolean }
  | { kind: "failed" };

type Tab = "attention" | "open";

/** A snapshot older than this gets a named warning, never quietly old rows (Sofia's rule 0.5). */
const oldAfterMinutes = 30;

/**
 * The Pull requests screen (requirement `team.pull-requests`, HAL-17515
 * renders P1–P10): Needs attention with the stuck PRs worst first and those
 * coming up, and All open grouped by state. It reads when it opens, when a
 * source says it changed and on **Try again**. It only shows: nothing merges,
 * queues or approves from here, and links open outside the app.
 */
export function PullRequestsPage({ pullRequests, opener, onLink }: PullRequestsPageProps) {
  const [shown, setShown] = useState<Shown>({ kind: "loading" });
  // Grows on each change a source reports and on Try again, so the page reads again.
  const [changed, setChanged] = useState(0);
  const readAgain = () => setChanged((count) => count + 1);

  useEffect(() => pullRequests.watch(readAgain), [pullRequests]);

  useEffect(() => {
    let current = true;
    pullRequests.read().then(
      (state) => {
        if (current) setShown({ kind: "read", state, failed: false });
      },
      (error: unknown) => {
        console.error("Pull requests couldn't be read:", error);
        if (current) {
          setShown((before) =>
            before.kind === "read" ? { ...before, failed: true } : { kind: "failed" },
          );
        }
      },
    );
    return () => {
      current = false;
    };
  }, [pullRequests, changed]);

  // One frame for every state, so the main and h1 stay put when a read lands.
  return (
    <PullRequestsFrame shown={shown} clock={pullRequests.timeClock}>
      <ShownBody
        shown={shown}
        clock={pullRequests.timeClock}
        opener={opener}
        onLink={onLink}
        onTryAgain={readAgain}
      />
    </PullRequestsFrame>
  );
}

/** The page's main and h1 in every state, with the snapshot's freshness once there is a read. */
function PullRequestsFrame(props: { shown: Shown; clock: TeamClock; children: ReactNode }) {
  const { shown, clock } = props;
  const { heading, remember } = useKeepFocus();
  const busy = shown.kind === "loading";
  const read = shown.kind === "read" && shown.state.kind === "read" ? shown.state : undefined;
  return (
    <main
      aria-busy={busy ? "true" : undefined}
      aria-label={busy ? pullRequestWords.loadingSpoken : undefined}
      className="flex flex-col gap-3 p-3"
      onFocus={remember}
    >
      <header className="flex flex-wrap justify-between gap-x-4">
        <h1 ref={heading} tabIndex={-1} className="outline-none">
          {read === undefined ? pullRequestWords.place : pullRequestWords.title(read.repo)}
        </h1>
        {read === undefined ? null : <Freshness asOf={read.asOf} clock={clock} />}
      </header>
      {props.children}
    </main>
  );
}

/** What the frame holds: loading, a failed first read, why there are no rows, or the lists. */
function ShownBody(props: {
  shown: Shown;
  clock: TeamClock;
  opener: WebLinkOpener;
  onLink: (link: TeamLink) => void;
  onTryAgain: () => void;
}) {
  const { shown, clock } = props;
  if (shown.kind === "loading") return <p>{pullRequestWords.loading}</p>;
  if (shown.kind === "failed") {
    return (
      <p role="alert">
        {teamWords.notAnswering} <TryAgain onPress={props.onTryAgain} />
      </p>
    );
  }
  const { state } = shown;
  if (state.kind !== "read") return <Unavailable state={state} onLink={props.onLink} />;
  return (
    <>
      {shown.failed ? (
        <p role="alert">
          {pullRequestWords.offline(formatTime(state.asOf, clock))}{" "}
          <TryAgain onPress={props.onTryAgain} />
        </p>
      ) : null}
      <Lists rows={state.rows} clock={clock} opener={props.opener} />
    </>
  );
}

function TryAgain({ onPress }: { onPress: () => void }) {
  return (
    <button type="button" className="focus-ring text-small text-accent" onClick={onPress}>
      {teamWords.tryAgain}
    </button>
  );
}

/** No rows to show, and why. Never an empty list, which would look like nothing is wrong. */
function Unavailable(props: {
  state: Exclude<PullRequestsState, { kind: "read" }>;
  onLink: (link: TeamLink) => void;
}) {
  if (props.state.kind === "no-access") {
    return (
      <p>
        {pullRequestWords.cantRead} <LinkButton link="connect-again" onLink={props.onLink} />
      </p>
    );
  }
  return (
    <>
      <p>{pullRequestWords.notAvailable}</p>
      {props.state.kind === "no-snapshot" ? <p>{pullRequestWords.noSnapshot}</p> : null}
    </>
  );
}

function Freshness({ asOf, clock }: { asOf: string; clock: TeamClock }) {
  const minutes = minutesSince(asOf, clock);
  const line = teamWords.asOf(formatTime(asOf, clock), minutes);
  return minutes > oldAfterMinutes ? (
    <p role="status">{pullRequestWords.oldSnapshot(line)}</p>
  ) : (
    <p className="text-small text-fg-muted">{line}</p>
  );
}

/** Failing and conflicting first, then the oldest waits. */
function worstFirst(a: PullRequestRow, b: PullRequestRow): number {
  const rank = (row: PullRequestRow) =>
    row.stuck.includes("failing") || row.stuck.includes("conflicting") ? 0 : 1;
  return rank(a) - rank(b) || Date.parse(a.pullRequest.since) - Date.parse(b.pullRequest.since);
}

/**
 * Needs attention and All open as the kit's tabs: the selected list is shown by more than colour,
 * read as selected, and moved through with the arrow keys.
 */
function Lists(props: {
  rows: readonly PullRequestRow[];
  clock: TeamClock;
  opener: WebLinkOpener;
}) {
  const [tab, setTab] = useState<Tab>("attention");
  const tabList = useRef<HTMLDivElement>(null);
  // See all open removes itself, so focus moves to the All open tab instead of the page.
  const focusAllOpen = useRef(false);
  useEffect(() => {
    if (!focusAllOpen.current) return;
    focusAllOpen.current = false;
    tabList.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  });
  const seeAllOpen = () => {
    focusAllOpen.current = true;
    setTab("open");
  };
  const stuck = props.rows.filter((row) => row.stuck.length > 0).sort(worstFirst);
  const tabs = [
    { id: "attention", label: `${pullRequestWords.tabs.attention} ${stuck.length}` },
    { id: "open", label: `${pullRequestWords.tabs.open} ${props.rows.length}` },
  ] as const;
  const list = (title: string, rows: readonly PullRequestRow[]) => (
    <RowList key={title} title={title} rows={rows} clock={props.clock} opener={props.opener} />
  );
  return (
    <div ref={tabList}>
      <Tabs label={pullRequestWords.listsLabel} tabs={tabs} selected={tab} onSelect={setTab}>
        {props.rows.length === 0 ? <p>{pullRequestWords.noOpen}</p> : null}
        {props.rows.length > 0 && tab === "attention" ? (
          <>
            {stuck.length === 0 ? (
              <p>
                {pullRequestWords.nothingStuck(props.rows.length)}{" "}
                <button
                  type="button"
                  className="focus-ring text-small text-accent"
                  onClick={seeAllOpen}
                >
                  {pullRequestWords.seeAllOpen}
                </button>
              </p>
            ) : (
              list(pullRequestWords.stuckHeading, stuck)
            )}
            {list(pullRequestWords.comingUp, comingUp(props.rows))}
          </>
        ) : null}
        {tab === "open"
          ? byState(props.rows).map(([title, rows]) =>
              list(title === "" ? "" : `${title} · ${rows.length}`, rows),
            )
          : null}
      </Tabs>
    </div>
  );
}

/** PRs on their way in that aren't stuck: approved, then the queue in its order. */
function comingUp(rows: readonly PullRequestRow[]): readonly PullRequestRow[] {
  const place = (row: PullRequestRow) => row.pullRequest.queue?.position ?? 0;
  return rows
    .filter((row) => row.stuck.length === 0)
    .filter((row) => row.pullRequest.state === "approved" || row.pullRequest.state === "in-queue")
    .sort((a, b) => place(a) - place(b));
}

/** All open's groups in the state table's order, each with its rows; empty groups left out. */
function byState(rows: readonly PullRequestRow[]): readonly [string, readonly PullRequestRow[]][] {
  const groups = pullRequestWords.groups.map(
    ([state, title]): [string, readonly PullRequestRow[]] => [
      title,
      rows.filter((row) => row.pullRequest.state === state),
    ],
  );
  const named = new Set<string>(pullRequestWords.groups.map(([state]) => state));
  const rest = rows.filter((row) => !named.has(row.pullRequest.state));
  return [...groups, ["", rest] as [string, readonly PullRequestRow[]]].filter(
    ([, each]) => each.length > 0,
  );
}

function RowList(props: {
  title: string;
  rows: readonly PullRequestRow[];
  clock: TeamClock;
  opener: WebLinkOpener;
}) {
  if (props.rows.length === 0) return null;
  return (
    <section aria-label={props.title || undefined}>
      {props.title === "" ? null : <h2>{props.title}</h2>}
      <ul>
        {props.rows.map((row) => (
          <PullRequestRowView
            key={row.pullRequest.id}
            row={row}
            clock={props.clock}
            opener={props.opener}
          />
        ))}
      </ul>
    </section>
  );
}
