import type { MessagingId } from "@halonicjs/ports";
import { Callout, EmptyState, LockIcon, SkeletonBar } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { pullRequestWords } from "../pull-request-words.ts";
import type { PullRequests, PullRequestsState } from "../pull-requests.ts";
import { formatTime, minutesSince, type TeamClock } from "../team-format.ts";
import { type TeamLink, teamWords } from "../team-words.ts";
import { LinkButton, TeamLinks } from "./money-tiles.tsx";
import { PageFrame, TryAgain } from "./page-frame.tsx";
import { listBox } from "./pr-list-parts.tsx";
import { PullRequestDetailPage } from "./pull-request-detail.tsx";
import { PullRequestLists } from "./pull-request-lists.tsx";
import { OpenPullRequest, pullRequestKey, type WebLinkOpener } from "./pull-request-row.tsx";

/** The props of {@link PullRequestsPage}. */
export interface PullRequestsPageProps {
  readonly pullRequests: PullRequests;
  /** Opens a PR's GitHub page or a Paperclip page in the system browser. */
  readonly opener: WebLinkOpener;
  /** Opens the connection flow for "Connect again". Without it, the screen draws no link buttons. */
  readonly onLink?: ((link: TeamLink) => void) | undefined;
}

/** Still loading, the last good read (marked failed when a later read failed), or a failed first read. */
type Shown =
  | { kind: "loading" }
  | { kind: "read"; state: PullRequestsState; failed: boolean }
  | { kind: "failed" };

/** A snapshot older than this gets a named warning, never quietly old rows (Sofia's rule 0.5). */
const oldAfterMinutes = 30;

/**
 * The Pull requests screen (requirement `team.pull-requests`, HAL-17515
 * renders P1–P10, P18–P22): Needs attention with the stuck PRs worst first and
 * those coming up, All open grouped by state, the merge queue and Merged today. A row's title
 * opens the PR's own page (P12–P17) in place. It reads when it opens, when a
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

  const clock = pullRequests.timeClock;
  const read = shown.kind === "read" && shown.state.kind === "read" ? shown.state : undefined;
  const { opened, open, back, list } = useOpenedPullRequest();
  // One frame for every state, so the main and h1 stay put when a read lands. The lists stay
  // mounted under a PR's page, so Back finds the same tab and the title that opened it.
  return (
    <TeamLinks.Provider value={onLink === undefined ? "none" : "on"}>
      <OpenPullRequest.Provider value={open}>
        <div ref={list} hidden={opened !== undefined}>
          <PageFrame
            title={<PageTitle repo={read?.repo} />}
            loadingSpoken={pullRequestWords.loadingSpoken}
            busy={shown.kind === "loading"}
            freshness={freshness(shown, read, clock)}
          >
            <ShownBody
              shown={shown}
              clock={clock}
              opener={opener}
              onLink={onLink ?? noLink}
              onTryAgain={readAgain}
            />
          </PageFrame>
        </div>
      </OpenPullRequest.Provider>
      {opened === undefined ? null : (
        <PullRequestDetailPage
          pullRequests={pullRequests}
          id={opened}
          opener={opener}
          onBack={back}
        />
      )}
    </TeamLinks.Provider>
  );
}

/**
 * The PR whose page is open, if any. Back closes it and focuses the title that opened it again,
 * since the page that had focus goes away (WCAG 2.4.3).
 */
function useOpenedPullRequest() {
  const [opened, setOpened] = useState<MessagingId | undefined>(undefined);
  // A new object on each Back, so coming back to the same PR twice still moves focus.
  const [cameBack, setCameBack] = useState<{ id: MessagingId } | undefined>(undefined);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (cameBack === undefined) return;
    const key = pullRequestKey(cameBack.id);
    const titles = list.current?.querySelectorAll<HTMLElement>("[data-opens]") ?? [];
    const title = [...titles].find((each) => each.dataset["opens"] === key);
    title?.querySelector("button")?.focus();
  }, [cameBack]);
  const back = () => {
    if (opened !== undefined) setCameBack({ id: opened });
    setOpened(undefined);
  };
  return { opened, open: setOpened, back, list };
}

/** Never called: with no `onLink`, no link button is drawn. */
function noLink(): void {}

