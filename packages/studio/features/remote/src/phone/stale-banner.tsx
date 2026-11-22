import { Button, RefreshIcon, WarningIcon } from "@halonicjs/studio-kit";
import { useId } from "react";
import { asOfText } from "./phone-forms.ts";
import { staleWords } from "./status-words.ts";

/**
 * Why the phone can't reach its computer, as the banner says it. `tailscaleOff` (G17) and
 * `nearbyOff` (G24) are the phone's own causes; the header still says "Your phone is offline" and
 * "{computer} isn't answering" for them.
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
 * The banner over the agents while the phone can't reach its computer (`s-m3`, `s-m8`): a ⚠ and
 * what is wrong, what time the agents shown are as of, and that the agents keep running on the computer. It's plain
 * page content, not a live region: the header's live region has already said the state.
 */
export function StaleBanner(props: StaleBannerProps) {
  const { kind, computer, asOf, now } = props;
  const titleId = useId();
  const body =
    asOf === undefined
      ? staleWords.keepRunning
      : `${staleWords.asOf(asOfText(asOf, now))} ${staleWords.keepRunning}`;
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-md bg-attention-soft px-4 py-3"
    >
      {/* The ⚠ before the title, as drawn; the body lines up under the title, not the ⚠. */}
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className="mt-0.5 inline-grid size-icon-sm shrink-0 place-items-center text-attention *:size-full"
        >
          <WarningIcon />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p id={titleId} className="text-body-strong text-fg">
            {staleWords.title[kind](computer)}
          </p>
          <p className="text-small text-fg">{body}</p>
        </div>
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
          // Only Try again gets the ↻, as drawn and as on the detail sheet.
          icon={<RefreshIcon />}
          onClick={props.onTryAgain}
        >
          {staleWords.tryAgain}
        </Button>
      </div>
    </section>
  );
}
