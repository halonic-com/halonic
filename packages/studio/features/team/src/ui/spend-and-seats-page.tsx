import { useContext, useEffect, useId, useState } from "react";
import type { SpendAndSeats, SpendAndSeatsState } from "../spend-and-seats.ts";
import type { TeamDetails } from "../team-details.ts";
import type { TeamClock } from "../team-format.ts";
import { type TeamLink, teamWords } from "../team-words.ts";
import { AllAgentsPage } from "./agents-by-spend.tsx";
import { pageKey, type TeamPage } from "./detail-frame.tsx";
import { AgentDetailPage, SeatDetailPage } from "./detail-pages.tsx";
import type { ArrivalFocus } from "./keep-focus.ts";
import { LinkButton, TeamLinks, type TeamLinksState } from "./money-tiles.tsx";
import { LoadingBody, PageFrame, TryAgain } from "./page-frame.tsx";
import { lastGoodRead, NoSeatsLine, ReadBody, readFreshness } from "./read-screen.tsx";

/** The props of {@link SpendAndSeatsPage}. */
export interface SpendAndSeatsPageProps {
  readonly spendAndSeats: SpendAndSeats;
  /**
   * Opens a Paperclip page in the system browser, or the connection flow for
   * "Connect again". Without it, the screen draws no link buttons.
   */
  readonly onLink?: ((link: TeamLink) => void) | undefined;
  /** The detail pages' reads. Without them, there is no Agents by spend and seat rows open AI seats. */
  readonly details?: TeamDetails | undefined;
}

/**
 * What the page holds: still loading, the last good read, or a failed first
 * read. A read that fails after a good one keeps the good one, marked failed.
 */
type Shown =
  | { kind: "loading" }
  | { kind: "read"; state: SpendAndSeatsState | undefined; readAt: string; failed: boolean }
  | { kind: "failed" };

/**
 * The Spend and seats screen (requirement `team.spend-and-seats`, HAL-17515
 * renders S1–S9): Needs you, the money and seat tiles, and the seats worst
 * first. It reads when it opens, whenever a source says it changed, and on
 * **Try again** after a failed read, and shows each state of Sofia's table
 * 1.6 that `TeamStatus` can tell apart. It only shows: every action opens
 * Paperclip.
 */
export function SpendAndSeatsPage(props: SpendAndSeatsPageProps) {
  const links: TeamLinksState = props.onLink === undefined ? "none" : "on";
  const [page, setPage] = useState<TeamPage | undefined>(undefined);
  // The row pressed on Spend and seats, so Back can focus it again once the screen has read.
  const [cameBack, setCameBack] = useState<ArrivalFocus | undefined>(undefined);
  const details = props.details;
  const open = (opened: TeamPage) => {
    setCameBack({ kind: "row", opens: pageKey(opened) });
    setPage(opened);
  };
  const back = () => setPage(undefined);
  const pages = details === undefined ? undefined : { details, onOpen: open };
  return (
    <TeamLinks.Provider value={links}>
      {details === undefined || page === undefined ? (
        <SpendAndSeatsScreen
          spendAndSeats={props.spendAndSeats}
          onLink={props.onLink ?? noLink}
          pages={pages}
          arrival={cameBack}
        />
      ) : (
        <DetailPage details={details} page={page} onOpen={setPage} onBack={back} />
      )}
    </TeamLinks.Provider>
  );
}

/** The detail page open over Spend and seats. */
function DetailPage(props: {
  details: TeamDetails;
  page: TeamPage;
  onOpen: (page: TeamPage) => void;
  onBack: () => void;
}) {
  const { details, page, onOpen, onBack } = props;
  if (page.kind === "agent")
    return <AgentDetailPage details={details} id={page.id} onBack={onBack} />;
  if (page.kind === "seat") {
    return <SeatDetailPage details={details} id={page.id} onOpen={onOpen} onBack={onBack} />;
  }
  return <AllAgentsPage details={details} onOpen={onOpen} onBack={onBack} />;
}

/** Never called: with no `onLink`, no link button is drawn. */
function noLink(): void {}

