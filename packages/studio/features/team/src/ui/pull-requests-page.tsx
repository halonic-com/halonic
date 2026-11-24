import { useEffect, useState } from "react";
import { pullRequestWords } from "../pull-request-words.ts";
import type { PullRequestRow, PullRequests, PullRequestsState } from "../pull-requests.ts";
import { formatTime, minutesSince, type TeamClock } from "../team-format.ts";
import { type TeamLink, teamWords } from "../team-words.ts";
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

  if (shown.kind === "loading") {
    return (
      <main aria-busy="true" aria-label={pullRequestWords.loadingSpoken}>
        <h1>{pullRequestWords.place}</h1>
        <p>{pullRequestWords.loading}</p>
      </main>
    );
  }
  if (shown.kind === "failed") {
    return (
      <main>
        <h1>{pullRequestWords.place}</h1>
        <p role="alert">
          {teamWords.notAnswering} <TryAgain onPress={readAgain} />
        </p>
      </main>
    );
  }
  const { state } = shown;
  if (state.kind !== "read") return <Unavailable state={state} onLink={onLink} />;
  return (
    <main className="flex flex-col gap-3 p-3">
      <Freshness asOf={state.asOf} repo={state.repo} clock={pullRequests.timeClock} />
      {shown.failed ? (
        <p role="alert">
          {pullRequestWords.offline(formatTime(state.asOf, pullRequests.timeClock))}{" "}
          <TryAgain onPress={readAgain} />
        </p>
      ) : null}
      <Tabs rows={state.rows} clock={pullRequests.timeClock} opener={opener} />
    </main>
  );
}

function TryAgain({ onPress }: { onPress: () => void }) {
  return (
    <button type="button" className="text-small text-accent" onClick={onPress}>
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
      <main>
        <h1>{pullRequestWords.place}</h1>
        <p>
          {pullRequestWords.cantRead} <LinkButton link="connect-again" onLink={props.onLink} />
        </p>
      </main>
    );
  }
  return (
    <main>
      <h1>{pullRequestWords.place}</h1>
      <p>{pullRequestWords.notAvailable}</p>
      {props.state.kind === "no-snapshot" ? <p>{pullRequestWords.noSnapshot}</p> : null}
    </main>
  );
}

function Freshness({ asOf, repo, clock }: { asOf: string; repo: string; clock: TeamClock }) {
  const minutes = minutesSince(asOf, clock);
  const line = teamWords.asOf(formatTime(asOf, clock), minutes);
  return (
    <header className="flex justify-between">
      <h1>{pullRequestWords.title(repo)}</h1>
      {minutes > oldAfterMinutes ? (
        <p role="status">{pullRequestWords.oldSnapshot(line)}</p>
      ) : (
        <p className="text-small text-fg-muted">{line}</p>
      )}
    </header>
  );
}

/** Failing and conflicting first, then the oldest waits. */
function worstFirst(a: PullRequestRow, b: PullRequestRow): number {
  const rank = (row: PullRequestRow) =>
    row.stuck.includes("failing") || row.stuck.includes("conflicting") ? 0 : 1;
  return rank(a) - rank(b) || Date.parse(a.pullRequest.since) - Date.parse(b.pullRequest.since);
}

function Tabs(props: { rows: readonly PullRequestRow[]; clock: TeamClock; opener: WebLinkOpener }) {
  const [tab, setTab] = useState<Tab>("attention");
  const stuck = props.rows.filter((row) => row.stuck.length > 0).sort(worstFirst);
  const tabButton = (which: Tab, count: number) => (
    <button type="button" aria-pressed={tab === which} onClick={() => setTab(which)}>
      {pullRequestWords.tabs[which]} {count}
    </button>
  );
  const list = (title: string, rows: readonly PullRequestRow[]) => (
    <RowList key={title} title={title} rows={rows} clock={props.clock} opener={props.opener} />
  );
  return (
    <>
      <nav className="flex gap-2">
        {tabButton("attention", stuck.length)}
        {tabButton("open", props.rows.length)}
      </nav>
      {props.rows.length === 0 ? <p>{pullRequestWords.noOpen}</p> : null}
      {props.rows.length > 0 && tab === "attention" ? (
        <>
          {stuck.length === 0 ? (
            <p>
              {pullRequestWords.nothingStuck(props.rows.length)}{" "}
              <button
                type="button"
                className="text-small text-accent"
                onClick={() => setTab("open")}
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
    </>
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
