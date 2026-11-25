import { useEffect, useState } from "react";
import type { SpendAndSeats, SpendAndSeatsState } from "../spend-and-seats.ts";
import type { TeamDetails } from "../team-details.ts";
import { type TeamLink, teamWords } from "../team-words.ts";
import { AgentDetailPage, AllAgentsPage, SeatDetailPage, type TeamPage } from "./detail-pages.tsx";
import { TeamLinks, type TeamLinksState } from "./money-tiles.tsx";
import { LoadingPage, PageFrame, TryAgain } from "./page-frame.tsx";
import { NoSeatsLine, ReadScreen } from "./read-screen.tsx";

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
  const details = props.details;
  const back = () => setPage(undefined);
  const pages = details === undefined ? undefined : { details, onOpen: setPage };
  return (
    <TeamLinks.Provider value={links}>
      {details === undefined || page === undefined ? (
        <SpendAndSeatsScreen
          spendAndSeats={props.spendAndSeats}
          onLink={props.onLink ?? noLink}
          pages={pages}
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

function SpendAndSeatsScreen(props: {
  spendAndSeats: SpendAndSeats;
  onLink: (link: TeamLink) => void;
  pages: { details: TeamDetails; onOpen: (page: TeamPage) => void } | undefined;
}) {
  const { spendAndSeats, onLink } = props;
  const [shown, setShown] = useState<Shown>({ kind: "loading" });
  // Grows on each change a source reports and on Try again, so the page reads again.
  const [changed, setChanged] = useState(0);
  const readAgain = () => setChanged((count) => count + 1);

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
  if (shown.kind === "loading") return <LoadingPage />;
  if (shown.kind === "failed") {
    return (
      <PageFrame>
        <div role="alert" className="flex flex-col items-start gap-2">
          <p>{teamWords.notAnswering}</p>
          <TryAgain onPress={readAgain} />
        </div>
      </PageFrame>
    );
  }
  const state = shown.state;
  if (state === undefined) {
    return (
      <PageFrame>
        <NoSeatsLine words={teamWords.seatsMissing} link="paperclip" onLink={onLink} />
      </PageFrame>
    );
  }
  return (
    <ReadScreen
      state={state}
      failed={shown.failed}
      readAt={shown.readAt}
      clock={clock}
      onLink={onLink}
      onTryAgain={readAgain}
      pages={props.pages}
    />
  );
}

/** A failed read keeps what the screen already showed; with nothing shown yet, it says so. */
function failedAfter(before: Shown): Shown {
  return before.kind === "read" ? { ...before, failed: true } : { kind: "failed" };
}
