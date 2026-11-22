import { Button } from "@halonicjs/studio-kit";
import { useId } from "react";
import { asOfText } from "./phone-forms.ts";
import { staleWords } from "./status-words.ts";

/**
 * Why the phone can't reach its computer, as the banner says it. `tailscaleOff` (G17) and
 * `nearbyOff` (G24) are the phone's own causes; the header still says "Your phone is offline" and
 * "Can't reach your computer" for them.
 */
export type StaleBannerOf = keyof typeof staleWords.title;

export interface StaleBannerProps {
  readonly kind: StaleBannerOf;
  /** The computer's own name: "Tim's laptop". */
  readonly computer: string;
  /** When the last session list or event arrived (`RemoteView.asOf`); none since the app started. */
  readonly asOf: Date | undefined;
  /** The phone's clock, for "as of 14:02" or "as of yesterday 14:02". */
  readonly now: Date;
  /** A try is under way: Try again is busy. */
  readonly trying?: boolean | undefined;
  /** Details: opens the same sheet as the header label. */
  readonly onDetails: () => void;
  /** Try again: connect at once. */
  readonly onTryAgain: () => void;
}

/**
 * The banner over the agents while the phone can't reach its computer (`s-m3`, `s-m8`): what is
 * wrong, when the last update came, and that the agents keep running on the computer. It's plain
 * page content, not a live region: the header's live region has already said the state.
 */
export function StaleBanner(props: StaleBannerProps) {
  const { kind, computer, asOf, now } = props;
  const titleId = useId();
  const body =
    asOf === undefined
      ? staleWords.keepRunning
      : `${staleWords.lastUpdate(asOfText(asOf, now))} ${staleWords.keepRunning}`;
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-md bg-attention-soft px-4 py-3"
    >
      <div className="flex flex-col gap-1">
        <p id={titleId} className="text-body-strong text-fg">
          {staleWords.title[kind](computer)}
        </p>
        <p className="text-small text-fg">{body}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="touch"
          name={staleWords.detailsName}
          onClick={props.onDetails}
        >
          {staleWords.details}
        </Button>
        <Button
          variant="secondary"
          size="touch"
          busy={props.trying === true}
          onClick={props.onTryAgain}
        >
          {staleWords.tryAgain}
        </Button>
      </div>
    </section>
  );
}