/** "Pull requests · halonic", the repo muted; the place's name alone before a repo is known. */
function PageTitle({ repo }: { repo: string | undefined }) {
  if (repo === undefined) return pullRequestWords.place;
  return (
    <>
      {pullRequestWords.place}
      <span className="text-body text-fg-muted"> · {repo}</span>
    </>
  );
}

/** The frame's freshness slot: "Loading…", then "As of 13:00 · 3 min ago", ⚠ when it's old. */
function freshness(
  shown: Shown,
  read: Extract<PullRequestsState, { kind: "read" }> | undefined,
  clock: TeamClock,
): ReactNode {
  if (shown.kind === "loading") return pullRequestWords.loading;
  if (read === undefined) return undefined;
  const line = asOfLine(read.asOf, clock);
  if (minutesSince(read.asOf, clock) <= oldAfterMinutes) return line;
  return <span className="text-attention">{pullRequestWords.oldAsOf(line)}</span>;
}

function asOfLine(asOf: string, clock: TeamClock): string {
  return teamWords.asOf(formatTime(asOf, clock), minutesSince(asOf, clock));
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
  const state = shown.kind === "read" ? shown.state : undefined;
  const words = failedWords(shown, clock);
  return (
    <>
      {/* Always on the page, so the failed and offline words are read out when a read fails. */}
      {/* Empty while nothing failed, so the kit draws no box; the region stays for the words. */}
      <Callout tone="attention" announce="polite">
        {words === undefined ? null : (
          <span className="flex flex-col items-start gap-2">
            <span>{words}</span>
            <TryAgain onPress={props.onTryAgain} />
          </span>
        )}
      </Callout>
      {shown.kind === "loading" ? <LoadingRows /> : null}
      {state !== undefined && state.kind !== "read" ? (
        <Unavailable state={state} onLink={props.onLink} />
      ) : null}
      {state?.kind === "read" ? (
        <>
          <OldSnapshot asOf={state.asOf} clock={clock} />
          <PullRequestLists
            rows={state.rows}
            merged={state.merged}
            queue={state.queue}
            clock={clock}
            opener={props.opener}
          />
        </>
      ) : null}
    </>
  );
}

/**
 * The words in the attention Callout: Paperclip isn't answering when the first read failed, or
 * offline as of the last good read when a later one did; nothing otherwise.
 */
function failedWords(shown: Shown, clock: TeamClock): string | undefined {
  if (shown.kind === "failed") return teamWords.notAnswering;
  if (shown.kind === "read" && shown.failed && shown.state.kind === "read") {
    return pullRequestWords.offline(formatTime(shown.state.asOf, clock));
  }
  return undefined;
}

/** Loading (HAL-17515 P9): three skeleton rows in one bordered list where the PRs go. */
function LoadingRows() {
  return (
    <ul className={listBox}>
      {[0, 1, 2].map((index) => (
        <li key={index} className="flex items-center gap-3 px-4 py-4">
          <span className="w-16">
            <SkeletonBar kind="meta" />
          </span>
          <span className="min-w-0 flex-1">
            <SkeletonBar kind="title" width="2/3" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** No rows to show, and why. Never an empty list, which would look like nothing is wrong. */
function Unavailable(props: {
  state: Exclude<PullRequestsState, { kind: "read" }>;
  onLink: (link: TeamLink) => void;
}) {
  if (props.state.kind === "no-access") {
    return (
      <Callout tone="attention" icon={<LockIcon />}>
        <span className="flex flex-col items-start gap-2">
          <span>{pullRequestWords.cantRead}</span>
          <LinkButton link="connect-again" onLink={props.onLink} />
        </span>
      </Callout>
    );
  }
  // P8 also has Open in GitHub ↗, but the port carries no link to the repo yet.
  return (
    <EmptyState
      title={pullRequestWords.notAvailable}
      description={props.state.kind === "no-snapshot" ? pullRequestWords.noSnapshot : undefined}
    />
  );
}

/** A snapshot older than half an hour says so above the rows, never quietly old rows (P7). */
function OldSnapshot({ asOf, clock }: { asOf: string; clock: TeamClock }) {
  if (minutesSince(asOf, clock) <= oldAfterMinutes) return null;
  return <Callout tone="attention">{pullRequestWords.oldSnapshot(asOfLine(asOf, clock))}</Callout>;
}
