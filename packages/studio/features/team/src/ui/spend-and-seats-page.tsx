import { useEffect, useState } from "react";
import type { SpendAndSeats, SpendAndSeatsState } from "../spend-and-seats.ts";
import { type TeamLink, teamWords } from "../team-words.ts";
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
  return (
    <TeamLinks.Provider value={links}>
      <SpendAndSeatsScreen spendAndSeats={props.spendAndSeats} onLink={props.onLink ?? noLink} />
    </TeamLinks.Provider>
  );
}

/** Never called: with no `onLink`, no link button is drawn. */
function noLink(): void {}

function SpendAndSeatsScreen(props: {
  spendAndSeats: SpendAndSeats;
  onLink: (link: TeamLink) => void;
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
    />
  );
}

/** A failed read keeps what the screen already showed; with nothing shown yet, it says so. */
function failedAfter(before: Shown): Shown {
  return before.kind === "read" ? { ...before, failed: true } : { kind: "failed" };
}