/** Where the detail pages are, for the screen's Agents by spend and seat rows. */
type Pages = { details: TeamDetails; onOpen: (page: TeamPage) => void } | undefined;

function SpendAndSeatsScreen(props: {
  spendAndSeats: SpendAndSeats;
  onLink: (link: TeamLink) => void;
  pages: Pages;
  arrival: ArrivalFocus | undefined;
}) {
  const { spendAndSeats, onLink } = props;
  const [shown, setShown] = useState<Shown>({ kind: "loading" });
  // Grows on each change a source reports and on Try again, so the page reads again.
  const [changed, setChanged] = useState(0);
  const readAgain = () => setChanged((count) => count + 1);
  const links = useContext(TeamLinks);
  const bannerId = useId();

  useEffect(() => spendAndSeats.watch(readAgain), [spendAndSeats]);

  useEffect(() => {
    let current = true;
    spendAndSeats.read().then(
      (state) => {
        const readAt = spendAndSeats.timeClock.now().toISOString();
        if (current) setShown({ kind: "read", state, readAt, failed: false });
      },
      (error: unknown) => {
        console.error("Spend and seats couldn't be read:", error);
        if (current) setShown((before) => failedAfter(before));
      },
    );
    return () => {
      current = false;
    };
  }, [spendAndSeats, changed]);

  const clock = spendAndSeats.timeClock;
  const loading = shown.kind === "loading";
  // One frame and one links provider for every state, so the main and h1 stay put when a read lands.
  return (
    <TeamLinks.Provider value={linksWhile(shown, links, bannerId)}>
      <PageFrame
        busy={loading}
        freshness={loading ? teamWords.loading : freshnessOf(shown, clock)}
        action={
          <LinkButton link="ai-seats" label={teamWords.openAiSeatsInPaperclip} onLink={onLink} />
        }
        arrival={props.arrival}
      >
        {shown.kind === "loading" ? (
          <LoadingBody />
        ) : (
          <ShownBody
            shown={shown}
            clock={clock}
            onLink={onLink}
            onTryAgain={readAgain}
            pages={props.pages}
            bannerId={bannerId}
          />
        )}
      </PageFrame>
    </TeamLinks.Provider>
  );
}

/** The freshness slot once a read landed: "As of 13:00 · 2 min ago", or offline's words. */
function freshnessOf(shown: Shown, clock: TeamClock): string | undefined {
  if (shown.kind !== "read" || shown.state === undefined) return undefined;
  return readFreshness(shown.state, clock, shown);
}

/**
 * The link buttons' state: offline, every link button and row is off, the header's too, naming
 * the banner as why.
 */
function linksWhile(shown: Shown, links: TeamLinksState, bannerId: string): TeamLinksState {
  if (links !== "on" || shown.kind !== "read" || shown.state === undefined) return links;
  const offline = lastGoodRead(shown.state, shown.failed, shown.readAt) !== undefined;
  return offline ? { offBecause: bannerId } : links;
}

/** What the frame holds once loading is over: the read, or why there is none. */
function ShownBody(props: {
  shown: Exclude<Shown, { kind: "loading" }>;
  clock: TeamClock;
  onLink: (link: TeamLink) => void;
  onTryAgain: () => void;
  pages: Pages;
  bannerId: string;
}) {
  const { shown, onLink } = props;
  if (shown.kind === "failed") {
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p>{teamWords.notAnswering}</p>
        <TryAgain onPress={props.onTryAgain} />
      </div>
    );
  }
  if (shown.state === undefined) {
    return <NoSeatsLine words={teamWords.seatsMissing} link="paperclip" onLink={onLink} />;
  }
  return (
    <ReadBody
      state={shown.state}
      failed={shown.failed}
      readAt={shown.readAt}
      clock={props.clock}
      onLink={onLink}
      onTryAgain={props.onTryAgain}
      pages={props.pages}
      bannerId={props.bannerId}
    />
  );
}

/** A failed read keeps what the screen already showed; with nothing shown yet, it says so. */
function failedAfter(before: Shown): Shown {
  return before.kind === "read" ? { ...before, failed: true } : { kind: "failed" };
}
